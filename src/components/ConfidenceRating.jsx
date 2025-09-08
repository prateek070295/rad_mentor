import React from 'react';

const ConfidenceRating = ({ onRate }) => {
  return (
    <div className="p-4 bg-gray-100 border-t text-center space-y-3">
      <p className="font-semibold text-gray-700">How confident do you feel about this topic?</p>
      <div className="flex justify-center space-x-3">
        <button
          onClick={() => onRate('low')}
          className="px-6 py-2 bg-red-100 text-red-700 rounded-lg font-semibold hover:bg-red-200"
        >
          Low
        </button>
        <button
          onClick={() => onRate('medium')}
          className="px-6 py-2 bg-yellow-100 text-yellow-700 rounded-lg font-semibold hover:bg-yellow-200"
        >
          Medium
        </button>
        <button
          onClick={() => onRate('high')}
          className="px-6 py-2 bg-green-100 text-green-700 rounded-lg font-semibold hover:bg-green-200"
        >
          High
        </button>
      </div>
    </div>
  );
};

export default ConfidenceRating;