import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import TopicNode from './TopicNode';
import MCQForm from './MCQForm';

const LearnTab = ({ todayFocus, userName, setIsFocusMode }) => {
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

  // Notify parent component about focus mode change
  useEffect(() => {
    if (setIsFocusMode) {
      setIsFocusMode(!isSidebarOpen); // True when in focus mode
    }
  }, [isSidebarOpen, setIsFocusMode]);

  const parseFocusString = (fullFocusString) => {
    if (!fullFocusString) return null;
    const parts = fullFocusString.split(':');
    if (parts.length < 2) return null;
    const sectionName = parts[0].trim();
    const topicWithDay = parts.slice(1).join(':').trim();
    const chapterName = topicWithDay.replace(/\(Day \d+ of \d+\)/, '').trim();
    return { sectionName, chapterName };
  };

  // Effect to fetch sidebar data
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
                if (parent) parent.children.push(topic);
            }
        });
        setChapterTopics(rootTopics);
      } catch (err) {
        console.error("Failed to fetch sidebar data:", err);
      } finally {
        setIsSidebarLoading(false);
      }
    };
    fetchSidebarData();
  }, [todayFocus]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tutorHistory, isMentorTyping]);

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
          organ: topic.path[0],
          userName: userName
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
        body: JSON.stringify({ sessionState: sessionState, userInput: { selectedIndex } }),
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

  const handleContinue = async () => {
    if (isMentorTyping || !sessionState) return;
    setIsMentorTyping(true);
    setTutorHistory(prev => [...prev, { type: 'USER_MESSAGE', message: "Continue" }]);
    try {
      const response = await fetch(`/tutor/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionState: sessionState, userInput: "continue" }),
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

  const renderTutorCard = (card, index) => {
    if (!card) return null;
    const isLastCard = index === tutorHistory.length - 1;

    const renderChatInput = () => (
      <div className="mt-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <form onSubmit={handleChatInputSubmit}>
            <fieldset disabled={isMentorTyping}>
                <label className="font-semibold text-gray-700 block mb-2">Your Answer</label>
                <div className="flex space-x-2">
                    <input type="text" autoFocus value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type your answer..." className="flex-grow rounded-lg px-4 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-blue-400">Send</button>
                </div>
            </fieldset>
        </form>
      </div>
    );

    const shouldShowInput = isLastCard && ['OBJECTIVES_CARD', 'TEACH_CARD', 'SHORT_CHECKPOINT', 'SUMMARY_CARD'].includes(card.type);

    switch(card.type) {
        case 'OBJECTIVES_CARD':
            return (
                <div key={index} className="rounded-lg shadow-md bg-white border border-gray-200 overflow-hidden">
                    <div className="bg-indigo-600 p-4"><h3 className="font-bold text-3xl text-white">{card.title}</h3></div>
                    <div className="p-6">
                        <div className="prose prose-lg max-w-none text-gray-800"><ReactMarkdown>{card.message}</ReactMarkdown></div>
                        {shouldShowInput && renderChatInput()}
                    </div>
                </div>
            );
        case 'TEACH_CARD':
            return (
              <div key={index} className="rounded-lg shadow-md bg-white border border-gray-200 overflow-hidden">
                <div className="bg-gray-800 p-4"><h3 className="font-bold text-3xl text-white">{card.title}</h3></div>
                <div className="p-6">
                    <div className="prose prose-lg max-w-none"><ReactMarkdown>{card.message}</ReactMarkdown></div>
                    {(card.assets?.images?.length > 0 || card.assets?.cases?.length > 0) && (
                        <div className="mt-6 pt-4 border-t border-gray-300">
                        <h4 className="font-semibold text-base text-gray-600 mb-2">Reference Material:</h4>
                        {(card.assets.images || []).map(img => <a key={img.alt} href={img.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block text-base">{img.alt}</a>)}
                        {(card.assets.cases || []).map(c => <a key={c.label} href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block text-base">{c.label}</a>)}
                        </div>
                    )}
                    {shouldShowInput && renderChatInput()}
                </div>
              </div>
            );
        case 'TRANSITION_CARD':
            return (
                <div key={index} className="rounded-lg shadow-md bg-white border border-gray-200 overflow-hidden">
                     <div className="bg-blue-600 p-4"><h3 className="font-bold text-3xl text-white">{card.title}</h3></div>
                    <div className="p-6">
                        <div className="prose prose-lg max-w-none text-gray-800"><ReactMarkdown>{card.message}</ReactMarkdown></div>
                        <div className="mt-6 flex justify-end">
                            <button onClick={handleContinue} disabled={isMentorTyping} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-400">Continue to Checkpoint →</button>
                        </div>
                    </div>
                </div>
            );
        case 'MCQ_CHECKPOINT':
            return (
                <div key={index} className="rounded-lg shadow-md bg-white border border-gray-200 overflow-hidden">
                    <div className="bg-gray-800 p-4"><h3 className="font-bold text-3xl text-white">{card.title}</h3></div>
                    <div className="p-6">
                        <MCQForm question={card.message} options={card.options} onSubmit={handleCheckpointSubmit} isMentorTyping={isMentorTyping}/>
                    </div>
                </div>
            );
        case 'SHORT_CHECKPOINT':
            return (
                <div key={index} className="rounded-lg shadow-md bg-white border border-gray-200 overflow-hidden">
                    <div className="bg-gray-800 p-4"><h3 className="font-bold text-3xl text-white">{card.title}</h3></div>
                    <div className="p-6">
                        <div className="prose prose-lg max-w-none"><ReactMarkdown>{card.message}</ReactMarkdown></div>
                        {shouldShowInput && renderChatInput()}
                    </div>
              </div>
            );
        case 'FEEDBACK_CARD':
            const isCorrect = card.isCorrect;
            return (
              <div key={index} className={`rounded-lg shadow-md bg-white border border-gray-200 overflow-hidden`}>
                <div className={`${isCorrect ? 'bg-green-600' : 'bg-red-600'} p-4`}><h3 className="font-bold text-3xl text-white">{card.title}</h3></div>
                <div className="p-6">
                    <div className="prose prose-lg max-w-none text-gray-800"><ReactMarkdown>{card.message}</ReactMarkdown></div>
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleContinue} disabled={isMentorTyping} className="px-4 py-2 bg-gray-700 text-white font-semibold rounded-md hover:bg-gray-800 disabled:bg-gray-400">Continue →</button>
                    </div>
                </div>
              </div>
            );
        case 'SUMMARY_CARD':
        case 'TOPIC_COMPLETE':
            return (
                <div key={index} className="rounded-lg shadow-md bg-white border border-gray-200 overflow-hidden">
                    <div className="bg-yellow-500 p-4"><h3 className="font-bold text-3xl text-white">{card.title}</h3></div>
                    <div className="p-6">
                        <div className="prose prose-lg max-w-none text-gray-800 mt-4"><ReactMarkdown>{card.message}</ReactMarkdown></div>
                        {shouldShowInput && renderChatInput()}
                    </div>
                </div>
            );
        case 'USER_MESSAGE':
            return (
                <div key={index} className="flex justify-end">
                    <div className="inline-block max-w-2xl p-4 rounded-lg bg-gray-100 border border-gray-200 text-gray-800">{card.message}</div>
                </div>
            );
        case 'ERROR':
            return ( <div key={index} className="flex justify-start"><div className="p-4 rounded-xl bg-red-100 text-red-700 font-medium">{card.message}</div></div> );
        default:
            return <div key={index} className="text-sm text-gray-400">Received an unknown card type: {card.type}</div>;
    }
  };

  return (
    <div className="flex h-full w-full"> {/* Use h-full to fill parent */}
      {/* Sidebar */}
      <aside className={`bg-white shadow-xl flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-80' : 'w-0'}`}>
        <div className={`p-6 font-bold text-2xl text-gray-800 flex-shrink-0 border-b ${!isSidebarOpen && 'hidden'}`}>
            {currentChapter ? currentChapter.name : 'Chapter'}
        </div>
        <nav className={`flex-grow overflow-y-auto p-6 ${!isSidebarOpen && 'hidden'}`}>
          {isSidebarLoading ? <p>Loading topics...</p> : <ul>{chapterTopics.map(topic => <TopicNode key={topic.id} topic={topic} onTopicSelect={handleTopicClick} currentTopicId={activeTopic ? activeTopic.id : null}/>)}</ul>}
        </nav>
      </aside>

      {/* Main content area */}
      <main className="flex-grow flex flex-col bg-gray-50 h-full">
        {isSidebarOpen ? (
          <>
            {/* --- Standard Header --- */}
            <div className="sticky top-0 z-10 bg-gray-50 p-6 border-b border-gray-200 flex-shrink-0">
              <div><h1 className="text-3xl font-bold text-gray-800">{activeTopic ? activeTopic.name : "Select a topic"}</h1></div>
              <div className="flex space-x-2 flex-shrink-0 mt-4">
                  <button onClick={toggleSidebar} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-300">Focus Mode</button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* --- Focus Mode Header --- */}
            <div className="flex-shrink-0 p-6 h-20">
              <button onClick={toggleSidebar} className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-semibold hover:bg-gray-900 shadow-lg">
                  Show Menu
              </button>
            </div>
          </>
        )}

        {/* --- Lesson Content (Scrollable Area) --- */}
        <div className="flex-grow overflow-y-auto p-6 space-y-6">
            {tutorHistory.length > 0 ? (
                tutorHistory.map(renderTutorCard)
            ) : (
                <div className="text-center text-gray-500 pt-10">
                    <h2 className="text-2xl font-semibold mb-2">Welcome to the Learn Tab!</h2>
                    <p>Select a topic from the menu on the left to begin your interactive lesson.</p>
                </div>
            )}
            {isMentorTyping && (
                <div className="flex justify-start">
                    <div className="p-4 rounded-xl bg-white border border-gray-200 text-gray-800 shadow-md">
                        <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
                        </div>
                    </div>
                </div>
            )}
            <div ref={chatEndRef} />
        </div>
      </main>
    </div>
  );
};

export default LearnTab;