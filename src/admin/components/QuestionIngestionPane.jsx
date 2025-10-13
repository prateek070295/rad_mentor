import React, { useState } from 'react';
import QuestionUploader from '../../components/QuestionUploader';
import QPPreviewSave from '../../components/QPpreview_save';
import { useAdminPanel } from '../context/AdminPanelContext';
import { useAdminToasts } from '../context/AdminToastContext';

const QuestionIngestionPane = () => {
  const { sectionsQuery } = useAdminPanel();
  const { pushToast } = useAdminToasts();
  const [isOpen, setIsOpen] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [lastReport, setLastReport] = useState(null);

  const organSystems = (sectionsQuery.data ?? []).map((section) => ({
    id: section.id,
    name: section.title,
  }));

  const notify = (payload) => {
    if (!payload) return;
    const { type = 'info', text = '' } = payload;
    pushToast({
      type,
      title: type === 'error' ? 'Issue detected' : type === 'success' ? 'Success' : 'Update',
      message: text,
    });
  };

  const handleExtracted = (payload) => {
    setExtractedData(payload);
    setIsOpen(true);
  };

  const handleSaveSummary = (summary) => {
    setLastReport(summary);
    pushToast({
      type: 'success',
      title: 'Question bank updated',
      message: summary?.message || 'All questions saved successfully.',
    });
  };

  const handleCancel = () => {
    setExtractedData(null);
  };

  return (
    <aside
      className={`relative flex h-full flex-shrink-0 flex-col overflow-hidden rounded-l-3xl border-l border-slate-200 bg-slate-50/80 shadow-inner transition-all duration-300 ease-in-out ${
        isOpen ? 'w-[360px]' : 'w-16'
      }`}
    >
      <button
        onClick={() => setIsOpen((value) => !value)}
        className="absolute right-3 top-4 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-600 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50"
      >
        {isOpen ? 'Close ingestion' : 'Open ingestion'}
      </button>
      <div
        className={`flex-1 overflow-y-auto px-4 pb-6 pt-16 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="rounded-3xl border border-indigo-100 bg-white/90 p-5 shadow-xl shadow-indigo-200/40">
          <header>
            <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-indigo-500">
              Question bank
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              Paper ingestion workspace
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Upload exam papers, validate extracted questions, and assign them to topics.
            </p>
          </header>
          <div className="mt-4 space-y-5">
            <QuestionUploader onExtracted={handleExtracted} onNotify={notify} />
            {extractedData ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <QPPreviewSave
                  data={extractedData}
                  organSystems={organSystems}
                  onSave={handleSaveSummary}
                  onCancel={handleCancel}
                  onNotify={notify}
                />
              </div>
            ) : null}
            {lastReport ? (
              <article className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-700">
                <h3 className="text-sm font-semibold">Last import summary</h3>
                <p className="mt-1">{lastReport.message}</p>
                {lastReport.previewLink ? (
                  <a
                    href={lastReport.previewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center text-xs font-semibold text-emerald-600 underline"
                  >
                    Open tutor preview
                  </a>
                ) : null}
              </article>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default QuestionIngestionPane;
