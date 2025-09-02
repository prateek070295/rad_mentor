import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, where, doc, updateDoc } from 'firebase/firestore';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

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

  // --- NEW: UI State for collapsing panes ---
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);

  useEffect(() => {
    // This entire useEffect hook for fetching data is unchanged
    const fetchNodesAndCheckForChildren = async () => {
      setIsLoading(true);
      const currentLevel = breadcrumbs.length;
      let q;
      try {
        if (currentLevel === 0) {
          const sectionsCollectionRef = collection(db, 'sections');
          q = query(sectionsCollectionRef, orderBy("title"));
        } else {
          const parentSection = breadcrumbs[0];
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
          const childrenMap = results.reduce((acc, curr) => {
            acc[curr.id] = curr.hasChildren;
            return acc;
          }, {});
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
  }, [breadcrumbs]);

  // All navigation and saving functions are unchanged
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
      setBreadcrumbs(prev => [...prev]);
    } catch (error) {
      console.error("Error updating document:", error);
      alert('Failed to save changes.');
    }
  };

  // --- NEW: Function to handle the preview ---
  const handlePreview = () => {
    // Save the current, unsaved content to localStorage
    localStorage.setItem('radmentor_preview_content', JSON.stringify(content));
    // Open the /preview route in a new tab
    window.open('/preview', '_blank');
  };

  const renderNavContent = () => {
    // This function is unchanged
    if (isLoading) return <p>Loading...</p>;
    if (nodes.length === 0) return <p className="text-gray-500">No sub-topics found.</p>;
    return (
      <ul>
        {nodes.map(node => {
          const hasChildren = nodeHasChildren[node.id];
          return (
            <li key={node.id} className={`flex justify-between items-center p-2 font-semibold rounded-md ${selectedNode?.id === node.id ? 'bg-blue-100' : 'hover:bg-gray-100'}`} onClick={!hasChildren ? () => selectNodeForEditing(node) : undefined}>
              <span className={hasChildren ? 'cursor-pointer flex-grow' : ''} onClick={hasChildren ? () => drillDown(node) : undefined}>{node.name}</span>
              {hasChildren && (<button className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-1 px-2 rounded" onClick={(e) => { e.stopPropagation(); selectNodeForEditing(node); }}>Edit</button>)}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex h-[calc(100vh-120px)] bg-gray-200 transition-all duration-300">
      {/* Left Pane: Now Collapsible */}
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

      {/* Center Pane: Takes up remaining space */}
      <div className="flex-grow p-6 flex flex-col bg-gray-50">
        {selectedNode ? (
          <>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex-shrink-0">
              <label htmlFor="topicName" className="block text-sm font-medium text-gray-700">Topic Name</label>
              <input type="text" id="topicName" value={editedName} onChange={(e) => setEditedName(e.target.value)} className="mt-1 block w-full text-xl font-bold border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
              <p className="text-sm text-white bg-blue-500 inline-block px-2 py-0.5 rounded-full mt-2">{selectedNode.category}</p>
            </div>
            <div className="flex-grow flex flex-col overflow-y-hidden bg-white rounded-lg shadow-sm border border-gray-200">
              <ReactQuill theme="snow" value={content || ''} onChange={(newContent, delta, source, editor) => setContent(editor.getContents())} className="flex-grow" style={{ display: 'flex', flexDirection: 'column' }} />
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