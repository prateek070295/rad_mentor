import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import {
  SectionList,
  SectionEditor,
  TopicArrayEditor,
  EditorActionTypes,
  structuredEditorReducer,
  createEditorState,
  selectSections,
  selectObjectives,
  selectKeyPoints,
  selectTopic,
  createEmptySection,
  hasMeaningfulChanges,
} from './structured-editor';
import { useAdminToasts } from '../context/AdminToastContext';
import { auth } from '../../firebase';

const API_BASE = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/$/, '');

const LOCAL_STORAGE_DRAFT_KEY = 'admin_structured_drafts';
const LOCAL_STORAGE_VERSIONS_KEY = 'admin_structured_versions';

const readStorage = (key) => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return {};
  } catch (error) {
    console.warn(`Failed to read ${key} from storage`, error);
    return {};
  }
};

const writeStorage = (key, value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to write ${key} to storage`, error);
  }
};

const StructuredEditorPane = ({
  organId,
  topicId,
  topicName,
  legacyText,
  initialStructuredContent,
  onPublishSuccess,
}) => {
  const { pushToast } = useAdminToasts();

  const [editorState, dispatch] = useReducer(
    structuredEditorReducer,
    initialStructuredContent,
    (initial) => createEditorState(initial || {}),
  );

  const [rawText, setRawText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [versionHistory, setVersionHistory] = useState([]);
  const [isEditorActive, setIsEditorActive] = useState(Boolean(initialStructuredContent));
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [pendingFocus, setPendingFocus] = useState(null);

  const sections = selectSections(editorState);
  const objectives = selectObjectives(editorState);
  const keyPoints = selectKeyPoints(editorState);
  const topic = selectTopic(editorState);

  const isDirty = useMemo(() => hasMeaningfulChanges(editorState), [editorState]);

  const callAdminEndpoint = useCallback(
    async (path, init = {}) => {
      if (!auth.currentUser) {
        const authError = new Error('You must be signed in as an admin to perform this action.');
        authError.code = 'auth/missing-user';
        throw authError;
      }

      const token = await auth.currentUser.getIdToken();
      const endpoint = API_BASE ? `${API_BASE}${path}` : path;
      const headers = {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
      };

      const response = await fetch(endpoint, {
        ...init,
        headers,
      });

      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        const message =
          details.error ||
          details.message ||
          `Failed with status ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }

      return response;
    },
    [],
  );

  const draftKey = useMemo(() => `${topicId}`, [topicId]);
  const versionKey = useMemo(() => `${organId}:${topicId}`, [organId, topicId]);

  const activateEditor = useCallback(
    (structured) => {
      dispatch({
        type: EditorActionTypes.RESET,
        payload: { topic: structured || {} },
      });
      setIsEditorActive(true);
      setPendingFocus({ mode: 'first' });
    },
    [dispatch],
  );

  const persistDraft = useCallback(
    ({ rawText: nextRaw, structuredContent }) => {
      const drafts = readStorage(LOCAL_STORAGE_DRAFT_KEY);
      drafts[draftKey] = {
        rawText: nextRaw,
        structuredContent,
        savedAt: Date.now(),
      };
      writeStorage(LOCAL_STORAGE_DRAFT_KEY, drafts);
      setDraftSavedAt(Date.now());
    },
    [draftKey],
  );

  const removeDraft = useCallback(() => {
    const drafts = readStorage(LOCAL_STORAGE_DRAFT_KEY);
    delete drafts[draftKey];
    writeStorage(LOCAL_STORAGE_DRAFT_KEY, drafts);
    setDraftSavedAt(null);
  }, [draftKey]);

  useEffect(() => {
    if (!topicId) return;
    const drafts = readStorage(LOCAL_STORAGE_DRAFT_KEY);
    const existing = drafts[draftKey];
    if (existing?.structuredContent) {
      activateEditor(existing.structuredContent);
      setRawText(existing.rawText || '');
      setDraftSavedAt(existing.savedAt || null);
    } else {
      if (initialStructuredContent) {
        activateEditor(initialStructuredContent);
      } else {
        dispatch({
          type: EditorActionTypes.RESET,
          payload: { topic: {} },
        });
        setIsEditorActive(false);
        setPendingFocus(null);
      }
      setRawText('');
      setDraftSavedAt(null);
    }
  }, [draftKey, topicId, initialStructuredContent, activateEditor]);

  useEffect(() => {
    if (!versionKey) return;
    const allVersions = readStorage(LOCAL_STORAGE_VERSIONS_KEY);
    setVersionHistory(allVersions[versionKey] || []);
  }, [versionKey]);

  useEffect(() => {
    if (!isEditorActive || sections.length === 0) {
      setActiveSectionId(null);
      return;
    }
    const firstId = sections[0].localId || sections[0].id;
    setActiveSectionId((current) => {
      if (!current) return firstId;
      const exists = sections.some(
        (section) => section.localId === current || section.id === current,
      );
      return exists ? current : firstId;
    });
  }, [sections, isEditorActive]);

  useEffect(() => {
    if (!pendingFocus || !isEditorActive || sections.length === 0) return;
    if (pendingFocus.mode === 'first') {
      const firstId = sections[0].localId || sections[0].id;
      setActiveSectionId(firstId);
      setPendingFocus(null);
      return;
    }
    if (pendingFocus.mode === 'explicit') {
      const exists = sections.some(
        (section) =>
          section.localId === pendingFocus.newId || section.id === pendingFocus.newId,
      );
      if (exists) {
        setActiveSectionId(pendingFocus.newId);
        setPendingFocus(null);
      }
      return;
    }
    if (pendingFocus.mode === 'after') {
      const index = sections.findIndex(
        (section) =>
          section.localId === pendingFocus.referenceId ||
          section.id === pendingFocus.referenceId,
      );
      if (index !== -1 && sections[index + 1]) {
        const nextId = sections[index + 1].localId || sections[index + 1].id;
        if (nextId !== pendingFocus.referenceId) {
          setActiveSectionId(nextId);
          setPendingFocus(null);
        }
      } else {
        setPendingFocus(null);
      }
    }
  }, [pendingFocus, sections, isEditorActive]);

  const appendVersion = useCallback(
    (snapshot) => {
      const allVersions = readStorage(LOCAL_STORAGE_VERSIONS_KEY);
      const current = allVersions[versionKey] || [];
      const next = [
        {
          id: `${Date.now()}`,
          savedAt: Date.now(),
          snapshot,
        },
        ...current,
      ].slice(0, 10);
      allVersions[versionKey] = next;
      writeStorage(LOCAL_STORAGE_VERSIONS_KEY, allVersions);
      setVersionHistory(next);
    },
    [versionKey],
  );

  const handlePrefillLegacy = () => {
    if (!legacyText) {
      pushToast({
        type: 'info',
        title: 'No legacy content',
        message: 'This topic does not have legacy rich text content to convert.',
      });
      return;
    }
    setRawText(legacyText);
    pushToast({
      type: 'success',
      title: 'Legacy content copied',
      message: 'Legacy content copied into the generator. Review it, then run the converter.',
    });
  };

  const handleGenerate = async () => {
    if (!rawText.trim()) {
      pushToast({
        type: 'warning',
        title: 'Add source text',
        message: 'Paste or enter source material before generating structured content.',
      });
      return;
    }
    setIsGenerating(true);
    try {
      const response = await callAdminEndpoint('/structure', {
        method: 'POST',
        body: JSON.stringify({
          rawText,
          organId,
          topicId,
        }),
      });
      const result = await response.json();
      if (!result?.structured) {
        throw new Error('No structured content returned by pipeline');
      }
      activateEditor(result.structured);
      persistDraft({ rawText, structuredContent: result.structured });
      pushToast({
        type: 'success',
        title: 'Structure ready',
        message: 'Review the generated outline, tweak details, and publish when ready.',
      });
    } catch (error) {
      console.error('Structure generation failed', error);
      pushToast({
        type: 'error',
        title: 'Failed to generate',
        message:
          error.code === 'auth/missing-user'
            ? 'Sign in to an admin account before generating structured content.'
            : error.message || 'Unknown error occurred while generating structure.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!isEditorActive) {
      pushToast({
        type: 'warning',
        title: 'Nothing to publish',
        message: 'Generate or load a structure before publishing.',
      });
      return;
    }

    const structured = selectTopic(editorState);
    const publishReady = {
      ...structured,
      objectives: (structured.objectives || []).map((value) => String(value || '').trim()).filter(Boolean),
      key_points: (structured.key_points || []).map((value) => String(value || '').trim()).filter(Boolean),
    };
    if (!structured.sections?.length) {
      pushToast({
        type: 'error',
        title: 'Missing sections',
        message: 'Add at least one section before publishing.',
      });
      return;
    }

    setIsPublishing(true);
    const publishPayload = { organ: organId, topicId, structured: publishReady };
    const versionSnapshot = {
      structured: publishReady,
      rawText,
    };
    try {
      const response = await callAdminEndpoint('/admin/save', {
        method: 'POST',
        body: JSON.stringify(publishPayload),
      });
      const result = await response.json();
      appendVersion(versionSnapshot);
      removeDraft();
      dispatch({
        type: EditorActionTypes.RESET,
        payload: { topic: structured },
      });
      pushToast({
        type: 'success',
        title: 'Published',
        message: result.message || 'Structured content saved successfully.',
      });
      onPublishSuccess?.(publishPayload);
    } catch (error) {
      console.error('Publish failed', error);
      pushToast({
        type: 'error',
        title: 'Failed to publish',
        message:
          error.code === 'auth/missing-user'
            ? 'Sign in to an admin account before publishing.'
            : error.message || 'Unknown error occurred while saving content.',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDraftSave = () => {
    if (!isEditorActive) {
      pushToast({
        type: 'info',
        title: 'Nothing to save',
        message: 'Generate structure content before saving a draft.',
      });
      return;
    }
    persistDraft({ rawText, structuredContent: topic });
    pushToast({
      type: 'success',
      title: 'Draft saved',
      message: 'Saved locally. Publish to push updates live.',
    });
  };

  const handleDraftDiscard = () => {
    removeDraft();
    setRawText('');
    if (initialStructuredContent) {
      activateEditor(initialStructuredContent);
    } else {
      dispatch({
        type: EditorActionTypes.RESET,
        payload: { topic: {} },
      });
      setIsEditorActive(false);
      setPendingFocus(null);
    }
    pushToast({
      type: 'info',
      title: 'Draft cleared',
      message: 'Local draft removed. Reload the topic to fetch the latest published version.',
    });
  };

  const handleVersionRestore = (version) => {
    if (!version?.snapshot) return;
    activateEditor(version.snapshot.structured || {});
    setRawText(version.snapshot.rawText || '');
    persistDraft({
      rawText: version.snapshot.rawText || '',
      structuredContent: version.snapshot.structured || {},
    });
    pushToast({
      type: 'success',
      title: 'Version restored',
      message: 'Review and publish to make this version live again.',
    });
  };

  const handleObjectivesChange = (next) => {
    dispatch({
      type: EditorActionTypes.SET_TOPIC_ARRAY,
      payload: { field: 'objectives', values: next },
    });
  };

  const handleKeyPointsChange = (next) => {
    dispatch({
      type: EditorActionTypes.SET_TOPIC_ARRAY,
      payload: { field: 'key_points', values: next },
    });
  };

  const handleSectionSelect = (sectionId) => {
    setActiveSectionId(sectionId);
  };

  const handleSectionAdd = () => {
    const newSection = createEmptySection(sections.length + 1);
    setPendingFocus({ mode: 'explicit', newId: newSection.localId });
    dispatch({
      type: EditorActionTypes.ADD_SECTION,
      payload: { section: newSection },
    });
  };

  const handleSectionAddBelow = (sectionId) => {
    const newSection = createEmptySection(sections.length + 1);
    setPendingFocus({ mode: 'explicit', newId: newSection.localId });
    dispatch({
      type: EditorActionTypes.ADD_SECTION,
      payload: { afterId: sectionId, section: newSection },
    });
  };

  const handleSectionClone = (sectionId) => {
    setPendingFocus({ mode: 'after', referenceId: sectionId });
    dispatch({
      type: EditorActionTypes.CLONE_SECTION,
      payload: { sectionId },
    });
  };

  const handleSectionRemove = (sectionId) => {
    dispatch({
      type: EditorActionTypes.REMOVE_SECTION,
      payload: { sectionId },
    });
  };

  const handleSectionReorder = (fromIndex, toIndex) => {
    dispatch({
      type: EditorActionTypes.REORDER_SECTION,
      payload: { fromIndex, toIndex },
    });
  };

  const handleSectionMove = (direction, sectionId, index) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;
    handleSectionReorder(index, targetIndex);
  };

  const handleResetToGenerator = () => {
    setIsEditorActive(false);
    setPendingFocus(null);
    dispatch({
      type: EditorActionTypes.RESET,
      payload: { topic: {} },
    });
  };

  const activeSection = useMemo(
    () =>
      sections.find(
        (section) => section.localId === activeSectionId || section.id === activeSectionId,
      ) || null,
    [sections, activeSectionId],
  );

  const activeSectionIndex = useMemo(
    () =>
      sections.findIndex(
        (section) => section.localId === activeSectionId || section.id === activeSectionId,
      ),
    [sections, activeSectionId],
  );

  return (
    <section className="rounded-3xl border border-indigo-100 bg-white/90 p-6 shadow-xl shadow-indigo-200/40">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Structured Content</h2>
          <p className="text-sm text-slate-500">
            {topicName ? `Curating: ${topicName}` : 'Generate, refine, and publish topic content.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {isEditorActive ? (
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 font-semibold ${
                isDirty
                  ? 'border-amber-200 bg-amber-50 text-amber-600'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-600'
              }`}
            >
              {isDirty ? 'Unsaved changes' : 'All changes synced locally'}
            </span>
          ) : null}
          {draftSavedAt ? (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-500">
              Draft saved {formatRelativeTime(draftSavedAt)}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-400">
              No local draft
            </span>
          )}
          <button
            type="button"
            onClick={handleDraftSave}
            className="inline-flex items-center rounded-full border border-indigo-200 px-3 py-1 font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50"
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={handleDraftDiscard}
            className="inline-flex items-center rounded-full border border-rose-200 px-3 py-1 font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50"
          >
            Clear draft
          </button>
        </div>
      </header>
      <div className="mt-6 space-y-6">
        {!isEditorActive ? (
          <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-inner shadow-indigo-100/40">
            <h3 className="text-lg font-semibold text-slate-800">1. Prepare source text</h3>
            <p className="mt-1 text-sm text-slate-500">
              Paste textbook paragraphs here. Use the toolbar to pull in existing legacy material.
            </p>
            <textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder="Paste textbook content, bullet outlines, or copied mentor notes..."
              className="mt-3 h-48 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-mono text-slate-700 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handlePrefillLegacy}
                className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
              >
                Convert legacy content
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className={`inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold text-white shadow-sm transition ${
                  isGenerating
                    ? 'cursor-not-allowed bg-indigo-300'
                    : 'bg-indigo-600 hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-lg'
                }`}
              >
                {isGenerating ? 'Generating…' : 'Generate structure'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px,1fr] xl:grid-cols-[360px,1fr] 2xl:grid-cols-[400px,1fr]">
            <SectionList
              sections={sections}
              activeSectionId={activeSectionId}
              onSelect={handleSectionSelect}
              onAddSection={handleSectionAdd}
              onCloneSection={handleSectionClone}
              onRemoveSection={handleSectionRemove}
              onReorderSection={handleSectionReorder}
            />
            <div className="space-y-6">
              <TopicArrayEditor
                label="Objectives"
                description="Set expectations for what the learner should master."
                values={objectives}
                onChange={handleObjectivesChange}
                placeholder="By the end, the learner should be able to…"
              />
              {activeSection ? (
                <SectionEditor
                  section={activeSection}
                  index={activeSectionIndex === -1 ? 0 : activeSectionIndex}
                  totalSections={sections.length}
                  dispatch={dispatch}
                  onMove={handleSectionMove}
                  onClone={handleSectionClone}
                  onRemove={handleSectionRemove}
                  onAddBelow={handleSectionAddBelow}
                />
              ) : (
                <div className="rounded-3xl border border-dashed border-indigo-200 bg-indigo-50/60 p-6 text-center text-sm text-indigo-600">
                  Select a section to edit its content.
                </div>
              )}
              <TopicArrayEditor
                label="Key Points"
                description="Publish-ready recap bullets that reinforce mastery."
                values={keyPoints}
                onChange={handleKeyPointsChange}
                placeholder="High-yield takeaway…"
              />
              <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>
                    {sections.length} section{sections.length === 1 ? '' : 's'} ·{' '}
                    {sections.reduce((total, section) => total + (section.checkpoints?.length || 0), 0)}{' '}
                    checkpoint(s)
                  </span>
                  <span>Last edit {formatRelativeTime(editorState.lastChange)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetToGenerator}
                    className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
                  >
                    Return to generator
                  </button>
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={isPublishing}
                    className={`inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold text-white shadow-sm transition ${
                      isPublishing
                        ? 'cursor-not-allowed bg-indigo-300'
                        : 'bg-indigo-600 hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-lg'
                    }`}
                  >
                    {isPublishing ? 'Publishing…' : 'Publish updates'}
                  </button>
                </div>
              </footer>
            </div>
          </div>
        )}
      </div>
      {versionHistory.length > 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <header className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-600">
              Version history
            </h3>
            <span className="text-xs text-slate-500">{versionHistory.length} snapshot(s)</span>
          </header>
          <ul className="mt-3 space-y-2">
            {versionHistory.map((version) => (
              <li
                key={version.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner"
              >
                <div>
                  <p className="font-semibold">
                    {new Date(version.savedAt).toLocaleString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                  <p className="text-xs text-slate-500">Local snapshot</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleVersionRestore(version)}
                  className="rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return 'just now';
  const delta = Date.now() - timestamp;
  const minutes = Math.floor(delta / (60 * 1000));
  if (minutes <= 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

export default StructuredEditorPane;
