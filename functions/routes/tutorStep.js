import express from "express";
import { getFirestore } from "firebase-admin/firestore";
import { getGenAI } from "../helpers.js";

const router = express.Router();

// --- 1. Initial State Definition ---
const INITIAL_STATE = {
  topicId: null,
  organ: null,
  userName: "Dr.",
  sectionIndex: 0,
  checkpointIndex: 0,
  phase: 'INIT',
  mastery: {},
  history: [],
};

// --- 2. The State Reducer ---
// This reducer handles the primary state transitions based on user actions.
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
      // After feedback, we enter the ADVANCE phase to decide what's next.
      if (event.type === 'USER_ANSWER') return { ...state, phase: 'ADVANCE' };
      break;
    case 'SUMMARY':
      if (event.type === 'USER_ANSWER') return { ...state, phase: 'COMPLETE' };
      break;
    // ADVANCE, and COMPLETE are terminal or handled outside the main flow.
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
    return `You are RadMentor, an expert Socratic tutor. Rephrase the following text into a short, engaging lesson. Use Markdown for clarity. End with EXACTLY ONE open-ended Socratic question. Do not add external knowledge.\n\nTEXT TO REPHRASE:\n---\n<title>: ${title}\n<body_md>: """${body}"""\n---`;
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
  
  Your response should be a single, concise paragraph.`;
};


// --- 4. The API Endpoint ---
router.post("/", express.json(), async (req, res) => {
  const db = getFirestore();
  try {
    const { sessionState, userInput, topicId, organ, userName } = req.body;

    let currentState = sessionState || { ...INITIAL_STATE, topicId, organ, userName: userName || "Dr." };
    let event = { type: sessionState ? 'USER_ANSWER' : 'START', userInput };
    let nextState = reducer(currentState, event);
    
    let uiResponse = {};
    const nodeRef = db.collection('sections').doc(nextState.organ).collection('nodes').doc(nextState.topicId);
    
    if (nextState.phase === 'EVAL') {
        const sectionsRef = nodeRef.collection('contentSections');
        const sectionQuery = sectionsRef.where('order', '==', currentState.sectionIndex + 1).limit(1);
        const sectionSnapshot = await sectionQuery.get();

        if (sectionSnapshot.empty) {
            console.warn(`EVAL: Section not found for index ${currentState.sectionIndex}. Advancing to summary.`);
            nextState = { ...nextState, phase: 'SUMMARY' };
        } else {
            const sectionDoc = sectionSnapshot.docs[0];
            const checkpointsRef = sectionDoc.ref.collection('checkpoints');
            // Fetch all checkpoints and sort them to get the correct one
            const allCheckpointsSnapshot = await checkpointsRef.orderBy('bloom_level').get();
            
            if (allCheckpointsSnapshot.empty || currentState.checkpointIndex >= allCheckpointsSnapshot.size) {
                console.warn(`EVAL: Checkpoint not found for index ${currentState.checkpointIndex} in section ${currentState.sectionIndex}. Advancing to summary.`);
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
                    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });
                    const gradingPrompt = `You are an expert radiology proctor. CONTEXT: - Question: "${checkpointData.question_md}" - Key Concepts: "${checkpointData.rationale_md}" - Student's Answer: "${userInput}" TASK: 1. Evaluate the student's answer. 2. Determine a 'verdict': "correct", "partially_correct", or "incorrect". 3. Write a concise 'feedback' message. If 'partially_correct', praise the correct parts and explain what was missing. 4. **IMPORTANT**: Do NOT use "Key Concepts". Your response MUST be a valid JSON object: { "verdict": "...", "feedback": "..." }`;
                    const result = await model.generateContent(gradingPrompt);
                    const gradingResponse = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());
                    isCorrect = gradingResponse.verdict === 'correct' || gradingResponse.verdict === 'partially_correct';
                    feedbackMessage = gradingResponse.feedback;
                }

                uiResponse = { type: 'FEEDBACK_CARD', title: isCorrect ? 'Correct!' : 'Feedback', message: feedbackMessage, isCorrect };
                nextState = reducer(nextState, { type: 'GRADE_RESULT' });
            }
        }
    } 
    // CORRECTED ADVANCE LOGIC
    else if (nextState.phase === 'ADVANCE') {
        const sectionsRef = nodeRef.collection('contentSections');
        const currentSectionQuery = sectionsRef.where('order', '==', currentState.sectionIndex + 1).limit(1);
        const currentSectionSnapshot = await currentSectionQuery.get();
        
        if (currentSectionSnapshot.empty) {
            // Can't find current section, something is wrong. Go to summary.
            nextState = { ...nextState, phase: 'SUMMARY' };
        } else {
            const checkpointsRef = currentSectionSnapshot.docs[0].ref.collection('checkpoints');
            const allCheckpointsSnapshot = await checkpointsRef.get();
            const totalCheckpoints = allCheckpointsSnapshot.size;

            if (currentState.checkpointIndex + 1 < totalCheckpoints) {
                // More checkpoints exist in the current section.
                nextState = { ...nextState, checkpointIndex: currentState.checkpointIndex + 1, phase: 'CHECKPOINT' };
            } else {
                // End of checkpoints, look for the next section.
                const nextSectionQuery = sectionsRef.where('order', '==', currentState.sectionIndex + 2).limit(1);
                const nextSectionSnapshot = await nextSectionQuery.get();

                if (!nextSectionSnapshot.empty) {
                    // Next section found.
                    nextState = { ...nextState, sectionIndex: currentState.sectionIndex + 1, checkpointIndex: 0, phase: 'TEACH' };
                } else {
                    // No more sections.
                    nextState = { ...nextState, phase: 'SUMMARY' };
                }
            }
        }
    }
    
    // The main switch for generating the UI based on the final, calculated state.
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
            const nodeSnap = await nodeRef.get();
            const nodeData = nodeSnap.data();
            const keyPointsText = (nodeData.key_points || []).map(pt => `- ${pt}`).join('\n');
            uiResponse = { type: 'SUMMARY_CARD', title: "Topic Summary", message: `Great work! Here are the key points from this topic:\n${keyPointsText}`};
        } else {
            const sectionData = sectionSnapshot.docs[0].data();
            const genAI = getGenAI();
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
            const prompt = socraticTeachPrompt(sectionData.title, sectionData.body_md);
            const result = await model.generateContent(prompt);
            let message = result.response.text();

            if (!message.trim().endsWith('?')) {
                console.warn("AI response for TEACH failed validation (did not end with '?'). Using fallback.");
                message = `${sectionData.body_md}\n\n**Based on this, what are your thoughts?**`;
            }
            uiResponse = { type: 'TEACH_CARD', title: sectionData.title, message, assets: { images: sectionData.images || [], cases: sectionData.cases || [] } };
        }
        break;
      }
      case 'SOCRATIC_EVAL': {
          const sectionQuery = sectionsRef.where('order', '==', currentState.sectionIndex + 1).limit(1);
          const sectionSnapshot = await sectionQuery.get();
          if (sectionSnapshot.empty) {
              console.warn(`SOCRATIC_EVAL: Section not found for index ${currentState.sectionIndex}. Advancing to summary.`);
              nextState = { ...nextState, phase: 'SUMMARY' };
              const nodeSnap = await nodeRef.get();
              const nodeData = nodeSnap.data();
              const keyPointsText = (nodeData.key_points || []).map(pt => `- ${pt}`).join('\n');
              uiResponse = { type: 'SUMMARY_CARD', title: "Topic Summary", message: `Great work! Here are the key points from this topic:\n${keyPointsText}`};
          } else {
              const sectionData = sectionSnapshot.docs[0].data();
              const genAI = getGenAI();
              const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
              const prompt = socraticEvaluationPrompt(sectionData.body_md, userInput);
              const result = await model.generateContent(prompt);

              uiResponse = { 
                type: 'TRANSITION_CARD', 
                title: "Let's review your thoughts", 
                message: result.response.text() 
              };
          }
          break;
      }
      case 'CHECKPOINT': {
          const sectionQuery = sectionsRef.where('order', '==', nextState.sectionIndex + 1).limit(1);
          const sectionSnapshot = await sectionQuery.get();
          
          if (sectionSnapshot.empty) {
                console.warn(`CHECKPOINT: Section not found for index ${nextState.sectionIndex}. Advancing to summary.`);
                nextState = { ...nextState, phase: 'SUMMARY' };
          } else {
              const sectionDoc = sectionSnapshot.docs[0];
              const checkpointsRef = sectionDoc.ref.collection('checkpoints');
              // Fetch all checkpoints and sort them to get the correct one
              const allCheckpointsSnapshot = await checkpointsRef.orderBy('bloom_level').get();
              
              if (allCheckpointsSnapshot.empty || nextState.checkpointIndex >= allCheckpointsSnapshot.size) {
                    console.warn(`CHECKPOINT: Checkpoint not found for index ${nextState.checkpointIndex} in section ${nextState.sectionIndex}. Advancing to summary.`);
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
          // If we fell through to summary, we need to populate the uiResponse
          if (nextState.phase === 'SUMMARY' && !uiResponse.type) {
              const nodeSnap = await nodeRef.get();
              const nodeData = nodeSnap.data();
              const keyPointsText = (nodeData.key_points || []).map(pt => `- ${pt}`).join('\n');
              uiResponse = { type: 'SUMMARY_CARD', title: "Topic Summary", message: `Great work! Here are the key points from this topic:\n${keyPointsText}`};
          }
          break;
      }
      case 'FEEDBACK': {
        // uiResponse is already populated from the EVAL phase
        break;
      }
      case 'SUMMARY': {
          if (!uiResponse.type) {
              const nodeSnap = await nodeRef.get();
              const nodeData = nodeSnap.data();
              const keyPointsText = (nodeData.key_points || []).map(pt => `- ${pt}`).join('\n');
              uiResponse = { type: 'SUMMARY_CARD', title: "Topic Summary", message: `Great work! Here are the key points from this topic:\n${keyPointsText}`};
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

    res.json({ newSessionState: nextState, ui: uiResponse });

  } catch (error) {
    console.error("Error in /tutor/step endpoint:", error);
    res.status(500).json({ newSessionState: req.body.sessionState, ui: { type: 'ERROR', message: 'A critical server error occurred.' }, errors: [{ code: 'SERVER_ERROR', message: error.message }] });
  }
});

export default router;

