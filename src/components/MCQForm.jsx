import React, { useState } from 'react';

const MCQForm = ({ title, question, options, onSubmit, isMentorTyping }) => {
  const [selectedIndex, setSelectedIndex] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (selectedIndex !== null) {
      onSubmit(selectedIndex);
    }
  };

  return (
    <div className="p-4 bg-gray-100 border border-gray-300 rounded-lg mt-4">
      <h3 className="font-bold text-lg mb-2">{title}</h3>
      <p className="mb-4">{question}</p>
      <form onSubmit={handleSubmit}>
        <div className="space-y-2 mb-4">
          {options.map((option, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setSelectedIndex(index)}
              disabled={isMentorTyping}
              className={`block w-full text-left p-3 rounded-lg border-2 transition-colors ${
                selectedIndex === index
                  ? 'bg-blue-500 border-blue-600 text-white'
                  : 'bg-white border-gray-300 hover:bg-gray-100 disabled:bg-gray-200'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={selectedIndex === null || isMentorTyping}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-blue-400"
          >
            Submit Answer
          </button>
        </div>
      </form>
    </div>
  );
};

export default MCQForm;

