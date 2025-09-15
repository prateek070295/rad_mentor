import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase'; 
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const QPPreviewSave = ({ data, organSystems, onSave, onCancel }) => {
  const [editedQuestions, setEditedQuestions] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    // ✅ **FIX**: This block now intelligently matches the AI's topic (e.g., "HeadNeckFace")
    // to the official topic name from your list (e.g., "Head Neck Face").
    if (data && data.questions && organSystems.length > 0) {
      const matchedQuestions = data.questions.map(q => {
        if (!q.topic) return q; // Return question as-is if no topic
        
        const aiTopicNormalized = q.topic.replace(/\s/g, '').toLowerCase();
        const officialTopic = organSystems.find(os => 
          os.name.replace(/\s/g, '').toLowerCase() === aiTopicNormalized
        );

        // If a match is found, use the official name (with spaces). Otherwise, keep the AI's suggestion.
        return { ...q, topic: officialTopic ? officialTopic.name : q.topic };
      });
      setEditedQuestions(matchedQuestions);
    } else if (data && data.questions) {
      // Fallback for when organSystems haven't loaded yet
      setEditedQuestions(data.questions);
    }
  }, [data, organSystems]);

  const handleTopicChange = (index, newTopic) => {
    const updatedQuestions = [...editedQuestions];
    updatedQuestions[index].topic = newTopic;
    setEditedQuestions(updatedQuestions);
  };

  const handleSaveToFirestore = async () => {
    if (!db || !auth.currentUser) {
      setError("Database or user authentication not ready.");
      return;
    }
    if (!data || !data.metadata) {
      setError("Exam metadata is missing. Cannot save.");
      return;
    }

    setIsSaving(true);
    setError(null);
    
    try {
      const questionsCollectionRef = collection(db, "questionBank");
      
      const savePromises = editedQuestions.map(question => {
        const dataToSave = {
          ...question,
          ...data.metadata,
          // When saving, we can remove spaces again for a consistent format in the DB
          topic: question.topic.replace(/\s/g, ''),
          createdAt: serverTimestamp(),
          uploaderId: auth.currentUser.uid,
        };
        return addDoc(questionsCollectionRef, dataToSave);
      });
      
      await Promise.all(savePromises);
      onSave(); 
      
    } catch (e) {
      console.error("Failed to save questions to Firestore:", e);
      setError("Failed to save questions. Please check the console for details.");
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
            <p className="font-semibold text-gray-800 mb-2">{index + 1}. {item.questionText}</p>
            <div className="flex items-center gap-4">
              <label htmlFor={`topic-${index}`} className="block text-sm font-medium text-gray-700">
                Topic:
              </label>
              <select
                id={`topic-${index}`}
                value={item.topic || ''}
                onChange={(e) => handleTopicChange(index, e.target.value)}
                className="block w-full max-w-xs pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                {/* This conditional logic for "(AI Suggested)" is now only for true mismatches */}
                {item.topic && !organSystems.some(os => os.name === item.topic) && (
                    <option value={item.topic}>{item.topic} (AI Suggested)</option>
                )}
                {organSystems.map(system => (
                  <option key={system.id} value={system.name}>{system.name}</option>
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
          className={`px-6 py-2 rounded-lg font-semibold transition-colors duration-200 ${isSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
        >
          {isSaving ? 'Saving...' : 'Save to Bank'}
        </button>
      </div>
    </div>
  );
};

export default QPPreviewSave;