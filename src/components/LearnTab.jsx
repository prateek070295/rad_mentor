import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import TopicNode from './TopicNode';
import MCQForm from './MCQForm';

const LearnTab = ({ todayFocus, userName }) => {
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [chapterTopics, setChapterTopics] = useState([]);
  const [isSidebarLoading, setIsSidebarLoading] = useState(true);
  
  // Tutor State
  const [sessionState, setSessionState] = useState(null);
  const [tutorHistory, setTutorHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isMentorTyping, setIsMentorTyping] = useState(false);
  const [activeTopic, setActiveTopic] = useState(null);

  const chatEndRef = useRef(null);

  const parseFocusString = (fullFocusString) => {
    if (!fullFocusString) return null;
    const parts = fullFocusString.split(':');
    if (parts.length < 2) return null;
    const sectionName = parts[0].trim();
    const topicWithDay = parts.slice(1).join(':').trim();
    const chapterName = topicWithDay.replace(/\(Day \d+ of \d+\)/, '').trim();
    return { sectionName, chapterName };
  };

  // Effect to fetch sidebar data based on today's focus
  useEffect(() => {
    const focusData = parseFocusString(todayFocus);
    if (!focusData) {
      setIsSidebarLoading(false);
      setChapterTopics([]);
      setCurrentChapter({ name: "No Topic Scheduled" });
      return;
    }
    const fetchSidebarData = async () => {
      setIsSidebarLoading(true);
      try {
        const sectionsRef = collection(db, 'sections');
        const sectionQuery = query(sectionsRef, where("title", "==", focusData.sectionName));
        const sectionSnapshot = await getDocs(sectionQuery);
        if (sectionSnapshot.empty) throw new Error(`Section "${focusData.sectionName}" not found.`);
        const sectionDoc = sectionSnapshot.docs[0];

        const nodesRef = collection(db, 'sections', sectionDoc.id, 'nodes');
        const chapterQuery = query(nodesRef, where("name", "==", focusData.chapterName), where("parentId", "==", null));
        const chapterSnapshot = await getDocs(chapterQuery);
        if (chapterSnapshot.empty) throw new Error(`Chapter "${focusData.chapterName}" not found.`);
        
        const chapterData = chapterSnapshot.docs[0].data();
        setCurrentChapter(chapterData);

        const allTopicsQuery = query(nodesRef, where("path", "array-contains", chapterData.name), orderBy("order"));
        const allTopicsSnapshot = await getDocs(allTopicsQuery);
        const descendantTopics = allTopicsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // Robust tree-building logic
        const nodeMap = new Map();
        descendantTopics.forEach(topic => {
            topic.children = [];
            nodeMap.set(topic.topicId, topic);
        });

        const rootTopics = [];
        descendantTopics.forEach(topic => {
            if (topic.parentId === chapterData.topicId) {
                rootTopics.push(topic);
            } else if (topic.parentId && nodeMap.has(topic.parentId)) {
                const parent = nodeMap.get(topic.parentId);
                if (parent) {
                  parent.children.push(topic);
                }
            }
        });

        if (rootTopics.length === 0 && descendantTopics.length > 0) {
          console.warn("No root topics found for this chapter. Check parentId mismatch.", {
            chapterTopicId: chapterData.topicId,
            descendants: descendantTopics.map(t => ({ name: t.name, parentId: t.parentId }))
          });
        }
        setChapterTopics(rootTopics);
      } catch (err) {
        console.error("Failed to fetch sidebar data:", err);
      } finally {
        setIsSidebarLoading(false);
      }
    };
    fetchSidebarData();
  }, [todayFocus]);
  
  // Effect to scroll to the bottom of the chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tutorHistory, isMentorTyping]);

  // Starts a new tutor session for a topic
  const handleTopicClick = async (topic) => {
    if (activeTopic?.id === topic.id) return;
    
    setIsMentorTyping(true);
    setTutorHistory([]);
    setActiveTopic(topic);
    setSessionState(null);

    try {
      const response = await fetch(`/tutor/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: topic.id,
          organ: topic.path[0]
        }),
      });

      if (!response.ok) throw new Error('Failed to start tutor session.');
      const data = await response.json();
      setSessionState(data.newSessionState);
      setTutorHistory([data.ui]);
    } catch (err) {
      console.error("Error starting session:", err);
      const errorCard = { type: 'ERROR', message: "Could not start the lesson. Please try again." };
      setTutorHistory([errorCard]);
    } finally {
      setIsMentorTyping(false);
    }
  };

  // Handles text input submissions (for TEACH and SHORT_CHECKPOINT)
  const handleChatInputSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isMentorTyping || !sessionState) return;
    const userInput = chatInput;
    setChatInput('');
    setIsMentorTyping(true);
    setTutorHistory(prev => [...prev, { type: 'USER_MESSAGE', message: userInput }]);
    try {
      const response = await fetch(`/tutor/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionState: sessionState, userInput: userInput }),
      });
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      setSessionState(data.newSessionState);
      setTutorHistory(prev => [...prev, data.ui]);
    } catch (error) {
      console.error("Error fetching mentor's response:", error);
      const errorCard = { type: 'ERROR', message: "Sorry, I'm having trouble connecting." };
      setTutorHistory(prev => [...prev, errorCard]);
    } finally {
      setIsMentorTyping(false);
    }
  };
  
  // Handles MCQ form submissions
  const handleCheckpointSubmit = async (selectedIndex) => {
    if (isMentorTyping || !sessionState) return;
    setIsMentorTyping(true);
    
    const lastCard = tutorHistory[tutorHistory.length - 1];
    const choiceText = lastCard?.options ? lastCard.options[selectedIndex] : `Answer index ${selectedIndex}`;
    setTutorHistory(prev => [...prev, { type: 'USER_MESSAGE', message: `My answer: "${choiceText}"` }]);

    try {
      const response = await fetch(`/tutor/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionState: sessionState,
          userInput: { selectedIndex }
        }),
      });
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      setSessionState(data.newSessionState);
      setTutorHistory(prev => [...prev, data.ui]);
    } catch (error) {
      console.error("Error submitting checkpoint:", error);
      const errorCard = { type: 'ERROR', message: "Sorry, there was an error submitting your answer." };
      setTutorHistory(prev => [...prev, errorCard]);
    } finally {
      setIsMentorTyping(false);
    }
  };

  // Handles the "Continue" button on feedback cards
  const handleContinue = async () => {
    if (isMentorTyping || !sessionState) return;
    setIsMentorTyping(true);
    setTutorHistory(prev => [...prev, { type: 'USER_MESSAGE', message: "Continue" }]);
    try {
      const response = await fetch(`/tutor/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionState: sessionState,
          userInput: "continue"
        }),
      });
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      setSessionState(data.newSessionState);
      setTutorHistory(prev => [...prev, data.ui]); 
    } catch (error) {
      console.error("Error continuing lesson:", error);
      const errorCard = { type: 'ERROR', message: "Sorry, there was an error loading the next section." };
      setTutorHistory(prev => [...prev, errorCard]);
    } finally {
      setIsMentorTyping(false);
    }
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  // Renders different UI cards based on the type from the server
  const renderTutorCard = (card, index) => {
    if (!card) return null;
    switch(card.type) {
      case 'TEACH_CARD':
        return (
          <div key={index} className="flex justify-start">
            <div className="max-w-4xl p-4 rounded-xl shadow bg-gray-200 text-gray-800">
              <h3 className="font-bold text-lg mb-2">{card.title}</h3>
              <div className="prose max-w-none"><ReactMarkdown>{card.message}</ReactMarkdown></div>
              {(card.assets?.images || []).map(img => <a key={img.alt} href={img.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block mt-2">{img.alt}</a>)}
              {(card.assets?.cases || []).map(c => <a key={c.label} href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block mt-2">{c.label}</a>)}
            </div>
          </div>
        );
      case 'MCQ_CHECKPOINT':
        return (
          <MCQForm
            key={index}
            title={card.title}
            question={card.message}
            options={card.options}
            onSubmit={handleCheckpointSubmit}
            isMentorTyping={isMentorTyping}
          />
        );
      case 'SHORT_CHECKPOINT':
        return (
          <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg mt-4">
            <h3 className="font-bold text-lg mb-2">{card.title}</h3>
            <p className="mb-4">{card.message}</p>
            <p className="text-sm text-gray-500 italic">Type your answer in the chat box below.</p>
          </div>
        );
      case 'FEEDBACK_CARD':
        const isCorrect = card.isCorrect;
        return (
          <div key={index} className={`p-4 rounded-lg shadow-md border-l-4 ${isCorrect ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
            <h3 className={`font-bold text-lg mb-2 ${isCorrect ? 'text-green-800' : 'text-red-800'}`}>{card.title}</h3>
            <div className="prose max-w-none prose-sm text-gray-700">
              <ReactMarkdown>{card.message}</ReactMarkdown>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={handleContinue} disabled={isMentorTyping} className="px-4 py-1 bg-gray-700 text-white text-sm font-semibold rounded-md hover:bg-gray-800 disabled:bg-gray-400">
                Continue →
              </button>
            </div>
          </div>
        );
       case 'TOPIC_COMPLETE':
        return (
            <div key={index} className="p-4 rounded-lg shadow-md bg-yellow-50 border-l-4 border-yellow-500">
                <h3 className="font-bold text-lg text-yellow-800">{card.title}</h3>
                <div className="prose max-w-none prose-sm text-gray-700"><ReactMarkdown>{card.message}</ReactMarkdown></div>
            </div>
        );
      case 'USER_MESSAGE':
        return (
          <div key={index} className="flex justify-end">
            <div className={`max-w-4xl p-3 rounded-xl shadow text-base bg-blue-500 text-white`}>
              {card.message}
            </div>
          </div>
        );
      case 'ERROR':
        return ( <div key={index} className="flex justify-start"><div className="p-3 rounded-xl bg-red-100 text-red-700">{card.message}</div></div> );
      default:
        return <div key={index} className="text-sm text-gray-400">Received an unknown card type: {card.type}</div>;
    }
  };

  // Logic to decide when to show the text input form
  const shouldShowChatInput = () => {
    if (tutorHistory.length === 0 || !sessionState) return false;
    const lastCardType = tutorHistory[tutorHistory.length - 1]?.type;
    return lastCardType === 'TEACH_CARD' || lastCardType === 'SHORT_CHECKPOINT';
  }

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      <aside className={`bg-white shadow-xl flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-80 p-6' : 'w-0'}`}>
        <div className={`flex items-center justify-between mb-6 flex-shrink-0 ${!isSidebarOpen && 'hidden'}`}>
          <h2 className="text-2xl font-bold text-gray-800">{currentChapter ? currentChapter.name : 'Chapter'}</h2>
        </div>
        <nav className={`overflow-y-auto ${!isSidebarOpen && 'hidden'}`}>
          {isSidebarLoading ? <p>Loading topics...</p> : <ul>{chapterTopics.map(topic => <TopicNode key={topic.id} topic={topic} onTopicSelect={handleTopicClick} currentTopicId={activeTopic ? activeTopic.id : null}/>)}</ul>}
        </nav>
      </aside>
      
      <main className="flex-grow flex flex-col overflow-y-auto bg-gray-50">
        <div className="sticky top-0 z-10 bg-gray-50 p-6 border-b border-gray-200">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">{activeTopic ? activeTopic.name : "Select a topic"}</h1>
            </div>
            <div className="flex space-x-2 flex-shrink-0 mt-4">
              <button onClick={toggleSidebar} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-300">
                {isSidebarOpen ? 'Focus Mode' : 'Show Menu'}
              </button>
            </div>
          </div>

        <div className="px-6 pb-6 flex-grow flex flex-col">
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg flex flex-col flex-grow">
            <div className="flex-grow p-4 overflow-y-auto space-y-4">
              {tutorHistory.length > 0 ? tutorHistory.map(renderTutorCard) : <div className="text-center text-gray-500 pt-10">Select a topic from the menu to begin.</div>}
              {isMentorTyping && ( <div className="flex justify-start"><div className="p-3 rounded-xl bg-gray-200 text-gray-800"><span className="animate-pulse">Mentor is thinking...</span></div></div>)}
              <div ref={chatEndRef} />
            </div>
            
            {shouldShowChatInput() && (
              <form onSubmit={handleChatInputSubmit} className="p-4 bg-gray-100 border-t">
                <fieldset disabled={isMentorTyping || !sessionState} className="flex space-x-2">
                  <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type your answer..." className="flex-grow rounded-lg px-4 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-200" />
                  <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-blue-400">Send</button>
                </fieldset>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default LearnTab;

