// file: src/components/StructuredTable.jsx
import React from 'react';

const getCellText = (cell) => {
  if (cell == null) return '';
  if (typeof cell === 'object' && 'content' in cell) {
    return String(cell.content ?? '');
  }
  return String(cell);
};

const getRowCells = (row) => {
  if (Array.isArray(row)) return row;
  if (row && typeof row === 'object') {
    if (Array.isArray(row.cells)) return row.cells;
    if (Array.isArray(row.values)) return row.values;
  }
  return [];
};

const StructuredTable = ({ table, indexOffset = 0 }) => {
  if (!table || typeof table !== 'object') return null;
  const headers = Array.isArray(table.headers) ? table.headers : [];
  const rows = Array.isArray(table.rows) ? table.rows : [];
  if (!headers.length || !rows.length) return null;

  const caption = table.caption || `Table ${indexOffset + 1}`;
  const tableId = table.table_id || `table-${indexOffset}`;

  return (
    <div className="mt-5">
      <div className="hidden overflow-x-auto sm:block">
        <table className="min-w-full border-collapse text-sm text-slate-800 shadow-sm">
          <caption className="px-3 pb-3 text-left text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            {caption}
          </caption>
          <thead>
            <tr>
              {headers.map((header, idx) => (
                <th
                  key={`${tableId}-header-${idx}`}
                  scope="col"
                  className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700"
                >
                  {header || `Column ${idx + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr
                key={`${tableId}-row-${rowIdx}`}
                className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}
              >
                {getRowCells(row).map((cell, cellIdx) => (
                    <td
                      key={`${tableId}-cell-${rowIdx}-${cellIdx}`}
                      className="border border-slate-200 px-3 py-2 align-top"
                    >
                      {getCellText(cell)}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 sm:hidden">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
          {caption}
        </p>
        {rows.map((row, rowIdx) => (
          <div
            key={`${tableId}-card-${rowIdx}`}
            className="rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm"
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Row {rowIdx + 1}
            </p>
            <dl className="space-y-2 text-sm text-slate-700">
                {headers.map((header, headerIdx) => (
                  <div
                    key={`${tableId}-card-${rowIdx}-${headerIdx}`}
                    className="grid grid-cols-3 gap-2"
                  >
                  <dt className="col-span-1 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                    {header || `Column ${headerIdx + 1}`}
                  </dt>
                  <dd className="col-span-2 text-sm text-slate-800">
                    {getCellText(getRowCells(row)[headerIdx])}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StructuredTable;
