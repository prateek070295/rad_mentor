import express from "express";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getGenAI, runWithRetry } from "../helpers.js";

const router = express.Router();

const PHASES = Object.freeze({
  INIT: 'INIT',
  INTRO: 'INTRO',
  TEACH: 'TEACH',
  SOCRATIC_EVAL: 'SOCRATIC_EVAL',
  CHECKPOINT: 'CHECKPOINT',
  EVAL: 'EVAL',
  FEEDBACK: 'FEEDBACK',
  ADVANCE: 'ADVANCE',
  SUMMARY: 'SUMMARY',
  COMPLETE: 'COMPLETE',
});

const EVENT_TYPES = Object.freeze({
  START: 'START',
  USER_ANSWER: 'USER_ANSWER',
  GRADE_RESULT: 'GRADE_RESULT',
});

const MAX_MESSAGE_HISTORY = 50;
const DEFAULT_TEXT_GENERATION_CONFIG = Object.freeze({
  maxOutputTokens: 600,
  candidateCount: 1,
});

// --- 1. Initial State Definition ---
const INITIAL_STATE = {
  sectionIndex: 0,
  checkpointIndex: 0,
  phase: PHASES.INIT,
  mastery: {},
  history: [],
  lastTeachAnswer: "",
  lastTeachQuestion: "",
};

const toStringSafe = (value) => {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
};

const extractRowCells = (row) => {
  if (Array.isArray(row)) return row;
  if (row && typeof row === "object") {
    if (Array.isArray(row.cells)) return row.cells;
    if (Array.isArray(row.values)) return row.values;
  }
  return [];
};

const sanitizeTablesForUi = (tables) => {
  if (!Array.isArray(tables)) return [];
  const sanitized = [];
  for (const table of tables) {
    if (!table || typeof table !== "object") continue;
    const headers = Array.isArray(table.headers)
      ? table.headers.map((header, idx) => {
          const trimmed = toStringSafe(header).trim();
          return trimmed || `Column ${idx + 1}`;
        })
      : [];
    if (!headers.length) continue;

    const rows = Array.isArray(table.rows)
      ? table.rows
          .map((row) => {
            const cells = extractRowCells(row).map((cell) =>
              cell && typeof cell === "object" && "content" in cell
                ? toStringSafe(cell.content).trim()
                : toStringSafe(cell).trim(),
            );
            return cells.some((cell) => cell.length) ? { cells } : null;
          })
          .filter(Boolean)
      : [];
    if (!rows.length) continue;

    sanitized.push({
      table_id: typeof table.table_id === "string" ? table.table_id : undefined,
      caption: typeof table.caption === "string" ? table.caption : "",
      headers,
      rows,
    });
  }
  return sanitized.slice(0, 8);
};

const sanitizeUiForFirestore = (ui) => {
  if (!ui || typeof ui !== "object") return {};
  const safe = { ...ui };
  if (Array.isArray(safe.tables)) {
    const tables = sanitizeTablesForUi(safe.tables);
    if (tables.length) safe.tables = tables;
    else delete safe.tables;
  }
  if (Array.isArray(safe.options)) {
    const candidateKeys = ["text", "label", "value", "title", "name"];
    safe.options = safe.options
      .map((option) => {
        if (option == null) return null;
        if (typeof option === "string") return option;
        if (typeof option === "number" || typeof option === "boolean") {
          return String(option);
        }
        if (Array.isArray(option)) {
          return option.map((value) => toStringSafe(value));
        }
        if (typeof option === "object") {
          const candidate = candidateKeys
            .map((key) => (typeof option[key] === "string" ? option[key] : null))
            .find((value) => value && value.trim().length > 0);
          if (candidate) return candidate.trim();
          if (Array.isArray(option.richText)) {
            const text = option.richText
              .map((piece) => (typeof piece === "string" ? piece : ""))
              .join(" ")
              .trim();
            if (text) return text;
          }
          try {
            return JSON.stringify(option);
          } catch (error) {
            return toStringSafe(option);
          }
        }
        return toStringSafe(option);
      })
      .filter((entry) => entry != null);
  }
  if (Array.isArray(safe.key_points)) {
    safe.key_points = safe.key_points.map((point) => toStringSafe(point));
  }
  if (safe.message != null) safe.message = toStringSafe(safe.message);
  if (safe.title != null) safe.title = toStringSafe(safe.title);
  return safe;
};

const extractExpectedAnswer = (text) => {
  if (!text || typeof text !== "string") {
    return { cleaned: text || "", answer: "" };
  }
  const match = text.match(/<expected_answer>([\s\S]*?)<\/expected_answer>/i);
  if (!match) {
    return { cleaned: text, answer: "" };
  }
  const answer = match[1].trim();
  const cleaned = text.replace(match[0], "").trim();
  return { cleaned, answer };
};

