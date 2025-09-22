import express from "express";
import { getFirestore } from "firebase-admin/firestore";
import { getGenAI } from "../helpers.js"; // Import the helper for Gemini API access

const router = express.Router();

// --- 1. Initial State Definition ---
const INITIAL_STATE = {
  topicId: null,
  organ: null,
  sectionIndex: 0,
  checkpointIndex: 0, // Keeps track of the current checkpoint
  phase: 'INIT',
  mastery: {},
  history: [],
};

// --- 2. The State Reducer (The FSM Logic) ---
const reducer = (state, event) => {
  console.log(`Reducer: In phase ${state.phase}, received event ${event.type}`);
  switch (state.phase) {
    case 'INIT':
      if (event.type === 'START') return { ...state, phase: 'TEACH' };
      break;
    case 'TEACH':
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
    case 'ADVANCE':
      return { ...state, sectionIndex: state.sectionIndex + 1, checkpointIndex: 0, phase: 'TEACH' };
    default:
      return state;
  }
  return state;
};

// --- 3. The API Endpoint ---
router.post("/", express.json(), async (req, res) => {
  const db = getFirestore(); // Initialize DB inside the handler
  try {
    const { sessionState, userInput, topicId, organ } = req.body;

    let currentState = sessionState || { ...INITIAL_STATE, topicId, organ };
    let event = { type: sessionState ? 'USER_ANSWER' : 'START', userInput };
    
    let nextState = reducer(currentState, event);
    
    let uiResponse = {};
    let responseErrors = null;
    
    let isStableState = false;
    while (!isStableState) {
        const sectionsRef = db.collection('sections').doc(nextState.organ).collection('nodes').doc(nextState.topicId).collection('contentSections');
        
        switch(nextState.phase) {
            case 'TEACH': {
                const allSectionsSnapshot = await sectionsRef.get();
                const totalSections = allSectionsSnapshot.size;

                if (nextState.sectionIndex >= totalSections) {
                    uiResponse = { type: 'TOPIC_COMPLETE', title: "Topic Complete!", message: "Congratulations! You've finished all sections for this topic." };
                } else {
                    const sectionQuery = sectionsRef.where('order', '==', nextState.sectionIndex + 1).limit(1);
                    const sectionSnapshot = await sectionQuery.get();
                    if (sectionSnapshot.empty) throw new Error(`Section order ${nextState.sectionIndex + 1} not found.`);
                    const sectionData = sectionSnapshot.docs[0].data();
                    uiResponse = { type: 'TEACH_CARD', title: sectionData.title, message: sectionData.body_md, assets: { images: sectionData.images || [], cases: sectionData.cases || [] } };
                }
                isStableState = true;
                break;
            }

            case 'CHECKPOINT': {
                const sectionQuery = sectionsRef.where('order', '==', nextState.sectionIndex + 1).limit(1);
                const sectionSnapshot = await sectionQuery.get();
                if (sectionSnapshot.empty) throw new Error(`Section order ${nextState.sectionIndex + 1} not found.`);
                
                const sectionDoc = sectionSnapshot.docs[0];
                const checkpointsRef = sectionDoc.ref.collection('checkpoints');
                const checkpointQuery = checkpointsRef.orderBy('bloom_level').limit(1);
                const checkpointSnapshot = await checkpointQuery.get();
                if (checkpointSnapshot.empty) throw new Error(`No checkpoints found for section ${sectionDoc.id}.`);

                const checkpointData = checkpointSnapshot.docs[0].data();
                uiResponse = {
                    type: checkpointData.type === 'mcq' ? 'MCQ_CHECKPOINT' : 'SHORT_CHECKPOINT',
                    title: `Checkpoint for: ${sectionDoc.data().title}`,
                    message: checkpointData.question_md,
                    options: checkpointData.options || null,
                };
                isStableState = true;
                break;
            }
            
            case 'EVAL': {
                const sectionQuery = sectionsRef.where('order', '==', currentState.sectionIndex + 1).limit(1);
                const sectionSnapshot = await sectionQuery.get();
                const sectionDoc = sectionSnapshot.docs[0];
                const checkpointsRef = sectionDoc.ref.collection('checkpoints');
                const checkpointQuery = checkpointsRef.orderBy('bloom_level').limit(1);
                const checkpointSnapshot = await checkpointQuery.get();
                const checkpointData = checkpointSnapshot.docs[0].data();
                
                let isCorrect = false;
                let feedbackMessage = "";

                if (checkpointData.type === 'mcq') {
                    isCorrect = checkpointData.correct_index === userInput.selectedIndex;
                    feedbackMessage = checkpointData.rationale_md;
                } else if (checkpointData.type === 'short') {
                    const genAI = getGenAI();
                    const model = genAI.getGenerativeModel({ 
                        model: "gemini-1.5-flash-latest",
                        generationConfig: { responseMimeType: "application/json" },
                    });
                    
                    const gradingPrompt = `
                      You are an expert radiology proctor evaluating a resident's short answer.

                      CONTEXT:
                      - Question: "${checkpointData.question_md}"
                      - Key Concepts for a Complete Answer: "${checkpointData.rationale_md}"
                      - Student's Answer: "${userInput}"

                      TASK:
                      1.  Evaluate the student's answer by comparing it to the 'Key Concepts'.
                      2.  Determine a 'verdict': "correct", "partially_correct", or "incorrect".
                      3.  Write a concise 'feedback' message.
                          - If 'partially_correct', praise what the student got right and then gently explain what key concepts were missing.
                          - If 'incorrect', explain the misunderstanding.
                      4.  **IMPORTANT**: In your feedback message, speak naturally to the student. DO NOT use the literal phrases "Key Concepts" or "Grading Key".

                      Your response MUST be a valid JSON object with this exact structure: { "verdict": "...", "feedback": "..." }
                    `;
                    
                    const result = await model.generateContent(gradingPrompt);
                    const gradingResponseText = result.response.text();
                    const gradingResponse = JSON.parse(gradingResponseText);
                    
                    isCorrect = gradingResponse.verdict === 'correct' || gradingResponse.verdict === 'partially_correct';
                    feedbackMessage = gradingResponse.feedback;
                }

                uiResponse = { 
                    type: 'FEEDBACK_CARD', 
                    title: isCorrect ? 'Correct!' : 'Feedback', 
                    message: feedbackMessage, 
                    isCorrect: isCorrect 
                };

                nextState = reducer(nextState, { type: 'GRADE_RESULT' });
                isStableState = true;
                break;
            }

            case 'ADVANCE': {
                nextState = reducer(nextState, { type: 'CONTINUE' });
                break; // Let the loop continue to the 'TEACH' case
            }

            default:
                uiResponse = { type: 'ERROR', message: `Reached an unknown or unimplemented state: ${nextState.phase}` };
                isStableState = true;
                break;
        }
    }

    res.json({ newSessionState: nextState, ui: uiResponse, errors: responseErrors });

  } catch (error) {
    console.error("Error in /tutor/step endpoint:", error);
    res.status(500).json({ newSessionState: req.body.sessionState, ui: { type: 'ERROR', message: 'A critical server error occurred.' }, errors: [{ code: 'SERVER_ERROR', message: error.message }] });
  }
});

export default router;

