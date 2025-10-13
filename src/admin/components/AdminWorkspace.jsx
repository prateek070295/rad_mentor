import React from 'react';
import NavigationPanel from './NavigationPanel';
import ContentWorkspace from './ContentWorkspace';
import QuestionIngestionPane from './QuestionIngestionPane';
import DiagnosticsDrawer from './DiagnosticsDrawer';

const AdminWorkspace = () => (
  <div className="relative flex h-full min-h-[720px] bg-gradient-to-br from-indigo-50/60 via-white to-slate-50">
    <NavigationPanel />
    <main className="flex flex-1 items-start gap-8 overflow-hidden px-8 py-6">
      <ContentWorkspace />
      <QuestionIngestionPane />
    </main>
    <DiagnosticsDrawer />
  </div>
);

export default AdminWorkspace;
