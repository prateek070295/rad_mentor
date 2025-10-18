// file: src/admin/components/structured-editor/SectionEditor.jsx
import React from 'react';
import { EditorActionTypes } from './state';
import AssetList from './AssetList';
import MisconceptionList from './MisconceptionList';
import CheckpointCard from './CheckpointCard';
import TableList from './TableList';

const SectionEditor = ({
  section,
  index,
  totalSections,
  dispatch,
  onMove,
  onClone,
  onRemove,
  onAddBelow,
}) => {
  const sectionId = section.localId || section.id;

  const handleFieldChange = (field, value) => {
    dispatch({
      type: EditorActionTypes.UPDATE_SECTION,
      payload: { sectionId, changes: { [field]: value } },
    });
  };

  const handleAddCheckpoint = (checkpointType) => {
    dispatch({
      type: EditorActionTypes.ADD_SECTION_ITEM,
      payload: { sectionId, itemType: 'checkpoints', checkpointType },
    });
  };

  const checkpoints = section.checkpoints || [];

  return (
    <section className="space-y-6 rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-xl shadow-indigo-100/50">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">
            Section {section.order}
          </p>
          <input
            type="text"
            value={section.title || ''}
            onChange={(event) => handleFieldChange('title', event.target.value)}
            placeholder="Section title"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-lg font-semibold text-slate-900 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onMove?.('up', sectionId, index)}
            disabled={index === 0}
            className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Move up
          </button>
          <button
            type="button"
            onClick={() => onMove?.('down', sectionId, index)}
            disabled={index === totalSections - 1}
            className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Move down
          </button>
          <button
            type="button"
            onClick={() => onClone?.(sectionId)}
            className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-100"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => onAddBelow?.(sectionId)}
            className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:border-emerald-300 hover:bg-emerald-100"
          >
            Add below
          </button>
          <button
            type="button"
            onClick={() => onRemove?.(sectionId)}
            className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
          >
            Remove
          </button>
        </div>
      </header>

      <label className="flex flex-col gap-2 text-xs font-semibold text-slate-600">
        Body (markdown)
        <textarea
          value={section.body_md || ''}
          onChange={(event) => handleFieldChange('body_md', event.target.value)}
          rows={6}
          placeholder="Teach the concept. Mix directives, pearls, and clarifications."
          className="rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-800 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring"
        />
      </label>

      <div className="space-y-4">
        <AssetList
          sectionId={sectionId}
          items={section.images}
          itemType="images"
          dispatch={dispatch}
        />
        <AssetList
          sectionId={sectionId}
          items={section.cases}
          itemType="cases"
          dispatch={dispatch}
        />
        <TableList sectionId={sectionId} tables={section.tables} dispatch={dispatch} />
      </div>

      <MisconceptionList sectionId={sectionId} items={section.misconceptions} dispatch={dispatch} />

      <section className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-inner shadow-indigo-100/50">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-indigo-600">
              Checkpoints ({checkpoints.length})
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Keep sections aligned with the schema: MCQ needs 4–5 options; short answers require patterns.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleAddCheckpoint('mcq')}
              className="inline-flex items-center rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-100"
            >
              Add MCQ
            </button>
            <button
              type="button"
              onClick={() => handleAddCheckpoint('short')}
              className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:border-emerald-300 hover:bg-emerald-100"
            >
              Add short answer
            </button>
          </div>
        </header>
        <div className="space-y-4">
          {checkpoints.map((checkpoint, checkpointIndex) => (
            <CheckpointCard
              key={checkpoint.localId || checkpoint.id || checkpointIndex}
              sectionId={sectionId}
              checkpoint={checkpoint}
              index={checkpointIndex}
              totalCount={checkpoints.length}
              dispatch={dispatch}
            />
          ))}
        </div>
      </section>
    </section>
  );
};

export default SectionEditor;
