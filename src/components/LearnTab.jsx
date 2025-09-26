import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, auth } from '../firebase';
import { collection, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import TopicNode from './TopicNode';
import MCQForm from './MCQForm';

// This hook for fetching user progress is correct and remains unchanged.
const useUserProgress = (organId) => {
  const [progress, setProgress] = useState(new Map());
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    if (!auth.currentUser || !organId) {
      setProgress(new Map());
      setIsLoading(false);
      return;
    }
    const userId = auth.currentUser.uid;
    const progressRef = collection(db, 'userProgress', userId, 'topics');
    const q = query(progressRef, where("chapterId", "==", organId));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const progressMap = new Map();
      querySnapshot.forEach(doc => {
        progressMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
      setProgress(progressMap);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching real-time user progress:", error);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [organId]);
  return { progress, isLoading };
};

const LearnTab = ({ todayFocus, userName, setIsFocusMode }) => {
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [chapterTopics, setChapterTopics] = useState([]); // This will hold the final merged tree
  const [isSidebarLoading, setIsSidebarLoading] = useState(true);
  
  // NEW: State to hold the static, fetched tree structure.
  const [sourceTopicsTree, setSourceTopicsTree] = useState([]);

  // Tutor State
  const [tutorHistory, setTutorHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isMentorTyping, setIsMentorTyping] = useState(false);
  const [activeTopic, setActiveTopic] = useState(null);
  const lastCardRef = useRef(null);
  
  const { progress: userProgress, isLoading: isProgressLoading } = useUserProgress(currentChapter?.sectionName);

  useEffect(() => {
    if (setIsFocusMode) {
      setIsFocusMode(!isSidebarOpen);
    }
  }, [isSidebarOpen, setIsFocusMode]);

  // EFFECT 1: Parse today's focus (Unchanged)
  useEffect(() => {
    const parseFocusString = (fullFocusString) => {
        if (!fullFocusString) return null;
        const parts = fullFocusString.split(':');
        if (parts.length < 2) return null;
        const sectionName = parts[0].trim();
        const topicWithDay = parts.slice(1).join(':').trim();
        const chapterName = topicWithDay.replace(/\(Day \d+ of \d+\)/, '').trim();
        return { sectionName, chapterName };
    };
    const focusData = parseFocusString(todayFocus);
    if (!focusData) {
      setCurrentChapter({ name: "No Topic Scheduled" });
    } else {
        setCurrentChapter({ name: focusData.chapterName, sectionName: focusData.sectionName });
    }
  }, [todayFocus]); 

  // EFFECT 2: Fetch the source topic structure ONCE when the chapter changes.
  useEffect(() => {
    const fetchSourceData = async () => {
      if (!currentChapter?.sectionName || !currentChapter?.name) {
          setSourceTopicsTree([]);
          return;
      }
      setIsSidebarLoading(true);
      try {
        const sectionsRef = collection(db, 'sections');
        const sectionQuery = query(sectionsRef, where("title", "==", currentChapter.sectionName));
        const sectionSnapshot = await getDocs(sectionQuery);
        if (sectionSnapshot.empty) throw new Error(`Section "${currentChapter.sectionName}" not found.`);
        const sectionDoc = sectionSnapshot.docs[0];
        
        const nodesRef = collection(db, 'sections', sectionDoc.id, 'nodes');
        const chapterQuery = query(nodesRef, where("name", "==", currentChapter.name), where("parentId", "==", null));
        const chapterSnapshot = await getDocs(chapterQuery);
        if (chapterSnapshot.empty) throw new Error(`Chapter "${currentChapter.name}" not found.`);
        const chapterData = chapterSnapshot.docs[0].data();
        
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
        setSourceTopicsTree(rootTopics);
      } catch (err) {
        console.error("Failed to fetch sidebar data:", err);
      } finally {
        setIsSidebarLoading(false);
      }
    };
    fetchSourceData();
  }, [currentChapter]); // This now ONLY re-runs when the chapter itself changes.

  // EFFECT 3: Merge the static tree with REAL-TIME progress updates.
  useEffect(() => {
    if (isProgressLoading || sourceTopicsTree.length === 0) {
        // If there's no source tree yet, just show the source tree
        setChapterTopics(sourceTopicsTree);
        return;
    };

    const mergeRecursively = (topics) => {
        return topics.map(topic => {
            const progress = userProgress.get(topic.id);
            const newTopic = { ...topic };
            if (progress) {
                newTopic.status = progress.status;
                newTopic.percentComplete = progress.percentComplete;
            } else {
                newTopic.status = 'not-started';
                newTopic.percentComplete = 0;
            }
            newTopic.chapterId = currentChapter?.sectionName;
            if (topic.children && topic.children.length > 0) {
                newTopic.children = mergeRecursively(topic.children);
            }
            return newTopic;
        });
    };
    setChapterTopics(mergeRecursively(sourceTopicsTree));
  }, [userProgress, sourceTopicsTree, isProgressLoading, currentChapter]);

  useEffect(() => {
    lastCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [tutorHistory, isMentorTyping]);

  useEffect(() => {
      const handleKeyDown = (event) => {
        // Check if the sidebar is closed (i.e., we are in focus mode) and Escape is pressed
        if (!isSidebarOpen && event.key === 'Escape') {
          setIsSidebarOpen(true);
        }
      };

      // Add event listener when the component mounts
      window.addEventListener('keydown', handleKeyDown);

      // Cleanup: remove event listener when the component unmounts to prevent memory leaks
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [isSidebarOpen]);
    
  const callTutorApi = useCallback(async (body) => {
    if (!auth.currentUser) throw new Error("User not authenticated.");
    const token = await auth.currentUser.getIdToken();
    const response = await fetch('/tutor/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'API request failed.');
    }
    return response.json();
  }, []);
  
  const handleTopicClick = useCallback(async (topic) => {
    // Parent categories are not lessons, so just let the sidebar expand/collapse.
    if (topic.children && topic.children.length > 0) {
      return; 
    }
    
    if (activeTopic?.id === topic.id) return;

    setIsMentorTyping(true);
    setTutorHistory([]);
    setActiveTopic(topic);

    try {
      if (!auth.currentUser) throw new Error("User not logged in.");
      const token = await auth.currentUser.getIdToken();

      const messagesResponse = await fetch(`/tutor/messages/${topic.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!messagesResponse.ok) throw new Error('Failed to fetch message history.');
      const historyData = await messagesResponse.json();
      
      const transformedHistory = historyData.messages.map(msg => {
          if (msg.role === 'assistant' && msg.ui) return msg.ui;
          if (msg.role === 'user' && msg.userInput) {
              if (typeof msg.userInput === 'object' && msg.userInput !== null) return null; 
              return { type: 'USER_MESSAGE', message: msg.userInput };
          }
          return null;
      }).filter(Boolean);

      // NEW LOGIC: If history exists, just show it. Otherwise, start a new session.
      if (transformedHistory.length > 0) {
        setTutorHistory(transformedHistory);
      } else {
        const startSessionData = await callTutorApi({
          topicId: topic.id,
          organ: topic.chapterId,
          userName: userName,
        });
        setTutorHistory([startSessionData.ui]); 
      }
    
    } catch (err) {
      console.error("Error starting/resuming session:", err);
      setTutorHistory([{ type: 'ERROR', message: "Could not load the lesson. Please try again." }]);
    } finally {
      setIsMentorTyping(false);
    }
  }, [activeTopic, userName, callTutorApi]);

  const submitTutorInteraction = useCallback(async (userInput, displayMessage) => {
    if (isMentorTyping || !activeTopic) return;
    setIsMentorTyping(true);
    if (displayMessage) {
      setTutorHistory(prev => [...prev, { type: 'USER_MESSAGE', message: displayMessage }]);
    }
    try {
      const data = await callTutorApi({
        userInput: userInput,
        topicId: activeTopic.id,
        organ: activeTopic.chapterId,
      });
      setTutorHistory(prev => [...prev, data.ui]);
    } catch (error) {
      console.error("Error submitting user input:", error);
      setTutorHistory(prev => [...prev, { type: 'ERROR', message: "Sorry, I'm having trouble connecting." }]);
    } finally {
      setIsMentorTyping(false);
    }
  }, [isMentorTyping, activeTopic, callTutorApi]);
  
  const handleChatInputSubmit = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    submitTutorInteraction(chatInput, chatInput);
    setChatInput('');
  };

  const handleCheckpointSubmit = (selectedIndex) => {
    const lastCard = tutorHistory[tutorHistory.length - 1];
    const choiceText = lastCard?.options[selectedIndex] || `Answer #${selectedIndex + 1}`;
    submitTutorInteraction({ selectedIndex }, `My answer: "${choiceText}"`);
  };



  const handleContinue = () => {
    // We send "continue" to the backend, but `null` for the display message
    // so it doesn't appear in the chat.
    submitTutorInteraction("continue", null);
  };

  const handleContinueToNextTopic = () => {
    // 1. Create a flat list of all learnable topics (those without children)
    const flatTopics = [];
    const flattenRecursively = (topics) => {
        topics.forEach(topic => {
            if (!topic.children || topic.children.length === 0) {
                flatTopics.push(topic);
            }
            if (topic.children && topic.children.length > 0) {
                flattenRecursively(topic.children);
            }
        });
    };
    flattenRecursively(chapterTopics); // chapterTopics holds the full, merged tree

    // 2. Find the index of the current topic
    const currentIndex = flatTopics.findIndex(topic => topic.id === activeTopic.id);

    // 3. If there is a next topic, click it
    if (currentIndex !== -1 && currentIndex < flatTopics.length - 1) {
        const nextTopic = flatTopics[currentIndex + 1];
        handleTopicClick(nextTopic);
    } else {
        // Optional: Handle the case where the last topic in the chapter is finished
        console.log("Chapter complete!");
        // You could add a UI card here to celebrate completing the chapter
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
                    <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type your answer..." className="flex-grow rounded-lg px-4 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-blue-400">Send</button>
                </div>
            </fieldset>
        </form>
      </div>
    );
    const shouldShowInput = isLastCard && ['TEACH_CARD', 'SHORT_CHECKPOINT'].includes(card.type);
    switch(card.type) {
        case 'OBJECTIVES_CARD': return ( <div key={index} className="rounded-lg shadow-md bg-white border border-gray-200 overflow-hidden"> <div className="bg-indigo-600 p-4"><h3 className="font-bold text-3xl text-white">{card.title}</h3></div> <div className="p-6"> <div className="prose prose-lg max-w-none text-gray-800"><ReactMarkdown>{card.message}</ReactMarkdown></div> {isLastCard && ( <div className="mt-6 flex justify-end"> <button onClick={handleContinue} disabled={isMentorTyping} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-400" > Ready </button> </div> )} </div> </div> );
        case 'TEACH_CARD': return ( <div key={index} className="rounded-lg shadow-md bg-white border border-gray-200 overflow-hidden"> <div className="bg-gray-800 p-4"><h3 className="font-bold text-3xl text-white">{card.title}</h3></div> <div className="p-6"> <div className="prose prose-lg max-w-none"><ReactMarkdown>{card.message}</ReactMarkdown></div> {(card.assets?.images?.length > 0 || card.assets?.cases?.length > 0) && ( <div className="mt-6 pt-4 border-t border-gray-300"> <h4 className="font-semibold text-base text-gray-600 mb-2">Reference Material:</h4> {(card.assets.images || []).map(img => <a key={img.alt} href={img.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block text-base">{img.alt}</a>)} {(card.assets.cases || []).map(c => <a key={c.label} href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block text-base">{c.label}</a>)} </div> )} {shouldShowInput && renderChatInput()} </div> </div> );
        case 'TRANSITION_CARD': return ( <div key={index} className="rounded-lg shadow-md bg-white border border-gray-200 overflow-hidden"> <div className="bg-blue-600 p-4"><h3 className="font-bold text-3xl text-white">{card.title}</h3></div> <div className="p-6"> <div className="prose prose-lg max-w-none text-gray-800"><ReactMarkdown>{card.message}</ReactMarkdown></div> <div className="mt-6 flex justify-end"> <button onClick={handleContinue} disabled={isMentorTyping} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-400">Continue to Checkpoint →</button> </div> </div> </div> );
        case 'MCQ_CHECKPOINT': return ( <div key={index} className="rounded-lg shadow-md bg-white border border-gray-200 overflow-hidden"> <div className="bg-gray-800 p-4"><h3 className="font-bold text-3xl text-white">{card.title}</h3></div> <div className="p-6"> <MCQForm question={card.message} options={card.options} onSubmit={handleCheckpointSubmit} isMentorTyping={isMentorTyping}/> </div> </div> );
        case 'SHORT_CHECKPOINT': return ( <div key={index} className="rounded-lg shadow-md bg-white border border-gray-200 overflow-hidden"> <div className="bg-gray-800 p-4"><h3 className="font-bold text-3xl text-white">{card.title}</h3></div> <div className="p-6"> <div className="prose prose-lg max-w-none"><ReactMarkdown>{card.message}</ReactMarkdown></div> {shouldShowInput && renderChatInput()} </div> </div> );
        case 'FEEDBACK_CARD': const isCorrect = card.isCorrect; return ( <div key={index} className={`rounded-lg shadow-md bg-white border border-gray-200 overflow-hidden`}> <div className={`${isCorrect ? 'bg-green-600' : 'bg-red-600'} p-4`}><h3 className="font-bold text-3xl text-white">{card.title}</h3></div> <div className="p-6"> <div className="prose prose-lg max-w-none text-gray-800"><ReactMarkdown>{card.message}</ReactMarkdown></div> <div className="mt-6 flex justify-end"> <button onClick={handleContinue} disabled={isMentorTyping} className="px-4 py-2 bg-gray-700 text-white font-semibold rounded-md hover:bg-gray-800 disabled:bg-gray-400">Continue →</button> </div> </div> </div> );
                case 'SUMMARY_CARD':
        case 'TOPIC_COMPLETE':
            return (
                <div key={index} className="rounded-lg shadow-md bg-white border border-gray-200 overflow-hidden">
                    <div className="bg-yellow-500 p-4"><h3 className="font-bold text-3xl text-white">{card.title}</h3></div>
                    <div className="p-6">
                        <div className="prose prose-lg max-w-none text-gray-800 mt-4"><ReactMarkdown>{card.message}</ReactMarkdown></div>
                        {/* NEW: Conditionally render the continue button */}
                        {card.isTopicComplete && isLastCard && (
                            <div className="mt-6 flex justify-end">
                                <button
                                  onClick={handleContinueToNextTopic}
                                  disabled={isMentorTyping}
                                  className="px-6 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:bg-green-400"
                                >
                                  Continue to Next Topic →
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            );
        case 'USER_MESSAGE': return ( <div key={index} className="flex justify-end"> <div className="inline-block max-w-2xl p-4 rounded-lg bg-gray-100 border border-gray-200 text-gray-800">{card.message}</div> </div> );
        case 'ERROR': return ( <div key={index} className="flex justify-start"><div className="p-4 rounded-xl bg-red-100 text-red-700 font-medium">{card.message}</div></div> );
        default: return <div key={index} className="text-sm text-gray-400">Received an unknown card type: {card.type}</div>;
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-50">
      {/* Sidebar (Correct) */}
      <aside className={`bg-white shadow-xl flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-80' : 'w-0'}`}>
        <div className={`p-6 font-bold text-2xl text-gray-800 flex-shrink-0 border-b ${!isSidebarOpen && 'hidden'}`}>
          {currentChapter ? currentChapter.name : 'Chapter'}
        </div>
        <nav className={`flex-grow overflow-y-auto p-6 ${!isSidebarOpen && 'hidden'}`}>
          {isSidebarLoading ? <p>Loading topics...</p> : <ul>{chapterTopics.map(topic => <TopicNode key={topic.id} topic={topic} onTopicSelect={handleTopicClick} currentTopicId={activeTopic ? activeTopic.id : null}/>)}</ul>}
        </nav>
      </aside>

      {/* Main content area */}
      <main className="flex-grow flex flex-col overflow-hidden"> {/* CHANGED: Main area no longer scrolls */}
        {isSidebarOpen ? (
          // Header is now a static block, not sticky
          <div className="p-6 border-b border-gray-200 flex-shrink-0">
            <div><h1 className="text-3xl font-bold text-gray-800">{activeTopic ? activeTopic.name : "Select a topic"}</h1></div>
            <div className="flex space-x-2 flex-shrink-0 mt-4">
              <button onClick={toggleSidebar} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-300">Focus Mode</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between p-6 flex-shrink-0 border-b border-gray-200 bg-gray-50">
            <button onClick={toggleSidebar} className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-semibold hover:bg-gray-900 shadow-lg">
              Show Menu
            </button>
            <h1 className="text-2xl font-bold text-gray-800 truncate pl-4">
              {activeTopic ? activeTopic.name : ""}
            </h1>
          </div>
        )}

        {/* This inner div is now the only scrolling part */}
        <div className="flex-grow overflow-y-auto p-6 space-y-6">
            {tutorHistory.length > 0 ? (
              tutorHistory.map((card, index) => (
                <div key={index} ref={index === tutorHistory.length - 1 ? lastCardRef : null}>
                  {renderTutorCard(card, index)}
                </div>
              ))
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
        </div>
      </main>
    </div>
  );
};

export default LearnTab;