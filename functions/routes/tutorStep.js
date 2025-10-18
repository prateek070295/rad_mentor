import express from "express";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getGenAI, runWithRetry } from "../helpers.js";

const router = express.Router();

// --- 1. Initial State Definition ---
const INITIAL_STATE = {
  sectionIndex: 0,
  checkpointIndex: 0,
  phase: 'INIT',
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
    safe.options = safe.options.map((option) => toStringSafe(option));
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
    case 'INIT':
      if (event.type === 'START') return { ...state, phase: 'INTRO' };
      break;
    case 'INTRO':
      if (event.type === 'USER_ANSWER') return { ...state, phase: 'TEACH' };
      break;
    case 'TEACH':
      if (event.type === 'USER_ANSWER') return { ...state, phase: 'SOCRATIC_EVAL' };
      break;
    case 'SOCRATIC_EVAL':
      if (event.type === 'USER_ANSWER') return { ...state, phase: 'CHECKPOINT' };
      break;
    case 'CHECKPOINT':
      if (event.type === 'USER_ANSWER') return { ...state, phase: 'EVAL' };
      break;
    case 'EVAL':
      if (event.type === 'GRADE_RESULT') return { ...state, phase: 'FEEDBACK' };
      break;
    case 'FEEDBACK':
      if (event.type === 'USER_ANSWER') return { ...state, phase: 'ADVANCE' };
      break;
    case 'SUMMARY':
      if (event.type === 'USER_ANSWER') return { ...state, phase: 'COMPLETE' };
      break;
    case 'ADVANCE':
    case 'COMPLETE':
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
  
  const { userInput, topicId, organ, userName } = req.body;
  if (!topicId || !organ) {
    return res.status(400).json({ error: 'topicId and organ are required.' });
  }

  try {
    const progressRef = db.doc(`userProgress/${userId}/topics/${topicId}`);
    const sessionRef = db.doc(`userProgress/${userId}/sessions/${topicId}`);
    const messagesRef = sessionRef.collection('messages');

    const sessionSnap = await sessionRef.get();
    let currentState;
    let event;

    if (!sessionSnap.exists) {
      currentState = { ...INITIAL_STATE, topicId, organ, userName: userName || "Dr." };
      event = { type: 'START', userInput };
    } else {
      currentState = sessionSnap.data().sessionState;
      if (userInput === undefined) {
        const lastMessageSnap = await messagesRef.orderBy('timestamp', 'desc').limit(1).get();
        if (!lastMessageSnap.empty && lastMessageSnap.docs[0].data().role === 'assistant') {
          return res.json({ ui: lastMessageSnap.docs[0].data().ui });
        }
        event = { type: 'START', userInput: undefined };
      } else {
        event = { type: 'USER_ANSWER', userInput };
      }
    }
    
    let nextState = reducer(currentState, event);
    let uiResponse = {};
    const nodeRef = db.collection('sections').doc(nextState.organ).collection('nodes').doc(nextState.topicId);
    
    if (nextState.phase === 'EVAL') {
        const sectionsRef = nodeRef.collection('contentSections');
        const sectionQuery = sectionsRef.where('order', '==', currentState.sectionIndex + 1).limit(1);
        const sectionSnapshot = await sectionQuery.get();
        if (sectionSnapshot.empty) {
            nextState = { ...nextState, phase: 'SUMMARY' };
        } else {
            const sectionDoc = sectionSnapshot.docs[0];
            const checkpointsRef = sectionDoc.ref.collection('checkpoints');
            const allCheckpointsSnapshot = await checkpointsRef.orderBy('bloom_level').get();
            if (allCheckpointsSnapshot.empty || currentState.checkpointIndex >= allCheckpointsSnapshot.size) {
                nextState = { ...nextState, phase: 'SUMMARY' };
            } else {
                const checkpointData = allCheckpointsSnapshot.docs[currentState.checkpointIndex].data();
                let isCorrect = false;
                let feedbackMessage = "";
                if (checkpointData.type === 'mcq') {
                    isCorrect = checkpointData.correct_index === userInput.selectedIndex;
                    feedbackMessage = `**Rationale:** ${checkpointData.rationale_md}`;
                } else if (checkpointData.type === 'short') {
                    const genAI = getGenAI();
                    const model = genAI.getGenerativeModel(
                      { model: "models/gemini-2.0-flash-lite-001" },
                      { apiVersion: "v1" }
                    );
                    const gradingPrompt = `You are an expert radiology proctor. CONTEXT: - Question: "${checkpointData.question_md}" - Key Concepts: "${checkpointData.rationale_md}" - Student's Answer: "${userInput}" TASK: 1. Evaluate the student's answer. 2. Determine a 'verdict': "correct", "partially_correct", or "incorrect". 3. Write a concise 'feedback' message. If 'partially_correct', praise the correct parts and explain what was missing. 4. **IMPORTANT**: Do NOT use "Key Concepts". Your response MUST be a valid JSON object: { "verdict": "...", "feedback": "..." }`;
                    const result = await runWithRetry(() => model.generateContent(gradingPrompt));
                    const gradingResponse = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());
                    isCorrect = gradingResponse.verdict === 'correct' || gradingResponse.verdict === 'partially_correct';
                    feedbackMessage = gradingResponse.feedback;
                }
                uiResponse = { type: 'FEEDBACK_CARD', title: isCorrect ? 'Correct!' : 'Feedback', message: feedbackMessage, isCorrect };
                nextState = reducer(nextState, { type: 'GRADE_RESULT' });
            }
        }
    } 
    else if (nextState.phase === 'ADVANCE') {
        const sectionsRef = nodeRef.collection('contentSections');
        const currentSectionQuery = sectionsRef.where('order', '==', currentState.sectionIndex + 1).limit(1);
        const currentSectionSnapshot = await currentSectionQuery.get();
        if (currentSectionSnapshot.empty) {
            nextState = { ...nextState, phase: 'SUMMARY' };
        } else {
            const checkpointsRef = currentSectionSnapshot.docs[0].ref.collection('checkpoints');
            const allCheckpointsSnapshot = await checkpointsRef.get();
            const totalCheckpoints = allCheckpointsSnapshot.size;
            if (currentState.checkpointIndex + 1 < totalCheckpoints) {
                nextState = { ...nextState, checkpointIndex: currentState.checkpointIndex + 1, phase: 'CHECKPOINT' };
            } else {
                const nextSectionQuery = sectionsRef.where('order', '==', currentState.sectionIndex + 2).limit(1);
                const nextSectionSnapshot = await nextSectionQuery.get();
                if (!nextSectionSnapshot.empty) {
                    nextState = { ...nextState, sectionIndex: currentState.sectionIndex + 1, checkpointIndex: 0, phase: 'TEACH' };
                } else {
                    nextState = { ...nextState, phase: 'SUMMARY' };
                }
            }
        }
    }
    
    const sectionsRef = nodeRef.collection('contentSections');
    switch(nextState.phase) {
      case 'INTRO': {
        const nodeSnap = await nodeRef.get();
        const nodeData = nodeSnap.data();
        const objectivesText = (nodeData.objectives || []).map(obj => `- ${obj}`).join('\n');
        const message = `Hello ${nextState.userName}, welcome to the topic on "${nodeData.name}".\n\nHere are our learning objectives:\n${objectivesText}\n\nReady to begin?`;
        uiResponse = { type: 'OBJECTIVES_CARD', title: `Topic Objectives`, message };
        break;
      }
      case 'TEACH': {
        const sectionQuery = sectionsRef.where('order', '==', nextState.sectionIndex + 1).limit(1);
        const sectionSnapshot = await sectionQuery.get();
        if (sectionSnapshot.empty) {
            nextState.phase = 'SUMMARY';
            // Fall through to SUMMARY case if no more sections
        } else {
            const sectionData = sectionSnapshot.docs[0].data();
            const cleanedBody = stripTablesFromText(sectionData.body_md || "");
            const genAI = getGenAI();
            const model = genAI.getGenerativeModel(
              { model: "models/gemini-2.0-flash-lite-001" },
              { apiVersion: "v1" }
            );
            const prompt = socraticTeachPrompt(sectionData.title, cleanedBody);
            const result = await runWithRetry(() => model.generateContent(prompt));
            const { cleaned: cleanedMessage, answer: expectedAnswer } = extractExpectedAnswer(result.response.text());
            let message = cleanedMessage;
            if (!message.trim().endsWith('?')) {
                message = `${cleanedBody}\n\n**Based on this, what are your thoughts?**`;
            }
            const teachQuestion =
              message
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .reverse()
                .find((line) => line.endsWith('?')) || '';
            const normalizedTables = sanitizeTablesForUi(sectionData.tables);
            uiResponse = {
              type: 'TEACH_CARD',
              title: sectionData.title,
              message,
              assets: { images: sectionData.images || [], cases: sectionData.cases || [] },
              tables: normalizedTables,
            };
            nextState = {
              ...nextState,
              lastTeachAnswer: expectedAnswer || "",
              lastTeachQuestion: teachQuestion,
            };
            break;
        }
      }
      case 'SOCRATIC_EVAL': {
          const sectionQuery = sectionsRef.where('order', '==', currentState.sectionIndex + 1).limit(1);
          const sectionSnapshot = await sectionQuery.get();
          if (sectionSnapshot.empty) {
              nextState = { ...nextState, phase: 'SUMMARY' };
          } else {
              const sectionData = sectionSnapshot.docs[0].data();
              const genAI = getGenAI();
              const model = genAI.getGenerativeModel(
                { model: "models/gemini-2.0-flash-lite-001" },
                { apiVersion: "v1" }
              );
              const prompt = socraticEvaluationPrompt(
                stripTablesFromText(sectionData.body_md || ""),
                userInput,
                currentState.lastTeachAnswer || "",
                currentState.lastTeachQuestion || "",
              );
              const result = await runWithRetry(() => model.generateContent(prompt));
              const { feedback, transition } = parseFeedbackWithTransition(result.response.text());
              const transitionLine = transition || DEFAULT_TRANSITION_LINE;
              const combinedMessage = feedback
                ? `${feedback}\n\n${transitionLine}`
                : transitionLine;
              uiResponse = {
                type: 'TRANSITION_CARD',
                title: "Let's review your thoughts",
                message: combinedMessage,
              };
              nextState = {
                ...nextState,
                lastTeachAnswer: "",
                lastTeachQuestion: "",
              };
          }
          break;
      }
      case 'CHECKPOINT': {
          const sectionQuery = sectionsRef.where('order', '==', nextState.sectionIndex + 1).limit(1);
          const sectionSnapshot = await sectionQuery.get();
          if (sectionSnapshot.empty) {
                nextState = { ...nextState, phase: 'SUMMARY' };
          } else {
              const sectionDoc = sectionSnapshot.docs[0];
              const checkpointsRef = sectionDoc.ref.collection('checkpoints');
              const allCheckpointsSnapshot = await checkpointsRef.orderBy('bloom_level').get();
              if (allCheckpointsSnapshot.empty || nextState.checkpointIndex >= allCheckpointsSnapshot.size) {
                    nextState = { ...nextState, phase: 'SUMMARY' };
              } else {
                  const checkpointData = allCheckpointsSnapshot.docs[nextState.checkpointIndex].data();
                  uiResponse = {
                      type: checkpointData.type === 'mcq' ? 'MCQ_CHECKPOINT' : 'SHORT_CHECKPOINT',
                      title: `Checkpoint for: ${sectionDoc.data().title}`,
                      message: checkpointData.question_md,
                      options: checkpointData.options || null,
                  };
              }
          }
          break;
      }
      case 'FEEDBACK': {
        if (!uiResponse.type) {
          uiResponse = { type: 'TRANSITION_CARD', title: "Moving On", message: "Let's proceed to the next part." };
        }
        break;
      }
      case 'SUMMARY': {
          if (!uiResponse.type) {
              const nodeSnap = await nodeRef.get();
              const nodeData = nodeSnap.data();
              const keyPointsText = (nodeData.key_points || []).map(pt => `- ${pt}`).join('\n');
              uiResponse = { type: 'SUMMARY_CARD', title: "Topic Summary", message: `Great work! Here are the key points from this topic:\n${keyPointsText}`, isTopicComplete: true };
          }
          break;
      }
      case 'COMPLETE': {
          uiResponse = { type: 'TOPIC_COMPLETE', title: "Topic Complete!", message: "Congratulations! You've successfully finished this topic." };
          break;
      }
      default:
        if (!uiResponse.type) {
          uiResponse = { type: 'ERROR', message: `Reached an unknown state: ${nextState.phase}` };
        }
        break;
    }

    if ((nextState.phase === 'SUMMARY' || nextState.phase === 'CHECKPOINT' || nextState.phase === 'TEACH') && !uiResponse.type) {
        // This is a consolidated fallback for generating the final card if a phase transition results in no UI
        const nodeSnap = await nodeRef.get();
        const nodeData = nodeSnap.data();
        const keyPointsText = (nodeData.key_points || []).map(pt => `- ${pt}`).join('\n');
        uiResponse = { type: 'SUMMARY_CARD', title: "Topic Summary", message: `Great work! Here are the key points from this topic:\n${keyPointsText}`, isTopicComplete: true };
    }

    const batch = db.batch();
    
    if (userInput !== undefined && userInput !== 'continue') {
        const userMessageRef = messagesRef.doc();
        batch.set(userMessageRef, {
            role: 'user',
            userInput: userInput,
            timestamp: FieldValue.serverTimestamp()
        });
    }
    const assistantMessageRef = messagesRef.doc();
    const sanitizedUi = sanitizeUiForFirestore(uiResponse);
    batch.set(assistantMessageRef, {
      role: 'assistant',
      ui: sanitizedUi,
      timestamp: FieldValue.serverTimestamp(),
    });

    const shouldSaveFullProgress = nextState.phase === 'FEEDBACK' || nextState.phase === 'SUMMARY' || nextState.phase === 'COMPLETE';

    if (shouldSaveFullProgress) {
        console.log(`Checkpoint reached. Saving full progress at phase: ${nextState.phase}`);
        const nodeSnap = await nodeRef.get();
        const topicData = nodeSnap.data() || {};
        const topicTitle = topicData.name || 'Untitled Topic';
        const chapterId = nextState.organ;

        let calculatedPercent = 0;
        try {
            const sectionsSnapshot = await sectionsRef.orderBy('order').get();
            const orderedSections = sectionsSnapshot.docs
              .map((doc) => ({
                order: Number(doc.data()?.order ?? 0),
                ref: doc.ref,
              }))
              .sort((a, b) => a.order - b.order);

            const totalSections = orderedSections.length || 1;

            if (nextState.phase === 'SUMMARY' || nextState.phase === 'COMPLETE') {
              calculatedPercent = 100;
            } else {
              const completedSections = Math.max(0, Math.min(nextState.sectionIndex, totalSections));
              const currentSectionIndex = Math.min(nextState.sectionIndex, totalSections - 1);
              const currentSectionEntry =
                orderedSections.find((entry) => entry.order === nextState.sectionIndex + 1) ||
                orderedSections[currentSectionIndex];

              let sectionFraction = 0;
              if (currentSectionEntry) {
                const checkpointsSnapshot = await currentSectionEntry.ref.collection('checkpoints').get();
                const totalCheckpoints = checkpointsSnapshot.size || 1;
                const baseCompleted = Math.min(nextState.checkpointIndex, totalCheckpoints);
                const adjustedCompleted =
                  nextState.phase === 'FEEDBACK'
                    ? Math.min(baseCompleted + 1, totalCheckpoints)
                    : Math.min(baseCompleted, totalCheckpoints);
                sectionFraction = adjustedCompleted / totalCheckpoints;
              }

              calculatedPercent = ((completedSections + sectionFraction) / totalSections) * 100;
              calculatedPercent = Math.max(0, Math.min(100, Math.round(calculatedPercent)));
            }
        } catch (progressError) {
            console.error("Failed to compute topic progress", progressError);
            calculatedPercent = nextState.phase === 'SUMMARY' || nextState.phase === 'COMPLETE' ? 100 : 0;
        }
        
        const progressData = {
            status: (nextState.phase === 'SUMMARY' || nextState.phase === 'COMPLETE') ? 'completed' : 'in-progress',
            updatedAt: FieldValue.serverTimestamp(),
            percentComplete: calculatedPercent,
            topicTitle,
            chapterId
        };
        batch.set(progressRef, progressData, { merge: true });
    }
    
    batch.set(sessionRef, { 
        sessionState: nextState,
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();
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


