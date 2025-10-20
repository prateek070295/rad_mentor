import React, { useState } from 'react';

const computeNodeStatus = (node, currentTopicId) => {
  if (!node) return 'not-started';

  const hasChildren = Array.isArray(node.children) && node.children.length > 0;

  const normalizedStatus =
    typeof node.status === 'string' ? node.status.trim().toLowerCase() : '';
  let status = normalizedStatus;

  if (!status || status === 'not-started') {
    const pct =
      typeof node.percentComplete === 'number' ? node.percentComplete : null;
    if (pct !== null) {
      if (pct >= 100) {
        status = 'completed';
      } else if (pct > 0) {
        status = 'in-progress';
      }
    }
  }

  if ((!status || status === 'not-started') && node.completed === true) {
    status = 'completed';
  }

  if ((!status || status === 'not-started') && node.started === true) {
    status = status === 'completed' ? status : 'in-progress';
  }

  if ((!status || status === 'not-started') && currentTopicId === node.id) {
    status = 'in-progress';
  }

  if (hasChildren) {
    const childStatuses = node.children.map((child) =>
      computeNodeStatus(child, currentTopicId),
    );

    if (childStatuses.length > 0) {
      const totalChildren = childStatuses.length;
      const completedChildren = childStatuses.filter(
        (childStatus) => childStatus === 'completed',
      ).length;

      if (completedChildren === totalChildren) {
        status = 'completed';
      } else if (
        completedChildren > 0 ||
        childStatuses.some((childStatus) => childStatus === 'in-progress')
      ) {
        status = 'in-progress';
      } else if (!status) {
        status = 'not-started';
      }
    }
  }

  return status || 'not-started';
};

const TopicNode = ({ topic, onTopicSelect, currentTopicId }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasChildren = Array.isArray(topic.children) && topic.children.length > 0;
  const computedStatus = computeNodeStatus(topic, currentTopicId);

  const handleRowClick = () => {
    onTopicSelect(topic);
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <li className="my-1">
      <div
        className="flex cursor-pointer items-center space-x-2 rounded-lg p-2 hover:bg-gray-100"
        onClick={handleRowClick}
      >
        {hasChildren ? (
          <span className="flex h-3 w-3 items-center justify-center text-gray-500 transition-colors duration-200">
            {isExpanded ? '▼' : '▶'}
          </span>
        ) : (
          <span className="h-3 w-3" />
        )}

        <div
          className={`h-3 w-3 flex-shrink-0 rounded-full ${
            computedStatus === 'completed'
              ? 'bg-green-500'
              : computedStatus === 'in-progress'
              ? 'bg-yellow-500'
              : 'bg-gray-400'
          }`}
        />

        <span
          className={`font-medium ${
            currentTopicId === topic.id ? 'font-bold text-blue-600' : 'text-gray-700'
          }`}
        >
          {topic.name}
        </span>
      </div>

      {isExpanded && hasChildren && (
        <ul className="ml-4 border-l-2 border-gray-200 pl-6">
          {topic.children.map((childTopic) => (
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
