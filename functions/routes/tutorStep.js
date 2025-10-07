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
};

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
    return `You are RadMentor, an expert Socratic tutor.  
    Transform the following content into a short, clear teaching lesson.  
    - Preserve the original meaning closely (do not over-rephrase).  
    - Focus on making it easy to understand and engaging.  
    - Use Markdown for structure (titles, bullet points, emphasis).  
    - End with EXACTLY ONE open-ended Socratic question that requires the learner to apply a specific fact, term, or detail you just taught. 
    - The question must reference at least one concrete concept from your explanation (avoid generic “what do you think?” prompts). 
    Do not add external knowledge.\n\nTEXT TO REPHRASE:\n---\n<title>: ${title}\n<body_md>: """${body}"""\n---`;
};

const socraticEvaluationPrompt = (lessonText, userAnswer) => {
  return `You are a Socratic tutor. A student has answered your question about a lesson.
  - The Original Lesson Text was: "${lessonText}"
  - The Student's Answer is: "${userAnswer}"

  TASK: Evaluate the student's answer based on the original lesson text.
  1. If they are correct, briefly praise them.
  2. If they are incorrect or partially correct, gently correct their misunderstanding.
  3. Your response MUST end with a clear transition to the next step, like "Now, let's move on to a quick checkpoint."
  4. CRITICAL RULE: Do NOT ask another question in your response.
  5. CRITICAL RULE: Do NOT say "The lesson highlights" or refer to the source material. Present the knowledge as your own.
  6. CRITICAL RULE: Never say "the lesson states" or any phrasing that references notes; speak as if you hold the knowledge directly.

  Your response should be a single, concise paragraph.`;
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
            const genAI = getGenAI();
            const model = genAI.getGenerativeModel(
              { model: "models/gemini-2.0-flash-lite-001" },
              { apiVersion: "v1" }
            );
            const prompt = socraticTeachPrompt(sectionData.title, sectionData.body_md);
            const result = await runWithRetry(() => model.generateContent(prompt));
            let message = result.response.text();
            if (!message.trim().endsWith('?')) {
                message = `${sectionData.body_md}\n\n**Based on this, what are your thoughts?**`;
            }
            uiResponse = { type: 'TEACH_CARD', title: sectionData.title, message, assets: { images: sectionData.images || [], cases: sectionData.cases || [] } };
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
              const prompt = socraticEvaluationPrompt(sectionData.body_md, userInput);
              const result = await runWithRetry(() => model.generateContent(prompt));
              uiResponse = { type: 'TRANSITION_CARD', title: "Let's review your thoughts", message: result.response.text() };
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
    batch.set(assistantMessageRef, { role: 'assistant', ui: uiResponse, timestamp: FieldValue.serverTimestamp() });

    const shouldSaveFullProgress = nextState.phase === 'FEEDBACK' || nextState.phase === 'SUMMARY' || nextState.phase === 'COMPLETE';

    if (shouldSaveFullProgress) {
        console.log(`Checkpoint reached. Saving full progress at phase: ${nextState.phase}`);
        const nodeSnap = await nodeRef.get();
        const topicTitle = nodeSnap.data()?.name || 'Untitled Topic';
        const chapterId = nextState.organ;
        const calculatedPercent = 100;
        
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
    res.json({ ui: uiResponse });

  } catch (error) {
    console.error(`Error in /tutor/step for user ${userId}:`, error);
    if (error?.status === 503 || error?.status === 429) {
      return res.status(503).json({ ui: { type: 'ERROR', message: 'Tutor is busy right now. Please try again in a few seconds.' }});
    }
    res.status(500).json({ ui: { type: 'ERROR', message: 'A critical server error occurred.' }});
  }
});

export default router;