const stripTablesFromText = (text) => {
  if (!text || typeof text !== "string") return "";
  const lines = text.split("\n");
  const cleaned = [];
  let index = 0;
  const isDividerLine = (line) => /^\s*\|(?:\s*[-:]+){2,}\s*\|?\s*$/.test(line);
  const isMarkdownRow = (line) => /^\s*\|.*\|\s*$/.test(line);
  const isAsciiBorder = (line) => /^\s*\+(?:[-=]+\+)+\s*$/.test(line);

  while (index < lines.length) {
    const line = lines[index];
    const next = lines[index + 1];

    if (isMarkdownRow(line) && next && isDividerLine(next)) {
      index += 2;
      while (index < lines.length && isMarkdownRow(lines[index])) {
        index += 1;
      }
      continue;
    }

    if (isAsciiBorder(line) && next && isMarkdownRow(next)) {
      index += 1;
      while (
        index < lines.length &&
        (isMarkdownRow(lines[index]) || isAsciiBorder(lines[index]))
      ) {
        index += 1;
      }
      continue;
    }

    cleaned.push(line);
    index += 1;
  }

  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const RAD_MENTOR_PERSONA_PROMPT = `You are **RadMentor**, an expert academic radiologist and seasoned medical educator. You routinely train senior radiology residents for board examinations and advanced clinical rotations.`;

const RAD_MENTOR_AUDIENCE_PROMPT = `Your learner is a radiology resident who has already completed an MBBS and core radiology postings. They expect nuanced, modality-specific instruction that assumes baseline anatomy, physics, and pathology knowledge.`;

const RAD_MENTOR_STYLE_RULES = `Instructional rules:
- Use precise radiological terminology (e.g., attenuation, glandular dose, compression paddle, oblique projection).
- Frame discussions in imaging physics, acquisition parameters, and interpretive nuance—never reduce exposure or acquisition to generic descriptions like "light."
- Highlight clinical relevance, differential considerations, and interpretation pitfalls appropriate for postgraduate learners.
- Maintain a concise but authoritative tone; do not oversimplify core medical concepts.
- When posing questions, reference specific radiologic findings, parameters, or pathophysiologic mechanisms.
- Write headings that are concise, factual, and free of learner descriptors (e.g., avoid phrases like "for the resident").`;

const parseFeedbackWithTransition = (text) => {
  if (!text || typeof text !== "string") {
    return { feedback: text || "", transition: "" };
  }
  const parts = text.split(/\[TRANSITION_LINE\]/i);
  const feedback = parts[0]?.trim() || "";
  const transition = parts[1]?.trim() || "";
  return { feedback, transition };
};

const DEFAULT_TRANSITION_LINE = "We'll build on this insight in the next checkpoint.";

// --- 2. The State Reducer ---
const reducer = (state, event) => {
  console.log(`Reducer: In phase ${state.phase}, received event ${event.type}`);
  switch (state.phase) {
    case PHASES.INIT:
      if (event.type === EVENT_TYPES.START) return { ...state, phase: PHASES.INTRO };
      break;
    case PHASES.INTRO:
      if (event.type === EVENT_TYPES.USER_ANSWER) return { ...state, phase: PHASES.TEACH };
      break;
    case PHASES.TEACH:
      if (event.type === EVENT_TYPES.USER_ANSWER)
        return { ...state, phase: PHASES.SOCRATIC_EVAL };
      break;
    case PHASES.SOCRATIC_EVAL:
      if (event.type === EVENT_TYPES.USER_ANSWER)
        return { ...state, phase: PHASES.CHECKPOINT };
      break;
    case PHASES.CHECKPOINT:
      if (event.type === EVENT_TYPES.USER_ANSWER) return { ...state, phase: PHASES.EVAL };
      break;
    case PHASES.EVAL:
      if (event.type === EVENT_TYPES.GRADE_RESULT) return { ...state, phase: PHASES.FEEDBACK };
      break;
    case PHASES.FEEDBACK:
      if (event.type === EVENT_TYPES.USER_ANSWER) return { ...state, phase: PHASES.ADVANCE };
      break;
    case PHASES.SUMMARY:
      if (event.type === EVENT_TYPES.USER_ANSWER) return { ...state, phase: PHASES.COMPLETE };
      break;
    case PHASES.ADVANCE:
    case PHASES.COMPLETE:
      return state;
    default:
      return state;
  }
  return state;
};

// --- 3. Prompts ---
const socraticTeachPrompt = (title, body) => {
  return `${RAD_MENTOR_PERSONA_PROMPT}
${RAD_MENTOR_AUDIENCE_PROMPT}
${RAD_MENTOR_STYLE_RULES}

Teaching task:
- Transform the following source into an advanced teaching segment appropriate for postgraduate radiology residents.
- Preserve every clinically relevant imaging detail while improving clarity, structure, and emphasis.
- Present the lesson in Markdown with purposeful headings, bullet lists, and emphasised pearls or pitfalls.
- Conclude with exactly one Socratic question that cites concrete facts pulled verbatim or paraphrased from the source (e.g., named views, positioning checks, dose considerations) so the learner can answer using that content only.
- The question must not introduce hypothetical scenarios, patient types, or modalities that are absent from the provided section.
- Immediately after the question, provide the ideal resident response wrapped in <expected_answer> ... </expected_answer> tags so faculty can reference it later. The expected answer must explicitly restate the source facts (e.g., which view, which positioning adjustment, which exposure parameter) that satisfy the question.
- Do not invent new clinical facts beyond the source material.

Source material:
- Topic title: ${title}
- Section content:
"""${body}"""

Deliver the refined teaching segment now.`;
};

const socraticEvaluationPrompt = (lessonText, userAnswer, expectedAnswer, question) => {
  return `${RAD_MENTOR_PERSONA_PROMPT}
${RAD_MENTOR_AUDIENCE_PROMPT}
${RAD_MENTOR_STYLE_RULES}

Evaluation task:
- You previously provided the lesson excerpt below to the resident.
- The Socratic question you asked was: "${question}"
- Analyse the resident's response using advanced radiologic reasoning.
- Compare their answer explicitly against the intended faculty answer: """${expectedAnswer}"""
- Address the learner directly using "you" rather than "the resident."
- Provide a concise paragraph that recognises correct thinking, corrects inaccuracies with precise terminology, and transitions the learner toward the next checkpoint.
- When the learner misses required details, restate the correct answer explicitly, quoting or paraphrasing the source facts found in the faculty answer.
- After your feedback paragraph, include a line containing only "[TRANSITION_LINE]" to indicate where the system will insert the next-step guidance.
- Do not pose a new question in this evaluation step.

Lesson excerpt:
"""${lessonText}"""

Resident response:
"""${userAnswer}"""

Faculty reference answer:
"""${expectedAnswer}"""

Offer your expert evaluation now.`;
};

// --- 4. The API Endpoint ---
router.post("/", express.json(), async (req, res) => {
  const db = getFirestore();
  const SESSION_CONFLICT = "SESSION_CONFLICT";
  let userId;
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error('No bearer token provided.');
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    userId = decodedToken.uid;
  } catch (authError) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  
  const {
    userInput,
    topicId,
    organ: chapterId,
    userName,
    resumeLast = false,
  } = req.body || {};
  const safeUserName =
    typeof userName === 'string' ? userName.trim() : '';
  if (!topicId || !chapterId) {
    return res.status(400).json({ error: 'topicId and chapterId are required.' });
  }

  try {
    const progressRef = db.doc(`userProgress/${userId}/topics/${topicId}`);
    const sessionRef = db.doc(`userProgress/${userId}/sessions/${topicId}`);
    const messagesRef = sessionRef.collection('messages');

    const sessionSnap = await sessionRef.get();
    let currentState;
    let event;
    const sessionVersion = Number(sessionSnap.exists ? sessionSnap.data()?.sessionStateVersion ?? 0 : 0);

    if (!sessionSnap.exists) {
      currentState = { ...INITIAL_STATE, topicId, organ: chapterId, userName: safeUserName };
      event = { type: EVENT_TYPES.START, userInput };
    } else {
      currentState = sessionSnap.data().sessionState;
      if (!currentState?.organ && chapterId) {
        currentState = { ...currentState, organ: chapterId };
      }
      if (!currentState?.topicId && topicId) {
        currentState = { ...currentState, topicId };
      }
      if (!currentState?.userName && safeUserName) {
        currentState = { ...currentState, userName: safeUserName };
      }
      if (userInput === undefined) {
        if (resumeLast === true) {
          const lastMessageSnap = await messagesRef.orderBy('timestamp', 'desc').limit(1).get();
          if (!lastMessageSnap.empty && lastMessageSnap.docs[0].data().role === 'assistant') {
            return res.json({ ui: lastMessageSnap.docs[0].data().ui });
          }
        }
        event = { type: EVENT_TYPES.START, userInput: undefined };
      } else {
        event = { type: EVENT_TYPES.USER_ANSWER, userInput };
      }
    }
    
    let nextState = reducer(currentState, event);
    let uiResponse = {};
    const nodeRef = db.collection('sections').doc(nextState.organ).collection('nodes').doc(nextState.topicId);
    
    const sectionsRef = nodeRef.collection('contentSections');
    const sectionDocCache = new Map();
    const getSectionDoc = async (order) =>
      getSectionDocByOrder(sectionsRef, sectionDocCache, order);
    const nodeSnapshotCache = { snapshot: null };
    const getNodeSnapshot = async () => {
      if (!nodeSnapshotCache.snapshot) {
        nodeSnapshotCache.snapshot = await nodeRef.get();
      }
      return nodeSnapshotCache.snapshot;
    };
    const getNodeData = async () => {
      const snap = await getNodeSnapshot();
      return snap.data() || {};
    };

    const phaseResult = await resolveTutorPhase({
      nextState,
      userInput,
      getSectionDoc,
      getNodeData,
    });
    nextState = phaseResult.nextState;
    uiResponse = phaseResult.uiResponse;
    const resumeSnapshot = phaseResult.resumeSnapshot || null;

    const shouldSaveFullProgress = nextState.phase === PHASES.FEEDBACK || nextState.phase === PHASES.SUMMARY || nextState.phase === PHASES.COMPLETE;
    let progressPayload = null;

    if (shouldSaveFullProgress) {
      console.log(`Checkpoint reached. Saving full progress at phase: ${nextState.phase}`);
      progressPayload = await calculateProgressPayload({
        nextState,
        getNodeData,
        sectionsRef,
        sectionDocCache,
      });
    }

    const sanitizedUi = sanitizeUiForFirestore(uiResponse);
    const assistantMessageRef = messagesRef.doc();
    const userMessageRef =
      userInput !== undefined && userInput !== "continue" ? messagesRef.doc() : null;

    try {
      await db.runTransaction(async (tx) => {
        const freshSessionSnap = await tx.get(sessionRef);
        const freshVersion = Number(
          freshSessionSnap.exists ? freshSessionSnap.data()?.sessionStateVersion ?? 0 : 0
        );
        if (freshVersion !== sessionVersion) {
          throw new Error(SESSION_CONFLICT);
        }

        if (userMessageRef) {
          tx.set(userMessageRef, {
            role: "user",
            userInput,
            timestamp: FieldValue.serverTimestamp(),
          });
        }

        tx.set(assistantMessageRef, {
          role: "assistant",
          ui: sanitizedUi,
          timestamp: FieldValue.serverTimestamp(),
        });

        if (progressPayload) {
          tx.set(progressRef, progressPayload, { merge: true });
        }

        const sessionUpdate = {
          sessionState: nextState,
          sessionStateVersion: sessionVersion + 1,
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (resumeSnapshot) {
          sessionUpdate.resumeSnapshot = {
            ...resumeSnapshot,
            ts: FieldValue.serverTimestamp(),
          };
        }

        tx.set(sessionRef, sessionUpdate, { merge: true });
      });
    } catch (txnError) {
      if (txnError?.message === SESSION_CONFLICT) {
        return res.status(409).json({
          error: "Tutor session updated elsewhere. Please retry.",
          ui: {
            type: "ERROR",
            message: "The tutor session was updated in another window. Please retry.",
          },
        });
      }
      throw txnError;
    }

    await trimMessageHistory(messagesRef);

    res.json({ ui: sanitizedUi });

  } catch (error) {
    console.error(`Error in /tutor/step for user ${userId}:`, error);
    const messageString = String(error?.message || error || "");
    const fetchFailed = /fetch failed/i.test(messageString);

    if (fetchFailed) {
      return res.status(503).json({
        error: "The tutor could not reach our AI service. Please retry.",
        ui: {
          type: 'ERROR',
          message: "I'm having trouble reaching our AI service. Please retry in a few seconds.",
        },
      });
    }

    if (error?.status === 503 || error?.status === 429) {
      return res.status(503).json({
        error: "Tutor is busy right now. Please try again in a few seconds.",
        ui: {
          type: 'ERROR',
          message: 'Tutor is busy right now. Please try again in a few seconds.',
        },
      });
    }

    res.status(500).json({
      error: messageString || 'A critical server error occurred.',
      ui: { type: 'ERROR', message: 'A critical server error occurred.' },
    });
  }
});

export default router;


async function getSectionDocByOrder(sectionsRef, cache, order) {
  const key = String(order);
  if (cache.has(key)) {
    return cache.get(key);
  }
  const snapshot = await sectionsRef
    .where('order', '==', order)
    .select('order', 'title', 'body_md', 'tables', 'images', 'cases', 'checkpointCount', 'checkpoint_count')
    .limit(1)
    .get();
  if (snapshot.empty) {
    cache.set(key, null);
    return null;
  }
  const doc = snapshot.docs[0];
  cache.set(key, doc);
  return doc;
}

async function loadAllSectionDocs(sectionsRef, cache) {
  if (cache.has('__all__')) {
    return cache.get('__all__');
  }
  const snapshot = await sectionsRef
    .orderBy('order')
    .select('order', 'checkpointCount', 'checkpoint_count')
    .get();
  const docs = snapshot.docs;
  docs.forEach((doc) => {
    const key = String(Number(doc.data()?.order ?? 0));
    if (!cache.has(key)) {
      cache.set(key, doc);
    }
  });
  cache.set('__all__', docs);
  return docs;
}

async function calculateProgressPayload({
  nextState,
  getNodeData,
  sectionsRef,
  sectionDocCache,
}) {
  try {
    const [topicData, orderedSectionDocs] = await Promise.all([
      getNodeData(),
      loadAllSectionDocs(sectionsRef, sectionDocCache),
    ]);

    const topicTitle = topicData.name || 'Untitled Topic';
    const chapterId = nextState.organ;
    const orderedSections = orderedSectionDocs.map((doc) => ({
      order: Number(doc.data()?.order ?? 0),
      ref: doc.ref,
      data: doc.data(),
    }));

    const totalSections = orderedSections.length || 1;
    let calculatedPercent = 0;

    if (nextState.phase === PHASES.SUMMARY || nextState.phase === PHASES.COMPLETE) {
      calculatedPercent = 100;
    } else {
      const boundedSectionIndex = Math.max(0, Math.min(nextState.sectionIndex, totalSections));
      const completedSections = Math.max(0, Math.min(nextState.sectionIndex, totalSections));
      const currentSectionIndex = Math.min(boundedSectionIndex, totalSections - 1);
      const currentSectionEntry =
        orderedSections.find((entry) => entry.order === nextState.sectionIndex + 1) ||
        orderedSections[currentSectionIndex];

      let sectionFraction = 0;
      if (currentSectionEntry) {
        let totalCheckpoints = Number(
          currentSectionEntry.data?.checkpointCount ??
            currentSectionEntry.data?.checkpoint_count ??
            NaN,
        );

        if (!Number.isFinite(totalCheckpoints) || totalCheckpoints <= 0) {
          const checkpointsSnapshot = await currentSectionEntry.ref.collection('checkpoints').get();
          totalCheckpoints = checkpointsSnapshot.size || 1;
        }

        const baseCompleted = Math.min(nextState.checkpointIndex, totalCheckpoints);
        const adjustedCompleted =
          nextState.phase === PHASES.FEEDBACK
            ? Math.min(baseCompleted + 1, totalCheckpoints)
            : Math.min(baseCompleted, totalCheckpoints);

        sectionFraction =
          totalCheckpoints > 0 ? adjustedCompleted / totalCheckpoints : 0;
      }

      calculatedPercent = ((completedSections + sectionFraction) / totalSections) * 100;
      calculatedPercent = Math.max(0, Math.min(100, Math.round(calculatedPercent)));
    }

    return {
      status:
        nextState.phase === PHASES.SUMMARY || nextState.phase === PHASES.COMPLETE
          ? 'completed'
          : 'in-progress',
      updatedAt: FieldValue.serverTimestamp(),
      percentComplete: calculatedPercent,
      topicTitle,
      chapterId,
    };
  } catch (error) {
    console.error('Failed to compute topic progress', error);
    return {
      status:
        nextState.phase === PHASES.SUMMARY || nextState.phase === PHASES.COMPLETE
          ? 'completed'
          : 'in-progress',
      updatedAt: FieldValue.serverTimestamp(),
      percentComplete:
        nextState.phase === PHASES.SUMMARY || nextState.phase === PHASES.COMPLETE ? 100 : 0,
      topicTitle: 'Untitled Topic',
      chapterId: nextState.organ,
    };
  }
}

async function trimMessageHistory(messagesRef, maxCount = MAX_MESSAGE_HISTORY) {
  try {
    if (maxCount <= 0) return;
    const countSnap = await messagesRef.count().get();
    const total = countSnap.data()?.count ?? 0;
    if (total <= maxCount) return;

    const excess = total - maxCount;
    const staleSnap = await messagesRef.orderBy('timestamp', 'asc').limit(excess).get();
    if (staleSnap.empty) return;

    const batch = messagesRef.firestore.batch();
    staleSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  } catch (error) {
    console.error('Failed to trim tutor message history', error);
  }
}

async function resolveTutorPhase({
  nextState,
  userInput,
  getSectionDoc,
  getNodeData,
}) {
  switch (nextState.phase) {
    case PHASES.INTRO:
      return introPhase(nextState, getNodeData);
    case PHASES.TEACH:
      return teachPhase(nextState, getSectionDoc, getNodeData);
    case PHASES.SOCRATIC_EVAL:
      return socraticEvalPhase(nextState, userInput, getSectionDoc, getNodeData);
    case PHASES.CHECKPOINT:
      return checkpointPhase(nextState, getSectionDoc, getNodeData);
    case PHASES.EVAL:
      return evalPhase(nextState, userInput, getSectionDoc, getNodeData);
    case PHASES.ADVANCE:
      return advancePhase(nextState, getSectionDoc, getNodeData);
    case PHASES.FEEDBACK:
      return feedbackPhase(nextState);
    case PHASES.SUMMARY:
      return summaryPhase(nextState, getNodeData);
    case PHASES.COMPLETE:
      return completePhase(nextState);
    default:
      return {
        nextState,
        uiResponse: {
          type: 'ERROR',
          message: `Reached an unknown state: ${nextState.phase}`,
        },
      };
  }
}

async function introPhase(nextState, getNodeData) {
  const nodeData = await getNodeData();
  const objectivesText = (nodeData.objectives || []).map((obj) => `- ${obj}`).join('\n');
  const salutation = nextState.userName ? `Hello ${nextState.userName}` : 'Hello';
  const message = `${salutation}, welcome to the topic on "${nodeData.name}".\n\nHere are our learning objectives:\n${objectivesText}\n\nReady to begin?`;
  return {
    nextState,
    uiResponse: { type: 'OBJECTIVES_CARD', title: 'Topic Objectives', message },
  };
}

async function teachPhase(nextState, getSectionDoc, getNodeData) {
  const sectionDoc = await getSectionDoc(nextState.sectionIndex + 1);
  if (!sectionDoc) {
    return summaryPhase({ ...nextState, phase: PHASES.SUMMARY }, getNodeData);
  }
  const sectionData = sectionDoc.data();
  const cleanedBody = stripTablesFromText(sectionData.body_md || '');
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel(
    { model: 'models/gemini-2.0-flash-lite-001' },
    { apiVersion: 'v1' },
  );
  const prompt = socraticTeachPrompt(sectionData.title, cleanedBody);
  const result = await runWithRetry(() =>
    model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: DEFAULT_TEXT_GENERATION_CONFIG,
    }),
  );
  const { cleaned: cleanedMessage, answer: initialAnswer } = extractExpectedAnswer(
    result.response.text(),
  );
  let message = cleanedMessage.trim();
  let teachAnswer = typeof initialAnswer === 'string' ? initialAnswer.trim() : '';
  let teachQuestion = message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse()
    .find((line) => line.endsWith('?')) || '';

  const needsFallback =
    !teachQuestion ||
    teachQuestion.length < 10 ||
    !teachAnswer ||
    teachAnswer.length < 5;

  if (needsFallback) {
    const fallback = await generateFallbackTeachQA({
      title: sectionData.title,
      body: cleanedBody,
    });
    if (fallback.question) {
      teachQuestion = fallback.question;
    }
    if (fallback.answer) {
      teachAnswer = fallback.answer;
    }
  }

  if (!teachQuestion || teachQuestion.length < 3) {
    teachQuestion = 'What is the single most important takeaway from this imaging discussion?';
  } else if (!teachQuestion.trim().endsWith('?')) {
    teachQuestion = `${teachQuestion.trim()}?`;
  }

  if (!teachAnswer || teachAnswer.length < 3) {
    teachAnswer =
      'Learner should summarise the critical imaging finding, technique, or decision highlighted in this teaching segment.';
  }

  if (!message) {
    message = cleanedBody;
  }

  if (!message.includes(teachQuestion)) {
    message = `${message}\n\n**Checkpoint Question:** ${teachQuestion}`;
  }

  if (!message.trim().endsWith('?')) {
    message = `${message.trim()}\n\n${teachQuestion}`;
  }

  const normalizedTables = sanitizeTablesForUi(sectionData.tables);
  return {
    nextState: {
      ...nextState,
      lastTeachAnswer: teachAnswer,
      lastTeachQuestion: teachQuestion,
    },
    uiResponse: {
      type: 'TEACH_CARD',
      title: sectionData.title,
      message,
      assets: { images: sectionData.images || [], cases: sectionData.cases || [] },
      tables: normalizedTables,
    },
  };
}

