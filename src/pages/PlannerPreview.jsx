// src/pages/PlannerPreview.jsx
import React, { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import {
  collection,
  getDocs,
  doc,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useSchedulerFlags } from "../hooks/useSchedulerFlags";

/* ======================= helpers ======================= */
const catRank = (c) => (c === "must" ? 3 : c === "good" ? 2 : c === "nice" ? 1 : 0);
const padSeq = (n, width = 5) => String(n).padStart(width, "0");
const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// robust numeric topic index: "6.12" -> 12; "6.3" -> 3; unknown -> big fallback
function parseTopicIndex(topicId) {
  const m = String(topicId || "").match(/^\s*\d+\.(\d+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n)) return n;
  }
  return 1e9;
}

// numeric-ish chapter tiebreaker if needed
function chapterIdNumeric(a, b) {
  const toNum = (s) => {
    const m = String(s || "").match(/^\s*(\d+)/);
    return m ? parseInt(m[1], 10) : 1e9;
  };
  return toNum(a) - toNum(b);
}

/* ============= build RAW topic blocks (unsorted) ============= */
/**
 * Block = Topic (+ its subtopics list) carrying enough chapter/topic meta
 * Minutes come from study_items roll-ups you computed server-side.
 */
async function buildTopicBlocksRaw() {
  const [topicsSnap, chaptersSnap, subsSnap] = await Promise.all([
    getDocs(query(collection(db, "study_items"), where("level", "==", "topic"))),
    getDocs(query(collection(db, "study_items"), where("level", "==", "chapter"))),
    getDocs(query(collection(db, "study_items"), where("level", "==", "subtopic"))),
  ]);

  // chapters index
  const chapters = new Map(); // `${section}__${chapterId}` -> chap data
  chaptersSnap.forEach((d) => chapters.set(d.id, { id: d.id, ...d.data() }));

  // subtopics grouped by topic
  const tmp = new Map(); // `${section}__${topicId}` -> [{id, order}, ...]
  subsSnap.forEach((s) => {
    const sd = s.data();
    const key = `${sd.section}__${sd.parentId}`;
    if (!tmp.has(key)) tmp.set(key, []);
    tmp.get(key).push({ id: sd.itemId, order: typeof sd.order === "number" ? sd.order : 9999 });
  });
  const subsByTopic = new Map();
  for (const [k, arr] of tmp) {
    arr.sort((a, b) => a.order - b.order);
    subsByTopic.set(k, arr.map((x) => x.id));
  }

  // compose raw blocks (no sorting yet)
  const blocks = [];
  topicsSnap.forEach((t) => {
    const td = t.data();
    const section = td.section;
    const topicId = td.itemId;
    const chapterId = td.parentId;
    const minutes = Number(td.estimatedMinutes) || 0;

    const chap = chapters.get(`${section}__${chapterId}`) || {};
    const chapterCategory = chap.categoryNorm || chap.category || "good";
    const chapterOrder = typeof chap.order === "number" ? chap.order : 9999;
    const isChapter1 = String(chapterId || "").split(".")[0] === "1";

    // Intro heuristic: x.1 OR order==1 OR name includes "intro"
    const isIntro =
      String(topicId || "").split(".")[1] === "1" ||
      Number(td.order) === 1 ||
      String(td.name || "").toLowerCase().includes("intro");

    blocks.push({
      section,
      topicId,
      topicName: td.name || "",
      minutes,
      subtopicIds: subsByTopic.get(`${section}__${topicId}`) || [],

      chapterId,
      chapterOrder,
      chapterCategory,
      isChapter1,

      topicOrder: typeof td.order === "number" ? td.order : 9999,
      isIntro,
      topicIndex: parseTopicIndex(topicId),
    });
  });

  return blocks;
}

/* ============= apply ordering (chapter-first) ============= */
/**
 * Global: chapterCategory (must>good>nice) across sections,
 * then custom section order.
 * Preserve chapter flow:
 *   - Chapter 1 first
 *   - Chapter order (book order)
 *   - Within a chapter: Intro first, then numeric topic index, then topicOrder.
 */
