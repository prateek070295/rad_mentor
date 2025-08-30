import React, { useState } from 'react';

const TestTab = () => {
  // State to manage which screen is currently visible
  // 'selection' | 'test' | 'analytics'
  const [currentScreen, setCurrentScreen] = useState('selection');
  // State to manage test settings
  const [isTutorMode, setIsTutorMode] = useState(false);
  const [customTestOptions, setCustomTestOptions] = useState([]);
  const [isCustomOptionsOpen, setIsCustomOptionsOpen] = useState(false);

  // State for the test-taking interface
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [userTheoryAnswer, setUserTheoryAnswer] = useState('');
  const [questionStatus, setQuestionStatus] = useState(Array(10).fill('unseen')); // 'unseen' | 'answered' | 'unanswered'
  // State to manage the navigator panel's visibility
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(true); // Initialized to true to see full view on load

  // Dummy data for questions and analytics
  const questions = [
    {
      type: 'mcq',
      text: "On a T2-weighted MRI of the brain, cerebrospinal fluid (CSF) appears:",
      options: ["A. Hyperintense (bright)", "B. Hypointense (dark)", "C. Isointense to grey matter", "D. Isodense to bone"],
      correctAnswer: "A. Hyperintense (bright)"
    },
    {
      type: 'theory',
      text: "Describe the key radiological findings of a glioblastoma multiforme on MRI.",
      correctAnswer: "Glioblastoma multiforme (GBM) typically presents as a large, heterogeneous, contrast-enhancing mass with central necrosis. There is often surrounding vasogenic edema, which is T2/FLAIR hyperintense. The mass itself is usually irregular and can cross the corpus callosum (butterfly glioma)."
    },
    {
      type: 'mcq',
      text: "Which of the following is the most common cause of acute stroke?",
      options: ["A. Hemorrhagic stroke", "B. Ischemic stroke", "C. Subarachnoid hemorrhage", "D. Venous sinus thrombosis"],
      correctAnswer: "B. Ischemic stroke"
    },
  ];

  const organSystems = [
    "CNS", "GIT", "MSK", "Cardiovascular", "Respiratory",
    "Genitourinary", "Endocrine", "Breast", "Pediatric", "Physics"
  ];
  const testResults = {
    score: 82,
    correctAnswers: 8,
    incorrectAnswers: 2,
    timeTaken: "25:30",
    topicBreakdown: [
      { topic: "CNS", accuracy: 90 },
      { topic: "MSK", accuracy: 80 },
      { topic: "GIT", accuracy: 75 },
      { topic: "Breast", accuracy: 95 },
      { topic: "Cardiac", accuracy: 60 }
    ],
  };

  const currentQuestion = questions[currentQuestionIndex];

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      setCurrentScreen('analytics');
    }
  };

  const handleAnswerChange = (e) => {
    if (currentQuestion.type === 'mcq') {
      setSelectedAnswer(e.target.value);
    } else if (currentQuestion.type === 'theory') {
      setUserTheoryAnswer(e.target.value);
    }
  };

  const handleSubmitAnswer = () => {
    const newStatus = [...questionStatus];
    newStatus[currentQuestionIndex] = 'answered';
    setQuestionStatus(newStatus);
    handleNextQuestion();
  };

  // --- Render Functions for different screens ---
  const renderTestSelectionHub = () => (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Test Selection Hub</h2>
      
      {/* Test Mode Selection - moved to the top */}
      <div className="flex items-center justify-between p-4 bg-white rounded-xl shadow-lg mb-6">
        <div className="flex flex-col">
          <h4 className="text-lg font-bold text-gray-800">Test Mode: {isTutorMode ? 'Tutor Mode' : 'Exam Mode'}</h4>
          <p className="text-sm text-gray-600">
            {isTutorMode
              ? 'Get immediate feedback after each question.'
              : 'Take the test without interruptions and review results at the end.'
            }
          </p>
        </div>
        <button
          onClick={() => setIsTutorMode(!isTutorMode)}
          className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors ${isTutorMode ? 'bg-blue-600' : 'bg-gray-200'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isTutorMode ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        {/* Card for Weekly Test */}
        <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col justify-between cursor-pointer hover:shadow-xl transition-shadow">
          <h3 className="text-xl font-bold text-gray-800">Start Weekly Test</h3>
          <p className="text-gray-600 mt-2">A comprehensive test of the week's topics.</p>
          <button onClick={() => setCurrentScreen('test')} className="mt-4 w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">
            Begin Test
          </button>
        </div>

        {/* Card for Grand Test */}
        <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col justify-between cursor-pointer hover:shadow-xl transition-shadow">
          <h3 className="text-xl font-bold text-gray-800">Start Grand Test</h3>
          <p className="text-gray-600 mt-2">A long-form test covering all major systems.</p>
          <button onClick={() => setCurrentScreen('test')} className="mt-4 w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">
            Begin Test
          </button>
        </div>

        {/* Card for Custom Practice Test */}
        <div onClick={() => setIsCustomOptionsOpen(!isCustomOptionsOpen)} className="bg-white rounded-xl shadow-lg p-6 flex flex-col justify-between cursor-pointer hover:shadow-xl transition-shadow">
          <h3 className="text-xl font-bold text-gray-800">Create Custom Practice Test</h3>
          <p className="text-gray-600 mt-2">Select your own topics and question count.</p>
          <button className="mt-4 w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">
            Customize
          </button>
        </div>
      </div>

      {/* Custom Test Options Panel */}
      {isCustomOptionsOpen && (
        <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
          <h4 className="text-lg font-bold text-gray-800 mb-4">Customize Your Test</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
            {organSystems.map(system => (
              <label key={system} className="flex items-center text-gray-700">
                <input
                  type="checkbox"
                  value={system}
                  onChange={(e) => {
                    const newOptions = e.target.checked
                      ? [...customTestOptions, e.target.value]
                      : customTestOptions.filter(opt => opt !== e.target.value);
                    setCustomTestOptions(newOptions);
                  }}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 rounded"
                />
                <span className="ml-2">{system}</span>
              </label>
            ))}
          </div>
          <p className="text-sm text-gray-600 mb-4">Selected: {customTestOptions.join(', ') || 'None'}</p>
          <button onClick={() => setCurrentScreen('test')} className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">
            Begin Custom Test
          </button>
        </div>
      )}
    </div>
  );

  const renderTestInterface = () => (
    <div className="flex h-full min-h-[calc(100vh-120px)] flex-col p-6 space-y-6">
      {/* Question Navigator - Now at the top and collapsible */}
      <div className={`flex-shrink-0 bg-white rounded-xl shadow-lg p-4 transition-all duration-300 ${isNavigatorOpen ? 'h-52' : 'h-12'}`}>
        <div className="relative h-full">
          {/* Header with visible label and toggle button */}
          <div className="flex items-center justify-between mb-4">
            <h4 className={`font-bold text-lg text-gray-800`}>
              Question Navigator
            </h4>
            <button
              onClick={() => setIsNavigatorOpen(!isNavigatorOpen)}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-600"
            >
              {isNavigatorOpen ? (
                // Arrow pointing up when expanded
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                // Arrow pointing down when collapsed
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
          </div>
          {/* Collapsible content area */}
          <div className={`${!isNavigatorOpen ? 'hidden' : ''}`}>
            <div className="grid grid-cols-5 sm:grid-cols-7 lg:grid-cols-10 gap-2 overflow-y-auto max-h-36 pr-2">
              {questions.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentQuestionIndex(index)}
                  className={`p-2 rounded-lg text-sm font-semibold transition-colors
                    ${questionStatus[index] === 'answered' ? 'bg-green-500 text-white' : ''}
                    ${questionStatus[index] === 'unanswered' ? 'bg-blue-500 text-white' : ''}
                    ${currentQuestionIndex === index ? 'border-2 border-blue-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}
                  `}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Question Area */}
      <div className="flex-grow bg-white rounded-xl shadow-lg p-6 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-baseline mb-4">
            <h3 className="text-xl font-bold text-gray-800">Question {currentQuestionIndex + 1}</h3>
            {/* Countdown timer placeholder */}
            <span className="text-sm font-semibold text-gray-600">Time: 25:00</span>
          </div>
          <p className="text-lg text-gray-700 mb-6">{currentQuestion.text}</p>
        </div>

        {/* Answer Input based on question type */}
        {currentQuestion.type === 'mcq' && (
          <div className="space-y-4">
            {currentQuestion.options.map((option, index) => (
              <label key={index} className="flex items-center cursor-pointer p-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                <input
                  type="radio"
                  name="mcq-answer"
                  value={option}
                  checked={selectedAnswer === option}
                  onChange={handleAnswerChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-3 text-base text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        )}

        {currentQuestion.type === 'theory' && (
          <div className="flex flex-col">
            <label htmlFor="theory-answer" className="text-lg font-medium text-gray-700 mb-2">Your Answer:</label>
            <textarea
              id="theory-answer"
              rows="6"
              value={userTheoryAnswer}
              onChange={handleAnswerChange}
              className="resize-none block w-full px-4 py-2 text-base text-gray-700 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Type your answer here..."
            ></textarea>
            {isTutorMode && (
              <button className="mt-4 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                Get AI Feedback
              </button>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end mt-8 space-x-4">
          <button className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 transition-colors">
            {currentQuestionIndex === questions.length - 1 ? 'Finish Test' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderPerformanceAnalyticsDashboard = () => (
    <div className="p-8">
      <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Performance Analytics</h2>
      
      {/* Top Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-lg p-6 text-center">
          <p className="text-4xl font-extrabold text-blue-600">{testResults.score}%</p>
          <p className="text-lg text-gray-600 mt-2">Score</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6 text-center">
          <p className="text-4xl font-extrabold text-green-600">{testResults.correctAnswers}</p>
          <p className="text-lg text-gray-600 mt-2">Correct Answers</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6 text-center">
          <p className="text-4xl font-extrabold text-red-600">{testResults.incorrectAnswers}</p>
          <p className="text-lg text-gray-600 mt-2">Incorrect Answers</p>
        </div>
      </div>

      {/* Topic-wise Breakdown (Bar Chart) */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Topic-wise Breakdown</h3>
        <div className="space-y-4">
          {testResults.topicBreakdown.map((item, index) => (
            <div key={index}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-gray-700">{item.topic}</span>
                <span className="text-sm font-medium text-gray-700">{item.accuracy}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full"
                  style={{ width: `${item.accuracy}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Detailed Review Section */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Detailed Review</h3>
        <p className="text-gray-600">Coming Soon: A scrollable list of every question, your answer, the correct answer, and a detailed text explanation.</p>
      </div>

      <div className="flex justify-center mt-8">
        <button onClick={() => setCurrentScreen('selection')} className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
          Back to Test Hub
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full">
      {currentScreen === 'selection' && renderTestSelectionHub()}
      {currentScreen === 'test' && renderTestInterface()}
      {currentScreen === 'analytics' && renderPerformanceAnalyticsDashboard()}
    </div>
  );
};

export default TestTab;
