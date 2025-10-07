import React, { useEffect, useRef } from 'react';
import Quill from 'quill';

const QuillEditor = ({ value, onChange }) => {
  const editorRef = useRef(null);
  const quillInstanceRef = useRef(null);
  const latestOnChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);

  useEffect(() => {
    latestOnChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (editorRef.current) {
      // Prevent initializing Quill multiple times
      if (!quillInstanceRef.current) {
        quillInstanceRef.current = new Quill(editorRef.current, {
          theme: 'snow',
          modules: {
            toolbar: [
              [{ 'header': [1, 2, 3, false] }],
              ['bold', 'italic', 'underline', 'strike'],
              [{ 'list': 'ordered'}, { 'list': 'bullet' }],
              ['link', 'image'],
              ['clean']
            ],
          },
        });

        quillInstanceRef.current.on('text-change', () => {
          const handler = latestOnChangeRef.current;
          handler?.(quillInstanceRef.current.getContents());
        });

        if (initialValueRef.current) {
          quillInstanceRef.current.setContents(initialValueRef.current, 'silent');
        }
      }
    }
  }, []); // Run only once on mount

  // Update editor content when the `value` prop changes from the parent
  useEffect(() => {
    if (quillInstanceRef.current && value && JSON.stringify(quillInstanceRef.current.getContents()) !== JSON.stringify(value)) {
      quillInstanceRef.current.setContents(value, 'silent');
    }
  }, [value]);

  return <div ref={editorRef} style={{ minHeight: '300px', display: 'flex', flexDirection: 'column' }} />;
};

export default QuillEditor;
