// file: src/admin/components/structured-editor/MisconceptionList.jsx
import React from 'react';
import { EditorActionTypes } from './state';

const MisconceptionList = ({ sectionId, items = [], dispatch }) => {
  const handleAdd = () => {
    dispatch({
      type: EditorActionTypes.ADD_SECTION_ITEM,
      payload: { sectionId, itemType: 'misconceptions' },
    });
  };

  const handleRemove = (itemId) => {
    dispatch({
      type: EditorActionTypes.REMOVE_SECTION_ITEM,
      payload: { sectionId, itemType: 'misconceptions', itemId },
    });
  };

  const handleFieldChange = (itemId, field, value) => {
    dispatch({
      type: EditorActionTypes.UPDATE_SECTION_ITEM,
      payload: { sectionId, itemType: 'misconceptions', itemId, changes: { [field]: value } },
    });
  };

  return (
    <section className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4 shadow-inner shadow-rose-100/40">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-rose-500">
            Misconceptions
          </h4>
          <p className="mt-1 text-xs text-rose-600">
            Capture the common incorrect beliefs and their clarifications.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
        >
          Add misconception
        </button>
      </header>
      {items.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-rose-200 bg-white/60 px-3 py-3 text-sm text-rose-600">
          No misconceptions recorded for this section.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item, index) => (
            <li
              key={item.localId || item.id || index}
              className="space-y-3 rounded-xl border border-rose-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[11px] font-semibold text-rose-500">
                  {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(item.localId || item.id)}
                  className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
                >
                  Remove
                </button>
              </div>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Misconception / Claim
                <input
                  type="text"
                  value={item.claim || ''}
                  onChange={(event) =>
                    handleFieldChange(item.localId || item.id, 'claim', event.target.value)
                  }
                  placeholder="Incorrect assumption to address"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-rose-400 focus:outline-none focus:ring"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Correction
                <textarea
                  value={item.correction || ''}
                  onChange={(event) =>
                    handleFieldChange(item.localId || item.id, 'correction', event.target.value)
                  }
                  placeholder="Short corrective explanation or rule of thumb"
                  rows={3}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-rose-400 focus:outline-none focus:ring"
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default MisconceptionList;
