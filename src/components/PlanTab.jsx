import React, { useState } from 'react';

const PlanTab = ({ showSetup, setShowSetup, organSystems }) => {
  const [setupStep, setSetupStep] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [examDate, setExamDate] = useState('');
  const [confidenceRatings, setConfidenceRatings] = useState(() =>
    organSystems.reduce((acc, system) => ({ ...acc, [system]: 0 }), {})
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // State for sidebar toggle

  // State for reorderable organ systems in the schedule controls
  const [reorderableOrganSystems, setReorderableOrganSystems] = useState(organSystems);
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState(null);

  const handleRatingChange = (system, rating) => {
    setConfidenceRatings(prev => ({ ...prev, [system]: rating }));
  };

  const handleNextStep = () => {
    if (setupStep < 3) {
      setSetupStep(prev => prev + 1);
    } else {
      setShowSetup(false); // Exit setup after last step
    }
  };

  const handleBackStep = () => {
    if (setupStep > 1) {
      setSetupStep(prev => prev - 1);
    }
  };

  const handleSkipSetup = () => {
    setShowSetup(false); // Skip setup and go to main calendar view
  };

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e, index) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Optionally, set data for more complex drops
    // e.dataTransfer.setData('text/plain', index);
  };

  const handleDragEnter = (e, index) => {
    e.preventDefault(); // Necessary to allow drop
    if (draggedItemIndex === index) return; // Don't highlight if dragging over itself
    setDragOverItemIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverItemIndex(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault(); // Necessary to allow drop
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === dropIndex) {
      setDragOverItemIndex(null);
      return;
    }

    const newOrder = [...reorderableOrganSystems];
    const [draggedItem] = newOrder.splice(draggedItemIndex, 1);
    newOrder.splice(dropIndex, 0, draggedItem);

    setReorderableOrganSystems(newOrder);
    setDraggedItemIndex(null);
    setDragOverItemIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedItemIndex(null);
    setDragOverItemIndex(null);
  };
  // --- End Drag and Drop Handlers ---


  // Dummy data for calendar
  const daysInMonth = 30; // For September
  const startDayOfMonth = 0; // 0 for Sunday, September 1st, 2025 is a Monday (so index 1)
  const monthName = "September 2025";
  const dummyTopics = {
    5: "CNS: Ischemic Stroke",
    8: "MSK: Fractures",
    12: "GIT: Liver Lesions",
    15: "Revision & Test",
    20: "Cardiac: Valvular Disease",
    22: "Revision & Test",
    25: "GU: Renal Masses",
  };
  const completedDays = [5, 8, 15]; // Example completed days

  const renderSetupWizard = () => (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 sm:p-8 w-full max-w-lg mx-auto flex flex-col">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Personalized Plan Setup</h2>

        {setupStep === 1 && (
          <div className="flex-grow flex flex-col items-center justify-center">
            <p className="text-lg text-gray-700 mb-4">Step 1: Select your dates.</p>
            <div className="flex flex-col sm:flex-row gap-4 mb-6 w-full max-w-sm">
              <div className="flex-1">
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  id="startDate"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label htmlFor="examDate" className="block text-sm font-medium text-gray-700 mb-1">Exam Date</label>
                <input
                  type="date"
                  id="examDate"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {setupStep === 2 && (
          <div className="flex-grow flex flex-col">
            <p className="text-lg text-gray-700 mb-4 text-center">Step 2: Rate your confidence (1-5 stars).</p>
            <div className="overflow-y-auto max-h-64 pr-2 -mr-2">
              {organSystems.map(system => (
                <div key={system} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
                  <span className="text-gray-800 text-base">{system}</span>
                  <div className="flex space-x-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        className={`text-xl ${star <= confidenceRatings[system] ? 'text-yellow-400' : 'text-gray-300'} hover:text-yellow-500 transition-colors duration-200`}
                        onClick={() => handleRatingChange(system, star)}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {setupStep === 3 && (
          <div className="flex-grow flex flex-col items-center justify-center text-center">
            <p className="text-lg text-gray-700 mb-4">Step 3: Generating your personalized plan... ✨</p>
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            <p className="text-sm text-gray-500 mt-4">This might take a moment.</p>
          </div>
        )}

        <div className="flex justify-between mt-6 pt-4 border-t border-gray-200">
          <button
            className={`px-4 py-2 rounded-lg text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors ${setupStep === 1 ? 'invisible' : ''}`}
            onClick={handleBackStep}
            disabled={setupStep === 1}
          >
            Back
          </button>
          <button
            className="px-4 py-2 rounded-lg text-blue-700 hover:bg-blue-50 transition-colors"
            onClick={handleSkipSetup}
          >
            Skip Setup
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
            onClick={handleNextStep}
          >
            {setupStep === 3 ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderMainCalendarView = () => (
    <div className="flex flex-col md:flex-row h-full min-h-[calc(100vh-120px)]">
      {/* Left Sidebar (Schedule Controls) */}
      <div className={`bg-white rounded-xl shadow-lg p-4 md:p-6 flex-shrink-0 transition-all duration-300 ${isSidebarOpen ? 'w-full md:w-72' : 'w-0 md:w-12 overflow-hidden'}`}>
        <div className="flex justify-between items-center mb-4">
          <h4 className={`text-lg font-bold text-gray-800 ${!isSidebarOpen && 'md:hidden'}`}>Schedule Controls</h4>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-600"
          >
            {isSidebarOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
        <div className={`${!isSidebarOpen && 'md:hidden'}`}>
          <p className="text-sm text-gray-600 mb-3">Adjust allocated days (Drag to reorder):</p>
          <ul className="space-y-2 mb-6">
            {reorderableOrganSystems.map((system, index) => (
              <li
                key={system} // Use system name as key for stable identity
                draggable="true"
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnter={(e) => handleDragEnter(e, index)}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center justify-between py-2 px-3 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors cursor-grab
                  ${dragOverItemIndex === index ? 'border-b-2 border-blue-500' : ''}
                  ${draggedItemIndex === index ? 'opacity-50 border-dashed border-gray-400' : ''}
                `}
              >
                <span className="text-gray-700">{system}:</span>
                <input
                  type="number"
                  defaultValue="10" // Dummy allocated days
                  className="w-16 px-2 py-1 rounded-md border border-gray-300 text-sm text-center"
                  onClick={(e) => e.stopPropagation()} // Prevent drag event from firing when clicking input
                />
                <span className="text-gray-500 text-sm">days</span>
              </li>
            ))}
          </ul>
          <button className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">
            Update & Recalculate Schedule
          </button>
        </div>
      </div>

      {/* Right Panel (Interactive Calendar) */}
      <div className="flex-grow bg-white rounded-xl shadow-lg p-4 md:p-6 ml-0 md:ml-6 mt-6 md:mt-0">
        <div className="flex justify-between items-center mb-6">
          <h4 className="text-xl font-bold text-gray-800">{monthName}</h4>
          <div className="flex space-x-2">
            <button className="px-4 py-2 rounded-lg text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors">
              Month
            </button>
            <button className="px-4 py-2 rounded-lg text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors">
              Week
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1 text-center text-sm">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div key={day} className="font-semibold text-gray-600 py-2">
              {day}
            </div>
          ))}
          {Array.from({ length: startDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} className="py-4 bg-gray-50 rounded-md"></div>
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const isWeekend = (startDayOfMonth + i) % 7 >= 5;
            const isCompleted = completedDays.includes(dayNum);
            const topic = dummyTopics[dayNum];

            return (
              <div
                key={dayNum}
                className={`relative py-4 rounded-md cursor-pointer transition-colors duration-200
                  ${isWeekend ? 'bg-gray-100 hover:bg-gray-200' : 'bg-white hover:bg-blue-50'}
                  ${isCompleted ? 'bg-green-100 hover:bg-green-200' : ''}
                  border border-gray-200 flex flex-col items-center justify-center text-gray-800
                `}
              >
                <span className="font-bold text-lg">{dayNum}</span>
                {topic && (
                  <p className="text-xs mt-1 px-1 text-blue-700 font-medium leading-tight">
                    {topic}
                  </p>
                )}
                {isCompleted && (
                  <span className="absolute top-1 right-1 text-green-600 text-sm">✅</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative h-full">
      {showSetup ? renderSetupWizard() : renderMainCalendarView()}
    </div>
  );
};

export default PlanTab;
