// src/pages/PlannerPreview.jsx
import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  limit,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useSchedulerFlags } from "../hooks/useSchedulerFlags";
import { exportDocumentJSON, exportCollectionJSON } from "../utils/exportFirestore";
import { computePriority, getChapterId } from "../lib/priority";

/**
 * Read-only planner preview with strict hierarchy:
 * Across sections: Chapter category (must>good>nice) → chapter.order (asc)
 * Within a chapter: Topic category (must>good>nice) → topic.order (asc)
 * Within a topic: topic first, then subtopics by subtopic.order (asc)
 */
export default function PlannerPreview() {
  const { flags, loading } = useSchedulerFlags();

  // Inputs
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dailyCap, setDailyCap] = useState(270);
  const [preview, setPreview] = useState(null);

  // Suggestions state
  const [sectionFilter, setSectionFilter] = useState(""); // blank = all sections
  const [sampleSize, setSampleSize] = useState(400); // slightly larger sample for better chapters coverage
  const [rankedTop, setRankedTop] = useState([]);
  const [packedDay, setPackedDay] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Meta maps (keys are `${section}__${chapterId}` and `${section}__${topicId}`)
  const [chapterMeta, setChapterMeta] = useState({});
  const [topicMeta, setTopicMeta] = useState({});

  // Export helpers
  const auth = getAuth();
  const uid = auth.currentUser?.uid || "";
  const defaultDocPath = uid ? `plans/${uid}` : "";
  const [customPath, setCustomPath] = useState(defaultDocPath);

  useEffect(() => {
    if (!loading && flags?.dailyCapacityMinsDefault) {
      setDailyCap(flags.dailyCapacityMinsDefault);
    }
  }, [loading, flags]);

  if (loading) return null;

  // ---------- helpers ----------
  const CH_CAT = { must: 3, good: 2, nice: 1 };
  const TOP_CAT = { must: 3, good: 2, nice: 1 };

  const chKey = (it) => `${it.section}__${getChapterId(it)}`;      // e.g. "Breast__1"
  const tpKey = (it) => `${it.section}__${it.level === "topic" ? it.itemId : (it.parentId || "")}`; // e.g. "Breast__1.3"

  function ensureChapterMeta(rows, meta) {
    const missing = new Set();
    for (const it of rows) {
      const key = chKey(it);
      if (!meta[key]) {
        const chapDocId = key; // "Section__1"
        const found = rows.find(r => r.id === chapDocId && r.level === "chapter");
        if (found) {
          meta[key] = {
            categoryNorm: found.categoryNorm,
            order: found.order,
            name: found.name,
          };
        } else {
          missing.add(chapDocId);
        }
      }
    }
    return missing;
  }

  function ensureTopicMeta(rows, meta) {
    const missing = new Set();
    for (const it of rows) {
      if (it.level === "chapter") continue;
      const key = tpKey(it);
      if (!meta[key]) {
        const [section, tid] = key.split("__");
        const topicDocId = `${section}__${tid}`;
        const found = rows.find(r => r.id === topicDocId && r.level === "topic");
        if (found) {
          meta[key] = {
            categoryNorm: found.categoryNorm,
            order: found.order,
            name: found.name,
          };
        } else {
          missing.add(topicDocId);
        }
      }
    }
    return missing;
  }

  async function fetchMissingMeta(missingIds, meta) {
    if (!missingIds.size) return;
    await Promise.all(
      Array.from(missingIds).map(async (fullId) => {
        const ref = doc(db, "study_items", fullId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          meta[fullId] = {
            categoryNorm: data.categoryNorm || "good",
            order: data.order ?? 9999,
            name: data.name || "",
          };
        } else {
          meta[fullId] = { categoryNorm: "good", order: 9999 };
        }
      })
    );
  }

  // Build the strict order list by grouping then sorting groups
  function buildStrictOrder(rows, cMeta, tMeta) {
    // 1) Filter out chapter nodes; we schedule topics & subtopics
    const items = rows.filter(r => r.level !== "chapter");

    // 2) Group by Section → Chapter
    const chapterGroups = new Map(); // key = `${section}__${chapterId}` -> array of items
    for (const it of items) {
      const key = chKey(it);
      if (!chapterGroups.has(key)) chapterGroups.set(key, []);
      chapterGroups.get(key).push(it);
    }

    // 3) Sort chapter groups by (chapter.category desc, chapter.order asc, section asc)
    const sortedChapterKeys = Array.from(chapterGroups.keys()).sort((A, B) => {
    // Keys look like "Breast__1", "Breast__2", "Cardiovascular__1", etc.
    const [sectionA, chapA] = A.split("__");
    const [sectionB, chapB] = B.split("__");

    // NEW: within the SAME section, force chapter "1" to be first
    if (sectionA === sectionB) {
        const isAFirst = chapA === "1";
        const isBFirst = chapB === "1";
        if (isAFirst !== isBFirst) return isAFirst ? -1 : 1; // put "1" before anything else
    }

  // Existing logic: category (must>good>nice), then chapter.order (asc)
    const ca = cMeta[A] || {};
    const cb = cMeta[B] || {};
    const ra = CH_CAT[ca.categoryNorm] ?? 0;
    const rb = CH_CAT[cb.categoryNorm] ?? 0;
    if (ra !== rb) return rb - ra;

    const oa = Number(ca.order ?? 9999);
    const ob = Number(cb.order ?? 9999);
    if (oa !== ob) return oa - ob;

    return A.localeCompare(B); // deterministic tie-breaker
    });

    // 4) For each chapter, group by topic, sort topics, then flatten topic then its subtopics (by subtopic.order)
    const result = [];
    for (const cKey of sortedChapterKeys) {
      const itemsInChapter = chapterGroups.get(cKey) || [];

      // 4a) group by topic
      const topicGroups = new Map(); // key = `${section}__${topicId}`
      for (const it of itemsInChapter) {
        const key = tpKey(it);
        if (!topicGroups.has(key)) topicGroups.set(key, []);
        topicGroups.get(key).push(it);
      }

      // 4b) sort topics: INTRO (order==1) first, then topic.category (must>good>nice), then topic.order
      const sortedTopicKeys = Array.from(topicGroups.keys()).sort((A, B) => {
        const ta = tMeta[A] || {};
        const tb = tMeta[B] || {};

      // Helper: is the topic an "intro"?
      // We check (a) order === 1, or (b) topicId ends with ".1", or (c) name contains "intro"
        const topicIdA = A.split("__")[1] || "";
        const topicIdB = B.split("__")[1] || "";
        const isIntroA =
            Number(ta.order) === 1 ||
            topicIdA.split(".")[1] === "1" ||
            String(ta.name || "").toLowerCase().includes("intro");
        const isIntroB =
            Number(tb.order) === 1 ||
            topicIdB.split(".")[1] === "1" ||
            String(tb.name || "").toLowerCase().includes("intro");

        // NEW RULE: Intro first inside the chapter
        if (isIntroA !== isIntroB) return isIntroA ? -1 : 1;

        // Then by topic category (must > good > nice)
        const ra = TOP_CAT[ta.categoryNorm] ?? 0;
        const rb = TOP_CAT[tb.categoryNorm] ?? 0;
        if (ra !== rb) return rb - ra;

        // Then by topic.order (earlier first)
        const oa = Number(ta.order ?? 9999);
        const ob = Number(tb.order ?? 9999);
        if (oa !== ob) return oa - ob;

        // Deterministic fallback
        return A.localeCompare(B);
    });


      // 4c) inside each topic: topic first, then subtopics by subtopic.order asc
      for (const tKey of sortedTopicKeys) {
        const bunch = topicGroups.get(tKey) || [];
        const topicNode = bunch.find(x => x.level === "topic");
        const subNodes = bunch.filter(x => x.level === "subtopic")
                              .sort((a, b) => (Number(a.order ?? 9999) - Number(b.order ?? 9999)));

        if (topicNode) result.push(topicNode);
        result.push(...subNodes);
      }
    }

    return result;
    }

  // ---------- actions ----------
  async function generatePreview() {
    const res = {
      message: "Read-only preview (Phase 2). No writes to Firestore.",
      inputs: { start, end, dailyCap },
      flags,
      timestamp: new Date().toISOString(),
    };
    setPreview(res);
  }

  async function loadSuggestions() {
    setLoadingSuggestions(true);
    try {
      const base = collection(db, "study_items");
      const q = sectionFilter
        ? query(base, where("section", "==", sectionFilter), limit(Number(sampleSize)))
        : query(base, limit(Number(sampleSize)));

      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Build/complete meta
      const cMeta = { ...chapterMeta };
      const tMeta = { ...topicMeta };

      const missingCh = ensureChapterMeta(rows, cMeta);
      const missingTp = ensureTopicMeta(rows, tMeta);

      // Fetch any missing chapter/topic docs
      await fetchMissingMeta(missingCh, cMeta);
      await fetchMissingMeta(missingTp, tMeta);

      setChapterMeta(cMeta);
      setTopicMeta(tMeta);

      // Strict hierarchical build
      const ordered = buildStrictOrder(rows, cMeta, tMeta)
        .slice(0, 60); // cap for preview readability
      setRankedTop(ordered);
      setPackedDay(null);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  // Greedy pack under dailyCap using the already ordered list
  function packOneDay() {
    let remaining = Number(dailyCap) || 0;
    const chosen = [];
    for (const it of rankedTop) {
      const mins = Number(it.estimatedMinutes) || 0;
      if (mins <= remaining) {
        chosen.push(it);
        remaining -= mins;
      }
    }
    setPackedDay({
      total: (Number(dailyCap) || 0) - remaining,
      remaining,
      items: chosen.map((x) => ({
        id: x.id,
        name: x.name,
        section: x.section,
        minutes: x.estimatedMinutes,
        scoreFallback: computePriority(x),
        level: x.level,
        category: x.categoryNorm,
        chapterId: getChapterId(x),
        chapterCategory: (chapterMeta[chKey(x)] || {}).categoryNorm ?? null,
        chapterOrder: (chapterMeta[chKey(x)] || {}).order ?? null,
        topicId: tpKey(x).split("__")[1],
        topicCategory: (topicMeta[tpKey(x)] || {}).categoryNorm ?? null,
        topicOrder: (topicMeta[tpKey(x)] || {}).order ?? null,
        subtopicOrder: x.level === "subtopic" ? (x.order ?? null) : null,
      })),
    });
  }

  const canExportDoc = customPath && customPath.includes("/");
  const canExportCollection = Boolean(customPath);

  return (
    <div style={{ maxWidth: 980, margin: "24px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 4 }}>Planner Preview (Read-only)</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Sandbox to try ideas. Nothing here writes to Firestore.
      </p>

      {/* Inputs */}
      <div
        style={{
          display: "grid",
          gap: 12,
          marginTop: 16,
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        }}
      >
        <label>
          Start date
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            style={{ display: "block", marginTop: 4 }}
          />
        </label>
        <label>
          End date
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            style={{ display: "block", marginTop: 4 }}
          />
        </label>
        <label>
          Daily capacity (mins)
          <input
            type="number"
            value={dailyCap}
            onChange={(e) => setDailyCap(Number(e.target.value))}
            min={30}
            step={5}
            style={{ display: "block", marginTop: 4 }}
          />
        </label>
      </div>

      <button onClick={generatePreview} style={{ marginTop: 12 }}>
        Generate Preview
      </button>

      {preview && (
        <pre
          style={{
            marginTop: 12,
            background: "#f7f7f7",
            padding: 12,
            borderRadius: 8,
            overflowX: "auto",
          }}
        >
          {JSON.stringify(preview, null, 2)}
        </pre>
      )}

      {/* Suggestions */}
      <hr style={{ margin: "24px 0" }} />
      <h2>Suggestions (read-only, strict hierarchy)</h2>
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        }}
      >
        <label>
          Filter by section (optional)
          <input
            type="text"
            placeholder='e.g. "Breast" (leave blank = all)'
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            style={{ display: "block", marginTop: 4 }}
          />
        </label>
        <label>
          Sample size
          <input
            type="number"
            min={100}
            max={1000}
            step={50}
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
            style={{ display: "block", marginTop: 4 }}
          />
        </label>
        <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
          <button onClick={loadSuggestions} disabled={loadingSuggestions}>
            {loadingSuggestions ? "Loading…" : "Load Suggestions"}
          </button>
          <button onClick={packOneDay} disabled={!rankedTop.length}>
            Pack One Day
          </button>
        </div>
      </div>

      {!!rankedTop.length && (
        <>
          <h3 style={{ marginTop: 16 }}>
            Top (chapter → topic → subtopic, showing {rankedTop.length})
          </h3>
          <pre
            style={{
              background: "#f6f6f6",
              padding: 12,
              borderRadius: 8,
              overflowX: "auto",
            }}
          >
            {JSON.stringify(
              rankedTop.map((x) => ({
                id: x.id,
                name: x.name,
                section: x.section,
                level: x.level,
                minutes: x.estimatedMinutes,
                chapterId: getChapterId(x),
                chapterCategory: (chapterMeta[chKey(x)] || {}).categoryNorm ?? null,
                chapterOrder: (chapterMeta[chKey(x)] || {}).order ?? null,
                topicId: tpKey(x).split("__")[1],
                topicCategory: (topicMeta[tpKey(x)] || {}).categoryNorm ?? null,
                topicOrder: (topicMeta[tpKey(x)] || {}).order ?? null,
                subtopicOrder: x.level === "subtopic" ? (x.order ?? null) : null,
              })),
              null,
              2
            )}
          </pre>
        </>
      )}

      {packedDay && (
        <>
          <h3 style={{ marginTop: 16 }}>
            Packed Day (greedy under {dailyCap} mins)
          </h3>
          <pre
            style={{
              background: "#eef7ff",
              padding: 12,
              borderRadius: 8,
              overflowX: "auto",
            }}
          >
            {JSON.stringify(packedDay, null, 2)}
          </pre>
        </>
      )}

      {/* Export / Backup */}
      <hr style={{ margin: "24px 0" }} />
      <h3 style={{ marginBottom: 8 }}>Backup / Export (JSON)</h3>
      <p style={{ color: "#666", marginTop: 0 }}>
        Downloads a JSON file locally (still read-only).
      </p>

      <div style={{ display: "grid", gap: 8, maxWidth: 680, marginTop: 8 }}>
        <label>
          Firestore path to export (doc or collection)
          <input
            type="text"
            placeholder="e.g. plans/USER_ID  or  plans/USER_ID/weeks"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            style={{ display: "block", marginTop: 4, width: "100%" }}
          />
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => exportDocumentJSON(customPath)} disabled={!canExportDoc}>
            Export Document
          </button>
          <button onClick={() => exportCollectionJSON(customPath)} disabled={!canExportCollection}>
            Export Collection
          </button>
        </div>

        <small style={{ color: "#999" }}>
          Tip: Try <code>plans/&lt;uid&gt;</code>. If you store per week, use{" "}
          <code>plans/&lt;uid&gt;/weeks</code>.
        </small>
      </div>

      <p style={{ fontSize: 12, color: "#999", marginTop: 16 }}>
        Phase 2: This screen never writes to Firestore.
      </p>
    </div>
  );
}
