// file: src/admin/components/structured-editor/SectionList.jsx
import React from 'react';

const SectionList = ({
  sections,
  activeSectionId,
  onSelect,
  onAddSection,
  onCloneSection,
  onRemoveSection,
  onReorderSection,
}) => {
  const handleReorder = (index, direction) => {
    if (!onReorderSection) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;
    onReorderSection(index, targetIndex);
  };

  return (
    <aside className="w-full max-w-sm shrink-0 rounded-3xl border border-indigo-100 bg-white/70 p-4 shadow-lg shadow-indigo-100/60 xl:max-w-md 2xl:max-w-lg">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-indigo-500">
            Sections
          </p>
          <p className="text-xs text-slate-500">{sections.length} total</p>
        </div>
        <button
          type="button"
          onClick={() => onAddSection?.()}
          className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:border-emerald-300 hover:bg-emerald-100"
        >
          Add section
        </button>
      </header>
      {sections.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">
          No sections yet. Use "Add section" to start curating this topic.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {sections.map((section, index) => {
            const sectionId = section.localId || section.id;
            const isActive = sectionId === activeSectionId;
            return (
              <li
                key={sectionId || index}
                className={`rounded-2xl border px-3 py-3 shadow-sm transition ${
                  isActive
                    ? 'border-indigo-300 bg-indigo-50/80 shadow-indigo-100/60'
                    : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect?.(sectionId)}
                  className="flex w-full flex-col gap-1 text-left"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    #{section.order}
                  </span>
                  <span className="truncate text-sm font-semibold text-slate-800">
                    {section.title || 'Untitled section'}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {section.checkpoints?.length || 0} checkpoint(s)
                  </span>
                </button>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                  <button
                    type="button"
                    onClick={() => handleReorder(index, 'up')}
                    disabled={index === 0}
                    className="rounded-full border border-slate-200 px-2 py-1 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReorder(index, 'down')}
                    disabled={index === sections.length - 1}
                    className="rounded-full border border-slate-200 px-2 py-1 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => onCloneSection?.(sectionId)}
                    className="rounded-full border border-indigo-200 px-2 py-1 text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveSection?.(sectionId)}
                    className="rounded-full border border-rose-200 px-2 py-1 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
};

export default SectionList;
