import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import QuestionPaperViewer from './QuestionPaperViewer';
import TopicTestViewer from './TopicTestViewer';

const TestTab = ({ organSystems }) => {
  const [view, setView] = useState('hub');
  
  // State for the new Section-wise Test flow
  const [topics, setTopics] = useState([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState(null);

  // This effect fetches the list of topics from our new collection
  useEffect(() => {
    if (view === 'section-selection' && topics.length === 0) {
      const fetchTopics = async () => {
        setIsLoadingTopics(true);
        try {
          // Query the new 'questionTopics' collection, order by name
          const q = query(collection(db, "questionTopics"), orderBy("name"));
          const snapshot = await getDocs(q);
          const topicsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setTopics(topicsData);
        } catch (error) {
          console.error("Error fetching topics:", error);
          // You could add an error state here to show a message
        }
        setIsLoadingTopics(false);
      };
      fetchTopics();
    }
  }, [view, topics.length]);

  // Handler to select a topic and move to the next view
  const handleTopicSelect = (topic) => {
    setSelectedTopic(topic);
    setView('topic-viewer');
  };
  
  // The main hub view
  if (view === 'hub') {
    return (
      <div className="p-4">
        {/* ... The hub JSX remains the same ... */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800">Test Center</h1>
          <p className="text-lg text-gray-600 mt-2">Select a test mode to begin your preparation.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 flex flex-col">
            <h2 className="text-2xl font-bold text-gray-800">Section-wise Tests</h2>
            <p className="text-gray-600 mt-2 flex-grow">
              Focus on specific topics like Breast, MSK, or CNS. Choose between MCQs and theory questions.
            </p>
            <button
              onClick={() => setView('section-selection')}
              className="mt-6 w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
            >
              Start Sectional Test
            </button>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 flex flex-col">
            <h2 className="text-2xl font-bold text-gray-800">Past Year Papers (PYQs)</h2>
            <p className="text-gray-600 mt-2 flex-grow">
              Practice with official past question papers. Choose a specific exam, year, and paper to begin.
            </p>
            <button
              onClick={() => setView('pyq-filter')}
              className="mt-6 w-full px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
            >
              View Papers
            </button>
          </div>
        </div>
      </div>
    );
  }

  // The PYQ filter and viewer screen
  if (view === 'pyq-filter') {
    return (
      <div className="p-4">
        <div className="text-center mb-12">
          <button onClick={() => setView('hub')} className="text-blue-600 hover:underline mb-4">
            &larr; Back to Test Center
          </button>
          <h1 className="text-4xl font-bold text-gray-800">Past Year Question Papers</h1>
          <p className="text-lg text-gray-600 mt-2">Select a paper to view.</p>
        </div>
        <div className="max-w-5xl mx-auto">
          <QuestionPaperViewer />
        </div>
      </div>
    )
  }

  // The NEW section selection view
  if (view === 'section-selection') {
    return (
      <div className="p-4">
        <div className="text-center mb-12">
          <button onClick={() => setView('hub')} className="text-blue-600 hover:underline mb-4">
            &larr; Back to Test Center
          </button>
          <h1 className="text-4xl font-bold text-gray-800">Section-wise Test</h1>
          <p className="text-lg text-gray-600 mt-2">Choose a section to start a test.</p>
        </div>
        <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          {isLoadingTopics ? (
            <p className="text-center col-span-2 text-gray-500">Loading Topics...</p>
          ) : (
            topics.map((topic) => (
              <button
                key={topic.id}
                onClick={() => handleTopicSelect(topic)}
                className="p-4 bg-white rounded-xl shadow-lg border border-gray-200 text-lg font-semibold text-gray-700 hover:border-blue-500 hover:text-blue-600 text-left"
              >
                {topic.name} ({topic.questionCount})
              </button>
            ))
          )}
        </div>
      </div>
    );
  }
  
  // This is the placeholder for our next component
  if (view === 'topic-viewer') {
      return (
          <div className="p-4">
              <button onClick={() => setView('section-selection')} className="text-blue-600 hover:underline mb-4">
                &larr; Back to Section List
              </button>
              <h1 className="text-4xl font-bold text-center text-gray-800">{selectedTopic?.name}</h1>
              <TopicTestViewer topic={selectedTopic} />
          </div>
      )
  }
  
  return null;
};

export default TestTab;