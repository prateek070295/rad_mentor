import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NavigationPanel from './NavigationPanel';
import ContentWorkspace from './ContentWorkspace';
import QuestionIngestionPane from './QuestionIngestionPane';
import DiagnosticsDrawer from './DiagnosticsDrawer';
import WorkspaceChooser from './WorkspaceChooser';
import { useAdminPanel } from '../context/AdminPanelContext';

const AdminWorkspace = () => {
  const [activePane, setActivePane] = useState('landing');
  const [isNavVisible, setIsNavVisible] = useState(true);
  const firstSelectionRef = useRef(null);
  const { clearToChapters, selectedNodeId } = useAdminPanel();

  const handleSelectPane = useCallback(
    (pane) => {
      if (pane === 'content') {
        clearToChapters();
        firstSelectionRef.current = null;
        setIsNavVisible(true);
        setActivePane('content');
      } else if (pane === 'questions') {
        setActivePane('questions');
      } else {
        setActivePane('landing');
      }
    },
    [clearToChapters],
  );

  const goLanding = useCallback(() => setActivePane('landing'), []);
  const goContent = useCallback(() => {
    clearToChapters();
    firstSelectionRef.current = null;
    setIsNavVisible(true);
    setActivePane('content');
  }, [clearToChapters]);
  const goQuestions = useCallback(() => setActivePane('questions'), []);

  useEffect(() => {
    if (activePane !== 'content') {
      firstSelectionRef.current = null;
      return;
    }
    if (!selectedNodeId || firstSelectionRef.current) return;
    firstSelectionRef.current = selectedNodeId;
    setIsNavVisible(false);
  }, [activePane, selectedNodeId]);

  const scene = useMemo(() => {
    switch (activePane) {
      case 'content':
        return (
          <div className="flex flex-1 overflow-hidden">
            {isNavVisible ? <NavigationPanel onCollapse={() => setIsNavVisible(false)} /> : null}
            <main className="flex flex-1 flex-col overflow-hidden px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
              <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={goLanding}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
                  >
                    Back to workspace chooser
                  </button>
                  <button
                    type="button"
                    onClick={goQuestions}
                    className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:border-emerald-300 hover:bg-emerald-100"
                  >
                    Switch to question ingestion
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsNavVisible((value) => !value)}
                    className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-100"
                  >
                    {isNavVisible ? 'Hide navigation' : 'Show navigation'}
                  </button>
                </div>
              </header>
              <div className="flex min-h-0 flex-1 overflow-hidden">
                <ContentWorkspace />
              </div>
            </main>
          </div>
        );
      case 'questions':
        return (
          <main className="flex flex-1 flex-col overflow-hidden px-6 py-6 sm:px-8 lg:px-12">
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={goLanding}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
                >
                  Back to workspace chooser
                </button>
                <button
                  type="button"
                  onClick={goContent}
                  className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-100"
                >
                  Switch to content workspace
                </button>
              </div>
            </header>
            <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto">
              <div className="w-full max-w-5xl">
                <QuestionIngestionPane defaultOpen variant="standalone" />
              </div>
            </div>
          </main>
        );
      default:
        return <WorkspaceChooser onSelect={handleSelectPane} />;
    }
  }, [activePane, goContent, goLanding, goQuestions, handleSelectPane, isNavVisible]);

  return (
    <div className="relative flex h-full min-h-[720px] bg-gradient-to-br from-indigo-50/60 via-white to-slate-50">
      {scene}
      <DiagnosticsDrawer />
    </div>
  );
};

export default AdminWorkspace;
