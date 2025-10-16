// file: src/admin/components/structured-editor/TopicArrayEditor.jsx
import React from 'react';

const TopicArrayEditor = ({
  label,
  description,
  values = [],
  maxItems = 5,
  placeholder = '',
  onChange,
  addLabel = 'Add item',
}) => {
  const handleItemChange = (index, nextValue) => {
    const updated = values.slice();
    updated[index] = nextValue;
    onChange(updated);
  };

  const handleAdd = () => {
    if (values.length >= maxItems) return;
    onChange([...values, '']);
  };

  const handleRemove = (index) => {
    const updated = values.filter((_, idx) => idx !== index);
    onChange(updated);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-inner shadow-slate-100/60">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-indigo-600">
            {label}
          </h3>
          {description ? (
            <p className="mt-1 text-xs text-slate-500">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={values.length >= maxItems}
          className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {addLabel}
        </button>
      </header>
      {values.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-3 text-sm text-slate-500">
          No items yet—use “{addLabel}” to add the first entry.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {values.map((value, index) => (
            <li
              key={`topic-array-${index}`}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
            >
              <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-600">
                {index + 1}
              </span>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={value}
                  onChange={(event) => handleItemChange(index, event.target.value)}
                  placeholder={placeholder}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring"
                />
              </div>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="mt-1 inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TopicArrayEditor;
