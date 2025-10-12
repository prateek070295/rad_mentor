import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';

const API_BASE = (process.env.REACT_APP_API_BASE_URL || "").replace(/\/$/, "");

const TopicTestViewer = ({ topic }) => {
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // NEW: State to track which question answers are revealed
  const [revealed, setRevealed] = useState(new Set());

  useEffect(() => {
    if (!topic?.id) return;

    let isMounted = true;
    const controller = new AbortController();

    const fetchQuestions = async () => {
      setIsLoading(true);
      setError('');
      setQuestions([]);
      setRevealed(new Set());
      try {
        if (!API_BASE) {
          throw new Error("Test API base URL is not configured.");
        }
        const user = auth.currentUser;
        if (!user) {
          throw new Error("You must be signed in to view topic questions.");
        }
        const token = await user.getIdToken();
        const params = new URLSearchParams({ topicId: topic.id });
        const response = await fetch(`${API_BASE}/tests/topic-questions?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) {
          const message = payload?.error || "Failed to fetch topic questions.";
          throw new Error(message);
        }

        if (!isMounted) return;

        const fetchedQuestions = Array.isArray(payload?.questions) ? payload.questions : [];
        if (fetchedQuestions.length === 0) {
          setError("No questions found for this topic.");
          setQuestions([]);
        } else {
          setQuestions(fetchedQuestions);
        }
      } catch (err) {
        if (controller.signal.aborted || !isMounted) return;
        console.error("Error fetching topic questions:", err);
        const message = err?.message || "An error occurred while loading topic questions.";
        setError(message);
        setQuestions([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchQuestions();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [topic]);

  // NEW: Handler to reveal a single question's answer by its ID
  const handleReveal = (questionId) => {
    setRevealed(prev => new Set(prev).add(questionId));
  };

  if (isLoading) return <p className="text-center text-gray-500 mt-8">Loading Questions...</p>;
  if (error) return <p className="text-center text-red-500 font-semibold mt-8">{error}</p>;
  if (questions.length === 0) return <p className="text-center text-gray-500 mt-8">No questions available for this topic yet.</p>;

  // CHANGED: The component now returns a list instead of a single question viewer
  return (
    <div className="max-w-4xl mx-auto mt-8 space-y-4">
      {questions.map((question, index) => (
        <div key={question.id} className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
          <div className="flex justify-between items-center text-sm font-semibold text-gray-500 mb-4">
            <span>Question {index + 1}</span>
            <span>Marks: <strong>{question.marks}</strong>{question.marksDistribution && <span className="text-gray-400 ml-1">({question.marksDistribution})</span>}</span>
          </div>
          <p className="text-xl font-semibold text-gray-800 mb-6">{question.questionText}</p>
          
          {revealed.has(question.id) ? (
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm font-bold text-green-800">Answer Hint:</p>
              <p className="text-lg text-green-900 capitalize">{question.topic.replace(/_/g, ' ')}</p>
            </div>
          ) : (
            <button onClick={() => handleReveal(question.id)} className="w-full py-2 px-4 bg-blue-100 text-blue-700 font-semibold rounded-lg hover:bg-blue-200">
              Reveal Topic
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default TopicTestViewer;