async function generateFallbackTeachQA({ title, body }) {
  const defaultQuestion =
    'What specific imaging lesson or technique does this section emphasise?';
  const defaultAnswer =
    'It emphasises the key imaging findings and technique choices described in the section.';

  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel(
      { model: 'models/gemini-2.0-flash-lite-001' },
      { apiVersion: 'v1' },
    );

    const prompt = [
      'You are RadMentor.',
      'Create a SINGLE Socratic checkpoint question and its ideal short answer using only the material below.',
      'Question requirements:',
      '- It must reference concrete data points from the source (e.g., views, parameters, pathology).',
      '- It must end with a question mark and avoid vague prompts like "what are your thoughts?".',
      'Answer requirements:',
      '- Provide a concise, faculty-grade answer rooted entirely in the source content.',
      '- Avoid introducing new facts.',
      '',
      `Topic Title: ${title}`,
      'Source Body:',
      `"""${body}"""`,
      '',
      'Respond ONLY with JSON following this schema:',
      `{ "question": "string", "answer": "string" }`,
    ].join('\n');

    const result = await runWithRetry(() =>
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 400,
          candidateCount: 1,
          responseSchema: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              answer: { type: 'string' },
            },
            required: ['question', 'answer'],
          },
        },
      }),
    );

    const raw = result?.response?.text?.() ?? '';
    const parsed = tryParseStrictJson(raw);
    const question =
      typeof parsed?.question === 'string' && parsed.question.trim().length > 0
        ? parsed.question.trim()
        : defaultQuestion;
    const answer =
      typeof parsed?.answer === 'string' && parsed.answer.trim().length > 0
        ? parsed.answer.trim()
        : defaultAnswer;

    return { question, answer };
  } catch (error) {
    console.error('Fallback Socratic QA generation failed', error);
    return { question: defaultQuestion, answer: defaultAnswer };
  }
}

