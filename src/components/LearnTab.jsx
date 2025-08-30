import React, { useState } from 'react';

const LearnTab = ({ todayFocus }) => {
  // State to manage which step of the learning session is active
  const [currentStep, setCurrentStep] = useState(1);
  // State to manage the chatbot panel's visibility
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  // State to manage the session outline's visibility
  const [isOutlineOpen, setIsOutlineOpen] = useState(true);
  // State for flashcard flipping animation
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);

  // --- AI Contextual Data (Mock) ---
  const studyMaterial = `
    Topic: CNS: Ischemic Stroke & Hemorrhage

    Ischemic stroke is a sudden interruption in the blood supply to the brain, caused by a blockage of a blood vessel.
    On MRI, the key sequence for early detection is Diffusion-Weighted Imaging (DWI). An area of acute ischemia will
    show diffusion restriction, appearing as a hyperintense (bright) signal on DWI and a corresponding
    hypointense (dark) signal on an Apparent Diffusion Coefficient (ADC) map. This "DWI-ADC mismatch" is a classic sign of an acute stroke.

    Key Imaging Features:
    - DWI: Hyperintense (bright) signal.
    - ADC Map: Hypointense (dark) signal.
    - FLAIR: Often normal in the first 6 hours, becomes hyperintense later.

    Hemorrhagic stroke, on the other hand, is caused by bleeding within the brain tissue.
    Its appearance on MRI is more complex and depends on the age of the blood products.
  `;
  
  const flashcards = [
    { question: "What is a DWI-ADC mismatch?", answer: "DWI hyperintensity with corresponding ADC hypointensity, indicating acute ischemia." },
    { question: "Key imaging sequence for early stroke detection?", answer: "Diffusion-Weighted Imaging (DWI)." },
  ];

  // --- Chatbot Integration State & Logic ---
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', content: "Hi! I'm Med42, your AI mentor. I'm ready to help you with today's topic!" },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const handleChatInputSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isThinking) return;

    const newUserMessage = { role: 'user', content: chatInput };
    setChatHistory(prev => [...prev, newUserMessage]);
    setChatInput('');
    setIsThinking(true);

    try {
      // Construct the system prompt with all the necessary context
      const systemPrompt = `
        You are a medical mentor chatbot named Med42, specializing in radiology. Your user is studying the topic: "${todayFocus}".
        
        Here is the study material for reference:
        ${studyMaterial}

        And here are some related flashcard questions and answers:
        ${flashcards.map(card => `Q: ${card.question}\nA: ${card.answer}`).join('\n')}

        Please answer the user's questions based on this provided context. If a question is outside this topic, gently guide the user back to the topic of "${todayFocus}".
      `;
      
      const messagesWithContext = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.slice(1), // Exclude the initial welcome message from the history
        newUserMessage,
      ];

      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messagesWithContext,
          // You can add more Med42 parameters here, like temperature or max_tokens
        }),
      });

      if (!response.ok) {
        throw new Error(`API call failed with status: ${response.status}`);
      }

      const data = await response.json();
      const aiMessage = data.choices[0].message;

      setChatHistory(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error fetching from Med42:', error);
      setChatHistory(prev => [...prev, { role: 'assistant', content: 'Sorry, I am unable to connect to Med42 right now. Please try again later.' }]);
    } finally {
      setIsThinking(false);
    }
  };

  // --- Quiz Generation & Evaluation State & Logic ---
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [quizError, setQuizError] = useState(null); // New state for quiz errors
  
  // State to track user's answers and the current question index
  const [userQuizResponses, setUserQuizResponses] = useState([]); // Stores { question, userAnswer, aiFeedback }
  const [currentQuizQuestionIndex, setCurrentQuizQuestionIndex] = useState(0);
  const [userSelectedOption, setUserSelectedOption] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false); // New state for evaluation loading
  const [quizSummary, setQuizSummary] = useState(null); // New state for quiz summary

  // New state for generated study material
  const [generatedStudyMaterial, setGeneratedStudyMaterial] = useState(null);
  const [isLoadingStudyMaterial, setIsLoadingStudyMaterial] = useState(false);


  // Helper to robustly parse JSON from AI responses
  const parseAIResponseAsJSON = (rawContent) => {
    // Attempt to clean content from common LLM markdown wraps
    let cleanedContent = rawContent.replace(/```json\n|\n```/g, '').trim();
    
    // Try to find the first '{' or '[' and the last '}' or ']'
    const firstBrace = cleanedContent.indexOf('{');
    const firstBracket = cleanedContent.indexOf('[');
    const lastBrace = cleanedContent.lastIndexOf('}');
    const lastBracket = cleanedContent.lastIndexOf(']');

    let jsonString = cleanedContent;

    // Prioritize array if found, then object
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      jsonString = cleanedContent.substring(firstBracket, lastBracket + 1);
    } else if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonString = cleanedContent.substring(firstBrace, lastBrace + 1);
    }
    
    return JSON.parse(jsonString);
  };


  const generateQuiz = async (numQuestions = 5) => {
    setIsLoadingQuiz(true);
    setQuizError(null); // Clear any previous errors
    setQuizQuestions([]); // Clear previous quiz
    setUserQuizResponses([]); // Clear previous user responses
    setCurrentQuizQuestionIndex(0); // Reset quiz index
    setUserSelectedOption(null); // Reset selected option
    setQuizSummary(null); // Clear previous summary
    setGeneratedStudyMaterial(null); // Clear previous generated study material

    try {
      const quizPrompt = `
        You are a helpful assistant. Generate a set of ${numQuestions} multiple-choice questions based on the following study material. 
        Each question must have 4 options (A, B, C, D) and a single correct answer.
        The output must be a valid JSON array of question objects.
        Each question object should have 'questionText', 'options' (an array of strings), and 'correctAnswer' (a string matching one of the options).
        
        Study Material:
        ${studyMaterial}

        Flashcard Content:
        ${flashcards.map(card => `Q: ${card.question}\nA: ${card.answer}`).join('\n')}

        Example JSON structure:
        [
          {
            "questionText": "What is the key MRI sequence for detecting acute ischemic stroke?",
            "options": ["A. T1-weighted", "B. T2-weighted", "C. DWI", "D. FLAIR"],
            "correctAnswer": "C. DWI"
          }
        ]
        
        Ensure the response is ONLY the JSON object, with no additional text or formatting.
      `;

      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: quizPrompt }],
          response_format: { type: "json_object" }, 
          temperature: 0.7, // Adjust temperature for creativity/consistency
          max_tokens: 1000, // Limit response length
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API call failed with status: ${response.status} and message: ${errorText}`);
      }

      const data = await response.json();
      const rawContent = data.choices[0].message.content;
      console.log("Raw AI response for quiz generation:", rawContent); // Log the raw response for debugging

      try {
        const generatedQuiz = parseAIResponseAsJSON(rawContent);
        // Basic validation for the quiz structure
        if (!Array.isArray(generatedQuiz) || generatedQuiz.length === 0 || !generatedQuiz[0].questionText) {
          throw new Error("AI response is not a valid quiz array.");
        }
        
        setQuizQuestions(generatedQuiz);
        setUserQuizResponses(generatedQuiz.map(q => ({ question: q, userAnswer: null, aiFeedback: null })));
        setCurrentStep(1); // Ensure we are on the pre-test step
      } catch (jsonError) {
        console.error('Failed to parse AI response as JSON for quiz:', jsonError);
        setQuizError('Failed to parse quiz response. The AI provided an invalid JSON format. Check console for raw response.');
      }
      
    } catch (error) {
      console.error('Error generating quiz:', error);
      setQuizError(`Failed to generate quiz. Please check the Med42 server connection and logs. Error: ${error.message}`);
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  const evaluateAnswer = async (question, userAnswer, correctAnswer) => {
    try {
      const evaluationPrompt = `
        You are an intelligent quiz evaluator. The user was asked the following multiple-choice question:
        Question: "${question}"
        The user selected the answer: "${userAnswer}"
        The correct answer is: "${correctAnswer}"

        Evaluate the user's answer. Determine if it is correct or incorrect.
        Provide concise feedback explaining why their answer was right or wrong, and if wrong, briefly explain the correct concept.
        The output must be a valid JSON object with 'isCorrect' (boolean), 'feedback' (string).
        
        Example JSON structure:
        {
          "isCorrect": true,
          "feedback": "Excellent! DWI hyperintensity with ADC hypointensity is indeed the hallmark of acute ischemic stroke."
        }
        OR
        {
          "isCorrect": false,
          "feedback": "Incorrect. While T1/T2 sequences are used, DWI is specifically crucial for detecting acute ischemic stroke due to diffusion restriction."
        }
        Ensure the response is ONLY the JSON object, with no additional text or formatting.
      `;

      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: evaluationPrompt }],
          response_format: { type: "json_object" },
          temperature: 0.2, // Lower temperature for factual evaluation
          max_tokens: 200,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Evaluation API call failed with status: ${response.status} and message: ${errorText}`);
      }

      const data = await response.json();
      const rawContent = data.choices[0].message.content;
      console.log("Raw AI evaluation response:", rawContent);

      try {
        const evaluation = parseAIResponseAsJSON(rawContent);
        if (typeof evaluation.isCorrect !== 'boolean' || typeof evaluation.feedback !== 'string') {
          throw new Error("AI evaluation response is not a valid feedback object.");
        }
        return evaluation;
      } catch (jsonError) {
        console.error('Failed to parse AI evaluation response as JSON:', jsonError);
        return { isCorrect: false, feedback: 'Error: Failed to parse AI feedback. Invalid JSON format.' };
      }

    } catch (error) {
      console.error('Error evaluating answer:', error);
      return { isCorrect: false, feedback: `Error during evaluation: ${error.message}. Please check Med42 server.` };
    }
  };

  const generatePersonalizedStudyMaterial = async (quizResults) => {
    setIsLoadingStudyMaterial(true);
    try {
      // The AI will now infer concepts from the detailed feedbackSummary itself
      // No explicit concept extraction needed here.

      let feedbackSummary = "";
      quizResults.forEach(response => {
        feedbackSummary += `\n- Question: "${response.question.questionText}"\n  User Answer: "${response.userAnswer}"\n  Correct: ${response.aiFeedback?.isCorrect ? 'Yes' : 'No'}\n  Feedback: ${response.aiFeedback?.feedback}\n`;
      });

      const personalizedPrompt = `
        You are a medical mentor chatbot named Med42, specializing in radiology. Your user has just completed a pre-test on the topic: "${todayFocus}".
        
        Below is the original study material for your reference:
        ${studyMaterial}

        Here are the user's pre-test results and detailed feedback for each question:
        ${feedbackSummary}

        Generate a personalized study guide tailored to the user's pre-test performance.
        The study guide should be a coherent, educational narrative, not a list of quiz feedback.

        **Based on the provided pre-test results and feedback, infer the concepts where the user struggled and the concepts where they demonstrated understanding.**

        **For concepts where the user struggled (inferred from incorrect answers and negative feedback):**
        * Provide in-depth explanations.
        * Clarify underlying mechanisms and pathophysiology.
        * Include illustrative examples or analogies.
        * Address common misconceptions explicitly.
        * Emphasize the clinical importance and diagnostic relevance.
        * Use **bold** or _underline_ for key terms and crucial information.
        
        **For concepts where the user demonstrated understanding (inferred from correct answers and positive feedback):**
        * Provide concise, standard explanations that efficiently summarize the essential points.
        * Focus on reinforcing the user's correct understanding without extensive detail.

        Structure the material into a clear, multi-level study guide using:
        * Meaningful headings (e.g., "Detailed Review: [Concept]", "Reinforcement: [Concept]").
        * Bullet points where appropriate.
        * Separating major concepts into distinct sections.

        Ensure the tone is encouraging, supportive, and geared toward building knowledge and confidence.
        The response should be plain text formatting.
      `;

      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: personalizedPrompt }],
          // No response_format: { type: "json_object" } here as we want plain text
          temperature: 0.7, // Allow some creativity for generating new material
          max_tokens: 2000, // Allow longer response for study material
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Personalized Study Material API call failed with status: ${response.status} and message: ${errorText}`);
      }

      const data = await response.json();
      const generatedContent = data.choices[0].message.content;
      console.log("Raw AI response for personalized study material:", generatedContent);
      setGeneratedStudyMaterial(generatedContent);

    } catch (error) {
      console.error('Error generating personalized study material:', error);
      setGeneratedStudyMaterial(`Error generating personalized study material: ${error.message}. Please check Med42 server logs.`);
    } finally {
      setIsLoadingStudyMaterial(false);
    }
  };


  const evaluateAllAnswersAndTransition = async (finalResponses) => { // Accept responses as argument
    setIsEvaluating(true);
    const responsesToEvaluate = finalResponses || userQuizResponses; // Use argument if provided, else state
    const updatedResponses = [...responsesToEvaluate]; // Create a mutable copy
    let correctCount = 0;
    let incorrectCount = 0;

    for (let i = 0; i < quizQuestions.length; i++) { // quizQuestions is still needed for context
      const question = quizQuestions[i]; // Get original question details
      const userAnswer = updatedResponses[i].userAnswer;

      // Only evaluate if an answer was provided
      if (userAnswer !== null) {
        const evaluationResult = await evaluateAnswer(
          question.questionText,
          userAnswer,
          question.correctAnswer
        );
        updatedResponses[i] = { ...updatedResponses[i], aiFeedback: evaluationResult };
        if (evaluationResult.isCorrect) {
          correctCount++;
        } else {
          incorrectCount++;
        }
      } else {
        // Handle case where no answer was selected (shouldn't happen if button is disabled)
        updatedResponses[i] = { ...updatedResponses[i], aiFeedback: { isCorrect: false, feedback: "No answer selected." } };
        incorrectCount++; // Count as incorrect if no answer
      }
    }
    setUserQuizResponses(updatedResponses); // Update state with all feedback
    setQuizSummary({ correct: correctCount, incorrect: incorrectCount, total: quizQuestions.length });
    setIsEvaluating(false);

    console.log("Full Pre-Test Evaluation Complete!");
    console.log(`Total Correct: ${correctCount} out of ${quizQuestions.length}`);
    console.log("Detailed Responses with Feedback:", updatedResponses);

    // Automatically transition to Study Material after full evaluation
    setCurrentStep(2); 
    // Trigger personalized study material generation
    await generatePersonalizedStudyMaterial(updatedResponses);

    // Optionally reset quiz states if you don't need them for review later
    // setQuizQuestions([]);
    // setUserQuizResponses([]);
    // setCurrentQuizQuestionIndex(0);
    // setUserSelectedOption(null);
  };

  const handleAnswerSubmission = async () => {
    if (userSelectedOption === null) return;

    const currentQuestion = quizQuestions[currentQuizQuestionIndex];
    
    // Create a new response object for the current question
    const newResponseEntry = {
      question: currentQuestion,
      userAnswer: userSelectedOption,
      aiFeedback: null, // Will be filled later
    };

    // Update userQuizResponses with the new entry for the current question
    const updatedResponses = [...userQuizResponses];
    updatedResponses[currentQuizQuestionIndex] = newResponseEntry;
    setUserQuizResponses(updatedResponses); // Update the state

    // Reset selected option for the next question
    setUserSelectedOption(null);

    // Check if it's the last question
    if (currentQuizQuestionIndex === quizQuestions.length - 1) {
      // It's the last question, trigger full evaluation
      // Pass the updatedResponses directly to ensure the latest answer is included
      await evaluateAllAnswersAndTransition(updatedResponses);
    } else {
      // Not the last question, move to the next one
      setCurrentQuizQuestionIndex(prevIndex => prevIndex + 1);
    }
  };

  // Helper function to render content based on the current step
  const renderMainContent = () => {
    switch (currentStep) {
      case 1:
        // Pre-Test View
        const currentQuestion = quizQuestions[currentQuizQuestionIndex];

        return (
          <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-lg h-full">
            {isLoadingQuiz || isEvaluating || isLoadingStudyMaterial ? ( // Show loading for all AI processes
              <div className="flex flex-col items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
                <p className="text-sm text-gray-500 mt-4">
                  {isLoadingQuiz ? 'Generating quiz questions...' : isEvaluating ? 'Evaluating your quiz answers...' : 'Generating personalized study material...'}
                </p>
              </div>
            ) : quizQuestions.length > 0 && currentQuestion ? (
              // Display generated quiz questions
              <div className="w-full max-w-lg">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Pre-Test: Question {currentQuizQuestionIndex + 1} of {quizQuestions.length}</h3>
                <p className="text-lg text-gray-700 mb-6">{currentQuestion.questionText}</p>
                <div className="space-y-4">
                  {currentQuestion.options.map((option, index) => (
                    <div key={index} className="flex items-center">
                      <input
                        type="radio"
                        name="mcq"
                        id={`option-${index}`}
                        value={option}
                        checked={userSelectedOption === option}
                        onChange={(e) => setUserSelectedOption(e.target.value)}
                        disabled={isEvaluating} // Disable options during evaluation
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor={`option-${index}`} className={`ml-3 text-base text-gray-700`}>
                        {option}
                      </label>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleAnswerSubmission}
                  disabled={userSelectedOption === null || isEvaluating}
                  className={`mt-8 px-6 py-3 font-semibold rounded-lg shadow-md transition-colors
                    ${(userSelectedOption === null || isEvaluating) ? 'bg-gray-400 text-gray-200 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                >
                  {currentQuizQuestionIndex === quizQuestions.length - 1 ? 'Finish Pre-Test' : 'Submit Answer'}
                </button>
              </div>
            ) : (
              // Button to trigger quiz generation
              <div>
                {quizError && <div className="text-red-500 mb-4">{quizError}</div>}
                <button
                  onClick={() => generateQuiz(5)}
                  className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-colors"
                >
                  Start Pre-Test
                </button>
              </div>
            )}
          </div>
        );
      case 2:
        // Study Material View - Now the automatic destination after Pre-Test
        return (
          <div className="p-6 bg-white rounded-xl shadow-lg h-full overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
            <h3 className="text-2xl font-bold text-gray-800 mb-4">CNS: Ischemic Stroke & Hemorrhage</h3>
            
            {isLoadingStudyMaterial ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
                <p className="text-sm text-gray-500 mt-4">Generating personalized study material...</p>
              </div>
            ) : generatedStudyMaterial ? (
              <div className="prose max-w-none"> {/* Using prose for basic markdown styling if needed */}
                {/* Render generated study material directly */}
                <pre className="whitespace-pre-wrap font-sans text-gray-700">{generatedStudyMaterial}</pre>
              </div>
            ) : (
              // Fallback to original study material if AI generation fails or is not yet complete
              <div>
                <p className="text-gray-700 text-lg mb-4 leading-relaxed">
                  **Ischemic stroke** is a sudden interruption in the blood supply to the brain, caused by a blockage of a blood vessel.
                  On MRI, the key sequence for early detection is **Diffusion-Weighted Imaging (DWI)**. An area of acute ischemia will
                  show **diffusion restriction**, appearing as a hyperintense (bright) signal on DWI and a corresponding
                  hypointense (dark) signal on an Apparent Diffusion Coefficient (ADC) map. This "DWI-ADC mismatch" is a classic sign of an acute stroke.
                </p>
                <h4 className="text-xl font-semibold text-gray-800 mt-6 mb-2">Key Imaging Features:</h4>
                <ul className="list-disc list-inside space-y-2 text-gray-700 leading-relaxed">
                  <li>**DWI:** Hyperintense (bright) signal.</li>
                  <li>**ADC Map:** Hypointense (dark) signal.</li>
                  <li>**FLAIR:** Often normal in the first 6 hours, becomes hyperintense later.</li>
                </ul>
                <p className="text-gray-700 text-lg mt-4 leading-relaxed">
                  **Hemorrhagic stroke**, on the other hand, is caused by bleeding within the brain tissue.
                  Its appearance on MRI is more complex and depends on the age of the blood products.
                </p>
                <div className="mt-8 text-center text-gray-500 italic">
                  [Placeholder for image or video content related to MRI sequences]
                </div>
              </div>
            )}

            {/* Displaying Pre-Test Results Summary */}
            {quizSummary && (
              <div className="mt-8 p-6 bg-blue-50 rounded-xl border border-blue-200">
                <h5 className="font-bold text-blue-800 text-xl mb-3">Pre-Test Results:</h5>
                <p className="text-lg text-gray-800 mb-2">
                  You got <span className="font-extrabold text-green-600">{quizSummary.correct}</span> correct
                  and <span className="font-extrabold text-red-600">{quizSummary.incorrect}</span> incorrect
                  out of {quizSummary.total} questions.
                </p>
                <h6 className="font-semibold text-blue-700 mt-4 mb-2">Detailed Feedback:</h6>
                <ul className="space-y-3">
                  {userQuizResponses.map((response, index) => (
                    <li key={index} className="p-3 rounded-lg border border-gray-200">
                      <p className="font-medium text-gray-900 mb-1">
                        Q{index + 1}: {response.question.questionText}
                      </p>
                      <p className={`text-sm ${response.aiFeedback?.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                        Your Answer: {response.userAnswer} {response.aiFeedback?.isCorrect ? '✔️' : '❌'}
                      </p>
                      {!response.aiFeedback?.isCorrect && (
                        <p className="text-sm text-gray-700 mt-1">
                          Correct Answer: {response.question.correctAnswer}
                        </p>
                      )}
                      {response.aiFeedback && (
                        <p className="text-xs text-gray-600 mt-2">
                          Feedback: {response.aiFeedback.feedback}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      case 3:
        // Flashcard View
        return (
          <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-lg h-full">
            <h3 className="text-xl font-bold text-gray-800 mb-6">Flashcard</h3>
            <div className="w-full max-w-sm h-64 bg-gray-100 rounded-xl shadow-inner flex items-center justify-center relative transform transition-transform duration-500"
              onClick={() => setFlashcardFlipped(!flashcardFlipped)}
            >
              {flashcardFlipped ? (
                <div className="text-center text-gray-700 p-4">
                  <p className="font-semibold text-lg mb-2">Answer:</p>
                  <p className="text-sm">Diffusion Restriction on DWI.</p>
                </div>
              ) : (
                <div className="text-center text-gray-800 p-4">
                  <p className="font-semibold text-lg">Question:</p>
                  <p className="text-sm">What is the key MRI finding in acute ischemic stroke?</p>
                </div>
              )}
            </div>
            <p className="text-gray-500 text-xs mt-2">Click to flip card</p>
            <div className="flex space-x-2 mt-6">
              {['Again', 'Hard', 'Good', 'Easy'].map((btn, index) => (
                <button key={index} className="px-4 py-2 rounded-lg text-sm bg-gray-200 hover:bg-gray-300 transition-colors">
                  {btn}
                </button>
              ))}
            </div>
          </div>
        );
      case 4:
        // Post-Test View (same structure as pre-test, but could have different content/logic)
        return (
          <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-lg h-full">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Post-Test: Question 1 of 10</h3>
            <p className="text-lg text-gray-700 mb-6">
              An MRI showing T1 hyperintensity and T2 hypointensity on a brain scan is most likely
              indicative of what?
            </p>
            <div className="space-y-4 w-full max-w-md">
              {['A. Acute Ischemic Stroke', 'B. Subacute Hemorrhage', 'C. Chronic Ischemia', 'D. Normal Brain Tissue'].map((option, index) => (
                <div key={index} className="flex items-center">
                  <input type="radio" name="mcq" id={`option-${index}`} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                  <label htmlFor={`option-${index}`} className="ml-3 text-base text-gray-700">{option}</label>
                    </div>
                  ))}
                </div>
                <button className="mt-8 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-colors">
                  Submit Answer
                </button>
              </div>
            );
          default:
            return null;
        }
      };

      return (
        <div className="flex flex-col h-full min-h-[calc(100vh-120px)] p-6">
          {/* Today's Focus card - placed prominently at the top */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h4 className="text-lg font-bold text-gray-800 mb-2">Today's Focus:</h4>
            <p className="text-xl font-bold text-blue-700">{todayFocus}</p>
          </div>

          {/* Session Outline at the top */}
          <div className={`bg-white rounded-xl shadow-lg mb-6 flex-shrink-0 transition-all duration-300 ${isOutlineOpen ? 'h-72' : 'h-12'}`}>
            <div className="p-4 relative h-full">
              <div className="flex items-center justify-between">
                <h4 className={`text-lg font-bold text-gray-800`}>Session Outline</h4>
                <button
                  onClick={() => setIsOutlineOpen(!isOutlineOpen)}
                  className={`p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-600`}
                >
                  {isOutlineOpen ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transform -rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7-7" />
                    </svg>
                  )}
                </button>
              </div>
              <div className={`mt-4 overflow-y-auto ${!isOutlineOpen && 'hidden'}`}>
                <ul className="space-y-2">
                  {['1. Pre-Test', '2. Study Material', '3. Flashcards', '4. Post-Test'].map((step, index) => (
                    <li
                      key={index}
                      onClick={() => setCurrentStep(index + 1)}
                      className={`py-2 px-3 rounded-md cursor-pointer transition-colors
                        ${currentStep === index + 1 ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'}
                        ${index < currentStep - 1 ? 'line-through text-gray-400' : ''}
                      `}
                    >
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-grow mb-6">
            {renderMainContent()}
          </div>

          {/* AI Chatbot at the bottom */}
          <div className={`bg-white rounded-xl shadow-lg flex-shrink-0 transition-all duration-300 ${isChatbotOpen ? 'h-96' : 'h-12'}`}>
            <div className="p-4 relative h-full">
              <div className="flex items-center justify-between">
                <h4 className={`text-lg font-bold text-gray-800 ${!isChatbotOpen && 'hidden md:block'}`}>AI Chatbot</h4>
                <button
                  onClick={() => setIsChatbotOpen(!isChatbotOpen)}
                  className={`p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-600 absolute ${isChatbotOpen ? 'right-4' : 'left-1/2 -translate-x-1/2'}`}
                >
                  {isChatbotOpen ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transform rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </button>
              </div>
              <div className={`mt-4 h-full flex flex-col ${!isChatbotOpen && 'hidden'}`}>
                <div className="flex-grow overflow-y-auto pb-4 border-b border-gray-200">
                  <div className="space-y-4">
                    {chatHistory.map((msg, index) => (
                      <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`p-3 rounded-xl max-w-[75%] ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-bl-none'}`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {isThinking && (
                      <div className="flex justify-start">
                        <div className="bg-gray-200 text-gray-800 p-3 rounded-xl rounded-bl-none max-w-[75%]">
                          Med42 is thinking...
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <form onSubmit={handleChatInputSubmit} className="flex space-x-2 pt-4">
                  <input
                    type="text"
                    placeholder="Ask a question..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-grow px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    disabled={isThinking}
                  >
                    Send
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      );
    };

    export default LearnTab;
