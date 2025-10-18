// file: src/admin/components/structured-editor/TableList.jsx
import React from 'react';
import TableEditor from './TableEditor';
import { EditorActionTypes } from './state';

const TableList = ({ sectionId, tables = [], dispatch }) => {
  const handleAdd = () => {
    dispatch({
      type: EditorActionTypes.ADD_SECTION_ITEM,
      payload: { sectionId, itemType: 'tables' },
    });
  };

  const handleRemove = (tableId) => {
    dispatch({
      type: EditorActionTypes.REMOVE_SECTION_ITEM,
      payload: { sectionId, itemType: 'tables', itemId: tableId },
    });
  };

  const handleReorder = (fromIndex, toIndex) => {
    dispatch({
      type: EditorActionTypes.REORDER_SECTION_ITEM,
      payload: { sectionId, itemType: 'tables', fromIndex, toIndex },
    });
  };

  const handleDuplicate = (table) => {
    const clone = {
      ...table,
      localId: null,
      table_id: '',
      rows: (table.rows || []).map((row) =>
        Array.isArray(row)
          ? row.map((cell) => ({
              ...cell,
              localId: null,
            }))
          : row,
      ),
    };
    dispatch({
      type: EditorActionTypes.ADD_SECTION_ITEM,
      payload: { sectionId, itemType: 'tables', item: clone },
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-inner shadow-slate-100/50">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-600">
            Tables ({tables.length})
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            Capture structured comparisons or classification criteria without overloading body text.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-100"
        >
          Add table
        </button>
      </header>

      {tables.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4 text-sm text-slate-500">
          No tables yet. Add one to keep dense checklists or classifications tidy.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {tables.map((table, index) => (
            <li key={table.localId || table.table_id || index} className="space-y-4">
              <TableEditor
                sectionId={sectionId}
                table={table}
                index={index}
                totalCount={tables.length}
                onRemove={() => handleRemove(table.localId || table.table_id)}
                onDuplicate={() => handleDuplicate(table)}
                onMove={(direction) => {
                  const nextIndex = direction === 'up' ? index - 1 : index + 1;
                  if (nextIndex < 0 || nextIndex >= tables.length) return;
                  handleReorder(index, nextIndex);
                }}
                dispatch={dispatch}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default TableList;