async function socraticEvalPhase(
  nextState,
  userInput,
  getSectionDoc,
  getNodeData,
) {
  if (!nextState.lastTeachAnswer || !nextState.lastTeachQuestion) {
    return {
      nextState: {
        ...nextState,
        phase: PHASES.CHECKPOINT,
        lastTeachAnswer: '',
        lastTeachQuestion: '',
      },
      uiResponse: {
        type: 'TRANSITION_CARD',
        title: 'Let’s keep going',
        message: "We'll move ahead to the next checkpoint.",
      },
    };
  }

  const sectionDoc = await getSectionDoc(nextState.sectionIndex + 1);
  if (!sectionDoc) {
    return summaryPhase({ ...nextState, phase: PHASES.SUMMARY }, getNodeData);
  }
  const sectionData = sectionDoc.data();
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel(
    { model: 'models/gemini-2.0-flash-lite-001' },
    { apiVersion: 'v1' },
  );
  const prompt = socraticEvaluationPrompt(
    stripTablesFromText(sectionData.body_md || ''),
    userInput,
    nextState.lastTeachAnswer || '',
    nextState.lastTeachQuestion || '',
  );
  const result = await runWithRetry(() =>
    model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: DEFAULT_TEXT_GENERATION_CONFIG,
    }),
  );
  const { feedback, transition } = parseFeedbackWithTransition(result.response.text());
  const transitionLine = transition || DEFAULT_TRANSITION_LINE;
  const combinedMessage = feedback ? `${feedback}\n\n${transitionLine}` : transitionLine;
  return {
    nextState: {
      ...nextState,
      lastTeachAnswer: '',
      lastTeachQuestion: '',
    },
    uiResponse: {
      type: 'TRANSITION_CARD',
      title: "Let's review your thoughts",
      message: combinedMessage,
    },
  };
}

