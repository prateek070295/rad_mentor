// src/components/LearnTab.jsx

import React, { useState, useEffect } from 'react';
// ADDED: Imports for Firebase
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

const LearnTab = ({ todayFocus }) => {
  // --- EXISTING STATE ---
  const [currentStep, setCurrentStep] = useState(1);
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  // ... (all your other existing states)
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', content: "Hi! I'm Med42, your AI mentor. I'm ready to help you with today's topic!" },
  ]);

  // --- ADDED: STATE FOR DYNAMIC CONTENT ---
  const [topicContent, setTopicContent] = useState({ studyMaterial: '', flashcards: [] });
  const [isLoadingContent, setIsLoadingContent] = useState(true);
  const [contentError, setContentError] = useState(null);


  // --- ADDED: useEffect TO FETCH DYNAMIC CONTENT FROM FIRESTORE ---
  useEffect(() => {
    if (!todayFocus) return;

    const fetchTopicContent = async () => {
      setIsLoadingContent(true);
      setContentError(null);
      try {
        // We need to map the 'todayFocus' string to a document.
        // This example assumes the main system is before the colon (e.g., "CNS: ...").
        // You might need to adjust this logic based on your exact topic names.
        const topicPrefix = todayFocus.split(':')[0].trim(); // e.g., "CNS"
        
        // This query is an example. You may need a more robust way to map topics to documents.
        const sectionsRef = collection(db, 'sections');
        const q = query(sectionsRef, where("shortName", "==", topicPrefix.toLowerCase()));
        
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          throw new Error(`No study material found for the topic prefix: "${topicPrefix}".`);
        }

        // Assuming the first match is the correct one
        const docData = querySnapshot.docs[0].data();
        
        setTopicContent({
          studyMaterial: docData.mainContent || `No study material available for ${todayFocus}.`,
          flashcards: docData.flashcards || []
        });

      } catch (error) {
        console.error("Error fetching topic content:", error);
        setContentError(error.message);
      } finally {
        setIsLoadingContent(false);
      }
    };

    fetchTopicContent();
  }, [todayFocus]); // This hook re-runs whenever the todayFocus prop changes


  // --- All your other functions (`handleChatInputSubmit`, `generateQuiz`, etc.) go here ---
  // You just need to make ONE change inside them:

  const generateQuiz = async (numQuestions = 5) => {
    // ... (your existing setup logic)
    try {
      // CHANGED: Use the dynamic topicContent from state instead of hardcoded data
      const quizPrompt = `
        You are a helpful assistant. Generate a set of ${numQuestions} multiple-choice questions based on the following study material. 
        ...
        Study Material:
        ${topicContent.studyMaterial} 

        Flashcard Content:
        ${topicContent.flashcards.map(card => `Q: ${card.question}\nA: ${card.answer}`).join('\n')}
        ...
      `;
      // ... (the rest of your generateQuiz function)
    } catch (error) {
      // ...
    }
  };

  const handleChatInputSubmit = async (e) => {
    // ...
    try {
      // CHANGED: Use the dynamic topicContent from state
      const systemPrompt = `
        You are a medical mentor chatbot named Med42, specializing in radiology. Your user is studying the topic: "${todayFocus}".
        
        Here is the study material for reference:
        ${topicContent.studyMaterial}
        ...
      `;
      // ... (the rest of your chat submit function)
    } catch (error) {
      // ...
    }
  };
  
  // (You would apply the same change to `generatePersonalizedStudyMaterial` and any other
  // function that uses the hardcoded `studyMaterial` or `flashcards`)

  
  // --- RENDER LOGIC ---
  if (isLoadingContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        <p className="text-gray-600 mt-4">Loading study material for {todayFocus}...</p>
      </div>
    );
  }

  if (contentError) {
    return <div className="text-center p-10 text-red-500">Error: {contentError}</div>;
  }

  // The rest of your return statement and JSX is unchanged.
  // It will now automatically use the dynamic content.
  // return ( <div className="flex flex-col h-full ..."> ... </div> );
};

export default LearnTab;