import React, { useMemo } from 'react';
import { useAdminPanel } from '../context/AdminPanelContext';

const statusColorClass = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'green':
      return 'bg-emerald-500';
    case 'yellow':
      return 'bg-amber-400';
    default:
      return 'bg-slate-400';
  }
};

const NavigationPanel = ({ onCollapse }) => {
  const {
    sectionsQuery,
    sectionNodesQuery,
    activeSectionId,
    setActiveSectionId,
    selectedChapterId,
    selectedTopicId,
    selectChapter,
    selectTopic,
    selectSubtopic,
    clearToChapters,
    clearToTopics,
  } = useAdminPanel();

  const sections = sectionsQuery.data ?? [];
  const index = useMemo(
    () =>
      sectionNodesQuery.index ?? {
        roots: [],
        byDocId: new Map(),
        childrenByTopicId: new Map(),
      },
    [sectionNodesQuery.index],
  );
  const statusMap = sectionNodesQuery.statusMap ?? {};

  const activeChapter = selectedChapterId ? index.byDocId?.get(selectedChapterId) : null;
  const activeTopic = selectedTopicId ? index.byDocId?.get(selectedTopicId) : null;

  const chapters = useMemo(() => index.roots ?? [], [index]);

  const topics = useMemo(() => {
    if (!activeChapter) return [];
    const key = activeChapter.topicId || activeChapter.id;
    return index.childrenByTopicId?.get(key) ?? [];
  }, [activeChapter, index]);

  const subtopics = useMemo(() => {
    if (!activeTopic) return [];
    const key = activeTopic.topicId || activeTopic.id;
    return index.childrenByTopicId?.get(key) ?? [];
  }, [activeTopic, index]);

  return (
    <aside className="flex w-[320px] flex-shrink-0 flex-col border-r border-indigo-100 bg-white shadow-lg shadow-indigo-100/40">
      <div className="border-b border-indigo-50 px-6 pb-4 pt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-indigo-600">
          Navigation
        </p>
        <div className="mt-1 flex items-start justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-900">Syllabus Sections</h2>
          {onCollapse ? (
            <button
              type="button"
              onClick={onCollapse}
              className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 transition hover:border-slate-300 hover:bg-slate-100"
            >
              Close
            </button>
          ) : null}
        </div>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          Organ
        </label>
        <select
          className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring"
          value={activeSectionId ?? ''}
          onChange={(event) => setActiveSectionId(event.target.value)}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
        {!activeChapter ? (
          <LevelList
            title="Chapters"
            emptyLabel="No chapters found in this section yet."
            items={chapters}
            onSelect={(node) => selectChapter(node.id)}
            selectedId={selectedChapterId}
            statusMap={statusMap}
          />
        ) : !activeTopic ? (
          <LevelList
            title="Topics"
            parentLabel={activeChapter.name || activeChapter.title}
            onBack={clearToChapters}
            emptyLabel="No topics added to this chapter yet."
            items={topics}
            onSelect={(node) => selectTopic(node.id)}
            selectedId={selectedTopicId}
            statusMap={statusMap}
          />
        ) : (
          <LevelList
            title="Subtopics"
            parentLabel={activeTopic.name || activeTopic.title}
            onBack={clearToTopics}
            emptyLabel="No subtopics added to this topic yet."
            items={subtopics}
            onSelect={(node) => selectSubtopic(node.id)}
            selectedId={null}
            statusMap={statusMap}
            showStatusOnly
          />
        )}
      </div>
    </aside>
  );
};

const LevelList = ({
  title,
  parentLabel,
  onBack,
  items,
  onSelect,
  selectedId,
  statusMap,
  emptyLabel,
  showStatusOnly = false,
}) => (
  <div className="space-y-4">
    <header className="flex items-center justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-indigo-500">{title}</p>
        {parentLabel ? (
          <p className="mt-1 text-sm font-semibold text-slate-700">{parentLabel}</p>
        ) : null}
      </div>
      {onBack ? (
        <button
          onClick={onBack}
          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
        >
          Back
        </button>
      ) : null}
    </header>
    {items.length === 0 ? (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
        {emptyLabel}
      </p>
    ) : (
      <ul className="space-y-3">
        {items.map((item) => {
          const topicKey = item.topicId || item.id;
          const status = statusMap[topicKey] || 'grey';
          const isActive = selectedId ? selectedId === item.id : false;
          return (
            <li key={item.id}>
              <button
                onClick={() => onSelect(item)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  isActive
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:text-indigo-600'
                }`}
              >
                <span className="block truncate text-sm font-semibold">
                  {item.name || item.title}
                </span>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{item.category || 'Unassigned'}</span>
                  {!showStatusOnly ? (
                    <StatusBadge status={status} />
                  ) : (
                    <StatusBadge status={status} />
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);

const StatusBadge = ({ status }) => (
  <span
    className={`inline-flex h-2.5 w-2.5 rounded-full ${statusColorClass(status)}`}
    title={status ? `${status} status` : 'Status unknown'}
  >
    <span className="sr-only">{status || 'unknown'}</span>
  </span>
);

export default NavigationPanel;