async function checkpointPhase(
  nextState,
  getSectionDoc,
  getNodeData,
  { sectionDoc: providedSectionDoc = null, checkpointsSnapshot: providedSnapshot = null } = {},
) {
  const sectionDocPromise = providedSectionDoc
    ? Promise.resolve(providedSectionDoc)
    : getSectionDoc(nextState.sectionIndex + 1);
  const [sectionDoc, allCheckpointsSnapshot] = await Promise.all([
    sectionDocPromise,
    providedSnapshot
      ? Promise.resolve(providedSnapshot)
      : sectionDocPromise.then((doc) => {
          if (!doc) return null;
          return doc.ref
            .collection('checkpoints')
            .orderBy('bloom_level')
            .select('question_md', 'options', 'type', 'rationale_md', 'correct_index')
            .get();
        }),
  ]);
  if (!sectionDoc) {
    return summaryPhase({ ...nextState, phase: PHASES.SUMMARY }, getNodeData);
  }
  if (!allCheckpointsSnapshot) {
    return summaryPhase({ ...nextState, phase: PHASES.SUMMARY }, getNodeData);
  }
  if (allCheckpointsSnapshot.empty || nextState.checkpointIndex >= allCheckpointsSnapshot.size) {
    return summaryPhase({ ...nextState, phase: PHASES.SUMMARY }, getNodeData);
  }
  const checkpointData = allCheckpointsSnapshot.docs[nextState.checkpointIndex].data();
  return {
    nextState,
    uiResponse: {
      type: checkpointData.type === 'mcq' ? 'MCQ_CHECKPOINT' : 'SHORT_CHECKPOINT',
      title: `Checkpoint for: ${sectionDoc.data().title}`,
      message: checkpointData.question_md,
      options: checkpointData.options || null,
    },
    resumeSnapshot: {
      phase: PHASES.CHECKPOINT,
      sectionIndex: nextState.sectionIndex,
      checkpointIndex: nextState.checkpointIndex,
    },
  };
}

