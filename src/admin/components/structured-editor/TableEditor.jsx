// file: src/admin/components/structured-editor/TableEditor.jsx
import React, { useMemo, useState } from 'react';
import {
  EditorActionTypes,
  createEmptyTableCell,
  createEmptyTableRow,
} from './state';

const cloneRows = (rows = []) => rows.map((row) => row.map((cell) => ({ ...cell })));

const parseSpreadsheet = (raw) => {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length)
    .map((line) => {
      const delimiter = line.includes('\t') ? '\t' : line.includes(',') ? ',' : '\t';
      return line.split(delimiter).map((cell) => cell.trim());
    });
};

const TableEditor = ({
  sectionId,
  table,
  index,
  totalCount,
  dispatch,
  onRemove,
  onDuplicate,
  onMove,
}) => {
  const [isPasteMode, setIsPasteMode] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [useFirstRowAsHeader, setUseFirstRowAsHeader] = useState(true);

  const itemId = table.localId || table.table_id;

  const headers = Array.isArray(table.headers) && table.headers.length > 0 ? table.headers : [''];
  const rows = useMemo(
    () => (Array.isArray(table.rows) && table.rows.length > 0 ? table.rows : [createEmptyTableRow(headers.length)]),
    [table.rows, headers.length],
  );

  const columnCount = Math.max(headers.length, rows[0]?.length || 0, 1);
  const canRemoveColumn = columnCount > 1;
  const canRemoveRow = rows.length > 1;

  const dispatchUpdate = (changes) => {
    dispatch({
      type: EditorActionTypes.UPDATE_SECTION_ITEM,
      payload: { sectionId, itemType: 'tables', itemId, changes },
    });
  };

  const handleCaptionChange = (event) => {
    dispatchUpdate({ caption: event.target.value });
  };

  const handleHeaderChange = (headerIndex, value) => {
    const nextHeaders = headers.slice();
    nextHeaders[headerIndex] = value;
    dispatchUpdate({ headers: nextHeaders });
  };

  const handleCellChange = (rowIndex, columnIndex, value) => {
    const nextRows = cloneRows(rows);
    if (!nextRows[rowIndex]) return;
    const cell = nextRows[rowIndex][columnIndex] || createEmptyTableCell();
    nextRows[rowIndex][columnIndex] = { ...cell, content: value };
    dispatchUpdate({ rows: nextRows });
  };

  const handleAddColumn = () => {
    if (headers.length >= 10) return;
    const nextHeaders = [...headers, ''];
    const nextRows = cloneRows(rows).map((row) => [...row, createEmptyTableCell()]);
    dispatchUpdate({ headers: nextHeaders, rows: nextRows });
  };

  const handleRemoveColumn = (columnIndex) => {
    if (!canRemoveColumn) return;
    const nextHeaders = headers.filter((_, idx) => idx !== columnIndex);
    const nextRows = cloneRows(rows).map((row) => row.filter((_, idx) => idx !== columnIndex));
    dispatchUpdate({ headers: nextHeaders, rows: nextRows });
  };

  const handleAddRow = () => {
    if (rows.length >= 40) return;
    const nextRows = [...cloneRows(rows), createEmptyTableRow(headers.length || 1)];
    dispatchUpdate({ rows: nextRows });
  };

  const handleRemoveRow = (rowIndex) => {
    if (!canRemoveRow) return;
    const nextRows = cloneRows(rows).filter((_, idx) => idx !== rowIndex);
    dispatchUpdate({ rows: nextRows.length ? nextRows : [createEmptyTableRow(headers.length || 1)] });
  };

  const handlePasteApply = () => {
    const parsed = parseSpreadsheet(pasteValue);
    if (!parsed.length) {
      setIsPasteMode(false);
      setPasteValue('');
      return;
    }

    const dataRows = useFirstRowAsHeader ? parsed.slice(1) : parsed.slice();
    let nextHeaders = useFirstRowAsHeader ? parsed[0] : headers.slice();

    let inferredColumns = Math.max(
      nextHeaders ? nextHeaders.length : 0,
      ...dataRows.map((row) => row.length),
      1,
    );
    inferredColumns = Math.min(inferredColumns, 10);

    if (!nextHeaders || nextHeaders.length === 0) {
      nextHeaders = Array.from({ length: inferredColumns }, (_, idx) => `Column ${idx + 1}`);
    } else {
      nextHeaders = nextHeaders.slice(0, inferredColumns);
      while (nextHeaders.length < inferredColumns) {
        nextHeaders.push('');
      }
    }

    const normalizedRows = (dataRows.length ? dataRows : [[]])
      .slice(0, 40)
      .map((row) => {
        const cells = row.slice(0, inferredColumns).map((value) => ({
          ...createEmptyTableCell(),
          content: value,
        }));
        while (cells.length < inferredColumns) {
          cells.push(createEmptyTableCell());
        }
        return cells;
      });

    dispatchUpdate({
      headers: nextHeaders,
      rows: normalizedRows.length ? normalizedRows : [createEmptyTableRow(inferredColumns)],
    });
    setIsPasteMode(false);
    setPasteValue('');
  };

  const tableLabel = `Table ${index + 1}`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">{tableLabel}</p>
          <p className="mt-1 text-[11px] font-mono text-slate-500">ID: {table.table_id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => onMove?.('up')}
            disabled={index === 0}
            className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Move up
          </button>
          <button
            type="button"
            onClick={() => onMove?.('down')}
            disabled={index === totalCount - 1}
            className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Move down
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-100"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
          >
            Remove
          </button>
        </div>
      </header>

      <div className="mt-4 space-y-4">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          Caption
          <input
            type="text"
            value={table.caption || ''}
            onChange={handleCaptionChange}
            placeholder="Summarize what this table conveys"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring"
          />
        </label>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-50">
              <tr>
                {headers.map((header, headerIndex) => (
                  <th key={`${itemId}-header-${headerIndex}`} className="border border-slate-200 p-2 align-top">
                    <div className="flex flex-col gap-1">
                      <input
                        type="text"
                        value={header}
                        onChange={(event) => handleHeaderChange(headerIndex, event.target.value)}
                        placeholder={`Header ${headerIndex + 1}`}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring"
                      />
                      {canRemoveColumn && (
                        <button
                          type="button"
                          onClick={() => handleRemoveColumn(headerIndex)}
                          className="self-end text-[11px] font-semibold text-rose-500 hover:text-rose-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                {canRemoveRow && <th className="border border-slate-200 bg-slate-50" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${itemId}-row-${rowIndex}`} className="odd:bg-white even:bg-slate-50/60">
                  {row.map((cell, columnIndex) => (
                    <td key={cell.localId || `${itemId}-cell-${rowIndex}-${columnIndex}`} className="border border-slate-200 p-0 align-top">
                      <textarea
                        value={cell.content || ''}
                        onChange={(event) =>
                          handleCellChange(rowIndex, columnIndex, event.target.value)
                        }
                        rows={2}
                        className="h-full w-full resize-y border-none bg-transparent px-2 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        placeholder="Cell"
                      />
                    </td>
                  ))}
                  {canRemoveRow && (
                    <td className="border border-slate-200 bg-white align-top">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(rowIndex)}
                        className="mx-2 my-2 inline-flex rounded-full border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
                      >
                        Delete row
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={handleAddColumn}
            disabled={headers.length >= 10}
            className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add column
          </button>
          <button
            type="button"
            onClick={handleAddRow}
            disabled={rows.length >= 40}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-600 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add row
          </button>
          {!isPasteMode && (
            <button
              type="button"
              onClick={() => setIsPasteMode(true)}
              className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
            >
              Paste from spreadsheet
            </button>
          )}
        </div>

        {isPasteMode && (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              Paste data
            </p>
            <p className="text-xs text-slate-500">
              Paste tab- or comma-separated values. Optionally treat the first row as headers.
            </p>
            <textarea
              value={pasteValue}
              onChange={(event) => setPasteValue(event.target.value)}
              rows={5}
              className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring"
              placeholder={'Example:\nHeader A\tHeader B\nValue 1\tValue 2'}
            />
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={useFirstRowAsHeader}
                onChange={(event) => setUseFirstRowAsHeader(event.target.checked)}
              />
              Treat first row as headers
            </label>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={handlePasteApply}
                className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-100"
              >
                Apply paste
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPasteMode(false);
                  setPasteValue('');
                }}
                className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TableEditor;
