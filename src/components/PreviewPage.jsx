// src/components/PreviewPage.jsx
import React, { useState, useEffect } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.bubble.css'; // Use the clean bubble theme for display

const PreviewPage = () => {
  const [content, setContent] = useState(null);

  useEffect(() => {
    // On component load, read the content from localStorage
    const savedContent = localStorage.getItem('radmentor_preview_content');
    if (savedContent) {
      try {
        setContent(JSON.parse(savedContent));
      } catch (e) {
        console.error("Could not parse preview content:", e);
        setContent({ ops: [{ insert: 'Error loading preview.' }] });
      }
    }
  }, []);

  return (
    <div className="container mx-auto p-8">
      <div className="prose max-w-none">
        <ReactQuill 
          value={content || ''} 
          readOnly={true} 
          theme="bubble" 
        />
      </div>
    </div>
  );
};

export default PreviewPage;