async function evalPhase(
  nextState,
  userInput,
  getSectionDoc,
  getNodeData,
) {
  const sectionDocPromise = getSectionDoc(nextState.sectionIndex + 1);
  const [sectionDoc, orderedSnapshot] = await Promise.all([
    sectionDocPromise,
    sectionDocPromise.then((doc) => {
      if (!doc) return null;
      return doc.ref.collection('checkpoints').orderBy('bloom_level').get();
    }),
  ]);
  if (!sectionDoc) {
    return summaryPhase({ ...nextState, phase: PHASES.SUMMARY }, getNodeData);
  }
  if (!orderedSnapshot) {
    return summaryPhase({ ...nextState, phase: PHASES.SUMMARY }, getNodeData);
  }
  if (
    orderedSnapshot.empty ||
    nextState.checkpointIndex >= orderedSnapshot.size ||
    nextState.checkpointIndex < 0
  ) {
    return summaryPhase({ ...nextState, phase: PHASES.SUMMARY }, getNodeData);
  }

  const checkpointData = orderedSnapshot.docs[nextState.checkpointIndex].data();
  let isCorrect = false;
  let feedbackMessage = '';

  if (checkpointData.type === 'mcq') {
    const idx = Number(userInput?.selectedIndex);
    const selectedIndex = Number.isFinite(idx) ? idx : -1;
    const normalizedOptions = Array.isArray(checkpointData.options)
      ? checkpointData.options
      : [];
    const withinBounds =
      Number.isInteger(selectedIndex) &&
      selectedIndex >= 0 &&
      selectedIndex < normalizedOptions.length;
    isCorrect = withinBounds && checkpointData.correct_index === selectedIndex;
    feedbackMessage = `**Rationale:** ${checkpointData.rationale_md}`;
  } else if (checkpointData.type === 'short') {
    const gradingResult = await gradeShortCheckpointAnswer(checkpointData, userInput);
    isCorrect =
      gradingResult.verdict === 'correct' ||
      gradingResult.verdict === 'partially_correct';
    feedbackMessage = gradingResult.feedback;
  }

  return {
    nextState: reducer(nextState, { type: EVENT_TYPES.GRADE_RESULT }),
    uiResponse: {
      type: 'FEEDBACK_CARD',
      title: isCorrect ? 'Correct!' : 'Feedback',
      message: feedbackMessage,
      isCorrect,
    },
  };
}

