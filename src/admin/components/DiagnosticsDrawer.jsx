import React, { useMemo, useState } from 'react';
import { useAdminPanel } from '../context/AdminPanelContext';

const DiagnosticsDrawer = () => {
  const { sectionsQuery, sectionNodesQuery } = useAdminPanel();
  const [isOpen, setIsOpen] = useState(false);

  const stats = useMemo(
    () => ({
      sections: sectionsQuery.data?.length ?? 0,
      nodes: sectionNodesQuery.nodes?.length ?? 0,
      statusCount: Object.keys(sectionNodesQuery.statusMap ?? {}).length,
      isFetchingSections: sectionsQuery.isFetching,
      isFetchingNodes: sectionNodesQuery.isFetching,
    }),
    [sectionsQuery.data, sectionsQuery.isFetching, sectionNodesQuery],
  );

  return (
    <div className="pointer-events-none fixed bottom-5 left-5 z-40">
      <button
        onClick={() => setIsOpen((value) => !value)}
        className="pointer-events-auto inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-indigo-200 hover:text-indigo-600"
      >
        Diagnostics
      </button>
      {isOpen ? (
        <div className="pointer-events-auto mt-3 w-80 rounded-2xl border border-slate-200 bg-white/95 p-4 text-sm text-slate-700 shadow-2xl">
          <header className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
              Workspace health
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-400 transition hover:border-rose-200 hover:text-rose-500"
            >
              Close
            </button>
          </header>
          <dl className="mt-4 space-y-3">
            <DiagnosticItem label="Sections loaded" value={stats.sections} />
            <DiagnosticItem label="Topics cached" value={stats.nodes} />
            <DiagnosticItem label="Status entries" value={stats.statusCount} />
            <DiagnosticItem
              label="Sections refreshing"
              value={stats.isFetchingSections ? 'refreshing...' : 'idle'}
            />
            <DiagnosticItem
              label="Topics refreshing"
              value={stats.isFetchingNodes ? 'refreshing...' : 'idle'}
            />
          </dl>
          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-xs text-indigo-700">
            <p className="font-semibold">Mirror status</p>
            <p className="mt-1">
              Full diagnostics require backend signal integration. Hook the Cloud Function mirror
              heartbeat here to surface latency and failures.
            </p>
            <button
              className="mt-3 inline-flex items-center rounded-full border border-indigo-200 px-3 py-1 font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50"
            >
              Retry mirror (stub)
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const DiagnosticItem = ({ label, value }) => (
  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
    <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
      {label}
    </span>
    <span className="text-sm font-semibold text-slate-700">{value}</span>
  </div>
);

export default DiagnosticsDrawer;
