import React, { useEffect, useMemo, useState } from 'react';
import { useAdminPanel } from '../context/AdminPanelContext';
import { useAdminToasts } from '../context/AdminToastContext';
import StructuredEditorPane from './StructuredEditorPane';
import { useStructuredContent, useUpdateNodeMetadata } from '../hooks/useAdminData';

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

  const handleTutorDryRun = () => {
    pushToast({
      type: 'info',
      title: 'Tutor dry run (preview)',
      message: 'Tutor dry run will hook into the sandbox endpoint in a future iteration.',
    });
  };

  if (!selectedNode) {
    return (
      <div className="flex w-full max-w-4xl flex-1 items-center justify-center rounded-3xl border border-dashed border-indigo-200 bg-white/80 px-8 py-12 text-center text-slate-600">
        Select a chapter, topic, or subtopic from the navigation to edit its details.
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-4xl flex-1 flex-col gap-6 overflow-y-auto px-2 py-4 sm:px-6 lg:px-8">
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
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase ${statusBadgeClassName(status)}`}>
                  {status}
                </span>
              ) : null}
              <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-mono text-slate-500">
                ID: {selectedNode.topicId || selectedNode.id}
              </span>
              {selectedNode.updatedAt ? (
                <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500">
                  Updated {formatTimestamp(selectedNode.updatedAt)}
                </span>
              ) : null}
            </div>
          </div>
          <button
            onClick={() => setMetadataForm({
              name: selectedNode.name || selectedNode.title || '',
              category: selectedNode.category || '',
            })}
            className="hidden"
            aria-hidden
          />
        </header>

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
      </section>

      {legacyText ? (
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
          Run a dry run of the tutor experience using the current draft (stub).
        </p>
        <button
          onClick={handleTutorDryRun}
          className="mt-3 inline-flex items-center rounded-full border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50"
        >
          Tutor dry run (sandbox)
        </button>
      </section>
    </div>
  );
};

const statusBadgeClassName = (status) => {
  switch (status) {
    case 'green':
      return 'border-emerald-200 bg-emerald-50 text-emerald-600';
    case 'yellow':
      return 'border-amber-200 bg-amber-50 text-amber-600';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-600';
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