async function advancePhase(nextState, getSectionDoc, getNodeData) {
  const currentSectionDocPromise = getSectionDoc(nextState.sectionIndex + 1);
  const [currentSectionDoc, checkpointsSnapshot] = await Promise.all([
    currentSectionDocPromise,
    currentSectionDocPromise.then((doc) => {
      if (!doc) return null;
      return doc.ref
        .collection('checkpoints')
        .orderBy('bloom_level')
        .select('question_md', 'options', 'type', 'rationale_md', 'correct_index')
        .get();
    }),
  ]);
  if (!currentSectionDoc) {
    return summaryPhase({ ...nextState, phase: PHASES.SUMMARY }, getNodeData);
  }

  const totalCheckpoints = checkpointsSnapshot ? checkpointsSnapshot.size : 0;

  if (Number.isFinite(totalCheckpoints) && totalCheckpoints > 0) {
    if (nextState.checkpointIndex + 1 < totalCheckpoints) {
      const updatedState = {
        ...nextState,
        checkpointIndex: nextState.checkpointIndex + 1,
        phase: PHASES.CHECKPOINT,
      };
      return checkpointPhase(updatedState, getSectionDoc, getNodeData, {
        sectionDoc: currentSectionDoc,
        checkpointsSnapshot,
      });
    }
  }

  const nextSectionDoc = await getSectionDoc(nextState.sectionIndex + 2);
  if (nextSectionDoc) {
    const updatedState = {
      ...nextState,
      sectionIndex: nextState.sectionIndex + 1,
      checkpointIndex: 0,
      phase: PHASES.TEACH,
    };
    return teachPhase(updatedState, getSectionDoc, getNodeData);
  }

  return summaryPhase({ ...nextState, phase: PHASES.SUMMARY }, getNodeData);
}