function applyOrdering(rawBlocks, prefs) {
  const includedSet = new Set(prefs.order.filter((s) => prefs.included[s]));
  const orderIndex = new Map(prefs.order.map((s, i) => [s, i]));
  const unknownBase = prefs.order.length + 1000;

  const filtered = rawBlocks.filter((b) => includedSet.has(b.section));

  filtered.sort((a, b) => {
    // 1) chapter category (must > good > nice) across all sections
    const ca = catRank(a.chapterCategory);
    const cb = catRank(b.chapterCategory);
    if (ca !== cb) return cb - ca;

    // 2) custom section order
    const ra = orderIndex.has(a.section) ? orderIndex.get(a.section) : unknownBase;
    const rb = orderIndex.has(b.section) ? orderIndex.get(b.section) : unknownBase;
    if (ra !== rb) return ra - rb;

    // 3) Chapter 1 (foundational) first
    if (a.isChapter1 !== b.isChapter1) return a.isChapter1 ? -1 : 1;

    // 4) Chapter order (book order)
    if (a.chapterOrder !== b.chapterOrder) return a.chapterOrder - b.chapterOrder;

    // 5) Inside same chapter: preserve flow
    if (a.chapterId === b.chapterId) {
      // Intro first
      if (a.isIntro !== b.isIntro) return a.isIntro ? -1 : 1;

      // Numeric topic index (e.g., 6.2 < 6.3 < 6.12)
      const ia = Number.isFinite(a.topicIndex) ? a.topicIndex : a.topicOrder;
      const ib = Number.isFinite(b.topicIndex) ? b.topicIndex : b.topicOrder;
      if (ia !== ib) return ia - ib;

      // tiny fallback
      return a.topicOrder - b.topicOrder;
    }

    // If not same chapter, use chapterId numeric-ish as stable fallback
    return chapterIdNumeric(a.chapterId, b.chapterId);
  });

  return filtered;
}

