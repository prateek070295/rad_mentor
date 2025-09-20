import React, { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../firebase';
import { collection, getDocs, query, orderBy, where, doc, updateDoc } from 'firebase/firestore';
import QuillEditor from './QuillEditor';
import 'quill/dist/quill.snow.css';
import QuestionUploader from './QuestionUploader';
import QPPreviewSave from './QPpreview_save';
import StructuredContentEditor from './StructuredContentEditor';

const StatusIndicator = ({ status }) => {
  const baseClasses = "w-3 h-3 rounded-full flex-shrink-0";
  const statusClasses = {
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    grey: "bg-gray-300",
  };
  return <div className={`${baseClasses} ${statusClasses[status] || statusClasses.grey}`} />;
};

const AdminPanel = () => {
  const [nodes, setNodes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeHasChildren, setNodeHasChildren] = useState({});
  const [editedName, setEditedName] = useState('');
  const [content, setContent] = useState(null);
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const [statusMap, setStatusMap] = useState({});
  const [organSystems, setOrganSystems] = useState([]);
  const [activeEditorTab, setActiveEditorTab] = useState('legacy');

  // --- Uploader State Changes ---
  const [view, setView] = useState('uploader');
  // ✅ 1. State now holds the full data object (questions + metadata)
  const [extractedData, setExtractedData] = useState(null); 

  useEffect(() => {
    const fetchOrganSystems = async () => {
        const sectionsCollectionRef = collection(db, 'sections');
        const sectionsQuery = query(sectionsCollectionRef, orderBy("title"));
        const sectionsSnapshot = await getDocs(sectionsQuery);
        const systemsList = sectionsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().title }));
        setOrganSystems(systemsList);
    };
    fetchOrganSystems();
  }, []);
  
  // ... (all your other functions like calculateAllNodeStatuses, useEffects, drillDown, etc. remain unchanged) ...
  const calculateAllNodeStatuses = useCallback(async (sectionId) => {
    try {
      const allNodesRef = collection(db, 'sections', sectionId, 'nodes');
      const allNodesSnapshot = await getDocs(allNodesRef);
      const allNodes = allNodesSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      const nodeMap = new Map(allNodes.map(node => [node.topicId, node]));
      const childrenMap = new Map();
      allNodes.forEach(node => {
        if (node.parentId) {
          if (!childrenMap.has(node.parentId)) childrenMap.set(node.parentId, []);
          childrenMap.get(node.parentId).push(node.topicId);
        }
      });
      
      const statuses = {};
      const memo = {};

      const getStatus = (topicId) => {
        if (memo[topicId]) return memo[topicId];

        const node = nodeMap.get(topicId);
        if (!node) return 'grey';

        const children = childrenMap.get(topicId) || [];
        const hasContent = !!node.mainContent?.ops?.[0]?.insert?.trim();

        if (children.length === 0) {
          memo[topicId] = hasContent ? 'green' : 'grey';
          return memo[topicId];
        }

        const childStatuses = children.map(childId => getStatus(childId));
        const hasGreenChild = childStatuses.some(s => s === 'green');
        const hasYellowChild = childStatuses.some(s => s === 'yellow');
        const allChildrenGreen = childStatuses.every(s => s === 'green');

        if ((allChildrenGreen && hasContent) || (allChildrenGreen && children.length === 0)) {
            memo[topicId] = 'green';
        } else if (hasGreenChild || hasYellowChild) {
            memo[topicId] = 'yellow';
        } else {
            memo[topicId] = hasContent ? 'yellow' : 'grey';
        }
        return memo[topicId];
      };

      allNodes.forEach(node => {
        statuses[node.id] = getStatus(node.topicId);
      });
      setStatusMap(statuses);

    } catch (error) {
      console.error("Failed to calculate node statuses:", error);
    }
  }, []);

  useEffect(() => {
    const fetchNodesAndCheckForChildren = async () => {
      setIsLoading(true);
      const currentLevel = breadcrumbs.length;
      let q;
      try {
        if (currentLevel === 0) {
          setStatusMap({}); 
          const sectionsCollectionRef = collection(db, 'sections');
          q = query(sectionsCollectionRef, orderBy("title"));
        } else {
          const parentSection = breadcrumbs[0];
          if (currentLevel === 1) {
            calculateAllNodeStatuses(parentSection.id);
          }
          const nodesCollectionRef = collection(db, 'sections', parentSection.id, 'nodes');
          if (currentLevel === 1) {
            q = query(nodesCollectionRef, where("parentId", "==", null), orderBy("order"));
          } else {
            const parentNode = breadcrumbs[currentLevel - 1];
            q = query(nodesCollectionRef, where("parentId", "==", parentNode.topicId), orderBy("order"));
          }
        }
        const querySnapshot = await getDocs(q);
        const nodesList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().title || doc.data().name,
          ...doc.data()
        }));
        setNodes(nodesList);

        if (nodesList.length > 0 && breadcrumbs.length > 0) {
            const parentSectionId = breadcrumbs[0]?.id;
            const childrenCheckPromises = nodesList.map(async (node) => {
                const parentIdToCheck = node.topicId;
                const nodesCollectionRef = collection(db, 'sections', parentSectionId, 'nodes');
                const childrenQuery = query(nodesCollectionRef, where("parentId", "==", parentIdToCheck));
                const childrenSnapshot = await getDocs(childrenQuery);
                return { id: node.id, hasChildren: !childrenSnapshot.empty };
            });
            const results = await Promise.all(childrenCheckPromises);
            const childrenMap = results.reduce((acc, curr) => { acc[curr.id] = curr.hasChildren; return acc; }, {});
            setNodeHasChildren(childrenMap);
        } else {
            setNodeHasChildren({});
        }

      } catch (error) {
        console.error("Error fetching data:", error);
        setNodes([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchNodesAndCheckForChildren();
  }, [breadcrumbs, calculateAllNodeStatuses]);

  const drillDown = (node) => { 
      setSelectedNode(null); 
      setBreadcrumbs(prev => [...prev, { id: node.id, name: node.name, topicId: node.topicId }]); 
  };
  
  const selectNodeForEditing = (node) => { 
      setSelectedNode(node); 
      setEditedName(node.name); 
      if (typeof node.mainContent === 'object' && node.mainContent !== null) { 
          setContent(node.mainContent); 
      } else { 
          setContent(null); 
      } 
  };

  const handleBreadcrumbClick = (index) => { 
      setSelectedNode(null); 
      setBreadcrumbs(prev => prev.slice(0, index + 1)); 
  };
  
  const goToTopLevel = () => { 
      setSelectedNode(null); 
      setBreadcrumbs([]); 
  };

  const handleSaveChanges = async () => {
    if (!selectedNode) return;
    try {
      let docRef;
      let updatedData = {};
      const isContentChanged = JSON.stringify(selectedNode.mainContent) !== JSON.stringify(content);
      if (breadcrumbs.length === 1) {
        docRef = doc(db, 'sections', selectedNode.id);
        if (selectedNode.name !== editedName) updatedData.title = editedName;
      } else {
        const parentSection = breadcrumbs[0];
        docRef = doc(db, 'sections', parentSection.id, 'nodes', selectedNode.id);
        if (selectedNode.name !== editedName) updatedData.name = editedName;
        if (isContentChanged) updatedData.mainContent = { ...content };
      }
      if (Object.keys(updatedData).length === 0) { 
          alert("No changes to save."); 
          return; 
      }
      await updateDoc(docRef, updatedData);
      alert('Changes saved successfully!');
      if(breadcrumbs.length > 0) {
        calculateAllNodeStatuses(breadcrumbs[0].id);
      }
    } catch (error) {
      console.error("Error updating document:", error);
      alert('Failed to save changes.');
    }
  };

  const handlePreview = () => { 
      localStorage.setItem('radmentor_preview_content', JSON.stringify(content)); 
      window.open('/preview', '_blank'); 
  };

  // --- Uploader Function Handlers ---

  // ✅ 2. Handle the incoming data object from the uploader
  const handleExtracted = (data) => {
    setExtractedData(data);
    setView('preview');
  };

  const handleSaveToBank = () => {
    setExtractedData(null);
    setView('uploader');
    // You can add a success notification here
  };

  const handleCancelPreview = () => {
    setExtractedData(null);
    setView('uploader');
  };

  const renderNavContent = () => {
    if (isLoading) return <p>Loading...</p>;
    if (nodes.length === 0) return <p className="text-gray-500">No sub-topics found.</p>;
    return (
      <ul>
        {nodes.map(node => {
          const hasChildren = breadcrumbs.length === 0 || nodeHasChildren[node.id];
          return (
            <li key={node.id} className={`flex justify-between items-center p-2 font-semibold rounded-md ${selectedNode?.id === node.id ? 'bg-blue-100' : 'hover:bg-gray-100'}`} onClick={!hasChildren ? () => selectNodeForEditing(node) : undefined}>
              <div className="flex items-center gap-2">
                <StatusIndicator status={statusMap[node.id]} />
                <span className={`${hasChildren ? 'cursor-pointer' : ''}`} onClick={hasChildren ? () => drillDown(node) : undefined}>{node.name}</span>
              </div>
              {breadcrumbs.length > 0 && (
                <button 
                  className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-1 px-2 rounded flex-shrink-0" 
                  onClick={(e) => { e.stopPropagation(); selectNodeForEditing(node); }}
                >
                  Edit
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex h-[calc(100vh-120px)] bg-gray-200 transition-all duration-300">
      {/* --- NAVIGATION PANE (No changes here) --- */}
      <div className={`bg-white border-r border-gray-300 flex flex-col transition-all duration-300 ${isNavCollapsed ? 'w-16' : 'w-1/4'}`}>
        <div className={`p-4 flex items-center justify-between ${isNavCollapsed ? 'flex-col' : 'flex-row'}`}>
            {!isNavCollapsed && <h2 className="text-lg font-bold">Navigation 🌳</h2>}
            <button onClick={() => setIsNavCollapsed(!isNavCollapsed)} className="p-1 hover:bg-gray-200 rounded">
                {isNavCollapsed ? '→' : '←'}
            </button>
        </div>
        {!isNavCollapsed && (
            <div className="overflow-y-auto px-4">
                <div className="mb-4 text-sm text-gray-600">
                    <span onClick={goToTopLevel} className="cursor-pointer hover:underline">Sections</span>
                    {breadcrumbs.map((crumb, index) => (<span key={crumb.id}>{' > '}<span onClick={() => handleBreadcrumbClick(index)} className="cursor-pointer hover:underline">{crumb.name}</span></span>))}
                </div>
                {renderNavContent()}
            </div>
        )}
      </div>

      {/* --- MAIN CONTENT PANE --- */}
      <div className="flex-grow p-6 flex flex-col bg-gray-50 overflow-y-auto">
        
        {/* --- QUESTION UPLOADER (No changes here) --- */}
        {view === 'uploader' ? (
          <div className="mb-8">
            <QuestionUploader onExtracted={handleExtracted} />
          </div>
        ) : (
          extractedData && (
            <div className="mb-8">
              <QPPreviewSave 
                data={extractedData}
                organSystems={organSystems}
                onSave={handleSaveToBank}
                onCancel={handleCancelPreview}
              />
            </div>
          )
        )}
        <div className="text-center my-4">
            <span className="bg-gray-300 h-px w-1/3 inline-block"></span>
            <span className="text-gray-500 font-semibold uppercase mx-4">Or</span>
            <span className="bg-gray-300 h-px w-1/3 inline-block"></span>
        </div>
        
        {/* --- CONTENT EDITOR (This is where the changes are) --- */}
        <h3 className="text-2xl font-bold text-gray-800 mb-6">Content Editor</h3>

        {selectedNode ? (
          <div className="flex-grow flex flex-col">
            {/* --- TOPIC NAME INPUT (No changes here) --- */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex-shrink-0">
              <label htmlFor="topicName" className="block text-sm font-medium text-gray-700">Topic Name</label>
              <input type="text" id="topicName" value={editedName} onChange={(e) => setEditedName(e.target.value)} className="mt-1 block w-full text-xl font-bold border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
              {selectedNode.category && (
                <p className="text-sm text-white bg-blue-500 inline-block px-2 py-0.5 rounded-full mt-2">{selectedNode.category}</p>
              )}
            </div>

            {/* --- NEW: TAB BUTTONS --- */}
            <div className="flex border-b border-gray-300 mb-4">
              <button 
                onClick={() => setActiveEditorTab('legacy')}
                className={`px-4 py-2 text-sm font-semibold ${activeEditorTab === 'legacy' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Legacy (Quill)
              </button>
              <button 
                onClick={() => setActiveEditorTab('structured')}
                className={`px-4 py-2 text-sm font-semibold ${activeEditorTab === 'structured' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Structured (AI)
              </button>
            </div>

            {/* --- NEW: CONDITIONAL EDITOR RENDERING --- */}
            {activeEditorTab === 'legacy' && (
              <>
                <div className="flex-grow relative bg-white">
                  <QuillEditor 
                    value={content} 
                    onChange={setContent} 
                  />
                </div>
                <div className="mt-6 flex-shrink-0 flex items-center gap-4">
                  <button onClick={handleSaveChanges} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75">Save Changes</button>
                  <button onClick={handlePreview} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-75">See Preview</button>
                </div>
              </>
            )}

            {activeEditorTab === 'structured' && (
              <StructuredContentEditor
                organ={breadcrumbs[0]?.id}
                topicId={selectedNode?.topicId}
              />
            )}

          </div>
        ) : (
          <div>
            <p className="text-gray-500">Select a topic from the navigation pane to begin editing.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;