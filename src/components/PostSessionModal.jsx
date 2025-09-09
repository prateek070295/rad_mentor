import React from 'react';

const PostSessionModal = ({ isOpen, onClose, topicName }) => {
  if (!isOpen) {
    return null;
  }

  return (
    // Backdrop
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 z-40 flex justify-center items-center"
      onClick={onClose}
    >
      {/* Modal Content */}
      <div
        className="bg-white rounded-xl shadow-2xl z-50 w-11/12 max-w-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 text-center">
          <div className="mx-auto bg-green-100 w-12 h-12 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mt-4">Session Complete!</h2>
          <p className="text-gray-600 mt-2">You've finished the lesson on "{topicName}".</p>
        </div>

        {/* Action Buttons */}
        <div className="p-6 bg-gray-50 rounded-b-xl space-y-3">
            <button 
                className="w-full text-left p-3 bg-white rounded-lg border hover:bg-gray-100"
                onClick={() => alert('Feature coming soon: View Transcript')}
            >
                View Full Transcript
            </button>
            <button 
                className="w-full text-left p-3 bg-white rounded-lg border hover:bg-gray-100"
                onClick={() => alert('Feature coming soon: Generate Flashcards')}
            >
                Generate Flashcards
            </button>
        </div>

        <div className="p-4 text-center">
            <button
                onClick={onClose}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
            >
                Close
            </button>
        </div>
      </div>
    </div>
  );
};

export default PostSessionModal;