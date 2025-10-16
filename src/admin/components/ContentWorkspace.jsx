import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminPanel } from '../context/AdminPanelContext';
import { useAdminToasts } from '../context/AdminToastContext';
import StructuredEditorPane from './StructuredEditorPane';
import { useStructuredContent, useUpdateNodeMetadata } from '../hooks/useAdminData';
import ReactMarkdown from 'react-markdown';
import { auth, db } from '../../firebase';
import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore';

const API_BASE = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/$/, '');

const CATEGORY_OPTIONS = [
  { label: 'Must Know', value: 'Must Know' },
  { label: 'Good to Know', value: 'Good to Know' },
  { label: 'Nice to Know', value: 'Nice to Know' },
];

const CATEGORY_MAP = CATEGORY_OPTIONS.reduce((acc, option) => {
  acc[option.value.toLowerCase()] = option.value;
  return acc;
}, {});

const normalizeCategory = (value) => {
  if (!value) return '';
  const key = value.trim().toLowerCase();
  return CATEGORY_MAP[key] || value;
};

const MAX_DRY_RUN_STEPS = 12;

const describeAutoInput = (input) => {
  if (input === undefined) return 'No further input required.';
  if (typeof input === 'string') return `Auto reply: "${input}".`;
  if (input && typeof input === 'object' && Number.isInteger(input.selectedIndex)) {
    return `Auto selected option #${input.selectedIndex + 1}.`;
  }
  return 'Auto response submitted.';
};

const computeAutoAdvance = (card) => {
  switch (card?.type) {
    case 'OBJECTIVES_CARD': {
      const nextInput = 'Ready to begin';
      return { nextInput, note: describeAutoInput(nextInput), done: false };
    }
    case 'TEACH_CARD': {
      const nextInput = 'Here is my understanding of the key point.';
      return { nextInput, note: describeAutoInput(nextInput), done: false };
    }
    case 'TRANSITION_CARD': {
      const nextInput = 'continue';
      return { nextInput, note: describeAutoInput(nextInput), done: false };
    }
    case 'MCQ_CHECKPOINT': {
      const nextInput = { selectedIndex: 0 };
      return {
        nextInput,
        note: card?.options?.length
          ? `Auto selected "${card.options[0]}" (option #1).`
          : describeAutoInput(nextInput),
        done: false,
      };
    }
    case 'SHORT_CHECKPOINT': {
      const nextInput = 'My answer is that the described finding is likely benign.';
      return { nextInput, note: describeAutoInput(nextInput), done: false };
    }
    case 'FEEDBACK_CARD': {
      const nextInput = 'continue';
      return { nextInput, note: describeAutoInput(nextInput), done: false };
    }
    case 'SUMMARY_CARD': {
      const nextInput = 'continue';
      const done = card?.isTopicComplete === true;
      return { nextInput, note: describeAutoInput(nextInput), done };
    }
    case 'TOPIC_COMPLETE':
      return { nextInput: undefined, note: 'Session reached topic completion.', done: true };
    default:
      return { nextInput: undefined, note: 'Auto-run halted: unhandled card type.', done: true };
  }
};

const formatCardType = (value) =>
  typeof value === 'string'
    ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())
    : 'Unknown';


