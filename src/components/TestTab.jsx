import React, { useState } from 'react';

const TestTab = ({ organSystems }) => {
  // State to manage which view is visible
  const [view, setView] = useState('hub');
  const [selectedSection, setSelectedSection] = useState(null);

  const handleSectionSelect = (section) => {
    setSelectedSection(section);
    setView('test-type-selection'); // Navigate to the new view
  };

  const startMCQTest = (section) => {
    alert(`Starting MCQ test for ${section.name}! (Next: build the backend & test UI)`);
  };

  // The main hub view (unchanged)
  if (view === 'hub') {
    return (
      <div className="p-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800">Test Center</h1>
          <p className="text-lg text-gray-600 mt-2">Select a test mode to begin your preparation.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 flex flex-col">
            <h2 className="text-2xl font-bold text-gray-800">Section-wise Tests</h2>
            <p className="text-gray-600 mt-2 flex-grow">
              Focus on specific topics you've studied, like Breast, MSK, or CNS. Choose between quick MCQs and in-depth theory questions.
            </p>
            <button
              onClick={() => setView('section-selection')}
              className="mt-6 w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
            >
              Start Sectional Test
            </button>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 flex flex-col opacity-50">
            {/* Grand Tests Card */}
          </div>
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 flex flex-col opacity-50">
            {/* Custom Tests Card */}
          </div>
        </div>
      </div>
    );
  }

  // The section selection view (unchanged)
  if (view === 'section-selection') {
    return (
      <div className="p-4">
        <div className="text-center mb-12">
          <button onClick={() => setView('hub')} className="text-blue-600 hover:underline mb-4">
            &larr; Back to Test Center
          </button>
          <h1 className="text-4xl font-bold text-gray-800">Section-wise Test</h1>
          <p className="text-lg text-gray-600 mt-2">Choose a section to start a test.</p>
        </div>
        <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          {organSystems.map((system) => (
            <button
              key={system.id}
              onClick={() => handleSectionSelect(system)}
              className="p-4 bg-white rounded-xl shadow-lg border border-gray-200 text-lg font-semibold text-gray-700 hover:border-blue-500 hover:text-blue-600 text-left"
            >
              {system.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- NEW: The test type selection view ---
  if (view === 'test-type-selection') {
    return (
      <div className="p-4">
        <div className="text-center mb-12">
          <button onClick={() => setView('section-selection')} className="text-blue-600 hover:underline mb-4">
            &larr; Back to Section List
          </button>
          <h1 className="text-4xl font-bold text-gray-800">{selectedSection.name}</h1>
          <p className="text-lg text-gray-600 mt-2">Select the type of test you want to begin.</p>
        </div>
        <div className="max-w-2xl mx-auto space-y-4">
          <button
            onClick={() => startMCQTest(selectedSection)}
            className="w-full p-4 bg-white rounded-xl shadow-lg border border-gray-200 text-lg font-semibold text-gray-700 hover:border-blue-500 hover:text-blue-600 text-left"
          >
            Quick Test (MCQs)
          </button>
          <button
            onClick={() => alert('Feature coming soon!')}
            className="w-full p-4 bg-white rounded-xl shadow-lg border border-gray-200 text-lg font-semibold text-gray-700 hover:border-blue-500 hover:text-blue-600 text-left opacity-50 cursor-not-allowed"
          >
            Theory Test (Short Notes)
          </button>
          <button
            onClick={() => alert('Feature coming soon!')}
            className="w-full p-4 bg-white rounded-xl shadow-lg border border-gray-200 text-lg font-semibold text-gray-700 hover:border-blue-500 hover:text-blue-600 text-left opacity-50 cursor-not-allowed"
          >
            Practical Cases (OSCE, Long/Short Cases)
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default TestTab;