function feedbackPhase(nextState) {
  return {
    nextState,
    uiResponse: {
      type: 'TRANSITION_CARD',
      title: 'Moving On',
      message: "Let's proceed to the next part.",
    },
  };
}

async function summaryPhase(nextState, getNodeData) {
  const nodeData = await getNodeData();
  const keyPointsText = (nodeData.key_points || []).map((pt) => `- ${pt}`).join('\n');
  return {
    nextState: { ...nextState, phase: PHASES.COMPLETE },
    uiResponse: {
      type: 'SUMMARY_CARD',
      title: 'Topic Summary',
      message: `Great work! Here are the key points from this topic:\n${keyPointsText}`,
      isTopicComplete: true,
      autoAdvance: true,
      nextPhase: PHASES.COMPLETE,
    },
  };
}

function completePhase(nextState) {
  return {
    nextState,
    uiResponse: {
      type: 'TOPIC_COMPLETE',
      title: 'Topic Complete!',
      message: "Congratulations! You've successfully finished this topic.",
    },
  };
}

async function gradeShortCheckpointAnswer(checkpointData, userInput) {
  const fallback = {
    verdict: 'incorrect',
    feedback:
      "I couldn't automatically evaluate that response. Review the rationale above and try again.",
  };

  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel(
      { model: 'models/gemini-2.0-flash-lite-001' },
      { apiVersion: 'v1' },
    );

    const serializedQuestion = JSON.stringify(checkpointData.question_md ?? '');
    const serializedRationale = JSON.stringify(checkpointData.rationale_md ?? '');
    const serializedAnswer = JSON.stringify(
      typeof userInput === 'string' ? userInput : userInput ?? '',
    );

    const gradingPrompt = [
      'You are an expert radiology proctor.',
      `Question (JSON): ${serializedQuestion}`,
      `Key Concepts (JSON): ${serializedRationale}`,
      `Student Answer (JSON): ${serializedAnswer}`,
      'Tasks:',
      '1. Evaluate the student answer.',
      '2. Determine a verdict: "correct", "partially_correct", or "incorrect".',
      '3. Provide concise feedback.',
      'Return ONLY a JSON object that matches the provided schema. Do not wrap the response in backticks or include commentary.',
    ].join('\n');

    const result = await runWithRetry(() =>
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: gradingPrompt }] }],
      }),
    );

    const raw = result?.response?.text?.() ?? '';
    const parsed = tryParseStrictJson(raw);

    if (parsed && typeof parsed.verdict === 'string' && typeof parsed.feedback === 'string') {
      return parsed;
    }

    console.warn('Gemini returned malformed grading payload', raw);
    return fallback;
  } catch (error) {
    console.error('Failed to grade short-answer checkpoint', error);
    return fallback;
  }
}

function tryParseStrictJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    const trimmed = raw.trim();
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1]);
      } catch (innerError) {
        console.error('Failed to parse fenced JSON payload', innerError, fenceMatch[1]);
      }
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const probable = trimmed.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(probable);
      } catch (braceError) {
        console.error('Failed to parse extracted JSON payload', braceError, probable);
      }
    }
    console.error('Gemini grading parse error', error, trimmed);
    return null;
  }
}
