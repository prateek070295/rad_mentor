import React, { useState } from 'react';

const TopicNode = ({ topic, onTopicSelect, currentTopicId }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasChildren = topic.children && topic.children.length > 0;

  const normalizedStatus =
    typeof topic.status === "string" ? topic.status.trim().toLowerCase() : "";
  let computedStatus = normalizedStatus;

  if (!computedStatus || computedStatus === "not-started") {
    const pct =
      typeof topic.percentComplete === "number" ? topic.percentComplete : null;
    if (pct !== null) {
      if (pct >= 100) {
        computedStatus = "completed";
      } else if (pct > 0) {
        computedStatus = "in-progress";
      }
    }
  }

  if ((!computedStatus || computedStatus === "not-started") && topic.completed === true) {
    computedStatus = "completed";
  }

  if ((!computedStatus || computedStatus === "not-started") && topic.started === true) {
    computedStatus = computedStatus === "completed" ? computedStatus : "in-progress";
  }

  if ((!computedStatus || computedStatus === "not-started") && currentTopicId === topic.id) {
    computedStatus = "in-progress";
  }

  if (!computedStatus) {
    computedStatus = "not-started";
  }

  // A single handler for the entire row
  const handleRowClick = () => {
    // Action 1: Select the topic to view its content
    onTopicSelect(topic);

    // Action 2: Toggle the expansion of its children
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <li className="my-1">
      <div 
        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 cursor-pointer" 
        onClick={handleRowClick} // Use the new unified handler here
      >
        {/* Arrow Icon */}
        {hasChildren ? (
          <span className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : 'rotate-0'}`}>
            ▶
          </span>
        ) : (
          <span className="w-4"></span> // Placeholder for alignment
        )}

        {/* Status Icon */}
        <div
          className={`w-3 h-3 rounded-full flex-shrink-0 ${
            computedStatus === 'completed'
              ? 'bg-green-500'
              : computedStatus === 'in-progress'
              ? 'bg-yellow-500'
              : 'bg-gray-400'
          }`}
        ></div>
        
        {/* Topic Name (no longer needs its own click handler) */}
        <span 
          className={`font-medium ${currentTopicId === topic.id ? 'text-blue-600 font-bold' : 'text-gray-700'}`}
        >
          {topic.name}
        </span>
      </div>

      {/* Render Children if Expanded */}
      {isExpanded && hasChildren && (
        <ul className="pl-6 border-l-2 border-gray-200 ml-4">
          {topic.children.map(childTopic => (
            <TopicNode 
              key={childTopic.id}
              topic={childTopic}
              onTopicSelect={onTopicSelect}
              currentTopicId={currentTopicId}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export default TopicNode;