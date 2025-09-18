import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs } from "firebase/firestore";

const TopicTestViewer = ({ topic }) => {
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // NEW: State to track which question answers are revealed
  const [revealed, setRevealed] = useState(new Set());

  useEffect(() => {
    if (!topic?.id) return;

    const fetchQuestions = async () => {
      setIsLoading(true);
      setError('');
      setQuestions([]);
      try {
        const q = query(collection(db, "questions"), where("topic", "==", topic.id));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          setError("No questions found for this topic.");
        } else {
          const fetchedQuestions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setQuestions(fetchedQuestions);
        }
      } catch (err) {
        console.error("Error fetching topic questions:", err);
        setError("An error occurred. Please check the console.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuestions();
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