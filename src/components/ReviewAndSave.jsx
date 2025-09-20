// file: src/components/ReviewAndSave.jsx
// This is the complete and final version. Please replace the entire file content.

import React, { useState, useEffect } from 'react';

const ReviewAndSave = ({ structuredContent, onSave, onCancel, organ, topicId }) => {
  const [editableContent, setEditableContent] = useState(structuredContent);

  useEffect(() => {
    setEditableContent(structuredContent);
  }, [structuredContent]);

  if (!editableContent) return null;

  // --- STATE HANDLERS ---

  const handleTopLevelArrayChange = (field, textValue) => {
    const newArray = textValue.split('\n').filter(item => item.trim() !== '');
    setEditableContent({ ...editableContent, [field]: newArray });
  };

  const handleSectionChange = (sectionIndex, field, value) => {
    const updatedSections = [...editableContent.sections];
    updatedSections[sectionIndex] = { ...updatedSections[sectionIndex], [field]: value };
    setEditableContent({ ...editableContent, sections: updatedSections });
  };

  const handleImageChange = (sectionIndex, imageIndex, field, value) => {
    const updatedSections = [...editableContent.sections];
    const updatedImages = [...(updatedSections[sectionIndex].images || [])];
    updatedImages[imageIndex] = { ...updatedImages[imageIndex], [field]: value };
    updatedSections[sectionIndex].images = updatedImages;
    setEditableContent({ ...editableContent, sections: updatedSections });
  };

  const handleCaseChange = (sectionIndex, caseIndex, field, value) => {
    const updatedSections = [...editableContent.sections];
    const updatedCases = [...(updatedSections[sectionIndex].cases || [])];
    updatedCases[caseIndex] = { ...updatedCases[caseIndex], [field]: value };
    updatedSections[sectionIndex].cases = updatedCases;
    setEditableContent({ ...editableContent, sections: updatedSections });
  };
  
  const handleMisconceptionChange = (sectionIndex, mcIndex, field, value) => {
    const updatedSections = [...editableContent.sections];
    const updatedMisconceptions = [...(updatedSections[sectionIndex].misconceptions || [])];
    updatedMisconceptions[mcIndex] = { ...updatedMisconceptions[mcIndex], [field]: value };
    updatedSections[sectionIndex].misconceptions = updatedMisconceptions;
    setEditableContent({ ...editableContent, sections: updatedSections });
  };

  const handleCheckpointChange = (sectionIndex, cpIndex, field, value) => {
    const updatedSections = [...editableContent.sections];
    const updatedCheckpoints = [...updatedSections[sectionIndex].checkpoints];
    const finalValue = field === 'correct_index' ? parseInt(value, 10) || 0 : value;
    updatedCheckpoints[cpIndex] = { ...updatedCheckpoints[cpIndex], [field]: finalValue };
    updatedSections[sectionIndex].checkpoints = updatedCheckpoints;
    setEditableContent({ ...editableContent, sections: updatedSections });
  };
  
  const handleCheckpointArrayChange = (sectionIndex, cpIndex, field, textValue) => {
    const updatedSections = [...editableContent.sections];
    const updatedCheckpoints = [...updatedSections[sectionIndex].checkpoints];
    const newArray = textValue.split('\n');
    updatedCheckpoints[cpIndex] = { ...updatedCheckpoints[cpIndex], [field]: newArray };
    updatedSections[sectionIndex].checkpoints = updatedCheckpoints;
    setEditableContent({ ...editableContent, sections: updatedSections });
  };

  const handleSave = () => {
    onSave({ organ, topicId, structured: editableContent });
  };

  return (
    <div className="mt-8 p-4 border-t border-gray-300">
      <h3 className="text-2xl font-bold text-gray-800 mb-6">2. Edit & Save</h3>
      
      <div className="p-4 bg-white rounded-lg shadow border border-gray-200 mb-6">
        <label className="block">
          <span className="text-lg font-semibold text-gray-700">Topic Objectives</span>
          <p className="text-sm text-gray-500 mb-2">Overall learning goals for this topic (one per line).</p>
          <textarea value={(editableContent.objectives || []).join('\n')} onChange={(e) => handleTopLevelArrayChange('objectives', e.target.value)} className="mt-1 block w-full text-sm font-mono border-gray-300 rounded-md shadow-sm" rows={3}/>
        </label>
      </div>

      <div className="space-y-6">
        {editableContent.sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="p-4 bg-white rounded-lg shadow border border-gray-200 space-y-4">
            <label className="block"><span className="text-sm font-semibold text-gray-600">Section {section.order} Title</span><input type="text" value={section.title} onChange={(e) => handleSectionChange(sectionIndex, 'title', e.target.value)} className="mt-1 block w-full text-xl font-semibold border-gray-300 rounded-md shadow-sm"/></label>
            <label className="block"><span className="text-sm font-semibold text-gray-600">Body</span><textarea value={section.body_md} onChange={(e) => handleSectionChange(sectionIndex, 'body_md', e.target.value)} className="mt-1 block w-full h-40 p-2 border-gray-300 rounded-md shadow-sm"/></label>
            
            {(section.images || []).length > 0 && ( <div className="border-t pt-4 space-y-3"><h5 className="font-semibold text-gray-700">Images</h5>{section.images.map((image, imgIndex) => (<div key={imgIndex} className="p-2 border rounded-md space-y-2"><label className="block"><span className="text-xs font-medium text-gray-500">Image Description (alt text)</span><input type="text" value={image.alt} onChange={(e) => handleImageChange(sectionIndex, imgIndex, 'alt', e.target.value)} className="mt-1 block w-full text-sm border-gray-300 rounded-md shadow-sm"/></label><label className="block"><span className="text-xs font-medium text-gray-500">Image URL</span><input type="text" value={image.url} onChange={(e) => handleImageChange(sectionIndex, imgIndex, 'url', e.target.value)} className="mt-1 block w-full text-sm font-mono border-gray-300 rounded-md shadow-sm"/></label></div>))}</div>)}
            {(section.cases || []).length > 0 && ( <div className="border-t pt-4 space-y-3"><h5 className="font-semibold text-gray-700">Cases</h5>{section.cases.map((caseItem, caseIndex) => (<div key={caseIndex} className="p-2 border rounded-md space-y-2"><label className="block"><span className="text-xs font-medium text-gray-500">Case Label</span><input type="text" value={caseItem.label} onChange={(e) => handleCaseChange(sectionIndex, caseIndex, 'label', e.target.value)} className="mt-1 block w-full text-sm border-gray-300 rounded-md shadow-sm"/></label><label className="block"><span className="text-xs font-medium text-gray-500">Case URL</span><input type="text" value={caseItem.url} onChange={(e) => handleCaseChange(sectionIndex, caseIndex, 'url', e.target.value)} className="mt-1 block w-full text-sm font-mono border-gray-300 rounded-md shadow-sm"/></label></div>))}</div>)}
            {(section.misconceptions || []).length > 0 && ( <div className="border-t pt-4 space-y-3"><h5 className="font-semibold text-gray-700">Misconceptions</h5>{section.misconceptions.map((mc, mcIndex) => (<div key={mcIndex} className="p-2 border rounded-md space-y-2 bg-red-50"><label className="block"><span className="text-xs font-medium text-gray-500">Common Misconception (Claim)</span><input type="text" value={mc.claim} onChange={(e) => handleMisconceptionChange(sectionIndex, mcIndex, 'claim', e.target.value)} className="mt-1 block w-full text-sm border-gray-300 rounded-md shadow-sm"/></label><label className="block"><span className="text-xs font-medium text-gray-500">Correction</span><input type="text" value={mc.correction} onChange={(e) => handleMisconceptionChange(sectionIndex, mcIndex, 'correction', e.target.value)} className="mt-1 block w-full text-sm border-gray-300 rounded-md shadow-sm"/></label></div>))}</div>)}
            {(section.checkpoints || []).length > 0 && (<div className="border-t pt-4 space-y-4"><h5 className="font-semibold text-gray-700">Checkpoints</h5>{section.checkpoints.map((cp, cpIndex) => (<div key={cpIndex} className="p-3 bg-gray-50 border border-gray-300 rounded-md space-y-3"><label className="block w-1/3"><span className="text-xs font-medium text-gray-500">Type</span><select value={cp.type} onChange={(e) => handleCheckpointChange(sectionIndex, cpIndex, 'type', e.target.value)} className="mt-1 block w-full text-sm border-gray-300 rounded-md shadow-sm"><option value="mcq">MCQ</option><option value="short">Short Answer</option></select></label><label className="block"><span className="text-xs font-medium text-gray-500">Question</span><textarea value={cp.question_md} onChange={(e) => handleCheckpointChange(sectionIndex, cpIndex, 'question_md', e.target.value)} className="mt-1 block w-full text-sm border-gray-300 rounded-md shadow-sm" rows={2}/></label>{cp.type === 'mcq' && (<div className="p-2 border-l-4 border-blue-300 space-y-2"><label className="block"><span className="text-xs font-medium text-gray-500">Options (one per line)</span><textarea value={(cp.options || []).join('\n')} onChange={(e) => handleCheckpointArrayChange(sectionIndex, cpIndex, 'options', e.target.value)} className="mt-1 block w-full text-sm font-mono border-gray-300 rounded-md shadow-sm" rows={4}/></label><label className="block w-1/3"><span className="text-xs font-medium text-gray-500">Correct Index (0-based)</span><input type="number" value={cp.correct_index || 0} onChange={(e) => handleCheckpointChange(sectionIndex, cpIndex, 'correct_index', e.target.value)} className="mt-1 block w-full text-sm border-gray-300 rounded-md shadow-sm"/></label></div>)}<label className="block"><span className="text-xs font-medium text-gray-500">Rationale / Explanation</span><textarea value={cp.rationale_md} onChange={(e) => handleCheckpointChange(sectionIndex, cpIndex, 'rationale_md', e.target.value)} className="mt-1 block w-full text-sm border-gray-300 rounded-md shadow-sm" rows={3}/></label><label className="block"><span className="text-xs font-medium text-gray-500">Hints (one per line)</span><textarea value={(cp.hints || []).join('\n')} onChange={(e) => handleCheckpointArrayChange(sectionIndex, cpIndex, 'hints', e.target.value)} className="mt-1 block w-full text-sm border-gray-300 rounded-md shadow-sm" rows={3}/></label></div>))}</div>)}
          </div>
        ))}
      </div>

      <div className="p-4 bg-white rounded-lg shadow border border-gray-200 mt-6">
        <label className="block">
          <span className="text-lg font-semibold text-gray-700">Topic Key Points</span>
          <p className="text-sm text-gray-500 mb-2">Final summary points for this topic (one per line).</p>
          <textarea value={(editableContent.key_points || []).join('\n')} onChange={(e) => handleTopLevelArrayChange('key_points', e.target.value)} className="mt-1 block w-full text-sm font-mono border-gray-300 rounded-md shadow-sm" rows={4}/>
        </label>
      </div>

      <div className="mt-6 flex justify-end gap-4">
        <button onClick={onCancel} className="px-6 py-2 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700">Cancel / Edit</button>
        <button onClick={handleSave} className="px-6 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700">Save to Database</button>
      </div>
    </div>
  );
};

export default ReviewAndSave;