/* ============= Section picker + reorder UI ============= */
function SectionOrderEditor({ prefs, setPrefs, allSections, onApply }) {
  // Ensure prefs includes all sections; default included=true
  useEffect(() => {
    if (!allSections.length) return;
    setPrefs((prev) => {
      const seen = new Set(prev.order);
      const nextOrder = [...prev.order];
      let changed = false;

      for (const s of allSections) {
        if (!seen.has(s)) {
          nextOrder.push(s);
          changed = true;
        }
      }
      const nextIncluded = { ...prev.included };
      for (const s of allSections) {
        if (nextIncluded[s] === undefined) nextIncluded[s] = true;
      }
      return changed ? { order: nextOrder, included: nextIncluded } : prev;
    });
  }, [allSections, setPrefs]);

  function move(name, dir) {
    setPrefs((prev) => {
      const idx = prev.order.indexOf(name);
      if (idx < 0) return prev;
      const to = dir === "up" ? idx - 1 : idx + 1;
      if (to < 0 || to >= prev.order.length) return prev;
      const next = [...prev.order];
      [next[idx], next[to]] = [next[to], next[idx]];
      return { ...prev, order: next };
    });
  }

  function toggle(name) {
    setPrefs((prev) => ({
      ...prev,
      included: { ...prev.included, [name]: !prev.included[name] },
    }));
  }

  return (
    <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>Sections (pick & reorder)</h3>
        <button
          onClick={onApply}
          className="px-3 py-1.5 bg-gray-900 text-white rounded"
          title="Apply this section order to the preview below"
        >
          Apply Section Order
        </button>
      </div>
      <p style={{ color: "#666", marginTop: 6 }}>
        We schedule <b>all "must" chapters first across your selected sections</b>, then "good",
        then "nice", following the section order you set here. Inside each chapter we keep the book
        flow (Intro â†’ numeric topic index).
      </p>
      {!allSections.length ? (
        <div style={{ color: "#999" }}>Loading sections...</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {prefs.order.map((s) => (
            <li
              key={s}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
                borderBottom: "1px dashed #eee",
              }}
            >
              <input
                type="checkbox"
                checked={!!prefs.included[s]}
                onChange={() => toggle(s)}
                title="Include this section"
              />
              <div style={{ width: 32, textAlign: "center", color: "#666" }}>
                {prefs.order.indexOf(s) + 1}
              </div>
              <div style={{ flex: 1 }}>{s}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="px-2 py-1 border rounded"
                  onClick={() => move(s, "up")}
                  disabled={prefs.order.indexOf(s) === 0}
                >
                  â†‘
                </button>
                <button
                  className="px-2 py-1 border rounded"
                  onClick={() => move(s, "down")}
                  disabled={prefs.order.indexOf(s) === prefs.order.length - 1}
                >
                  â†“
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ======================= component ======================= */
export default function PlannerPreview() {
  const { flags, loading: flagsLoading } = useSchedulerFlags();
  const auth = getAuth();

  // Inputs
  const [startDate, setStartDate] = useState(todayISO());
  const [dailyCap, setDailyCap] = useState(270);

  // Data
  const [rawBlocks, setRawBlocks] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);
  const [error, setError] = useState("");

  // Section prefs (persist to localStorage)
  const [sectionPrefs, setSectionPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem("planner.sectionPrefs");
      if (saved) return JSON.parse(saved);
    } catch {}
    return { order: [], included: {} };
  });
  useEffect(() => {
    try {
      localStorage.setItem("planner.sectionPrefs", JSON.stringify(sectionPrefs));
    } catch {}
  }, [sectionPrefs]);

  // Default daily cap from flags
  useEffect(() => {
    if (!flagsLoading && flags?.dailyCapacityMinsDefault) {
      setDailyCap(flags.dailyCapacityMinsDefault);
    }
  }, [flagsLoading, flags]);

  // Load raw blocks once
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingBlocks(true);
        const list = await buildTopicBlocksRaw();
        if (!mounted) return;

        setRawBlocks(list);

        const allSections = Array.from(new Set(list.map((b) => b.section))).sort();
        setSectionPrefs((prev) => {
          const seen = new Set(prev.order);
          const nextOrder = prev.order.slice();
          let changed = false;
          for (const s of allSections) {
            if (!seen.has(s)) {
              nextOrder.push(s);
              changed = true;
            }
          }
          const included = { ...prev.included };
          for (const s of allSections) {
            if (included[s] === undefined) included[s] = true;
          }
          return changed ? { order: nextOrder, included } : { order: nextOrder, included };
        });

        const initial = applyOrdering(list, {
          order:
            sectionPrefs.order.length > 0
              ? sectionPrefs.order
              : Array.from(new Set(list.map((b) => b.section))).sort(),
          included:
            Object.keys(sectionPrefs.included).length > 0
              ? sectionPrefs.included
              : Object.fromEntries(allSections.map((s) => [s, true])),
        });
        setBlocks(initial);
      } catch (e) {
        console.error(e);
        if (mounted) setError(e.message || "Failed to load planner preview");
      } finally {
        if (mounted) setLoadingBlocks(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applySectionOrderNow() {
    if (!rawBlocks.length) return;
    const next = applyOrdering(rawBlocks, sectionPrefs);
    setBlocks(next);
  }


  // Write master plan
  async function handleBuildAndSaveMaster() {
  if (!auth.currentUser) {
    alert("Please sign in first.");
    return;
  }
  const uid = auth.currentUser.uid;

  try {
    // Rebuild with current prefs
    const freshRaw = await buildTopicBlocksRaw();
    const ordered = applyOrdering(freshRaw, sectionPrefs);

    // 1) Clear existing queue at: plans/{uid}/masterQueue  âœ… valid collection path
    const queueCol = collection(db, "plans", uid, "masterQueue");
    const snap = await getDocs(queueCol);
    {
      const docs = snap.docs;
      let i = 0;
      while (i < docs.length) {
        const end = Math.min(i + 450, docs.length);
        const batch = writeBatch(db);
        for (let j = i; j < end; j++) batch.delete(docs[j].ref);
        await batch.commit();
        i = end;
      }
    }

    // 2) Write meta (your existing path is fine)
    const totalMinutes = ordered.reduce((a, b) => a + (Number(b.minutes) || 0), 0);
    const metaBatch = writeBatch(db);
    metaBatch.set(doc(db, "plans", uid, "master", "meta"), {
      startDate,
      dailyCap: Number(dailyCap) || 0,
      sectionPrefs,
      totals: {
        topicBlocks: ordered.length,
        minutes: totalMinutes,
        hours: totalMinutes / 60,
        daysAtCap: (Number(dailyCap) || 0) ? totalMinutes / Number(dailyCap) : 0,
      },
      strategyVersion: "v3-chapterCategoryOnly-preserveChapterFlow",
      generatedAt: serverTimestamp(),
    });
    await metaBatch.commit();

    // 3) Write queue items to plans/{uid}/masterQueue (chunked)
    let i = 0;
    while (i < ordered.length) {
      const end = Math.min(i + 450, ordered.length);
      const batch = writeBatch(db);
      for (let j = i; j < end; j++) {
        const seq = padSeq(j + 1);
        const b = ordered[j];
        batch.set(
          doc(queueCol, seq),
          {
            seq,
            section: b.section,
            chapterId: b.chapterId,
            topicId: b.topicId,
            topicName: b.topicName,
            minutes: b.minutes,
            subtopicIds: b.subtopicIds,
            status: "pending",
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      await batch.commit();
      i = end;
    }

    alert("Master Plan saved!");
  } catch (e) {
    console.error(e);
    alert(`Failed to save Master Plan: ${e.message}`);
  }
}

  // sections list for editor
  const allSections = useMemo(
    () => Array.from(new Set(rawBlocks.map((b) => b.section))).sort(),
    [rawBlocks]
  );

  return (
    <div style={{ maxWidth: 1120, margin: "24px auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ marginBottom: 8, flex: "0 0 auto" }}>Planner Preview</h1>
        <button
          className="text-blue-600 underline"
          onClick={() => (window.location.href = "/planner/time")}
        >
          Time Report
        </button>
      </div>

      <p style={{ color: "#666", marginTop: 0 }}>
        Global ordering is by <b>chapter category</b> (mustâ†’goodâ†’nice) across your selected
        sections and order. Inside each chapter we preserve the book's flow:
        <b> Intro first</b>, then <b>numeric topic index</b>, then a small <code>topicOrder</code>{" "}
        fallback.
      </p>

      {/* Inputs */}
      <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginTop: 12 }}>
        <label className="text-sm">
          Start date
          <input
            type="date"
            className="block border rounded px-2 py-1"
            value={todayISO() > startDate ? todayISO() : startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ display: "block", marginTop: 4 }}
          />
        </label>

        <label className="text-sm">
          Daily capacity (mins)
          <input
            type="number"
            min={30}
            step={5}
            className="block border rounded px-2 py-1"
            value={dailyCap}
            onChange={(e) => setDailyCap(Number(e.target.value))}
            style={{ display: "block", marginTop: 4 }}
          />
        </label>

        <button
          onClick={handleBuildAndSaveMaster}
          disabled={loadingBlocks}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-blue-300"
        >
          Build & Save Master Plan
        </button>
      </div>

      {/* Section picker + reorder */}
      <SectionOrderEditor
        prefs={sectionPrefs}
        setPrefs={setSectionPrefs}
        allSections={allSections}
        onApply={applySectionOrderNow}
      />

      {/* Totals */}
      <div style={{ marginTop: 16, background: "#f7f8fa", padding: 12, borderRadius: 8 }}>
        <div>
          Total blocks (preview): <b>{blocks.length}</b>
        </div>
        <div>
          Total minutes:{" "}
          <b>
            {Math.round(blocks.reduce((a, b) => a + (b.minutes || 0), 0)).toLocaleString()}
          </b>{" "}
          (~{" "}
          <b>
            {(
              Math.round(
                (blocks.reduce((a, b) => a + (b.minutes || 0), 0) / 60) * 10
              ) / 10
            ).toLocaleString()}
          </b>{" "}
          hours)
        </div>
        <div>
          Days @ {dailyCap} min/day:{" "}
          <b>
            {(
              Math.round(
                ((blocks.reduce((a, b) => a + (b.minutes || 0), 0) / (dailyCap || 1)) || 0) * 100
              ) / 100
            ).toLocaleString()}
          </b>
        </div>
      </div>

      {/* Errors */}
      {error ? (
        <div style={{ marginTop: 12, color: "#b00020" }}>Error: {error}</div>
      ) : null}

      {/* Preview table */}
      <h3 style={{ marginTop: 20 }}>Preview (first 100)</h3>
      {loadingBlocks ? (
        <p>Loading...</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>#</th>
              <th style={th}>Section</th>
              <th style={th}>Chapter</th>
              <th style={th}>Topic</th>
              <th style={thRight}>Minutes</th>
              <th style={th}>Subtopics</th>
            </tr>
          </thead>
          <tbody>
            {blocks.slice(0, 100).map((b, idx) => (
              <tr key={`${b.section}__${b.topicId}`}>
                <td style={tdCenter}>{idx + 1}</td>
                <td style={td}>{b.section}</td>
                <td style={td}>{b.chapterId}</td>
                <td style={td}>
                  {b.topicId} - {b.topicName}
                </td>
                <td style={tdRight}>{Math.round(b.minutes)}</td>
                <td style={td}>
                  {b.subtopicIds.length ? b.subtopicIds.join(", ") : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ============== table styles ============== */
const th = { textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" };
const thRight = { ...th, textAlign: "right" };
const td = { borderBottom: "1px solid #eee", padding: "8px 6px" };
const tdRight = { ...td, textAlign: "right" };
const tdCenter = { ...td, textAlign: "center" };
