import React, { useEffect, useRef } from 'react';
import Quill from 'quill'; // Import the core Quill library

// This component manually initializes a read-only Quill instance
const ContentDisplay = ({ content }) => {
  const editorRef = useRef(null); // Ref to the container div

  useEffect(() => {
    // Ensure the container div exists and we have valid content
    if (editorRef.current && content && content.ops) {
      // Clear any previous instance to avoid duplicates
      editorRef.current.innerHTML = '';
      
      // Create a new Quill instance
      const quill = new Quill(editorRef.current, {
        readOnly: true,
        theme: 'snow',
        modules: { toolbar: false } // Hide the toolbar
      });

      // Set the content from the prop
      quill.setContents(content);
    }
  }, [content]); // Re-run this effect whenever the content changes

  // A simple guard for loading/empty states
  if (!content || !content.ops) {
    return (
      <div className="p-4">
        <p className="text-gray-500">Loading content or no material available...</p>
      </div>
    );
  }

  // The div that Quill will attach to
  return <div ref={editorRef} className="ql-container ql-snow" style={{ border: 'none' }} />;
};

export default ContentDisplay;