import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReviewAndSave from '../../components/ReviewAndSave';
import { useAdminToasts } from '../context/AdminToastContext';

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
  const [rawText, setRawText] = useState('');
  const [structuredContent, setStructuredContent] = useState(initialStructuredContent || null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [versionHistory, setVersionHistory] = useState([]);

  useEffect(() => {
    setStructuredContent(initialStructuredContent || null);
  }, [initialStructuredContent]);

  const draftKey = useMemo(() => `${topicId}`, [topicId]);
  const versionKey = useMemo(() => `${organId}:${topicId}`, [organId, topicId]);

  useEffect(() => {
    if (!topicId) return;
    const drafts = readStorage(LOCAL_STORAGE_DRAFT_KEY);
    const existing = drafts[draftKey];
    if (existing) {
      setRawText(existing.rawText || '');
      setDraftSavedAt(existing.savedAt || null);
      if (existing.structuredContent) {
        setStructuredContent(existing.structuredContent);
      }
    } else {
      setRawText('');
      setDraftSavedAt(null);
    }
  }, [draftKey, topicId]);

  const persistDraft = useCallback(
    (nextDraft) => {
      const drafts = readStorage(LOCAL_STORAGE_DRAFT_KEY);
      drafts[draftKey] = {
        rawText: nextDraft.rawText,
        structuredContent: nextDraft.structuredContent,
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
    if (!versionKey) return;
    const allVersions = readStorage(LOCAL_STORAGE_VERSIONS_KEY);
    setVersionHistory(allVersions[versionKey] || []);
  }, [versionKey]);

  const appendVersion = useCallback(
    (payload) => {
      const allVersions = readStorage(LOCAL_STORAGE_VERSIONS_KEY);
      const current = allVersions[versionKey] || [];
      const next = [
        {
          id: `${Date.now()}`,
          savedAt: Date.now(),
          snapshot: payload,
        },
        ...current,
      ].slice(0, 10);
      allVersions[versionKey] = next;
      writeStorage(LOCAL_STORAGE_VERSIONS_KEY, allVersions);
      setVersionHistory(next);
    },
    [versionKey],
  );

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
      const response = await fetch('/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText,
          organId,
          topicId,
        }),
      });
      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        throw new Error(details.error || `Failed with status ${response.status}`);
      }
      const result = await response.json();
      if (!result?.structured) {
        throw new Error('No structured content returned by pipeline');
      }
      setStructuredContent(result.structured);
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
        message: error.message || 'Unknown error occurred while generating structure.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async (payload) => {
    setIsPublishing(true);
    const publishPayload = { ...payload };
    const versionSnapshot = {
      ...payload,
      rawText,
    };
    try {
      const response = await fetch('/admin/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publishPayload),
      });
      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        throw new Error(details.error || `Failed with status ${response.status}`);
      }
      const result = await response.json();
      appendVersion(versionSnapshot);
      removeDraft();
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
        message: error.message || 'Unknown error occurred while saving content.',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCancel = () => {
    setStructuredContent(null);
  };

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

  const handleDraftSave = () => {
    persistDraft({ rawText, structuredContent });
    pushToast({
      type: 'success',
      title: 'Draft saved',
      message: 'Saved locally. Publish to push updates live.',
    });
  };

  const handleDraftDiscard = () => {
    removeDraft();
    setRawText('');
    setStructuredContent(initialStructuredContent || null);
    pushToast({
      type: 'info',
      title: 'Draft cleared',
      message: 'Local draft removed. Reload the topic to fetch the latest published version.',
    });
  };

  const handleVersionRestore = (version) => {
    if (!version?.snapshot) return;
    setStructuredContent(version.snapshot.structured || null);
    setRawText(version.snapshot.rawText || '');
    persistDraft({
      rawText: version.snapshot.rawText || '',
      structuredContent: version.snapshot.structured || null,
    });
    pushToast({
      type: 'success',
      title: 'Version restored',
      message: 'Review and publish to make this version live again.',
    });
  };

  return (
    <section className="rounded-3xl border border-indigo-100 bg-white/90 p-6 shadow-xl shadow-indigo-200/40">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Structured Content</h2>
          <p className="text-sm text-slate-500">
            Generate, refine, and publish topic content with version safety nets.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {draftSavedAt ? (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-600">
              Draft saved {formatRelativeTime(draftSavedAt)}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-400">
              No local draft
            </span>
          )}
          <button
            onClick={handleDraftSave}
            className="inline-flex items-center rounded-full border border-indigo-200 px-3 py-1 font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50"
          >
            Save draft
          </button>
          <button
            onClick={handleDraftDiscard}
            className="inline-flex items-center rounded-full border border-rose-200 px-3 py-1 font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50"
          >
            Clear draft
          </button>
        </div>
      </header>
      <div className="mt-6 space-y-6">
        {!structuredContent ? (
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
                onClick={handlePrefillLegacy}
                className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
              >
                Convert legacy content
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={`inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold text-white shadow-sm transition ${
                  isGenerating
                    ? 'cursor-not-allowed bg-indigo-300'
                    : 'bg-indigo-600 hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-lg'
                }`}
              >
                {isGenerating ? 'Generating...' : 'Generate structure'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <ReviewAndSave
              structuredContent={structuredContent}
              onSave={handlePublish}
              onCancel={handleCancel}
              organ={organId}
              topicId={topicId}
            />
            {isPublishing ? (
              <p className="text-sm text-slate-500">Publishing...</p>
            ) : null}
          </>
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
