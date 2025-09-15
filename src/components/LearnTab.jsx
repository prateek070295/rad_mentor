import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
import { collection, doc, getDoc, addDoc, serverTimestamp, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import TopicNode from './TopicNode';
import ContentDisplay from './ContentDisplay';
import Modal from './Modal';
import ConfidenceRating from './ConfidenceRating';
import PostSessionModal from './PostSessionModal';

const buildTopicTree = (topics, chapterTopicId) => {
    const nodeMap = new Map();
    const tree = [];
    for (const topic of topics) {
        topic.children = [];
        nodeMap.set(topic.topicId, topic);
    }
    for (const topic of topics) {
        if (topic.parentId && topic.parentId !== chapterTopicId && nodeMap.has(topic.parentId)) {
            nodeMap.get(topic.parentId).children.push(topic);
        } else {
            tree.push(topic);
        }
    }
    return tree;
};

const LearnTab = ({ todayFocus, userName }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [chapterTopics, setChapterTopics] = useState([]);
  const [currentTopic, setCurrentTopic] = useState(null);
  const [studyMaterial, setStudyMaterial] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPostSessionModalOpen, setIsPostSessionModalOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isMentorTyping, setIsMentorTyping] = useState(false);
  const [isLessonComplete, setIsLessonComplete] = useState(false);
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

  useEffect(() => {
    const focusData = parseFocusString(todayFocus);
    if (!focusData) {
      setIsLoading(false);
      setChapterTopics([]);
      setCurrentChapter({ name: "No Topic Scheduled" });
      setCurrentTopic(null);
      return;
    }
    const fetchAllData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const sectionsRef = collection(db, 'sections');
        const sectionQuery = query(sectionsRef, where("title", "==", focusData.sectionName));
        const sectionSnapshot = await getDocs(sectionQuery);
        if (sectionSnapshot.empty) throw new Error(`Section "${focusData.sectionName}" not found.`);
        const sectionDoc = sectionSnapshot.docs[0];
        const sectionId = sectionDoc.id;

        const nodesRef = collection(db, 'sections', sectionId, 'nodes');
        const chapterQuery = query(nodesRef, where("name", "==", focusData.chapterName), where("parentId", "==", null));
        const chapterSnapshot = await getDocs(chapterQuery);
        if (chapterSnapshot.empty) throw new Error(`Chapter "${focusData.chapterName}" not found.`);
        const chapterDoc = chapterSnapshot.docs[0];
        const chapterData = chapterDoc.data();
        setCurrentChapter(chapterData);

        const allTopicsQuery = query(nodesRef, where("parentId", "!=", null), orderBy("order"));
        const allTopicsSnapshot = await getDocs(allTopicsQuery);
        const descendantTopics = allTopicsSnapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(topic => topic.path && topic.path.includes(focusData.chapterName));

        if (descendantTopics.length === 0) {
            setChapterTopics([]);
            setStudyMaterial(null);
            setIsLoading(false);
            return;
        }

        const topicTree = buildTopicTree(descendantTopics, chapterData.topicId);
        setChapterTopics(topicTree);
        
        const initialTopic = descendantTopics[0];
        setCurrentTopic(initialTopic);

        const materialDocRef = doc(db, 'sections', sectionId, 'nodes', initialTopic.id);
        const materialDocSnap = await getDoc(materialDocRef);
        if (materialDocSnap.exists()) {
            setStudyMaterial(materialDocSnap.data().mainContent || null);
        }

        if (auth.currentUser) {
            const historyQuery = query(
                collection(db, "chatHistories"),
                where("userId", "==", auth.currentUser.uid),
                where("topicId", "==", initialTopic.topicId),
                orderBy("completedAt", "desc"),
                limit(1)
            );
            const historySnapshot = await getDocs(historyQuery);

            if (!historySnapshot.empty) {
                setChatHistory(historySnapshot.docs[0].data().history);
            } else {
                const greeting = `Hello ${userName || 'Dr.'}, ready to learn about ${initialTopic.name}?`;
                setChatHistory([{ role: 'assistant', content: greeting }]);
            }
        }
        setIsLessonComplete(false);

      } catch (err) {
        console.error("Failed to fetch chapter data:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllData();
  }, [todayFocus, userName]);
  
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isMentorTyping]);

  const handleTopicClick = async (topic) => {
    if (currentTopic?.id === topic.id) return;
    
    setIsLoading(true);
    setCurrentTopic(topic);
    setStudyMaterial(null);
    const sectionId = topic.path[0];
    const materialDocRef = doc(db, 'sections', sectionId, 'nodes', topic.id);
    const materialDocSnap = await getDoc(materialDocRef);
    if (materialDocSnap.exists()) {
        setStudyMaterial(materialDocSnap.data().mainContent || null);
    } else {
        setStudyMaterial(null);
    }
    
    if (auth.currentUser) {
        const historyQuery = query(
            collection(db, "chatHistories"),
            where("userId", "==", auth.currentUser.uid),
            where("topicId", "==", topic.topicId),
            orderBy("completedAt", "desc"),
            limit(1)
        );
        const historySnapshot = await getDocs(historyQuery);
        if (!historySnapshot.empty) {
            setChatHistory(historySnapshot.docs[0].data().history);
        } else {
            const greeting = `Hello ${userName || 'Dr.'}, ready to learn about ${topic.name}?`;
            setChatHistory([{ role: 'assistant', content: greeting }]);
        }
    }
    setIsLessonComplete(false);
    setIsLoading(false);
  };

  const handleChatInputSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isMentorTyping) return;

    const newUserMessage = { role: 'user', content: chatInput };
    const newChatHistory = [...chatHistory, newUserMessage];
    setChatHistory(newChatHistory);
    setChatInput('');
    setIsMentorTyping(true);

    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: newChatHistory,
          context: studyMaterial 
        }),
      });
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      const mentorMessage = { role: 'assistant', content: data.reply };
      setChatHistory(prev => [...prev, mentorMessage]);
      if (data.isComplete) {
        setIsLessonComplete(true);
      }
    } catch (error) {
      console.error("Error fetching mentor's response:", error);
      const errorMessage = { role: 'assistant', content: "Sorry, I'm having trouble connecting. Please try again." };
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsMentorTyping(false);
    }
  };
  
  const handleEndConversation = async (rating) => {
    if (!auth.currentUser || !currentTopic) {
      alert("Cannot save conversation. User or topic not found.");
      return;
    }
    try {
      await addDoc(collection(db, 'chatHistories'), {
        userId: auth.currentUser.uid,
        topicId: currentTopic.topicId,
        topicName: currentTopic.name,
        completedAt: serverTimestamp(),
        history: chatHistory,
        confidenceRating: rating
      });
      setIsPostSessionModalOpen(true);
    } catch (error) {
      console.error("Error saving chat history: ", error);
      alert("Could not save conversation. Please try again.");
    }
  };

  const handleClosePostSession = () => {
    const updateTopicStatus = (topics, topicId) => {
      return topics.map(topic => {
        if (topic.id === topicId) {
          return { ...topic, status: 'completed' };
        }
        if (topic.children && topic.children.length > 0) {
          return { ...topic, children: updateTopicStatus(topic.children, topicId) };
        }
        return topic;
      });
    };
    setChapterTopics(prevTopics => updateTopicStatus(prevTopics, currentTopic.id));

    setIsPostSessionModalOpen(false);
    setChatHistory([]);
    setIsLessonComplete(false);
  };

  const handleConfidenceSubmit = (rating) => {
    handleEndConversation(rating);
  };

  const handleSaveProgress = async () => {
    if (!auth.currentUser || !currentTopic || chatHistory.length <= 1) {
      alert("Nothing to save yet.");
      return;
    }
    try {
      await addDoc(collection(db, 'chatHistories'), {
        userId: auth.currentUser.uid,
        topicId: currentTopic.topicId,
        topicName: currentTopic.name,
        completedAt: serverTimestamp(),
        history: chatHistory
      });
      alert("Progress saved!");
    } catch (error) {
      console.error("Error saving chat history: ", error);
      alert("Could not save progress. Please try again.");
    }
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  if (isLoading) { return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div><p className="ml-4">Loading Chapter...</p></div>; }
  if (error) { return <div className="text-center text-red-500 p-10">Error: {error}</div>; }
  
  return (
    <div className="flex h-[calc(100vh-8rem)]">
      <aside className={`bg-white shadow-xl flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-80 p-6' : 'w-0'}`}>
        <div className={`flex items-center justify-between mb-6 flex-shrink-0`}>
          <h2 className="text-2xl font-bold text-gray-800">{currentChapter ? currentChapter.name : 'Chapter'}</h2>
        </div>
        <nav className="overflow-y-auto">
          <ul>
            {chapterTopics.map((topic) => (
              <TopicNode 
                key={topic.id}
                topic={topic}
                onTopicSelect={handleTopicClick}
                currentTopicId={currentTopic ? currentTopic.id : null}
              />
            ))}
          </ul>
        </nav>
      </aside>
      
      <main className="flex-grow flex flex-col overflow-y-auto bg-gray-50">
        <div className="sticky top-0 z-10 bg-gray-50 p-6">
          <div>
            <p className="text-sm font-medium text-blue-600">Today's Focus</p>
            <h1 className="text-3xl font-bold text-gray-800">{currentChapter ? currentChapter.name : "Select a topic"}</h1>
          </div>
          <div className="flex space-x-2 flex-shrink-0 mt-4">
            <button onClick={handleSaveProgress} className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-200">
              Save Progress
            </button>
            <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-300">
              Reference Material
            </button>
            <button onClick={toggleSidebar} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-300">
              {isSidebarOpen ? 'Focus Mode' : 'Show Menu'}
            </button>
          </div>
        </div>

        <div className="px-6 pb-6 flex-grow flex flex-col">
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg flex flex-col flex-grow">
            <div className="flex-grow p-4 overflow-y-auto space-y-4">
              {chatHistory.map((msg, index) => (
                <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-4xl p-3 rounded-xl shadow text-base ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
                    {msg.role === 'assistant' ? (
                      <div className="prose max-w-none"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}
              {isMentorTyping && (
                <div className="flex justify-start">
                  <div className="max-w-md p-3 rounded-xl shadow bg-gray-200 text-gray-800">
                    <span className="animate-pulse">Mentor is typing...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            
            {isLessonComplete ? (
              <ConfidenceRating onRate={handleConfidenceSubmit} />
            ) : (
              <form onSubmit={handleChatInputSubmit} className="p-4 bg-gray-100 border-t">
                <fieldset disabled={isMentorTyping} className="flex space-x-2">
                  <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask a question..." className="flex-grow rounded-lg px-4 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-200" />
                  <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-400">Send</button>
                </fieldset>
              </form>
            )}
          </div>
        </div>
      </main>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <ContentDisplay content={studyMaterial} />
      </Modal>

      <PostSessionModal 
        isOpen={isPostSessionModalOpen}
        onClose={handleClosePostSession}
        topicName={currentTopic ? currentTopic.name : ''}
      />
    </div>
  );
};

export default LearnTab;