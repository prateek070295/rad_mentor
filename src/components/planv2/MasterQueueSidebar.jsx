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
  const [runs, setRuns] = useState([]);
  const [allExpanded, setAllExpanded] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!uid) return;
      setLoading(true);
      try {
        // Only QUEUED items
        const r = await listMasterQueueLinear(uid, { filter: "queued" });
        if (!mounted) return;
        setRuns(Array.isArray(r) ? r : []);
      } catch (e) {
        console.error(e);
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
  const groups = useMemo(() => {
    const out = [];
    let cur = null;
    for (const r of runs) {
      const gkey = `${r.section}__${r.chapterId}`;
      if (!cur || cur.gkey !== gkey) {
        if (cur) out.push(cur);
        cur = {
          gkey,
          section: r.section,
          chapterId: r.chapterId,
          chapterName: r.chapterName || `Chapter ${r.chapterId}`,
          items: [],
        };
      }
      cur.items.push({
        seq: r.seq,
        topicId: r.topicId,
        topicName: r.topicName,
        minutes: Number(r.minutes || 0),
        subtopics: Array.isArray(r.subtopics) ? r.subtopics : [],
      });
    }
    if (cur) out.push(cur);
    return out;
  }, [runs]);

  const totalQueued = runs.length;

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
    <div className="h-full w-full border rounded-lg bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="font-semibold">Up Next</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{totalQueued} topics</span>
          <button
            onClick={() => setAllExpanded(true)}
            className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
          >
            Expand all
          </button>
          <button
            onClick={() => setAllExpanded(false)}
            className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="p-2 overflow-y-auto max-h-[calc(100vh-220px)]">
        {loading && (
          <div className="text-sm text-gray-500">Loading queue...</div>
        )}

        {!loading && groups.length === 0 && (
          <div className="text-sm text-gray-500">Queue is empty.</div>
        )}

        {!loading &&
          groups.map((g, gi) => (
            <Group
              key={g.gkey + "_" + gi}
              group={g}
              defaultOpen={allExpanded}
              onDragStart={handleDragStart}
            />
          ))}
      </div>
    </div>
  );
}

function Group({ group, defaultOpen, onDragStart }) {
  const [open, setOpen] = useState(!!defaultOpen);
  useEffect(() => setOpen(!!defaultOpen), [defaultOpen]);

  return (
    <div className="mb-2">
      <button
        className="w-full text-left bg-gray-50 hover:bg-gray-100 border rounded px-2 py-1"
        onClick={() => setOpen((o) => !o)}
        title={`${group.section} - ${group.chapterName}`}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium">
            {group.section} - {group.chapterName}
          </span>
          <span className="text-xs text-gray-500">
            {group.items.length} topic{group.items.length !== 1 ? "s" : ""}
          </span>
        </div>
      </button>

      {open && (
        <ul className="mt-1 ml-2">
          {group.items.map((it) => (
            <li
              key={it.seq}
              className="flex items-center justify-between border rounded px-2 py-1 mt-1 bg-white hover:bg-gray-50"
              draggable
              onDragStart={(e) => onDragStart(e, it)}
              title="Drag to a day card"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {it.topicName}
                </div>
                <div className="text-xs text-gray-500">
                  {it.subtopics?.length ?? 0} subtopic
                  {it.subtopics?.length !== 1 ? "s" : ""} - {it.minutes} min
                </div>
              </div>
              <div className="text-[10px] text-gray-400">#{it.seq}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