const ContentWorkspace = () => {
  const { sectionsQuery, sectionNodesQuery, activeSectionId, selectedNodeId } = useAdminPanel();
  const { pushToast } = useAdminToasts();

  const section = useMemo(
    () => sectionsQuery.data?.find((item) => item.id === activeSectionId) ?? null,
    [sectionsQuery.data, activeSectionId],
  );

  const nodeIndex = useMemo(
    () =>
      sectionNodesQuery.index ?? {
        roots: [],
        byDocId: new Map(),
        byTopicId: new Map(),
        parentByTopicId: new Map(),
        childrenByTopicId: new Map(),
      },
    [sectionNodesQuery.index],
  );

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodeIndex.byDocId?.get(selectedNodeId) ?? null;
  }, [nodeIndex, selectedNodeId]);

  const structuredContentQuery = useStructuredContent({
    organId: section?.id,
    topicId: selectedNode?.id,
    enabled: !!section && !!selectedNode,
  });

  const [dryRunCards, setDryRunCards] = useState([]);
  const [isDryRunModalOpen, setIsDryRunModalOpen] = useState(false);
  const [isDryRunRunning, setIsDryRunRunning] = useState(false);
  const [showTopicDetails, setShowTopicDetails] = useState(false);
  const [showLegacyPanel, setShowLegacyPanel] = useState(false);

  const callTutorStep = useCallback(async (payload) => {
    if (!auth.currentUser) throw new Error('You must be signed in to run the tutor.');
    const token = await auth.currentUser.getIdToken();
    const endpoint = API_BASE ? `${API_BASE}/tutor/step` : '/tutor/step';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      let errorMessage = `Tutor request failed (${response.status})`;
      try {
        const errorBody = await response.json();
        if (errorBody?.error) errorMessage = errorBody.error;
      } catch (_) {
        // ignore JSON parse errors, fallback to default message
      }
      throw new Error(errorMessage);
    }
    return response.json();
  }, []);

  const clearPreviousSession = useCallback(async (userId, topicKey) => {
    try {
      const sessionRef = doc(db, 'userProgress', userId, 'sessions', topicKey);
      const messagesSnapshot = await getDocs(collection(sessionRef, 'messages'));
      const deletions = messagesSnapshot.docs.map((docSnapshot) => deleteDoc(docSnapshot.ref));
      await Promise.all(deletions);
      await deleteDoc(sessionRef);
    } catch (_) {
      // ignore cleanup failures
    }
    try {
      await deleteDoc(doc(db, 'userProgress', userId, 'topics', topicKey));
    } catch (_) {
      // ignore cleanup failures
    }
  }, []);

  const updateMetadataMutation = useUpdateNodeMetadata(section?.id);

  const [metadataForm, setMetadataForm] = useState(() => ({
    name: selectedNode?.name ?? selectedNode?.title ?? '',
    category: normalizeCategory(selectedNode?.category),
  }));

  useEffect(() => {
    setMetadataForm({
      name: selectedNode?.name ?? selectedNode?.title ?? '',
      category: normalizeCategory(selectedNode?.category),
    });
  }, [selectedNode]);
  useEffect(() => {
    setShowTopicDetails(false);
    setShowLegacyPanel(false);
  }, [selectedNodeId]);

  const status = selectedNode
    ? sectionNodesQuery.statusMap?.[selectedNode.topicId || selectedNode.id] ?? 'grey'
    : null;

  const breadcrumbTrail = useMemo(() => {
    if (!selectedNode) return [];
    const chain = [];
    let cursor = selectedNode;
    while (cursor) {
      chain.unshift(cursor);
      const parentId = nodeIndex.parentByTopicId?.get(cursor.topicId || cursor.id);
      if (!parentId) break;
      cursor = nodeIndex.byTopicId?.get(parentId);
    }
    if (section) {
      chain.unshift({
        id: section.id,
        title: section.title,
        isSection: true,
      });
    }
    return chain;
  }, [section, nodeIndex, selectedNode]);

  const legacyText = useMemo(() => {
    if (!selectedNode?.mainContent?.ops) return '';
    const fragments = selectedNode.mainContent.ops
      .map((op) => {
        if (typeof op.insert === 'string') {
          return op.insert;
        }
        if (op.insert?.image) {
          return `[Image:${op.insert.image}]`;
        }
        return '';
      })
      .join('');
    return fragments.trim();
  }, [selectedNode?.mainContent]);

  const handleMetadataSubmit = async (event) => {
    event.preventDefault();
    if (!selectedNode) return;
    const trimmed = metadataForm.name.trim();
    if (!trimmed) {
      pushToast({
        type: 'warning',
        title: 'Name required',
        message: 'Please provide a descriptive name before saving.',
      });
      return;
    }
    try {
      await updateMetadataMutation.mutateAsync({
        nodeId: selectedNode.id,
        name: trimmed,
        category: metadataForm.category,
      });
      pushToast({
        type: 'success',
        title: 'Metadata updated',
        message: 'Name and category saved successfully.',
      });
    } catch (error) {
      pushToast({
        type: 'error',
        title: 'Update failed',
        message: error.message || 'Unable to save metadata.',
      });
    }
  };

  const handleTutorDryRun = useCallback(async () => {
    if (!selectedNode) {
      pushToast({
        type: 'info',
        title: 'Select a topic',
        message: 'Choose a specific topic or subtopic before running a tutor dry run.',
      });
      return;
    }
    if (!section) {
      pushToast({
        type: 'warning',
        title: 'Missing section context',
        message: 'Select a section before running the tutor.',
      });
      return;
    }
    if (!auth.currentUser) {
      pushToast({
        type: 'error',
        title: 'Sign in required',
        message: 'You must be signed in to execute a tutor dry run.',
      });
      return;
    }

    const topicKey = selectedNode.topicId || selectedNode.id;
    if (!topicKey) {
      pushToast({
        type: 'error',
        title: 'Topic identifier missing',
        message: 'This node is missing a topic identifier and cannot run through the tutor.',
      });
      return;
    }

    const organId = section.id;
    const userId = auth.currentUser.uid;

    setIsDryRunRunning(true);

    try {
      await clearPreviousSession(userId, topicKey);

      const cards = [];
      let autoInput;
      let finished = false;
      let iterations = 0;

      while (!finished && iterations < MAX_DRY_RUN_STEPS) {
        const payload = { topicId: topicKey, organ: organId };
        if (iterations === 0) {
          payload.userName = auth.currentUser.displayName || 'Admin Tester';
        }
        if (autoInput !== undefined) {
          payload.userInput = autoInput;
        }

        const response = await callTutorStep(payload);
        const ui = response?.ui;
        if (!ui) {
          throw new Error('Tutor response was missing UI payload.');
        }

        const { nextInput, note, done } = computeAutoAdvance(ui);
        cards.push({ ui, autoNote: note });
        autoInput = nextInput;
        finished = done || nextInput === undefined;
        iterations += 1;
      }

      await clearPreviousSession(userId, topicKey);

      if (cards.length === 0) {
        pushToast({
          type: 'warning',
          title: 'Tutor dry run',
          message: 'Tutor did not return any cards for this topic.',
        });
        return;
      }

      if (!finished) {
        pushToast({
          type: 'warning',
          title: 'Tutor dry run truncated',
          message: `Stopped after ${cards.length} card${cards.length === 1 ? '' : 's'} (safety limit ${MAX_DRY_RUN_STEPS}). Review the output below.`,
        });
      } else {
        pushToast({
          type: 'success',
          title: 'Tutor dry run complete',
          message: `Captured ${cards.length} card${cards.length === 1 ? '' : 's'}.`,
        });
      }

      setDryRunCards(cards);
      setIsDryRunModalOpen(true);
    } catch (error) {
      console.error('Tutor dry run failed', error);
      pushToast({
        type: 'error',
        title: 'Tutor dry run failed',
        message: error.message || 'Unable to execute tutor dry run.',
      });
    } finally {
      setIsDryRunRunning(false);
    }
  }, [selectedNode, section, pushToast, clearPreviousSession, callTutorStep]);

  if (!selectedNode) {
    return (
      <div className="flex w-full flex-1 items-center justify-center rounded-3xl border border-dashed border-indigo-200 bg-white/80 px-8 py-12 text-center text-slate-600">
        Select a chapter, topic, or subtopic from the navigation to edit its details.
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-6 overflow-y-auto px-1 py-4 sm:px-4 lg:px-6 xl:px-8 2xl:px-10">
      <section className="rounded-3xl border border-indigo-100 bg-white/90 p-6 shadow-xl shadow-indigo-200/40">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-indigo-500">
              Topic metadata
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">
              {selectedNode.name || selectedNode.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {breadcrumbTrail.map((crumb, index) => (
                <span key={crumb.id || index} className="inline-flex items-center gap-2">
                  {index > 0 ? <span className="text-slate-300">/</span> : null}
                  <span className={crumb.isSection ? 'font-semibold text-indigo-600' : 'text-slate-600'}>
                    {crumb.title || crumb.name}
                  </span>
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {status ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${statusColorClass(status)}`}
                    title={`Status ${status}`}
                  >
                    <span className="sr-only">{status}</span>
                  </span>
                </span>
              ) : null}
              <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-mono text-slate-500">
                ID: {selectedNode.topicId || selectedNode.id}
              </span>
              {metadataForm.category ? (
                <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
                  Category: {metadataForm.category}
                </span>
              ) : null}
              {selectedNode.updatedAt ? (
                <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500">
                  Updated {formatTimestamp(selectedNode.updatedAt)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setShowTopicDetails((value) => !value)}
              className="inline-flex items-center rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50"
            >
              {showTopicDetails ? 'Hide metadata form' : 'Edit topic metadata'}
            </button>
            {legacyText ? (
              <button
                type="button"
                onClick={() => setShowLegacyPanel((value) => !value)}
                className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
              >
                {showLegacyPanel ? 'Hide legacy content' : 'Show legacy content'}
              </button>
            ) : null}
          </div>
        </header>

        {showTopicDetails ? (
          <form
            onSubmit={handleMetadataSubmit}
            className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_200px]"
          >
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Name
              </label>
              <input
                value={metadataForm.name}
                onChange={(event) =>
                  setMetadataForm((current) => ({ ...current, name: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Category
              </label>
              <select
                value={metadataForm.category || ''}
                onChange={(event) =>
                  setMetadataForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring"
              >
                <option value="" disabled>
                  Select category
                </option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={updateMetadataMutation.isLoading}
                className={`inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold text-white shadow-sm transition ${
                  updateMetadataMutation.isLoading
                    ? 'cursor-not-allowed bg-indigo-300'
                    : 'bg-indigo-600 hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-lg'
                }`}
              >
                {updateMetadataMutation.isLoading ? 'Saving...' : 'Save metadata'}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {legacyText && showLegacyPanel ? (
        <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-6 shadow-inner shadow-slate-100/50">
          <header>
            <h3 className="text-lg font-semibold text-slate-800">Legacy content</h3>
            <p className="mt-1 text-sm text-slate-500">
              Reference-only view of existing rich text.
            </p>
          </header>
          <pre className="mt-4 max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {legacyText}
          </pre>
        </section>
      ) : null}

      <StructuredEditorPane
        organId={section?.id}
        topicId={selectedNode.id}
        topicName={selectedNode.name || selectedNode.title}
        legacyText={legacyText}
        initialStructuredContent={structuredContentQuery.data}
        onPublishSuccess={() => {
          structuredContentQuery.refetch();
        }}
      />

      <section className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Tutor utilities
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Run a dry run of the tutor experience using canned answers to surface missing content or schema issues before publishing.
        </p>
        <button
          onClick={handleTutorDryRun}
          disabled={isDryRunRunning}
          className={`mt-3 inline-flex items-center rounded-full border border-indigo-200 px-4 py-2 text-sm font-semibold transition ${
            isDryRunRunning
              ? 'cursor-not-allowed border-indigo-100 bg-indigo-100 text-indigo-400'
              : 'text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50'
          }`}
        >
          {isDryRunRunning ? 'Running dry run...' : 'Tutor dry run (sandbox)'}
        </button>
      </section>
      {isDryRunModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 backdrop-blur-sm">
          <div className="relative flex w-full max-w-4xl flex-col rounded-3xl border border-indigo-100 bg-white/95 p-6 shadow-2xl shadow-indigo-200/60">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Tutor Dry Run Output</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Auto responses were used to advance the tutor flow. Review the returned cards to catch missing data or prompt issues.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsDryRunModalOpen(false);
                  setDryRunCards([]);
                }}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              >
                Close
              </button>
            </header>
            <div className="mt-5 max-h-[65vh] space-y-4 overflow-y-auto pr-1">
              {dryRunCards.map((entry, index) => (
                <article
                  key={index}
                  className="rounded-2xl border border-slate-200 bg-white/95 px-5 py-4 shadow-sm shadow-slate-200/40"
                >
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    <span>
                      Step {index + 1}: {formatCardType(entry.ui?.type)}
                    </span>
                    {entry.autoNote ? (
                      <span className="text-[11px] font-medium normal-case tracking-normal text-indigo-500">
                        {entry.autoNote}
                      </span>
                    ) : null}
                  </div>
                  {entry.ui?.message ? (
                    <div className="prose prose-sm mt-3 max-w-none text-slate-700">
                      <ReactMarkdown>{entry.ui.message}</ReactMarkdown>
                    </div>
                  ) : null}
                  {Array.isArray(entry.ui?.options) && entry.ui.options.length > 0 ? (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                      {entry.ui.options.map((option, optionIndex) => (
                        <li key={optionIndex}>
                          Option {optionIndex + 1}: {option}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
              {dryRunCards.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                  No cards were generated. Try running the dry run again after ensuring the topic has structured content.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const statusColorClass = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'green':
      return 'bg-emerald-500';
    case 'yellow':
      return 'bg-amber-400';
    default:
      return 'bg-slate-400';
  }
};

const formatTimestamp = (input) => {
  if (!input) return 'recently';
  if (typeof input === 'number') {
    return new Date(input).toLocaleString();
  }
  if (typeof input.toDate === 'function') {
    return input.toDate().toLocaleString();
  }
  if (input.seconds) {
    return new Date(input.seconds * 1000).toLocaleString();
  }
  return 'recently';
};




export default ContentWorkspace;


