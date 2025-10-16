// file: src/admin/components/WorkspaceChooser.jsx
import React from 'react';

const cards = [
  {
    key: 'content',
    title: 'Content creation',
    description:
      'Design structured lessons, curate checkpoints, and publish topic updates in one flow.',
    cta: 'Open content workspace',
    accent: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  },
  {
    key: 'questions',
    title: 'Question paper ingestion',
    description:
      'Upload exam PDFs, validate extracted questions, and slot them into the right organ systems.',
    cta: 'Open question ingestion',
    accent: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
];

const WorkspaceChooser = ({ onSelect }) => (
  <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 sm:px-10 lg:px-16">
    <div className="w-full max-w-5xl space-y-8 text-center">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-500">
          Admin control centre
        </p>
        <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
          Choose the workspace you need
        </h1>
        <p className="text-sm text-slate-600 sm:text-base">
          Toggle between structured content authoring and question-bank ingestion. You can always
          switch back here later.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => onSelect?.(card.key)}
            className={`group flex flex-col rounded-3xl border bg-white/95 p-6 text-left shadow-xl transition hover:-translate-y-1 hover:shadow-2xl ${card.accent}`}
          >
            <h2 className="text-xl font-semibold text-slate-900">{card.title}</h2>
            <p className="mt-3 text-sm text-slate-600">{card.description}</p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-current">
              {card.cta}
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-current text-xs">
                →
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  </div>
);

export default WorkspaceChooser;
