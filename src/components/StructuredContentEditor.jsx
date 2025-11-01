// file: src/components/StructuredContentEditor.jsx

import React, { useState, useEffect, useCallback } from 'react';
import ReviewAndSave from './ReviewAndSave';
import { auth } from '../firebase';

const API_BASE = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/$/, '');

const StructuredContentEditor = ({ organ, topicId, topicName, path, initialContent, onNotify }) => {
  const [rawText, setRawText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // The structuredContent state is now initialized from the new prop
  const [structuredContent, setStructuredContent] = useState(initialContent || null); 
  const [error, setError] = useState('');

  const callAdminEndpoint = useCallback(
    async (endpointPath, init = {}) => {
      if (!auth.currentUser) {
        const authError = new Error('You must be signed in as an admin to continue.');
        authError.code = 'auth/missing-user';
        throw authError;
      }

      const token = await auth.currentUser.getIdToken();
      const endpoint = API_BASE ? `${API_BASE}${endpointPath}` : endpointPath;
      const headers = {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
      };

      const response = await fetch(endpoint, {
        ...init,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message =
          errorData.error ||
          errorData.message ||
          `Failed with status ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }

      return response;
    },
    [],
  );

  // NEW: This effect listens for changes to the initialContent prop.
  // When you select a new topic in the Admin Panel, this will update the editor.
  useEffect(() => {
    setStructuredContent(initialContent || null);
    // Reset raw text when new initial content is loaded
    if (initialContent) {
      setRawText('');
    }
  }, [initialContent]);

  const notify = useCallback(
    (type, text) => {
      if (!text) return;
      if (typeof onNotify === 'function') {
        onNotify({ type, text });
      } else if (type === 'error') {
        console.error(text);
      } else {
        console.log(text);
      }
    },
    [onNotify],
  );

  const handleGenerate = async () => {
    setStructuredContent(null);
    setError('');
    setIsLoading(true);
    try {
      const response = await callAdminEndpoint('/structure', {
        method: 'POST',
        body: JSON.stringify({ rawText }),
      });
      const data = await response.json();
      setStructuredContent(data.structured);
      notify('success', 'Structured outline generated. Review and refine before saving.');
    } catch (err) {
      console.error('Failed to generate structure:', err);
      setError(err.message);
      const message =
        err.code === 'auth/missing-user'
          ? 'Sign in to an admin account before generating structured content.'
          : err.message || 'Failed to generate structured content.';
      notify('error', message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (finalContent) => {
    console.log("Saving this content:", finalContent);
    try {
      const response = await callAdminEndpoint('/admin/save', {
        method: 'POST',
        body: JSON.stringify(finalContent),
      });

      const result = await response.json();
      notify('success', result.message || 'Structured content saved.');
      // After saving, we clear the view. The parent will refetch.
      setStructuredContent(null); 
      setRawText('');
      setError('');
    } catch (err) {
      console.error('Failed to save content:', err);
      setError(err.message);
      const message =
        err.code === 'auth/missing-user'
          ? 'Sign in to an admin account before saving structured content.'
          : err.message || 'Failed to save structured content.';
      notify('error', message);
    }
  };

  const handleCancel = () => {
    // Cancelling returns the user to the "Generate" view
    setStructuredContent(null);
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg shadow-inner mt-4">
      <div className="mb-4 space-y-1 text-xs text-gray-500">
        {topicName && (
          <p>
            <span className="font-semibold text-gray-700">Editing:</span> {topicName}
          </p>
        )}
        {path && (
          <p>
            <span className="font-semibold text-gray-700">Path:</span> {path}
          </p>
        )}
        {topicId && (
          <p className="font-mono text-[11px] text-gray-400">
            Document ID: {topicId}
          </p>
        )}
      </div>
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

