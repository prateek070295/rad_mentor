import React, { useState, useEffect, useCallback } from 'react';
import { auth } from '../firebase';

const normalizeTopic = (text = '') => text.replace(/[^\w]/g, '').toLowerCase();

const QPPreviewSave = ({ data, organSystems, onSave, onCancel, onNotify }) => {
  const [editedQuestions, setEditedQuestions] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const notify = useCallback(
    (type, text) => {
      if (!text) return;
      if (typeof onNotify === 'function') {
        onNotify({ type, text });
      }
    },
    [onNotify],
  );

  useEffect(() => {
    if (data?.questions && organSystems.length > 0) {
      const matchedQuestions = data.questions.map((question) => {
        if (!question.topic) return question;
        const aiTopicNormalized = normalizeTopic(question.topic);
        const officialTopic = organSystems.find(
          (system) => normalizeTopic(system.name) === aiTopicNormalized,
        );
        return { ...question, topic: officialTopic ? officialTopic.name : question.topic };
      });
      setEditedQuestions(matchedQuestions);
    } else if (data?.questions) {
      setEditedQuestions(data.questions);
    }
  }, [data, organSystems]);

  const handleTopicChange = (index, newTopic) => {
    const updatedQuestions = [...editedQuestions];
    updatedQuestions[index].topic = newTopic;
    setEditedQuestions(updatedQuestions);
  };

  const handleSaveToFirestore = async () => {
    if (!data?.metadata) {
      const message = 'Exam metadata is missing. Cannot save.';
      setError(message);
      notify('error', message);
      return;
    }
    if (!auth.currentUser) {
      const message = 'You must be logged in to save questions.';
      setError(message);
      notify('error', message);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const idToken = await auth.currentUser.getIdToken();

      const response = await fetch('https://api-4qet5dlzga-el.a.run.app/save-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          questions: editedQuestions,
          metadata: data.metadata,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'The server returned an error.');
      }

      const message = `Save complete! ${result.newQuestionsAdded} new questions were added. ${result.existingQuestionsUpdated} repeat questions were updated.`;
      notify('success', message);
      onSave?.({
        message,
        newQuestions: result.newQuestionsAdded,
        updatedQuestions: result.existingQuestionsUpdated,
        metadata: data.metadata,
        previewLink: result.previewLink,
      });
    } catch (saveError) {
      console.error('Failed to save questions:', saveError);
      const message = `Save Failed: ${saveError.message}`;
      setError(message);
      notify('error', saveError.message || 'Failed to save questions.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!data) {
    return <div>Loading preview...</div>;
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
      <h3 className="text-2xl font-bold text-gray-800">Preview Extracted Questions</h3>

      <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-lg my-4 flex flex-wrap gap-x-4 gap-y-2">
        <span className="font-semibold">Exam: {data.metadata.exam}</span>
        <span className="font-semibold">Year: {data.metadata.year}</span>
        <span className="font-semibold">Month: {data.metadata.month}</span>
        <span className="font-semibold">Paper: {data.metadata.paper}</span>
      </div>

      <p className="text-gray-600 mt-1 mb-6">
        Review the questions and correct the assigned topic for each one if needed. Click "Save to Bank" to finalize.
      </p>

      {error && <div className="text-red-500 text-center mb-4">{error}</div>}

      <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
        {editedQuestions.map((item, index) => (
          <div key={index} className="p-4 border rounded-lg bg-gray-50">
            <p className="font-semibold text-gray-800 mb-2">
              {index + 1}. {item.questionText}
            </p>
            <p className="text-sm text-gray-600">
              Marks: <strong>{item.marks}</strong>
              {item.marksDistribution && (
                <span className="text-gray-400 ml-1">({item.marksDistribution})</span>
              )}
            </p>
            <div className="flex items-center gap-4 mt-2">
              <label htmlFor={`topic-${index}`} className="block text-sm font-medium text-gray-700">
                Topic:
              </label>
              <select
                id={`topic-${index}`}
                value={item.topic || ''}
                onChange={(event) => handleTopicChange(index, event.target.value)}
                className="block w-full max-w-xs pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                {item.topic &&
                  !organSystems.some((system) => normalizeTopic(system.name) === normalizeTopic(item.topic)) && (
                    <option value={item.topic}>{item.topic} (AI Suggested)</option>
                  )}
                {organSystems.map((system) => (
                  <option key={system.id} value={system.name}>
                    {system.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end space-x-4 mt-6">
        <button
          onClick={onCancel}
          className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveToFirestore}
          disabled={isSaving}
          className={`px-6 py-2 rounded-lg font-semibold transition-colors duration-200 ${
            isSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {isSaving ? 'Saving...' : 'Save to Bank'}
        </button>
      </div>
    </div>
  );
};

export default QPPreviewSave;
