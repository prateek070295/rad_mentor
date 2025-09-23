import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
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
  const [legacyContent, setLegacyContent] = useState(null); // Renamed from 'content'
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const [statusMap, setStatusMap] = useState({});
  const [organSystems, setOrganSystems] = useState([]);
  const [activeEditorTab, setActiveEditorTab] = useState('legacy');
  const [view, setView] = useState('uploader');
  const [extractedData, setExtractedData] = useState(null);

  // --- NEW: State for loading and storing structured content ---
  const [structuredContent, setStructuredContent] = useState(null);
  const [isStructuredContentLoading, setIsStructuredContentLoading] = useState(false);

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
  
  // --- UPDATED: This function now fetches both legacy and structured content ---
  const selectNodeForEditing = async (node) => { 
      setSelectedNode(node); 
      setEditedName(node.name); 

      // Reset content states
      setLegacyContent(null);
      setStructuredContent(null);
      
      // Load legacy Quill content
      if (typeof node.mainContent === 'object' && node.mainContent !== null) { 
          setLegacyContent(node.mainContent); 
      }
      
      // Load structured content from our new API
      if (breadcrumbs.length > 0) {
        setIsStructuredContentLoading(true);
        const organ = breadcrumbs[0].id;
        const topicId = node.id; // Use the document ID for the API call
        try {
          const response = await fetch(`/content?organ=${organ}&topicId=${topicId}`);
          if (response.ok) {
            const data = await response.json();
            setStructuredContent(data.structuredContent); // Will be null if no content exists yet
          } else {
            console.error("Failed to fetch structured content, server responded with an error.");
            setStructuredContent(null);
          }
        } catch (error) {
          console.error("Error fetching structured content:", error);
          setStructuredContent(null);
        } finally {
          setIsStructuredContentLoading(false);
        }
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

  // --- UPDATED: This function now only saves legacy content ---
  const handleSaveChanges = async () => {
    if (!selectedNode) return;
    try {
      const parentSection = breadcrumbs[0];
      const docRef = doc(db, 'sections', parentSection.id, 'nodes', selectedNode.id);
      await updateDoc(docRef, { 
        name: editedName,
        mainContent: legacyContent 
      });
      alert('Legacy content saved successfully!');
      if(breadcrumbs.length > 0) {
        calculateAllNodeStatuses(breadcrumbs[0].id);
      }
    } catch (error) {
      console.error("Error updating document:", error);
      alert('Failed to save changes.');
    }
  };

  const handlePreview = () => { 
      localStorage.setItem('radmentor_preview_content', JSON.stringify(legacyContent)); 
      window.open('/preview', '_blank'); 
  };

  const handleExtracted = (data) => {
    setExtractedData(data);
    setView('preview');
  };

  const handleSaveToBank = () => {
    setExtractedData(null);
    setView('uploader');
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

      <div className="flex-grow p-6 flex flex-col bg-gray-50 overflow-y-auto">
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
        
        <h3 className="text-2xl font-bold text-gray-800 mb-6">Content Editor</h3>

        {selectedNode ? (
          <div className="flex-grow flex flex-col">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex-shrink-0">
              <label htmlFor="topicName" className="block text-sm font-medium text-gray-700">Topic Name</label>
              <input type="text" id="topicName" value={editedName} onChange={(e) => setEditedName(e.target.value)} className="mt-1 block w-full text-xl font-bold border-gray-300 rounded-md shadow-sm" />
              {selectedNode.category && (
                <p className="text-sm text-white bg-blue-500 inline-block px-2 py-0.5 rounded-full mt-2">{selectedNode.category}</p>
              )}
            </div>

            <div className="flex border-b border-gray-300 mb-4">
              <button onClick={() => setActiveEditorTab('legacy')} className={`px-4 py-2 text-sm font-semibold ${activeEditorTab === 'legacy' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>Legacy (Quill)</button>
              <button onClick={() => setActiveEditorTab('structured')} className={`px-4 py-2 text-sm font-semibold ${activeEditorTab === 'structured' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>Structured (AI)</button>
            </div>

            {activeEditorTab === 'legacy' && (
              <>
                <div className="flex-grow relative bg-white">
                  <QuillEditor value={legacyContent} onChange={setLegacyContent} />
                </div>
                <div className="mt-6 flex-shrink-0 flex items-center gap-4">
                  <button onClick={handleSaveChanges} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700">Save Changes</button>
                  <button onClick={handlePreview} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700">See Preview</button>
                </div>
              </>
            )}

            {activeEditorTab === 'structured' && (
              isStructuredContentLoading ? (
                <div className="text-center p-8">
                  <p className="text-gray-500">Loading structured content...</p>
                </div>
              ) : (
                <StructuredContentEditor
                  organ={breadcrumbs[0]?.id}
                  topicId={selectedNode?.id}
                  initialContent={structuredContent}
                />
              )
            )}
          </div>
        ) : (
          <p className="text-gray-500">Select a topic from the navigation pane to begin editing.</p>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;

