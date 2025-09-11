import React, { useState, useEffect } from 'react';
import ContentDisplay from './ContentDisplay'; // Use our existing component
import 'quill/dist/quill.snow.css'; // Use the standard snow theme CSS

const PreviewPage = () => {
  const [content, setContent] = useState(null);

  useEffect(() => {
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
        <ContentDisplay content={content} />
      </div>
    </div>
  );
};

export default PreviewPage;