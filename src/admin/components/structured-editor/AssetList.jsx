// file: src/admin/components/structured-editor/AssetList.jsx
import React from 'react';
import { EditorActionTypes } from './state';

const FIELD_CONFIG = {
  images: [
    { name: 'alt', label: 'Alt text / caption', placeholder: 'Describe what the learner sees' },
    { name: 'url', label: 'Image URL', placeholder: 'https://storage.googleapis.com/...', isMono: true },
  ],
  cases: [
    { name: 'label', label: 'Case label', placeholder: 'Case summary or diagnosis' },
    { name: 'url', label: 'Case URL', placeholder: 'https://storage.googleapis.com/...', isMono: true },
  ],
};

const TITLE_MAP = {
  images: 'Images',
  cases: 'Cases',
};

const DESCRIPTION_MAP = {
  images: 'Attach illustrative figures that reinforce the teaching point.',
  cases: 'Link to anonymized cases or PACS clips for deeper exploration.',
};

const AssetList = ({ sectionId, items = [], itemType, dispatch }) => {
  const fields = FIELD_CONFIG[itemType] || [];
  const title = TITLE_MAP[itemType] || 'Assets';
  const description = DESCRIPTION_MAP[itemType] || '';

  const handleAdd = () => {
    dispatch({
      type: EditorActionTypes.ADD_SECTION_ITEM,
      payload: { sectionId, itemType },
    });
  };

  const handleRemove = (itemId) => {
    dispatch({
      type: EditorActionTypes.REMOVE_SECTION_ITEM,
      payload: { sectionId, itemType, itemId },
    });
  };

  const handleFieldChange = (itemId, field, value) => {
    dispatch({
      type: EditorActionTypes.UPDATE_SECTION_ITEM,
      payload: { sectionId, itemType, itemId, changes: { [field]: value } },
    });
  };

  if (!fields.length) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-inner shadow-slate-100/50">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-600">
            {title}
          </h4>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-100"
        >
          Add {title.slice(0, -1)}
        </button>
      </header>
      {items.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4 text-sm text-slate-500">
          No {title.toLowerCase()} added yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item, index) => (
            <li
              key={item.localId || item.id || index}
              className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-600">
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
              <div className="space-y-3">
                {fields.map((field) => (
                  <label key={field.name} className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                    {field.label}
                    <input
                      type="text"
                      value={item[field.name] || ''}
                      onChange={(event) =>
                        handleFieldChange(item.localId || item.id, field.name, event.target.value)
                      }
                      placeholder={field.placeholder}
                      className={`rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring ${
                        field.isMono ? 'font-mono' : ''
                      }`}
                    />
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default AssetList;
