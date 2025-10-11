// src/components/planv2/MasterQueueSidebar.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { listMasterQueueLinear } from "../../services/planV2Api";

/**
 * Sidebar that mirrors the master queue order, nested as:
 * Section -> Chapter -> Topics (with subtopic count)
 *
 * We intentionally show ONLY "queued" items (no "In Progress" section),
 * so that when a topic gets scheduled (queueState -> inProgress), it disappears
 * from this sidebar after a refresh.
 *
 * Props:
 *  - uid: string
 *  - refreshSignal?: number   // bump from parent to force refetch
 */
export default function MasterQueueSidebar({ uid, refreshSignal = 0 }) {
  const [loading, setLoading] = useState(true);
  const [queuedRuns, setQueuedRuns] = useState([]);
  const [inProgressRuns, setInProgressRuns] = useState([]);
  const [allExpanded, setAllExpanded] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!uid) return;
      setLoading(true);
      try {
        const [queued, inProgress] = await Promise.all([
          listMasterQueueLinear(uid, { filter: "queued" }),
          listMasterQueueLinear(uid, { filter: "inProgress" }),
        ]);
        if (!mounted) return;
        setQueuedRuns(Array.isArray(queued) ? queued : []);
        const filteredInProgress = Array.isArray(inProgress)
          ? inProgress.filter((row) => {
              const subs = Array.isArray(row.subtopics) ? row.subtopics : [];
              if (!subs.length) return false;
              const scheduledIdx = new Set();
              Object.values(row.scheduledDates || {}).forEach((arr) => {
                if (!Array.isArray(arr)) return;
                arr.forEach((n) => {
                  const idx = Number(n);
                  if (Number.isFinite(idx)) {
                    scheduledIdx.add(idx);
                  }
                });
              });
              return subs.some((_, idx) => !scheduledIdx.has(idx));
            })
          : [];
        setInProgressRuns(filteredInProgress);
      } catch (e) {
        console.error(e);
        if (!mounted) {
          return;
        }
        setQueuedRuns([]);
        setInProgressRuns([]);
      } finally {
        mounted && setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [uid, refreshSignal]);

  // Build a nested structure while preserving the original order (runs array order)
  // Group consecutive items by (section, chapterId), and within each group list topics in order.
  const buildGroups = useCallback((rows, mode) => {
    const out = [];
    let cur = null;
    for (const r of rows) {
      const subs = Array.isArray(r.subtopics) ? r.subtopics : [];
      const scheduledIdx = new Set();
      Object.values(r.scheduledDates || {}).forEach((arr) => {
        if (!Array.isArray(arr)) return;
        arr.forEach((n) => {
          const idx = Number(n);
          if (Number.isFinite(idx)) {
            scheduledIdx.add(idx);
          }
        });
      });
      const remainingSubs = subs.filter((_, idx) => !scheduledIdx.has(idx));
      const totalMinutes = subs.reduce(
        (sum, sub) => sum + Number(sub?.minutes || 0),
        0,
      );
      const remainingMinutes = remainingSubs.reduce(
        (sum, sub) => sum + Number(sub?.minutes || 0),
        0,
      );

      const gkey = `${r.section}__${r.chapterId}`;
      if (!cur || cur.gkey !== gkey) {
        if (cur) out.push(cur);
        cur = {
          gkey,
          section: r.section,
          chapterId: r.chapterId,
          chapterName: r.chapterName || `Chapter ${r.chapterId}`,
          items: [],
          mode,
        };
      }
      cur.items.push({
        seq: r.seq,
        topicId: r.topicId,
        topicName: r.topicName,
        totalSubtopics: subs.length,
        totalMinutes,
        remainingSubtopics: remainingSubs.length,
        remainingMinutes,
        mode,
      });
    }
    if (cur) out.push(cur);
    return out;
  }, []);

  const inProgressGroups = useMemo(
    () => buildGroups(inProgressRuns, "inProgress"),
    [inProgressRuns, buildGroups],
  );

  const queuedGroups = useMemo(
    () => buildGroups(queuedRuns, "queued"),
    [queuedRuns, buildGroups],
  );

  const totalQueued = queuedRuns.length;
  const totalInProgress = inProgressRuns.length;

  const handleDragStart = useCallback((e, item) => {
    try {
      const payload = {
        kind: "queue-run",
        seq: item.seq,
        topicId: item.topicId,
        from: "sidebar",
      };
      if (e.dataTransfer) {
        e.dataTransfer.setData(
          "application/x-rad-run",
          JSON.stringify(payload),
        );
        e.dataTransfer.setData("text/plain", JSON.stringify(payload));
        e.dataTransfer.effectAllowed = "move";
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  return (
    <div className="flex h-full w-full flex-col rounded-3xl border border-indigo-100 bg-white/70 shadow-xl shadow-indigo-200/40 backdrop-blur">
      <div className="flex items-center justify-between rounded-t-3xl border-b border-indigo-100 bg-gradient-to-r from-indigo-500/10 to-sky-400/10 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">
            Master queue
          </p>
          <p className="text-sm font-semibold text-slate-700">Up next</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {totalQueued + totalInProgress} topics
          </span>
          <button
            onClick={() => setAllExpanded(true)}
            className="rounded-full border border-indigo-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-indigo-600 transition hover:-translate-y-0.5 hover:bg-indigo-50"
          >
            Expand
          </button>
          <button
            onClick={() => setAllExpanded(false)}
            className="rounded-full border border-indigo-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-indigo-600 transition hover:-translate-y-0.5 hover:bg-indigo-50"
          >
            Collapse
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-3">
        {loading && (
          <div className="rounded-2xl border border-dashed border-indigo-200 bg-white/70 px-3 py-4 text-center text-sm text-slate-500 shadow-inner shadow-indigo-100/50">
            Loading queue...
          </div>
        )}

        {!loading && inProgressGroups.length === 0 && queuedGroups.length === 0 && (
          <div className="rounded-2xl border border-dashed border-indigo-200 bg-white/70 px-3 py-4 text-center text-sm text-slate-500 shadow-inner shadow-indigo-100/50">
            Queue is empty.
          </div>
        )}

        {!loading && inProgressGroups.length > 0 && (
          <QueueSection
            title="In progress"
            badge={`${totalInProgress}`}
            groups={inProgressGroups}
            allExpanded={allExpanded}
            onDragStart={handleDragStart}
          />
        )}

        {!loading && queuedGroups.length > 0 && (
          <QueueSection
            title="Queued"
            badge={`${totalQueued}`}
            groups={queuedGroups}
            allExpanded={allExpanded}
            onDragStart={handleDragStart}
          />
        )}
      </div>
    </div>
  );
}

function QueueSection({ title, badge, groups, allExpanded, onDragStart }) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">
          {title}
        </h3>
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
          {badge}
        </span>
      </div>
      {groups.map((group, index) => (
        <Group
          key={group.gkey + "_" + index}
          group={group}
          defaultOpen={allExpanded}
          onDragStart={onDragStart}
        />
      ))}
    </div>
  );
}

function Group({ group, defaultOpen, onDragStart }) {
  const [open, setOpen] = useState(!!defaultOpen);
  useEffect(() => setOpen(!!defaultOpen), [defaultOpen]);

  return (
    <div className="mb-3 rounded-2xl border border-indigo-100 bg-white/70 shadow-sm shadow-indigo-100/40">
      <button
        className="w-full rounded-2xl border-b border-indigo-100 bg-white/80 px-3 py-2 text-left transition hover:bg-indigo-50"
        onClick={() => setOpen((o) => !o)}
        title={`${group.section} - ${group.chapterName}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">
            {group.section} - {group.chapterName}
          </span>
          <span className="text-xs text-slate-500">
            {group.items.length} topic{group.items.length !== 1 ? "s" : ""}
          </span>
        </div>
      </button>

      {open && (
        <ul className="space-y-2 px-3 py-3">
          {group.items.map((it) => {
            const isInProgress = it.mode === "inProgress";
            const remainingLabel = isInProgress
              ? `${it.remainingSubtopics} of ${it.totalSubtopics} left`
              : `${it.totalSubtopics} subtopic${
                  it.totalSubtopics !== 1 ? "s" : ""
                }`;
            const minutesLabel = isInProgress
              ? `${it.remainingMinutes} min left`
              : `${it.totalMinutes} min`;
            return (
              <li
                key={it.seq}
                className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-white/90 px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50 hover:shadow-lg hover:shadow-indigo-200/50"
                draggable
                onDragStart={(e) => onDragStart(e, it)}
                title="Drag to a day card"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {it.topicName}
                  </div>
                  <div className="text-xs text-slate-500">
                    {remainingLabel} - {minutesLabel}
                  </div>
                </div>
                <div className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
                  #{it.seq}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
