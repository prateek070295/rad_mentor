import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, where, doc, updateDoc } from 'firebase/firestore';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

// --- UPDATED: Status Indicator Component ---
// Added 'flex-shrink-0' to prevent it from being compressed by long text.
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
  // Data State
  const [nodes, setNodes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeHasChildren, setNodeHasChildren] = useState({});
  
  // Editor State
  const [editedName, setEditedName] = useState('');
  const [content, setContent] = useState(null);

  // UI State
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);

  // --- NEW: State to hold the calculated status for every node in the current section ---
  const [statusMap, setStatusMap] = useState({});

  // --- NEW: Function to calculate all statuses ---
  // This is the core logic for the roll-up feature.
  const calculateAllNodeStatuses = useCallback(async (sectionId) => {
    try {
      // 1. Fetch ALL nodes for the section just once.
      const allNodesRef = collection(db, 'sections', sectionId, 'nodes');
      const allNodesSnapshot = await getDocs(allNodesRef);
      const allNodes = allNodesSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      // 2. Create maps for easy lookups.
      const nodeMap = new Map(allNodes.map(node => [node.topicId, node]));
      const childrenMap = new Map();
      allNodes.forEach(node => {
        if (node.parentId) {
          if (!childrenMap.has(node.parentId)) childrenMap.set(node.parentId, []);
          childrenMap.get(node.parentId).push(node.topicId);
        }
      });
      
      const statuses = {};
      const memo = {}; // Memoization to avoid re-calculating statuses

      // 3. Recursive function to determine status from leaves up to roots.
      const getStatus = (topicId) => {
        if (memo[topicId]) return memo[topicId];

        const node = nodeMap.get(topicId);
        if (!node) return 'grey';

        const children = childrenMap.get(topicId) || [];
        const hasContent = !!node.mainContent?.ops?.[0]?.insert?.trim();

        if (children.length === 0) {
          // It's a leaf node. Status is based purely on its own content.
          memo[topicId] = hasContent ? 'green' : 'grey';
          return memo[topicId];
        }

        // It's a parent node. Calculate status based on children.
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

      // 4. Calculate status for every node and build the final map.
      allNodes.forEach(node => {
        statuses[node.id] = getStatus(node.topicId);
      });
      setStatusMap(statuses);

    } catch (error) {
      console.error("Failed to calculate node statuses:", error);
    }
  }, []);


  useEffect(() => {
    // This hook now fetches nodes for the current view and also triggers status calculation.
    const fetchNodesAndCheckForChildren = async () => {
      setIsLoading(true);
      const currentLevel = breadcrumbs.length;
      let q;
      try {
        if (currentLevel === 0) {
          // When at the top level, reset the status map.
          setStatusMap({}); 
          const sectionsCollectionRef = collection(db, 'sections');
          q = query(sectionsCollectionRef, orderBy("title"));
        } else {
          const parentSection = breadcrumbs[0];
          // When entering a section for the first time, calculate all statuses for it.
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

        // Check for children (this logic remains the same for the '>' indicator)
        if (nodesList.length > 0) {
            const collectionToCheck = currentLevel === 0 ? nodesList[0].id : breadcrumbs[0]?.id;
            const parentCollectionRef = collection(db, 'sections', collectionToCheck, 'nodes');
            const childrenCheckPromises = nodesList.map(async (node) => {
                const parentIdToCheck = currentLevel === 0 ? null : node.topicId;
                const childrenQuery = query(parentCollectionRef, where("parentId", "==", parentIdToCheck));
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

  // All other functions (drillDown, selectNodeForEditing, etc.) remain unchanged.
  const drillDown = (node) => { setSelectedNode(null); setBreadcrumbs(prev => [...prev, { id: node.id, name: node.name, topicId: node.topicId }]); };
  const selectNodeForEditing = (node) => { setSelectedNode(node); setEditedName(node.name); if (typeof node.mainContent === 'object' && node.mainContent !== null) { setContent(node.mainContent); } else { setContent(null); } };
  const handleBreadcrumbClick = (index) => { setSelectedNode(null); setBreadcrumbs(prev => prev.slice(0, index + 1)); };
  const goToTopLevel = () => { setSelectedNode(null); setBreadcrumbs([]); };
  const handleSaveChanges = async () => {
    if (!selectedNode) return;
    try {
      let docRef;
      let updatedData = {};
      const isContentChanged = JSON.stringify(selectedNode.mainContent) !== JSON.stringify({ ...content });
      if (breadcrumbs.length === 0) {
        docRef = doc(db, 'sections', selectedNode.id);
        if (selectedNode.name !== editedName) updatedData.title = editedName;
      } else {
        const parentSection = breadcrumbs[0];
        docRef = doc(db, 'sections', parentSection.id, 'nodes', selectedNode.id);
        if (selectedNode.name !== editedName) updatedData.name = editedName;
        if (isContentChanged) updatedData.mainContent = { ...content };
      }
      if (Object.keys(updatedData).length === 0) { alert("No changes to save."); return; }
      await updateDoc(docRef, updatedData);
      alert('Changes saved successfully!');
      // After saving, re-calculate statuses for the current section
      if(breadcrumbs.length > 0) {
        calculateAllNodeStatuses(breadcrumbs[0].id);
      }
    } catch (error) {
      console.error("Error updating document:", error);
      alert('Failed to save changes.');
    }
  };
  const handlePreview = () => { localStorage.setItem('radmentor_preview_content', JSON.stringify(content)); window.open('/preview', '_blank'); };

  // --- UPDATED RENDER FUNCTION ---
  // Now includes the StatusIndicator component.
  const renderNavContent = () => {
    if (isLoading) return <p>Loading...</p>;
    if (nodes.length === 0) return <p className="text-gray-500">No sub-topics found.</p>;
    return (
      <ul>
        {nodes.map(node => {
          const hasChildren = nodeHasChildren[node.id];
          return (
            <li key={node.id} className={`flex justify-between items-center p-2 font-semibold rounded-md ${selectedNode?.id === node.id ? 'bg-blue-100' : 'hover:bg-gray-100'}`} onClick={!hasChildren ? () => selectNodeForEditing(node) : undefined}>
              <div className="flex items-center gap-2"> {/* Removed min-w-0 */}
                <StatusIndicator status={statusMap[node.id]} />
                {/* Removed 'truncate' class to allow text to wrap */}
                <span className={`${hasChildren ? 'cursor-pointer' : ''}`} onClick={hasChildren ? () => drillDown(node) : undefined}>{node.name}</span>
              </div>
              {hasChildren && (<button className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-1 px-2 rounded flex-shrink-0" onClick={(e) => { e.stopPropagation(); selectNodeForEditing(node); }}>Edit</button>)}
            </li>
          );
        })}
      </ul>
    );
  };

  // The main return JSX is mostly unchanged, just includes the updated renderNavContent.
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
      <div className="flex-grow p-6 flex flex-col bg-gray-50">
        {selectedNode ? (
          <>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex-shrink-0">
              <label htmlFor="topicName" className="block text-sm font-medium text-gray-700">Topic Name</label>
              <input type="text" id="topicName" value={editedName} onChange={(e) => setEditedName(e.target.value)} className="mt-1 block w-full text-xl font-bold border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
              <p className="text-sm text-white bg-blue-500 inline-block px-2 py-0.5 rounded-full mt-2">{selectedNode.category}</p>
            </div>
            {/* --- UPDATED: Rich Text Editor Wrapper --- */}
            {/* Removed custom styles from ReactQuill and let the wrapper handle the layout */}
            <div className="flex-grow relative">
              <ReactQuill 
                theme="snow" 
                value={content || ''} 
                onChange={(newContent, delta, source, editor) => setContent(editor.getContents())} 
                style={{ height: 'calc(100% - 42px)' }} // Let Quill handle its height within the container
              />
            </div>
            <div className="mt-6 flex-shrink-0 flex items-center gap-4">
              <button onClick={handleSaveChanges} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75">Save Changes</button>
              <button onClick={handlePreview} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-75">See Preview</button>
            </div>
          </>
        ) : (
          <div>
            <h2 className="text-lg font-bold mb-4">Content Editor ✍️</h2>
            <p className="text-gray-500">Select a topic from the navigation pane to begin editing.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;

