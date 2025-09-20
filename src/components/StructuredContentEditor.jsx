// file: src/components/StructuredContentEditor.jsx

import React, { useState } from 'react';
import ReviewAndSave from './ReviewAndSave';

const StructuredContentEditor = ({ organ, topicId }) => {
  const [rawText, setRawText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [structuredContent, setStructuredContent] = useState(null); 
  const [error, setError] = useState('');

  const handleGenerate = async () => { /* ...this function is unchanged... */
    setStructuredContent(null);
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch('/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Something went wrong on the server.');
      }
      const data = await response.json();
      setStructuredContent(data.structured);
    } catch (err) {
      console.error('Failed to generate structure:', err);
      setError(err.message);
      alert(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- THIS FUNCTION IS NOW UPDATED ---
  const handleSave = async (finalContent) => {
    console.log("Saving this content:", finalContent);
    try {
      const response = await fetch('/admin/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalContent), // finalContent is already { organ, topicId, structured }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save content.');
      }
      
      const result = await response.json();
      alert(result.message); // Show success message from the server
      setStructuredContent(null); // Go back to the editor view

    } catch (err) {
      console.error('Failed to save content:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const handleCancel = () => {
    setStructuredContent(null);
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg shadow-inner mt-4">
      {!structuredContent ? (
        <>
          <h3 className="text-xl font-semibold mb-3 text-gray-700">1. Paste Source Material</h3>
          <p className="mb-4 text-sm text-gray-500">
            Paste your raw text below. Use the format `[Image: description,url]` for any images.
          </p>
          <textarea
            className="w-full h-64 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 transition"
            placeholder="e.g., Mammography... [Image: Comparative mammogram,https://...]"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            disabled={isLoading}
          />
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={!rawText.trim() || isLoading}
              className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {isLoading ? 'Generating...' : 'Generate Structure (AI)'}
            </button>
          </div>
          {error && <div className="mt-4 text-red-600 bg-red-100 p-3 rounded">Error: {error}</div>}
        </>
      ) : (
        <ReviewAndSave 
          structuredContent={structuredContent}
          onSave={handleSave}
          onCancel={handleCancel}
          organ={organ}
          topicId={topicId}
        />
      )}
    </div>
  );
};

export default StructuredContentEditor;