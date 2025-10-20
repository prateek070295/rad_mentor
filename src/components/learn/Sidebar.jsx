import React from 'react';
import TopicNode from '../TopicNode';

/**
 * Sidebar navigation for the Learn workspace syllabus tree.
 */
const Sidebar = ({
  isOpen,
  onToggle,
  title,
  subtitle,
  chapterGroups,
  isLoading,
  activeTopicId,
  onTopicSelect,
}) => (
  <aside
    className={`flex-shrink-0 transition-all duration-300 ease-in-out ${
      isOpen ? 'w-full max-w-sm lg:max-w-xs xl:max-w-sm' : 'w-0'
    }`}
  >
    <div
      className={`sticky top-4 flex h-[calc(100vh-3rem)] min-h-[640px] flex-col overflow-hidden rounded-3xl border border-indigo-100 bg-white/95 shadow-2xl shadow-indigo-200/50 backdrop-blur transition-all duration-300 ${
        isOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-6 opacity-0'
      }`}
    >
      <div className="flex justify-end px-6 pt-6 sm:px-7">
        <button
          onClick={onToggle}
          className="inline-flex items-center justify-center rounded-full border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:shadow-lg"
        >
          {isOpen ? 'Focus Mode' : 'Show Menu'}
        </button>
      </div>
      <div className="border-b border-indigo-100 px-6 pb-6 pt-4 sm:px-7">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">
          {title}
        </p>
        <h2 className="mt-2 text-lg font-semibold text-slate-900">{subtitle}</h2>
        <p className="mt-1 text-xs	text-slate-500">
          Navigate topics and subtopics for today&apos;s study plan.
        </p>
      </div>
      <nav className="flex-1 overflow-y-auto px-6 pb-5 pt-4 timeline-scrollbar">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="h-12 animate-pulse rounded-2xl border border-indigo-50 bg-indigo-50/60 shadow-inner shadow-indigo-100/40"
              />
            ))}
          </div>
        ) : chapterGroups.length > 0 ? (
          <div className="space-y-6">
            {chapterGroups.map((group) => (
              <div key={group.key} className="space-y-3">
                {chapterGroups.length > 1 ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-indigo-500">
                      {group.sectionName || 'Syllabus'}
                    </p>
                    <h3 className="text-sm font-semibold text-slate-800">
                      {group.chapterName || 'Chapter'}
                    </h3>
                  </div>
                ) : null}
                <ul className="space-y-2">
                  {(group.topics || []).map((topic) => (
                    <TopicNode
                      key={`${group.key || 'group'}-${topic.id}`}
                      topic={topic}
                      onTopicSelect={onTopicSelect}
                      currentTopicId={activeTopicId}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-indigo-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500 shadow-inner shadow-indigo-100/40">
            No topics available for today&apos;s plan yet.
          </div>
        )}
      </nav>
    </div>
  </aside>
);

export default Sidebar;
