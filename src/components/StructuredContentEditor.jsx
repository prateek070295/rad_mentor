// file: src/components/StructuredContentEditor.jsx

import React, { useState, useEffect } from 'react';
import ReviewAndSave from './ReviewAndSave';

const StructuredContentEditor = ({ organ, topicId, initialContent }) => {
  const [rawText, setRawText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // The structuredContent state is now initialized from the new prop
  const [structuredContent, setStructuredContent] = useState(initialContent || null); 
  const [error, setError] = useState('');

  // NEW: This effect listens for changes to the initialContent prop.
  // When you select a new topic in the Admin Panel, this will update the editor.
  useEffect(() => {
    setStructuredContent(initialContent || null);
    // Reset raw text when new initial content is loaded
    if (initialContent) {
      setRawText('');
    }
  }, [initialContent]);


  const handleGenerate = async () => {
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

  const handleSave = async (finalContent) => {
    console.log("Saving this content:", finalContent);
    try {
      const response = await fetch('/admin/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalContent),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save content.');
      }
      
      const result = await response.json();
      alert(result.message);
      // After saving, we clear the view. The parent will refetch.
      setStructuredContent(null); 

    } catch (err) { // <-- SYNTAX ERROR WAS HERE
      console.error('Failed to save content:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const handleCancel = () => {
    // Cancelling returns the user to the "Generate" view
    setStructuredContent(null);
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg shadow-inner mt-4">
      {/* The main conditional logic remains the same */}
      {!structuredContent ? (
        <>
          <h3 className="text-xl font-semibold mb-3 text-gray-700">1. Generate New Content</h3>
          <p className="mb-4 text-sm text-gray-500">
            No structured content found for this topic. Paste raw text below to generate it.
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

