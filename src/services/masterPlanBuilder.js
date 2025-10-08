// src/services/masterPlanBuilder.js
//
// Master Queue builder with intended interleaving order:
//   Category layers: must -> good -> nice -> other
//   For each category layer: iterate sections in wizard order (then append unknown sections alphabetically)
//   Within each (category, section): chapter number/order -> topic.order -> topicName
//
// Also:
//   - Precompute subtopics (sorted) and minutes
//   - Write scheduler-friendly fields: queueState, scheduledDates, sortKey, subtopics, subtopicMinutesSum, scheduledMinutes
//   - Write master/meta for reporting
//
// Exports:
//   - listSections()
//   - buildAndSaveMasterPlan(uid, { sectionPrefs, forceRebuild })
//   - ensureMasterPlan(uid, { sectionPrefs })
//   - forceRebuildMasterPlan(uid, { sectionPrefs })

import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";

/* ------------------------------ Utils ------------------------------ */

const NUM = (n, d = 0) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : d;
};

const pad5 = (n) => String(n).padStart(5, "0");

const normalizeCat = (cat) => {
  const s = String(cat || "").toLowerCase();
  if (s === "must") return "must";
  if (s === "good") return "good";
  if (s === "nice") return "nice";
  return "other";
};

const parseNumLike = (x) => {
  const n = Number(String(x || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const normalizeSection = (section) => String(section || "").trim();

const chapterKey = (section, chapterId) =>
  `${normalizeSection(section)}__${String(chapterId || "")}`;

const topicKey = (section, topicId) =>
  `${normalizeSection(section)}__${String(topicId || "")}`;

/* ------------------------------ Study items load ----------------------------- */

async function loadStudyItems() {
  const coll = collection(db, "study_items");

  // chapters
  const chapSnap = await getDocs(query(coll, where("level", "==", "chapter")));
  const chapters = [];
  chapSnap.forEach((s) => {
    const d = s.data() || {};
    const section = normalizeSection(d.section);
    chapters.push({
      _id: s.id,
      section,
      chapterId: String(d.itemId || ""),
      chapterName: String(d.name || ""),
      chapterOrder: typeof d.order === "number" ? d.order : 9999,
      categoryNorm: d.categoryNorm || "", // must|good|nice
    });
  });

  // topics
  const topicSnap = await getDocs(query(coll, where("level", "==", "topic")));
  const topics = [];
  topicSnap.forEach((s) => {
    const d = s.data() || {};
    const section = normalizeSection(d.section);
    topics.push({
      _id: s.id,
      section,
      chapterId: String(d.parentId || ""),
      topicId: String(d.itemId || ""),
      topicName: String(d.name || "Topic"),
      topicOrder: typeof d.order === "number" ? d.order : 9999,
      estimatedMinutes: NUM(d.estimatedMinutes, 0),
      topicCategoryNorm: d.categoryNorm || "", // fallback if chapter missing
      path: Array.isArray(d.path) ? d.path : [],
    });
  });

  // subtopics
  const subSnap = await getDocs(query(coll, where("level", "==", "subtopic")));
  const subtopics = [];
  subSnap.forEach((s) => {
    const d = s.data() || {};
    const section = normalizeSection(d.section);
    subtopics.push({
      _id: s.id,
      section,
      parentTopicId: String(d.parentId || ""),
      itemId: String(d.itemId || ""),
      name: String(d.name || "Subtopic"),
      minutes: NUM(d.estimatedMinutes, 0),
      order: typeof d.order === "number" ? d.order : 9999,
    });
  });

  return { chapters, topics, subtopics };
}

/* ------------------------------ Public helper ------------------------------- */
/**
 * Returns unique section names from study_items (based on topics).
 * Used by the Setup Wizard to present a draggable section list.
 */
export async function listSections() {
  const coll = collection(db, "study_items");
  const snap = await getDocs(query(coll, where("level", "==", "topic")));
  const set = new Set();
  snap.forEach((s) => {
    const d = s.data() || {};
    const sec = normalizeSection(d.section);
    if (sec) set.add(sec);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/* ------------------------------ Ordering helpers ---------------------------- */

function buildSectionOrder(allSections, sectionPrefs) {
  const normalizedAll = allSections
    .map((s) => normalizeSection(s))
    .filter(Boolean);
  const prefsRaw = Array.isArray(sectionPrefs) ? sectionPrefs : [];
  const prefs = [];
  const seen = new Set();

  for (const item of prefsRaw) {
    const norm = normalizeSection(item);
    if (!norm || seen.has(norm)) continue;
    prefs.push(norm);
    seen.add(norm);
  }

  const unknown = normalizedAll
    .filter((s) => !seen.has(s))
    .sort((a, b) => a.localeCompare(b));
  return [...prefs, ...unknown];
}

function resolveChapterMeta(
  chaptersByKey,
  section,
  chapterId,
  fallbackNameFromPath,
) {
  const sectionNorm = normalizeSection(section);
  const key = chapterKey(sectionNorm, chapterId);
  const ch = chaptersByKey.get(key);
  if (ch) return ch;
  return {
    section: sectionNorm,
    chapterId: String(chapterId || ""),
    chapterName: fallbackNameFromPath || `Chapter ${chapterId}`,
    chapterOrder: 9999,
    categoryNorm: "",
  };
}

/* ------------------------------ Main build step ----------------------------- */

export async function buildAndSaveMasterPlan(uid, opts = {}) {
  if (!uid) throw new Error("buildAndSaveMasterPlan: missing uid");
  const {
    sectionPrefs = [],
    forceRebuild = true,
    disabledSections = [],
    onlyMustChapters = false,
  } = opts;
  const disabledSet = new Set(
    (Array.isArray(disabledSections) ? disabledSections : [])
      .map((value) => normalizeSection(value))
      .filter(Boolean),
  );
  const isSectionDisabled = (section) =>
    disabledSet.has(normalizeSection(section));

  // 1) Load study items
  const { chapters, topics, subtopics } = await loadStudyItems();

  // 2) Index chapters & subtopics
  const chaptersByKey = new Map(); // `${section}__${chapterId}` -> chapter meta
  chapters.forEach((c) => {
    chaptersByKey.set(chapterKey(c.section, c.chapterId), c);
  });

  const subsByTopic = new Map(); // section/topic -> [subtopic]
  subtopics.forEach((s) => {
    const key = topicKey(s.section, s.parentTopicId);
    const arr = subsByTopic.get(key) || [];
    arr.push(s);
    subsByTopic.set(key, arr);

    if (!normalizeSection(s.section)) {
      const fallbackKey = topicKey("", s.parentTopicId);
      const fallbackArr = subsByTopic.get(fallbackKey) || [];
      fallbackArr.push(s);
      subsByTopic.set(fallbackKey, fallbackArr);
    }
  });
  // sort subtopics by 'order', then name; assign stable subIdx
  for (const arr of subsByTopic.values()) {
    arr.sort((a, b) => {
      const orderDiff = (a.order ?? 9999) - (b.order ?? 9999);
      if (orderDiff !== 0) return orderDiff;

      const idA = parseNumLike(a.itemId);
      const idB = parseNumLike(b.itemId);
      if (idA != null && idB != null && idA !== idB) return idA - idB;

      const idCompare = String(a.itemId || "").localeCompare(
        String(b.itemId || ""),
      );
      if (idCompare !== 0) return idCompare;

      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    arr.forEach((s, i) => (s.subIdx = i));
  }

  // 3) Compose topic rows with chapter meta and derived sort keys
  //    Also compute normalized categories for interleaving.
  let rowsRaw = topics.map((t) => {
    const section = normalizeSection(t.section);
    const chFromPath = Array.isArray(t.path) ? String(t.path[1] || "") : "";
    const ch = resolveChapterMeta(
      chaptersByKey,
      section,
      t.chapterId,
      chFromPath,
    );

    const chapterNum = parseNumLike(t.chapterId);
    const chapterRank =
      chapterNum != null
        ? chapterNum
        : typeof ch.chapterOrder === "number"
          ? ch.chapterOrder
          : 9999;

    const chapterCategory = normalizeCat(ch.categoryNorm || "");
    const topicCategory = normalizeCat(
      t.topicCategoryNorm || ch.categoryNorm || "",
    );
    const bandCategory =
      chapterCategory !== "other" ? chapterCategory : topicCategory;

    const scopedKey = topicKey(section, t.topicId);
    const subsSource =
      subsByTopic.get(scopedKey) ||
      subsByTopic.get(topicKey("", t.topicId)) ||
      [];
    const subs = subsSource.map((s) => ({
      subIdx: s.subIdx,
      itemId: s.itemId,
      name: s.name,
      minutes: NUM(s.minutes, 0),
    }));
    let subtopicList = subs;
    let subtopicMinutesSum = subtopicList.reduce(
      (sum, s) => sum + NUM(s.minutes, 0),
      0,
    );

    const topicMinutesBase = NUM(t.estimatedMinutes, 0);
    if (!subtopicList.length && topicMinutesBase > 0) {
      subtopicList = [
        {
          subIdx: 0,
          itemId: `${t.topicId}::synthetic`,
          name: t.topicName,
          minutes: topicMinutesBase,
        },
      ];
      subtopicMinutesSum = topicMinutesBase;
    }

    const topicMinutes =
      subtopicMinutesSum > 0
        ? Math.max(subtopicMinutesSum, topicMinutesBase)
        : topicMinutesBase;

    return {
      section,
      chapterId: String(t.chapterId || ""),
      chapterName: ch.chapterName || chFromPath || `Chapter ${t.chapterId}`,
      chapterRank,
      chapterCategory,
      topicCategory,
      bandCategory,
      topicId: t.topicId,
      topicName: t.topicName,
      topicOrder: typeof t.topicOrder === "number" ? t.topicOrder : 9999,
      minutes: topicMinutes,
      subtopics: subtopicList,
      subtopicMinutesSum,
    };
  });

  const restrictToMust = !!onlyMustChapters;
  if (restrictToMust) {
    rowsRaw = rowsRaw.filter((row) => row.bandCategory === "must");
  }

  // 4) Interleaving build:
  //    category bands in order, within each band iterate sections in wizard order,
  //    within (category, section) group by chapter (respecting chapter rank) and then order topics.
  const allSections = Array.from(new Set(rowsRaw.map((r) => r.section))).sort(
    (a, b) => a.localeCompare(b),
  );
  let sectionsOrdered = buildSectionOrder(allSections, sectionPrefs);
  if (disabledSet.size) {
    sectionsOrdered = sectionsOrdered.filter(
      (section) => !isSectionDisabled(section),
    );
  }
  const catOrder = restrictToMust
    ? ["must"]
    : ["must", "good", "nice", "other"];
  const catRank = (cat) => {
    const idx = catOrder.indexOf(cat);
    return idx >= 0 ? idx : catOrder.length;
  };
  const isIntroTopic = (row) => {
    if (row.topicOrder === 1) return true;
    const name = String(row.topicName || "")
      .trim()
      .toLowerCase();
    return name === "introduction" || name.startsWith("introduction ");
  };

  const rowsByCat = new Map();
  for (const row of rowsRaw) {
    const cat = row.bandCategory || "other";
    if (!rowsByCat.has(cat)) {
      rowsByCat.set(cat, new Map());
    }
    const secMap = rowsByCat.get(cat);
    const secKey = row.section || "";
    if (!secMap.has(secKey)) {
      secMap.set(secKey, new Map());
    }
    const chapterMap = secMap.get(secKey);
    const scopedChapterKey = chapterKey(secKey, row.chapterId);
    if (!chapterMap.has(scopedChapterKey)) {
      chapterMap.set(scopedChapterKey, {
        chapterId: row.chapterId,
        chapterName: row.chapterName,
        chapterRank: row.chapterRank,
        chapterCategory: row.chapterCategory,
        rows: [],
      });
    }
    chapterMap.get(scopedChapterKey).rows.push(row);
  }

  const rows = [];
  for (const cat of catOrder) {
    const secMap = rowsByCat.get(cat);
    if (!secMap) continue;

    const seenSections = new Set();

    for (const sec of sectionsOrdered) {
      if (isSectionDisabled(sec)) continue;
      const chapterMap = secMap.get(sec);
      if (!chapterMap) continue;
      seenSections.add(sec);

      const chapters = Array.from(chapterMap.values()).sort((a, b) => {
        if (a.chapterRank !== b.chapterRank)
          return a.chapterRank - b.chapterRank;
        return String(a.chapterName || "").localeCompare(
          String(b.chapterName || ""),
        );
      });

      for (const chapter of chapters) {
        const orderedTopics = chapter.rows.slice().sort((a, b) => {
          const introA = isIntroTopic(a);
          const introB = isIntroTopic(b);
          if (introA !== introB) return introA ? -1 : 1;

          const catDiff = catRank(a.topicCategory) - catRank(b.topicCategory);
          if (catDiff !== 0) return catDiff;

          if (a.topicOrder !== b.topicOrder) return a.topicOrder - b.topicOrder;
          return String(a.topicName || "").localeCompare(
            String(b.topicName || ""),
          );
        });

        rows.push(...orderedTopics);
      }
    }

    for (const [sec, chapterMap] of secMap.entries()) {
      if (isSectionDisabled(sec)) continue;
      if (seenSections.has(sec)) continue;

      const chapters = Array.from(chapterMap.values()).sort((a, b) => {
        if (a.chapterRank !== b.chapterRank)
          return a.chapterRank - b.chapterRank;
        return String(a.chapterName || "").localeCompare(
          String(b.chapterName || ""),
        );
      });

      for (const chapter of chapters) {
        const orderedTopics = chapter.rows.slice().sort((a, b) => {
          const introA = isIntroTopic(a);
          const introB = isIntroTopic(b);
          if (introA !== introB) return introA ? -1 : 1;

          const catDiff = catRank(a.topicCategory) - catRank(b.topicCategory);
          if (catDiff !== 0) return catDiff;

          if (a.topicOrder !== b.topicOrder) return a.topicOrder - b.topicOrder;
          return String(a.topicName || "").localeCompare(
            String(b.topicName || ""),
          );
        });

        rows.push(...orderedTopics);
      }
    }
  }

  // 5) Delete existing queue when forceRebuild=true; otherwise skip if exists
  const mqColRef = collection(db, "plans", uid, "masterQueue");
  if (forceRebuild) {
    const existing = await getDocs(query(mqColRef, orderBy("seq", "asc")));
    if (!existing.empty) {
      const toDelete = [];
      existing.forEach((s) => toDelete.push(s.id));
      while (toDelete.length) {
        const batch = writeBatch(db);
        for (let i = 0; i < 400 && toDelete.length; i++) {
          const id = toDelete.shift();
          batch.delete(doc(db, "plans", uid, "masterQueue", id));
        }
        await batch.commit();
      }
    }
  } else {
    const existing = await getDocs(query(mqColRef, orderBy("seq", "asc")));
    if (!existing.empty) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[masterPlanBuilder] Queue exists; skipping build.");
      }
      return { totalTopics: 0, totalMinutes: 0 };
    }
  }

  // 6) Write new queue docs with all scheduler fields
  let i = 1;
  let totalMinutes = 0;
  const batchSize = 400;
  let batch = writeBatch(db);
  let batchCount = 0;

  for (const row of rows) {
    const seq = pad5(i);
    const ref = doc(db, "plans", uid, "masterQueue", seq);
    totalMinutes += NUM(row.minutes, 0);

    const docBody = {
      // ordering & identity
      seq,
      sortKey: i, // explicit numeric order
      section: row.section,
      chapterId: row.chapterId,
      chapterName: row.chapterName,
      topicId: row.topicId,
      topicName: row.topicName,

      // minutes
      minutes: NUM(row.minutes, 0),
      subtopics: row.subtopics, // [{subIdx,itemId,name,minutes}]
      subtopicMinutesSum: NUM(row.subtopicMinutesSum, 0),
      scheduledMinutes: 0,
      completedSubIdx: [],
      completedMinutes: 0,
      completedAt: "",

      // scheduler state
      queueState: "queued", // "queued" | "inProgress" | "removed" | "done"
      scheduledDates: {}, // iso -> [subIdx]
      status: "pending",

      createdAt: new Date().toISOString(),
    };

    batch.set(ref, docBody);
    batchCount++;
    i++;

    if (batchCount >= batchSize) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  // 7) Write master meta for reporting/summary
  const metaRef = doc(db, "plans", uid, "master", "meta");
  const bySection = {};
  rows.forEach((r) => {
    bySection[r.section] = bySection[r.section] || { minutes: 0, topics: 0 };
    bySection[r.section].minutes += NUM(r.minutes, 0);
    bySection[r.section].topics += 1;
  });

  await setDoc(
    metaRef,
    {
      strategyVersion: "v5-interleave-by-category-and-section",
      sectionPrefs: Array.isArray(sectionPrefs) ? sectionPrefs : [],
      totals: {
        topics: rows.length,
        minutes: totalMinutes,
      },
      bySection,
      builtAtISO: new Date().toISOString(),
    },
    { merge: true },
  );

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[masterPlanBuilder] Built ${rows.length} topics, ${totalMinutes} minutes; sections=${JSON.stringify(
        sectionsOrdered,
      )}; disabled=${JSON.stringify(Array.from(disabledSet))}; scope=${
        restrictToMust ? "must-only" : "full"
      }.`,
    );
  }

  return { totalTopics: rows.length, totalMinutes };
}

/* ------------------------------ Convenience APIs ---------------------------- */

export async function ensureMasterPlan(
  uid,
  { sectionPrefs = [], disabledSections = [], onlyMustChapters = false } = {},
) {
  if (!uid) throw new Error("ensureMasterPlan: missing uid");
  const mqColRef = collection(db, "plans", uid, "masterQueue");
  const snap = await getDocs(query(mqColRef, orderBy("seq", "asc")));
  if (!snap.empty) return { built: false };
  const res = await buildAndSaveMasterPlan(uid, {
    sectionPrefs,
    disabledSections,
    onlyMustChapters,
    forceRebuild: false,
  });
  return { built: true, ...res };
}

export async function forceRebuildMasterPlan(
  uid,
  { sectionPrefs = [], disabledSections = [], onlyMustChapters = false } = {},
) {
  return await buildAndSaveMasterPlan(uid, {
    sectionPrefs,
    disabledSections,
    onlyMustChapters,
    forceRebuild: true,
  });
}
