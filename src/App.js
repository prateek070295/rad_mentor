import React, { useState } from 'react';
// IMPORTANT: Please ensure a file named 'Dashboard.jsx' exists in your 'src/components' folder.
import Dashboard from './components/Dashboard'; 
// IMPORTANT: Please ensure a file named 'PlanTab.jsx' exists in your 'src/components' folder.
import PlanTab from './components/PlanTab';     
// IMPORTANT: Please ensure a file named 'LearnTab.jsx' exists in your 'src/components' folder.
import LearnTab from './components/LearnTab'; 
// IMPORTANT: Please ensure a file named 'TestTab.jsx' exists in your 'src/components' folder.
import TestTab from './components/TestTab';

import appLogo from './assets/images/logo 1.PNG';

// Main App component which acts as the entry point for our UI
function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showPlanSetup, setShowPlanSetup] = useState(true);

  const userName = "Dr. Pranoti";
  const todayFocus = "CNS: Ischemic Stroke & Hemorrhage";
  const syllabusCompletion = 35;
  const testScores = [80, 75, 85, 90, 82, 88];
  const topTopics = ["Breast", "MSK", "GIT"];
  const bottomTopics = ["Neuroradiology", "Physics", "Cardiac"];
  const daysUntilExam = 124;
  const daysUntilWeeklyTest = 5;

  const organSystems = [
    "CNS", "GIT", "MSK", "Cardiovascular", "Respiratory",
    "Genitourinary", "Endocrine", "Breast", "Pediatric", "Physics"
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            userName={userName}
            todayFocus={todayFocus}
            syllabusCompletion={syllabusCompletion}
            testScores={testScores}
            topTopics={topTopics}
            bottomTopics={bottomTopics}
            daysUntilExam={daysUntilExam}
            daysUntilWeeklyTest={daysUntilWeeklyTest}
          />
        );
      case 'plan':
        return (
          <PlanTab
            showSetup={showPlanSetup}
            setShowSetup={setShowPlanSetup}
            organSystems={organSystems}
          />
        );
      case 'learn':
        return <LearnTab todayFocus={todayFocus} />;
      case 'test':
        return <TestTab />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 font-inter">
      <header className="sticky top-0 bg-white shadow-md p-4 flex items-center justify-between z-10">
        <div className="flex items-center space-x-2">
          <img src={appLogo} alt="Rad Mentor App Logo" className="w-8 h-8" />
          <span className="text-xl font-bold text-gray-800">Rad Mentor</span>
        </div>
        <div className="flex items-center space-x-4">
          <nav className="hidden md:flex space-x-4">
            <button
              className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'dashboard' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-200'}`}
              onClick={() => setActiveTab('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'plan' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-200'}`}
              onClick={() => setActiveTab('plan')}
            >
              Plan
            </button>
            <button
              className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'learn' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-200'}`}
              onClick={() => setActiveTab('learn')}
            >
              Learn
            </button>
            <button
              className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'test' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-200'}`}
              onClick={() => setActiveTab('test')}
            >
              Test
            </button>
          </nav>
          <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center text-blue-800 font-semibold text-lg">
            S
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
