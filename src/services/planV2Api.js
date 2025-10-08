// src/services/planV2Api.js
// RadMentor Plan v2 API - Firestore helpers for Plan/Queue/Week
//
// Data layout (current):
//   plans/{uid}                         -> { startDate, examDate, dailyMinutes, currentDayISO? }
//   plans/{uid}/masterQueue/{seq}       -> topic queue entries (padded string ids "00001", ...)
//   plans/{uid}/weeks/{weekKey}         -> one doc per week, keyed by Mon ISO "YYYY-MM-DD"
//        { dayCaps: {iso:number}, offDays:{iso:boolean}, assigned:{iso:Slice[]}, doneDays:{iso:true} }
//
// Queue doc minimal fields:
//   { seq, sortKey, section, chapterId, chapterName, topicId, topicName,
//     minutes, subtopics:[{subIdx,itemId,name,minutes}], subtopicMinutesSum,
//     queueState:"queued"|"inProgress"|"removed"|"done",
//     scheduledDates: { [iso]: number[] }  // list of subIdx scheduled per day
//   }
//
// Slice shape used in week.assigned[*]:
//   { seq, section, chapterId, chapterName, topicId, title, subIdx, subId, subName, minutes }
//
// NOTE: Transactions are used where cross-doc consistency matters.

import { db } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

/* ----------------------------- small helpers ----------------------------- */

export function NUM(n, d = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : d;
}

export function toDateKey(d) {
  const x = d instanceof Date ? new Date(d) : new Date(String(d));
  x.setHours(0, 0, 0, 0);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const da = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export function weekKeyFromDate(dateLike) {
  // Sunday as start of week
  const d = new Date(dateLike ? new Date(dateLike) : new Date());
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 Sun..6 Sat
  d.setDate(d.getDate() - dow); // back to Sunday
  return toDateKey(d);
}

async function deleteCollectionDocs(colRef) {
  const snap = await getDocs(colRef);
  if (snap.empty) return;
  let batch = writeBatch(db);
  let count = 0;
  for (const docSnap of snap.docs) {
    batch.delete(docSnap.ref);
    count += 1;
    if (count >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }
  if (count > 0) {
    await batch.commit();
  }
}

export async function resetPlanData(uid) {
  if (!uid) throw new Error("resetPlanData: missing uid");
  const planRef = doc(db, "plans", uid);

  await deleteCollectionDocs(collection(planRef, "weeks"));
  await deleteCollectionDocs(collection(planRef, "masterQueue"));

  await setDoc(
    planRef,
    {
      hasCompletedSetup: false,
      startDate: "",
      examDate: "",
      dailyMinutes: 0,
      currentDayISO: "",
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

export async function markStudyItemsCompleted(itemIds = []) {
  const unique = Array.from(
    new Set(
      (Array.isArray(itemIds) ? itemIds : [])
        .map((value) => (value == null ? "" : String(value).trim()))
        .filter((value) => value.length > 0),
    ),
  );
  if (!unique.length) return 0;

  const batch = writeBatch(db);
  const timestamp = new Date().toISOString();
  unique.forEach((itemId) => {
    const ref = doc(db, "study_items", itemId);
    batch.set(
      ref,
      { status: "completed", updatedAt: timestamp },
      { merge: true },
    );
  });
  await batch.commit();
  return unique.length;
}

export function collectScheduledItemIds(
  assignments = [],
  includeTopicIds = true,
) {
  if (!Array.isArray(assignments)) return [];
  const out = [];
  assignments.forEach((slice) => {
    const subId = slice?.subId ? String(slice.subId).trim() : "";
    const topicId = slice?.topicId ? String(slice.topicId).trim() : "";
    if (subId) {
      out.push(subId);
    } else if (includeTopicIds && topicId) {
      out.push(topicId);
    }
  });
  return out;
}

function buildAlreadySet(topicDoc = {}) {
  const scheduled = Object.values(topicDoc?.scheduledDates || {});
  const out = new Set();
  scheduled.forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((value) => {
      const num = Number(value);
      if (Number.isFinite(num)) {
        out.add(num);
      }
    });
  });

  const completed = Array.isArray(topicDoc?.completedSubIdx)
    ? topicDoc.completedSubIdx
    : [];
  completed.forEach((value) => {
    const num = Number(value);
    if (Number.isFinite(num)) {
      out.add(num);
    }
  });

  return out;
}

function calculateScheduledMinutes(topicDoc = {}, scheduledDates = {}) {
  const subs = Array.isArray(topicDoc?.subtopics) ? topicDoc.subtopics : [];
  let total = 0;
  Object.values(scheduledDates || {}).forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((value) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return;
      total += NUM(subs[num]?.minutes, 0);
    });
  });
  return total;
}

async function finalizeQueueAfterDayCompletion(uid, iso, dayAssignments) {
  if (!uid || iso == null) return;
  if (!Array.isArray(dayAssignments) || !dayAssignments.length) return;

  const isoKey = String(iso);
  const perSeq = new Map();
  dayAssignments.forEach((slice) => {
    const seqRaw = slice?.seq;
    if (seqRaw == null) return;
    const seqKey = String(seqRaw);
    const entry = perSeq.get(seqKey) || {
      subIdx: new Set(),
      markTopic: false,
    };
    const subIdx = Number(slice?.subIdx);
    if (Number.isFinite(subIdx)) {
      entry.subIdx.add(subIdx);
    } else if (slice?.topicId) {
      entry.markTopic = true;
    }
    perSeq.set(seqKey, entry);
  });

  if (!perSeq.size) return;

  await Promise.all(
    Array.from(perSeq.entries()).map(([seqKey, info]) =>
      runTransaction(db, async (tx) => {
        const ref = doc(db, "plans", uid, "masterQueue", seqKey);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const data = snap.data() || {};

        const scheduledDatesRaw = data.scheduledDates || {};
        const scheduledDates = {};
        Object.keys(scheduledDatesRaw).forEach((key) => {
          const list = scheduledDatesRaw[key];
          if (!Array.isArray(list)) return;
          const cleaned = list
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value));
          if (cleaned.length) {
            scheduledDates[key] = cleaned;
          }
        });

        if (info.subIdx.size) {
          const list = scheduledDates[isoKey] || [];
          const remaining = list.filter((idx) => !info.subIdx.has(Number(idx)));
          if (remaining.length) {
            scheduledDates[isoKey] = remaining;
          } else {
            delete scheduledDates[isoKey];
          }
        } else if (scheduledDates[isoKey]) {
          delete scheduledDates[isoKey];
        }

        const completedSet = new Set(
          Array.isArray(data.completedSubIdx)
            ? data.completedSubIdx
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value))
            : [],
        );

        const subs = Array.isArray(data.subtopics) ? data.subtopics : [];

        if (info.markTopic && subs.length) {
          subs.forEach((_sub, index) => completedSet.add(index));
        }

        info.subIdx.forEach((idx) => completedSet.add(idx));

        const completedSubIdx = Array.from(completedSet).sort((a, b) => a - b);

        const scheduledMinutes = calculateScheduledMinutes(
          data,
          scheduledDates,
        );
        const completedMinutes = completedSubIdx.reduce((sum, idx) => {
          return sum + NUM(subs[idx]?.minutes, 0);
        }, 0);

        const totalSubCount = subs.length;
        const hasScheduled = Object.values(scheduledDates).some(
          (list) => Array.isArray(list) && list.length > 0,
        );

        let queueState = data.queueState || "queued";
        if (totalSubCount === 0) {
          queueState = info.markTopic || !hasScheduled ? "done" : queueState;
        } else if (completedSubIdx.length >= totalSubCount) {
          queueState = "done";
        } else if (hasScheduled) {
          queueState = "inProgress";
        } else if (completedSubIdx.length > 0) {
          queueState = "inProgress";
        } else {
          queueState = "queued";
        }

        const timestamp = new Date().toISOString();
        const updatePayload = {
          scheduledDates,
          scheduledMinutes,
          completedSubIdx,
          completedMinutes,
          queueState,
          updatedAt: timestamp,
          completedAt: queueState === "done" ? timestamp : "",
        };

        tx.update(ref, updatePayload);
      }),
    ),
  );
}
export async function completeDayAndAdvance(uid, weekKey, iso) {
  if (!uid || !weekKey || !iso)
    throw new Error("completeDayAndAdvance: bad args");

  const weekRef = doc(db, "plans", uid, "weeks", weekKey);
  const weekSnap = await getDoc(weekRef);
  if (!weekSnap.exists()) throw new Error("Week not found");
  const weekDoc = weekSnap.data() || {};
  const dayAssignments = Array.isArray(weekDoc.assigned?.[iso])
    ? weekDoc.assigned[iso]
    : [];

  const itemIds = collectScheduledItemIds(dayAssignments);
  if (itemIds.length) {
    await markStudyItemsCompleted(itemIds);
  }

  await finalizeQueueAfterDayCompletion(uid, iso, dayAssignments);
  await updateDoc(weekRef, { [`doneDays.${iso}`]: true });

  const metaRef = doc(db, "plans", uid);
  const arr = weekDatesFromKey(weekKey);
  const idx = arr.indexOf(iso);
  let nextISO = iso;
  if (idx >= 0 && idx < 6) {
    nextISO = arr[idx + 1];
  } else if (idx === 6) {
    nextISO = nextWeekKey(weekKey);
  }
  await updateDoc(metaRef, {
    currentDayISO: nextISO,
    updatedAt: new Date().toISOString(),
  });

  return { nextISO, completedCount: itemIds.length };
}

export function weekDatesFromKey(weekKey) {
  const base = new Date(weekKey);
  base.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(base.getTime() + i * 86400000);
    out.push(toDateKey(dd));
  }
  return out;
}

export function nextWeekKey(weekKey) {
  const base = new Date(weekKey);
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + 7);
  return toDateKey(base);
}

export function minutesUsed(arr = []) {
  return arr.reduce((s, it) => s + NUM(it?.minutes, 0), 0);
}

/* ------------------------------- PLAN META ------------------------------- */

export async function loadPlanMeta(uid) {
  if (!uid) return null;
  const ref = doc(db, "plans", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() || null : null;
}

export async function loadMasterPlanMeta(uid) {
  if (!uid) throw new Error("loadMasterPlanMeta: missing uid");
  const ref = doc(db, "plans", uid, "master", "meta");
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() || null : null;
}

export async function loadSyllabusTotals() {
  const q = query(collection(db, "study_items"), where("level", "==", "chapter"));
  const snap = await getDocs(q);
  let minutes = 0;
  let chapters = 0;
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    minutes += NUM(data.estimatedMinutes, 0);
    chapters += 1;
  });
  return { minutes, chapters };
}

export async function savePlanMeta(uid, payload = {}) {
  if (!uid) throw new Error("savePlanMeta: missing uid");
  const ref = doc(db, "plans", uid);

  const data = {
    updatedAt: new Date().toISOString(),
  };

  if (Object.prototype.hasOwnProperty.call(payload, "startDate")) {
    const start = payload.startDate ? toDateKey(payload.startDate) : "";
    data.startDate = start;
    if (!Object.prototype.hasOwnProperty.call(payload, "currentDayISO")) {
      data.currentDayISO = start || "";
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "examDate")) {
    data.examDate = payload.examDate ? toDateKey(payload.examDate) : "";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "dailyMinutes")) {
    data.dailyMinutes = Math.max(0, NUM(payload.dailyMinutes, 0));
  }

  if (Object.prototype.hasOwnProperty.call(payload, "currentDayISO")) {
    data.currentDayISO = payload.currentDayISO
      ? toDateKey(payload.currentDayISO)
      : "";
  }

  if (
    Object.prototype.hasOwnProperty.call(payload, "sectionOrder") &&
    Array.isArray(payload.sectionOrder)
  ) {
    data.sectionOrder = payload.sectionOrder;
  }

  if (
    Object.prototype.hasOwnProperty.call(payload, "disabledSections") &&
    Array.isArray(payload.disabledSections)
  ) {
    const cleaned = Array.from(
      new Set(
        payload.disabledSections
          .map((value) => (value == null ? "" : String(value).trim()))
          .filter((value) => value.length > 0),
      ),
    );
    data.disabledSections = cleaned;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "strategy")) {
    data.strategy = payload.strategy ? String(payload.strategy) : "";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "recommendedDaily")) {
    const rec = NUM(payload.recommendedDaily, 0);
    data.recommendedDaily = rec > 0 ? rec : 0;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "onlyMustChapters")) {
    data.onlyMustChapters = !!payload.onlyMustChapters;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "hasCompletedSetup")) {
    data.hasCompletedSetup = !!payload.hasCompletedSetup;
  }

  await setDoc(ref, data, { merge: true });
}

export async function patchPlanMeta(uid, patchObj) {
  if (!uid) throw new Error("patchPlanMeta: missing uid");
  const ref = doc(db, "plans", uid);
  await updateDoc(ref, { ...patchObj, updatedAt: new Date().toISOString() });
}

/* ---------------------------- WEEKS (THIS WEEK) --------------------------- */

export async function loadOrInitWeek(uid, weekKey, defaultDailyMinutes = 90) {
  if (!uid || !weekKey) throw new Error("loadOrInitWeek: missing uid/weekKey");
  const ref = doc(db, "plans", uid, "weeks", weekKey);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  // initialize new
  const dates = weekDatesFromKey(weekKey);
  const dayCaps = {};
  const offDays = {};
  for (const iso of dates) {
    dayCaps[iso] = NUM(defaultDailyMinutes, 90);
    offDays[iso] = false;
  }
  const wk = { dayCaps, offDays, assigned: {}, doneDays: {} };
  await setDoc(ref, wk, { merge: true });
  return wk;
}

export async function patchWeek(uid, weekKey, patchObj) {
  if (!uid || !weekKey) throw new Error("patchWeek: missing uid/weekKey");
  const ref = doc(db, "plans", uid, "weeks", weekKey);
  await updateDoc(ref, patchObj);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/* --------------------------- MASTER QUEUE BUILDER -------------------------- */

/**
 * If the queue already has entries, NO-OP.
 * Otherwise build queue from study_items.
 */
export async function ensureMasterQueueBuilt(uid) {
  if (!uid) throw new Error("ensureMasterQueueBuilt: missing uid");
  const col = collection(db, "plans", uid, "masterQueue");
  const qs = await getDocs(query(col, limit(1)));
  if (!qs.empty) return;
  await buildMasterQueueFromStudyItems(uid);
}

/**
 * Build queue from study_items:
 * - topics (level='topic') become queue entries
 * - subtopics (level='subtopic') attached to their parent topic
 * - chapters (level='chapter') used for labels and ordering
 */
export async function buildMasterQueueFromStudyItems(uid) {
  const items = collection(db, "study_items");

  // topics
  const tSnap = await getDocs(query(items, where("level", "==", "topic")));
  const topics = [];
  tSnap.forEach((docSnap) => {
    const x = docSnap.data() || {};
    topics.push({
      id: docSnap.id,
      section: x.section || "",
      chapterId: String(x.parentId || ""),
      chapterNameFromPath: Array.isArray(x.path) ? String(x.path[1] || "") : "",
      topicId: String(x.itemId || ""),
      topicName: String(x.name || "Topic"),
      topicOrder: typeof x.order === "number" ? x.order : 9999,
      estMinutes: NUM(x.estimatedMinutes, 0),
    });
  });

  if (!topics.length) return;

  // chapters
  const cSnap = await getDocs(query(items, where("level", "==", "chapter")));
  const chapters = new Map(); // key `${section}__${chapterId}`
  cSnap.forEach((docSnap) => {
    const x = docSnap.data() || {};
    const key = `${x.section || ""}__${String(x.itemId || "")}`;
    chapters.set(key, {
      section: x.section || "",
      chapterId: String(x.itemId || ""),
      chapterName: String(x.name || ""),
      order: typeof x.order === "number" ? x.order : 9999,
    });
  });

  // subtopics -> group by parentId (topicId)
  const sSnap = await getDocs(query(items, where("level", "==", "subtopic")));
  const subsByTopic = new Map();
  sSnap.forEach((docSnap) => {
    const x = docSnap.data() || {};
    const parentTopicId = String(x.parentId || "");
    const arr = subsByTopic.get(parentTopicId) || [];
    arr.push({
      itemId: String(x.itemId || ""),
      name: String(x.name || "Subtopic"),
      minutes: NUM(x.estimatedMinutes, 0),
      order: typeof x.order === "number" ? x.order : 9999,
    });
    subsByTopic.set(parentTopicId, arr);
  });
  // sort subs by order and attach subIdx
  for (const arr of subsByTopic.values()) {
    arr.sort(
      (a, b) =>
        (a.order ?? 9999) - (b.order ?? 9999) || a.name.localeCompare(b.name),
    );
    arr.forEach((s, i) => (s.subIdx = i));
  }

  // order topics: section -> chapter.order -> topic.order -> topicName
  topics.sort((a, b) => {
    if (a.section !== b.section) return a.section.localeCompare(b.section);
    const ach = chapters.get(`${a.section}__${a.chapterId}`);
    const bch = chapters.get(`${b.section}__${b.chapterId}`);
    const aco = ach ? NUM(ach.order, 9999) : 9999;
    const bco = bch ? NUM(bch.order, 9999) : 9999;
    if (aco !== bco) return aco - bco;
    if (a.topicOrder !== b.topicOrder) return a.topicOrder - b.topicOrder;
    return a.topicName.localeCompare(b.topicName);
  });

  // write
  const batch = writeBatch(db);
  let i = 1;
  for (const t of topics) {
    const seq = String(i).padStart(5, "0");
    const ref = doc(db, "plans", uid, "masterQueue", seq);
    const subs = (subsByTopic.get(t.topicId) || []).map((s) => ({
      subIdx: s.subIdx,
      itemId: s.itemId,
      name: s.name,
      minutes: NUM(s.minutes, 0),
    }));
    const subsSum = subs.reduce((sum, s) => sum + NUM(s.minutes, 0), 0);
    const ch = chapters.get(`${t.section}__${t.chapterId}`);
    const chapterName = ch?.chapterName || t.chapterNameFromPath || "";
    const minutes = t.estMinutes > 0 ? t.estMinutes : subsSum;

    batch.set(ref, {
      seq,
      sortKey: i,
      section: t.section,
      chapterId: t.chapterId,
      chapterName,
      topicId: t.topicId,
      topicName: t.topicName,
      minutes,
      subtopics: subs,
      subtopicMinutesSum: subsSum,
      scheduledMinutes: 0,
      queueState: "queued",
      status: "pending",
      scheduledDates: {}, // iso -> [subIdx]
      createdAt: new Date().toISOString(),
    });
    i++;
  }
  await batch.commit();
}

/* --------------------------- MASTER QUEUE QUERIES -------------------------- */

async function getQueueOrdered(uid, filter) {
  const col = collection(db, "plans", uid, "masterQueue");
  let qs;
  try {
    qs = await getDocs(query(col, orderBy("sortKey", "asc")));
  } catch {
    qs = await getDocs(query(col, orderBy("seq", "asc")));
  }
  const rows = [];
  qs.forEach((snap) => {
    const d = snap.data() || {};
    if (filter === "removed" && d.queueState !== "removed") return;
    if (filter === "queued" && d.queueState !== "queued") return;
    if (filter === "inProgress") {
      const inProg =
        d.queueState === "inProgress" ||
        (d.scheduledDates && Object.keys(d.scheduledDates).length > 0);
      if (!inProg) return;
    }
    rows.push(d);
  });
  return rows;
}

/**
 * Sidebar tree, preserving run order within a single *appearance* of a section.
 * (Aggregates by section, GOOD for older UI; but merges duplicate sections.)
 */
export async function listMasterQueueRuns(uid, { filter = "queued" } = {}) {
  const rows = await getQueueOrdered(uid, filter);
  const out = [];

  // group rows as they appear: section -> chapter -> topic
  const lookup = new Map(); // section -> { chapters: Map(chapterId -> obj) }
  for (const r of rows) {
    const sec = r.section || "Section";
    if (!lookup.has(sec)) {
      lookup.set(sec, { section: sec, chapters: new Map() });
      out.push({ section: sec, chapters: [] });
    }
    const secObj = lookup.get(sec);

    const chKey = String(r.chapterId || "");
    if (!secObj.chapters.has(chKey)) {
      secObj.chapters.set(chKey, {
        chapterId: chKey,
        chapterName: r.chapterName || `Chapter ${chKey}`,
        topics: [],
      });
    }
    const chObj = secObj.chapters.get(chKey);
    chObj.topics.push({
      seq: r.seq,
      topicId: r.topicId,
      topicName: r.topicName,
      subtopics: Array.isArray(r.subtopics) ? r.subtopics : [],
      minutes: NUM(r.minutes, 0),
      scheduledDates: r.scheduledDates || {},
    });
  }

  // materialize chapter arrays preserving insertion
  for (const run of out) {
    const sec = lookup.get(run.section);
    run.chapters = Array.from(sec.chapters.values());
  }
  return out;
}

/**
 * NEW: Linear list of queue rows in *exact* master-queue order.
 * Use this when you want to render section/chapter *runs* (duplicates allowed).
 */
export async function listMasterQueueLinear(uid, { filter } = {}) {
  const rows = await getQueueOrdered(uid, filter);
  // pass through essential fields only
  return rows.map((d) => ({
    seq: d.seq,
    sortKey: d.sortKey,
    section: d.section,
    chapterId: d.chapterId,
    chapterName: d.chapterName,
    topicId: d.topicId,
    topicName: d.topicName,
    queueState: d.queueState || "queued",
    minutes: NUM(d.minutes, 0),
    subtopics: Array.isArray(d.subtopics) ? d.subtopics : [],
    subtopicMinutesSum: NUM(d.subtopicMinutesSum, 0),
    scheduledMinutes: NUM(d.scheduledMinutes, 0),
    scheduledDates: d.scheduledDates || {},
  }));
}

export async function searchMasterQueueTopics(uid) {
  if (!uid) throw new Error("searchMasterQueueTopics: missing uid");
  const rows = await listMasterQueueLinear(uid, { filter: undefined });
  return rows.map((d) => ({
    ...d,
    subtopics: Array.isArray(d.subtopics) ? d.subtopics : [],
  }));
}

export async function removeTopicFromQueue(uid, seq) {
  const ref = doc(db, "plans", uid, "masterQueue", String(seq));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Topic not found");
    const d = snap.data() || {};
    const sched = d.scheduledDates && Object.keys(d.scheduledDates).length > 0;
    if (sched || d.queueState === "inProgress") {
      throw new Error(
        "Cannot remove: topic is already scheduled or in progress",
      );
    }
    tx.update(ref, { queueState: "removed" });
  });
}

/* ------------------------- SCHEDULING / MOVEMENT -------------------------- */

function slicesForSubIdxes(topicDoc, subIdxes) {
  const subs = Array.isArray(topicDoc.subtopics) ? topicDoc.subtopics : [];
  return subIdxes.map((i) => {
    const s = subs[i] || {};
    return {
      seq: topicDoc.seq,
      section: topicDoc.section,
      chapterId: topicDoc.chapterId,
      chapterName: topicDoc.chapterName,
      topicId: topicDoc.topicId,
      title: topicDoc.topicName,
      subIdx: i,
      subId: s.itemId || "",
      subName: s.name || "Subtopic",
      minutes: NUM(s.minutes, 0),
    };
  });
}

async function loadWeekDoc(uid, iso) {
  const wkKey = weekKeyFromDate(iso);
  const ref = doc(db, "plans", uid, "weeks", wkKey);
  const snap = await getDoc(ref);
  return { ref, data: snap.exists() ? snap.data() || null : null, wkKey };
}

function remainingCapacity(weekDoc, iso) {
  const cap = NUM(weekDoc?.dayCaps?.[iso], 0);
  const used = minutesUsed(weekDoc?.assigned?.[iso] || []);
  const off = !!weekDoc?.offDays?.[iso];
  return off ? 0 : Math.max(0, cap - used);
}

/**
 * Schedule a topic's next subtopics into a day until capacity allows.
 * Returns { slices: Slice[] } (the ones newly scheduled).
 */
export async function scheduleTopicToDay(uid, iso, seq) {
  if (!uid || !iso || !seq) throw new Error("scheduleTopicToDay: bad args");

  const topicRef = doc(db, "plans", uid, "masterQueue", String(seq));
  const { ref: weekRef, data: weekDoc } = await loadWeekDoc(uid, iso);
  if (!weekDoc) throw new Error("Week not found");
  if (weekDoc.offDays?.[iso]) return { message: "Off day" };

  const capLeft = remainingCapacity(weekDoc, iso);
  if (capLeft <= 0) return { message: "No remaining capacity" };

  // transaction: compute missing subIdxes and write both week + topic
  const res = await runTransaction(db, async (tx) => {
    const tSnap = await tx.get(topicRef);
    const wSnap = await tx.get(weekRef);
    if (!tSnap.exists()) throw new Error("Topic not found");
    const topic = tSnap.data() || {};
    const wk = wSnap.data() || {};

    if (wk.offDays?.[iso]) return { message: "Off day" };

    const already = buildAlreadySet(topic);
    const subs = Array.isArray(topic.subtopics) ? topic.subtopics : [];
    const remainingIdxes = subs.map((_, i) => i).filter((i) => !already.has(i));

    if (!remainingIdxes.length) return { message: "Nothing remaining" };

    // fit as many as capacity permits
    const dayArr = Array.isArray(wk.assigned?.[iso])
      ? [...wk.assigned[iso]]
      : [];
    let cap = remainingCapacity(wk, iso);
    const picked = [];
    for (const subIdx of remainingIdxes) {
      const mins = NUM(subs[subIdx]?.minutes, 0);
      if (mins <= 0) continue;
      if (cap - mins < 0) break;
      cap -= mins;
      picked.push(subIdx);
    }
    if (!picked.length) return { message: "No remaining capacity" };

    const newSlices = slicesForSubIdxes(topic, picked);
    const assigned = { ...(wk.assigned || {}) };
    assigned[iso] = [...dayArr, ...newSlices];

    const scheduledDates = { ...(topic.scheduledDates || {}) };
    const forDay = Array.isArray(scheduledDates[iso])
      ? scheduledDates[iso]
      : [];
    scheduledDates[iso] = [...forDay, ...picked];

    tx.update(weekRef, { assigned });
    tx.update(topicRef, {
      scheduledDates,
      queueState: "inProgress",
      scheduledMinutes:
        NUM(topic.scheduledMinutes, 0) +
        newSlices.reduce((s, x) => s + NUM(x.minutes, 0), 0),
    });

    return { slices: newSlices };
  });

  return res;
}

/**
 * Schedule a single known subtopic index for a topic on a given day.
 * Returns { slice } when placed.
 */
export async function scheduleSubtopicToDay(uid, iso, seq, subIdx) {
  if (!uid || !iso || !seq || typeof subIdx !== "number")
    throw new Error("scheduleSubtopicToDay: bad args");

  const topicRef = doc(db, "plans", uid, "masterQueue", String(seq));
  const { ref: weekRef, data: weekDoc } = await loadWeekDoc(uid, iso);
  if (!weekDoc) throw new Error("Week not found");
  if (weekDoc.offDays?.[iso]) return { message: "Off day" };
  if (remainingCapacity(weekDoc, iso) <= 0)
    return { message: "No remaining capacity" };

  const res = await runTransaction(db, async (tx) => {
    const tSnap = await tx.get(topicRef);
    const wSnap = await tx.get(weekRef);
    if (!tSnap.exists()) throw new Error("Topic not found");
    const topic = tSnap.data() || {};
    const wk = wSnap.data() || {};

    const subs = Array.isArray(topic.subtopics) ? topic.subtopics : [];
    const sub = subs[subIdx];
    if (!sub) return { message: "Invalid subtopic index" };

    // already scheduled?
    const already = buildAlreadySet(topic);
    if (already.has(subIdx)) return { message: "Already scheduled" };

    const cap = remainingCapacity(wk, iso);
    if (cap < NUM(sub.minutes, 0)) return { message: "No remaining capacity" };

    const slice = slicesForSubIdxes(topic, [subIdx])[0];

    const assigned = { ...(wk.assigned || {}) };
    const dayArr = Array.isArray(assigned[iso]) ? assigned[iso] : [];
    assigned[iso] = [...dayArr, slice];

    const scheduledDates = { ...(topic.scheduledDates || {}) };
    const forDay = Array.isArray(scheduledDates[iso])
      ? scheduledDates[iso]
      : [];
    scheduledDates[iso] = [...forDay, subIdx];

    tx.update(weekRef, { assigned });
    tx.update(topicRef, {
      scheduledDates,
      queueState: "inProgress",
      scheduledMinutes: NUM(topic.scheduledMinutes, 0) + NUM(slice.minutes, 0),
    });

    return { slice };
  });

  return res;
}

/**
 * Move all slices of a topic from a given day forward to next days,
 * respecting daily capacity (may spill to next weeks).
 * Returns { moved: number }
 */
export async function moveTopicSlicesForward(uid, iso, seq) {
  if (!uid || !iso || !seq) throw new Error("moveTopicSlicesForward: bad args");

  // 1) Remove slices for (seq) from that day
  const { ref: weekRef, data: weekDoc, wkKey } = await loadWeekDoc(uid, iso);
  if (!weekDoc) return { moved: 0 };

  const meta = await loadPlanMeta(uid);
  const defaultDailyMinutes = NUM(meta?.dailyMinutes, 0) || 90;
  const dayArr = Array.isArray(weekDoc.assigned?.[iso])
    ? weekDoc.assigned[iso]
    : [];
  const toMove = dayArr.filter((s) => s.seq === seq);
  if (!toMove.length) return { moved: 0 };

  // update that day assigned
  const remain = dayArr.filter((s) => s.seq !== seq);
  await updateDoc(weekRef, { [`assigned.${iso}`]: remain });

  // 2) Append forward across future days/weeks
  let moved = 0;
  const topicRef = doc(db, "plans", uid, "masterQueue", String(seq));
  let topicSnap = await getDoc(topicRef);
  let topic = topicSnap.data() || {};

  // helper: place slices into (wkKey, iso) advancing as needed
  const placeMany = async (slices) => {
    let rest = [...slices];
    let wkKeyCur = wkKey;
    let dates = weekDatesFromKey(wkKeyCur);
    let idx = dates.indexOf(toDateKey(iso));
    if (idx < 0) idx = 0;

    while (rest.length) {
      // go to the next day after the source day
      idx++;
      if (idx >= dates.length) {
        // next week
        wkKeyCur = nextWeekKey(wkKeyCur);
        await loadOrInitWeek(uid, wkKeyCur, defaultDailyMinutes);
        dates = weekDatesFromKey(wkKeyCur);
        idx = 0;
      }
      const curIso = dates[idx];
      const { ref: wkRefCur, data: wkCur } = await loadWeekDoc(uid, curIso);
      if (!wkCur || wkCur.offDays?.[curIso]) continue;

      let cap = remainingCapacity(wkCur, curIso);
      if (cap <= 0) continue;

      const dayArrCur = Array.isArray(wkCur.assigned?.[curIso])
        ? wkCur.assigned[curIso]
        : [];
      const take = [];
      let used = 0;
      for (const sl of rest) {
        if (cap - NUM(sl.minutes, 0) < 0) break;
        take.push(sl);
        cap -= NUM(sl.minutes, 0);
        used += NUM(sl.minutes, 0);
      }
      if (!take.length) continue;

      // write day
      await updateDoc(wkRefCur, {
        [`assigned.${curIso}`]: [...dayArrCur, ...take],
      });

      // update topic scheduledDates for moved subIdxes
      const sched = { ...(topic.scheduledDates || {}) };
      const curArr = Array.isArray(sched[curIso]) ? sched[curIso] : [];
      const addIdx = take.map((s) => Number(s.subIdx));
      sched[curIso] = [...curArr, ...addIdx];

      await updateDoc(topicRef, {
        scheduledDates: sched,
        scheduledMinutes: NUM(topic.scheduledMinutes, 0) + used,
        queueState: "inProgress",
      });

      moved += take.length;
      rest = rest.slice(take.length);

      // refresh topic for next loop
      topicSnap = await getDoc(topicRef);
      topic = topicSnap.data() || {};
    }
  };

  await placeMany(toMove);

  // remove original day subIdxes from topic.scheduledDates[iso]
  const scheduledDates = { ...(topic.scheduledDates || {}) };
  const orig = Array.isArray(scheduledDates[iso]) ? scheduledDates[iso] : [];
  const movedIdx = new Set(toMove.map((s) => Number(s.subIdx)));
  const leftIdx = orig.filter((i) => !movedIdx.has(Number(i)));
  if (leftIdx.length) scheduledDates[iso] = leftIdx;
  else scheduledDates[iso] = [];

  await updateDoc(topicRef, { scheduledDates });

  return { moved };
}

/**
 * Unschedule topic slices from all scheduled dates and put back to end of queue.
 * Returns { removed: number }
 */
export async function unscheduleTopicReturnToQueue(uid, seq) {
  const topicRef = doc(db, "plans", uid, "masterQueue", String(seq));

  // Find new max sortKey (to push to end)
  const col = collection(db, "plans", uid, "masterQueue");
  let max = 0;
  const qs = await getDocs(query(col, orderBy("sortKey", "desc"), limit(1)));
  qs.forEach((s) => {
    const d = s.data() || {};
    max = Math.max(max, NUM(d.sortKey, 0));
  });

  // remove from all week docs listed in scheduledDates
  let removed = 0;
  await runTransaction(db, async (tx) => {
    const tSnap = await tx.get(topicRef);
    if (!tSnap.exists()) throw new Error("Topic not found");
    const t = tSnap.data() || {};
    const scheduled = t.scheduledDates || {};

    for (const iso of Object.keys(scheduled)) {
      const { ref: wkRef, data: wkDoc } = await (async () => {
        const wkKey = weekKeyFromDate(iso);
        const ref = doc(db, "plans", uid, "weeks", wkKey);
        const s = await tx.get(ref);
        return { ref, data: s.exists() ? s.data() || null : null };
      })();
      if (!wkDoc) continue;

      const arr = Array.isArray(wkDoc.assigned?.[iso])
        ? wkDoc.assigned[iso]
        : [];
      const remain = arr.filter((sl) => sl.seq !== seq);
      const patch = {};
      patch[`assigned.${iso}`] = remain;
      tx.update(wkRef, patch);

      removed += arr.length - remain.length;
    }

    tx.update(topicRef, {
      scheduledDates: {},
      scheduledMinutes: 0,
      queueState: "queued",
      sortKey: max + 1, // send to end (ordering uses sortKey asc)
      status: "pending",
    });
  });

  return { removed };
}

async function scheduleTopicSubIdxesBulk(uid, iso, seq, subIdxes) {
  if (!uid || !iso || !seq || !Array.isArray(subIdxes) || !subIdxes.length) {
    return { slices: [] };
  }

  const topicRef = doc(db, "plans", uid, "masterQueue", String(seq));
  const weekRef = doc(db, "plans", uid, "weeks", weekKeyFromDate(iso));
  const sorted = [...subIdxes]
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (!sorted.length) return { slices: [] };

  const res = await runTransaction(db, async (tx) => {
    const tSnap = await tx.get(topicRef);
    const wSnap = await tx.get(weekRef);
    if (!tSnap.exists()) throw new Error("Topic not found");
    const topic = tSnap.data() || {};
    const wk = wSnap.data() || {};

    if (wk.offDays?.[iso]) return { message: "Off day" };

    const subs = Array.isArray(topic.subtopics) ? topic.subtopics : [];
    const already = buildAlreadySet(topic);

    let cap = remainingCapacity(wk, iso);
    if (cap <= 0) return { message: "No remaining capacity" };

    const picked = [];
    let usedMinutes = 0;
    for (const subIdx of sorted) {
      if (already.has(subIdx)) continue;
      const mins = NUM(subs[subIdx]?.minutes, 0);
      if (mins <= 0) continue;
      if (cap - mins < 0) break;
      cap -= mins;
      usedMinutes += mins;
      picked.push(subIdx);
    }

    if (!picked.length) return { message: "No remaining capacity" };

    const slices = slicesForSubIdxes(topic, picked);
    const assigned = { ...(wk.assigned || {}) };
    const dayArr = Array.isArray(assigned[iso]) ? assigned[iso] : [];
    assigned[iso] = [...dayArr, ...slices];

    const scheduledDates = { ...(topic.scheduledDates || {}) };
    const forDay = Array.isArray(scheduledDates[iso])
      ? scheduledDates[iso]
      : [];
    scheduledDates[iso] = [...forDay, ...picked];

    tx.update(weekRef, { assigned });
    tx.update(topicRef, {
      scheduledDates,
      queueState: "inProgress",
      scheduledMinutes: NUM(topic.scheduledMinutes, 0) + usedMinutes,
    });

    return { slices };
  });

  return res;
}
/* ------------------------------ AUTO-FILL WEEK ----------------------------- */
/**
 * Pack a topic from a starting day: places all remaining subtopics contiguously,
 * spilling to following days as capacity allows. Skips offDays. Stops at week end.
 * Returns number of slices placed.
 */
export async function scheduleTopicPackFromDay(uid, startIso, seq) {
  if (!uid || !startIso || !seq)
    throw new Error("scheduleTopicPackFromDay: bad args");

  const topicRef = doc(db, "plans", uid, "masterQueue", String(seq));
  const topicSnap = await getDoc(topicRef);
  if (!topicSnap.exists()) throw new Error("Topic not found");
  const topic = topicSnap.data() || {};

  const subs = Array.isArray(topic.subtopics) ? topic.subtopics : [];
  const already = buildAlreadySet(topic);

  const remainingIndices = () =>
    subs
      .map((_, i) => i)
      .filter((i) => !already.has(i) && NUM(subs[i]?.minutes, 0) > 0);

  let placed = 0;
  const weekKey = weekKeyFromDate(startIso);
  const days = weekDatesFromKey(weekKey);
  let idx = days.indexOf(startIso);
  if (idx < 0) idx = 0;

  for (; idx < days.length; idx++) {
    const remaining = remainingIndices();
    if (!remaining.length) break;

    const iso = days[idx];
    const { data: wk } = await loadWeekDoc(uid, iso);
    if (!wk || wk.offDays?.[iso]) continue;

    let cap = remainingCapacity(wk, iso);
    if (cap <= 0) continue;

    const toPlace = [];
    for (const subIdx of remaining) {
      const mins = NUM(subs[subIdx]?.minutes, 0);
      if (mins <= 0) continue;
      if (cap - mins < 0) break;
      cap -= mins;
      toPlace.push(subIdx);
    }
    if (!toPlace.length) continue;

    const res = await scheduleTopicSubIdxesBulk(uid, iso, seq, toPlace);
    const slices = Array.isArray(res?.slices) ? res.slices : [];
    if (!slices.length) continue;

    slices.forEach((slice) => {
      already.add(Number(slice.subIdx));
    });
    placed += slices.length;
  }

  return { placed };
}

/**
 * Fill the week from the queue (inProgress first, then queued),
 * placing subtopics into available capacity day by day.
 * Returns the refreshed week doc.
 */
export async function autoFillWeekFromMaster(uid, weekKey) {
  if (!uid || !weekKey) throw new Error("autoFillWeekFromMaster: bad args");

  const wkRef = doc(db, "plans", uid, "weeks", weekKey);
  const wkSnap = await getDoc(wkRef);
  if (!wkSnap.exists()) throw new Error("Week not found");
  const weekDoc = wkSnap.data() || {};

  const assignedCache = { ...(weekDoc.assigned || {}) };
  const dayCaps = weekDoc.dayCaps || {};
  const offDays = weekDoc.offDays || {};

  const dates = weekDatesFromKey(weekKey);
  const todayISO = toDateKey(new Date());

  const queued = await getQueueOrdered(uid, "queued");
  const inProg = await getQueueOrdered(uid, "inProgress");
  const topics = [...inProg, ...queued];

  for (const t of topics) {
    const subs = Array.isArray(t.subtopics) ? t.subtopics : [];
    const already = new Set(
      Object.values(t.scheduledDates || {})
        .flat()
        .map((n) => Number(n)),
    );

    const remaining = () =>
      subs
        .map((_, i) => i)
        .filter((i) => !already.has(i) && NUM(subs[i]?.minutes, 0) > 0);

    for (const iso of dates.filter((d) => d >= todayISO)) {
      const remainIdx = remaining();
      if (!remainIdx.length) break;
      if (offDays?.[iso]) continue;

      const dayArr = Array.isArray(assignedCache[iso])
        ? assignedCache[iso]
        : [];
      let cap = Number(dayCaps?.[iso] || 0) - minutesUsed(dayArr);
      if (cap <= 0) continue;

      const toPlace = [];
      for (const subIdx of remainIdx) {
        const mins = NUM(subs[subIdx]?.minutes, 0);
        if (mins <= 0) continue;
        if (cap - mins < 0) break;
        cap -= mins;
        toPlace.push(subIdx);
      }
      if (!toPlace.length) continue;

      const res = await scheduleTopicSubIdxesBulk(uid, iso, t.seq, toPlace);
      const slices = Array.isArray(res?.slices) ? res.slices : [];
      if (!slices.length) continue;

      assignedCache[iso] = [...dayArr, ...slices];
      slices.forEach((slice) => {
        already.add(Number(slice.subIdx));
      });
    }
  }

  const snap = await getDoc(wkRef);
  return snap.exists() ? snap.data() || null : null;
}

/* ---------------------------- DAY DONE / ADVANCE --------------------------- */

export async function markDayDoneAndAdvance(uid, weekKey, iso) {
  if (!uid || !weekKey || !iso)
    throw new Error("markDayDoneAndAdvance: bad args");
  const ref = doc(db, "plans", uid, "weeks", weekKey);
  await updateDoc(ref, { [`doneDays.${iso}`]: true });

  // Advance currentDayISO in meta to next day (or next week's Monday when week ends)
  const metaRef = doc(db, "plans", uid);
  const arr = weekDatesFromKey(weekKey);
  const idx = arr.indexOf(iso);
  let nextISO = iso;
  if (idx >= 0 && idx < 6) {
    nextISO = arr[idx + 1];
  } else if (idx === 6) {
    nextISO = nextWeekKey(weekKey); // Monday of next week
  }
  await updateDoc(metaRef, {
    currentDayISO: nextISO,
    updatedAt: new Date().toISOString(),
  });
  return { nextISO };
}

/* --------------------------- UTIL (rarely used) --------------------------- */

export async function moveTopicSlicesToNextDay(uid, iso, seq) {
  if (!uid || !iso || !seq)
    throw new Error("moveTopicSlicesToNextDay: bad args");

  const weekKey = weekKeyFromDate(iso);
  const dates = weekDatesFromKey(weekKey);
  const idx = dates.indexOf(iso);
  if (idx < 0) return { moved: 0 };

  const { ref: wkRef, data: wkDoc } = await loadWeekDoc(uid, iso);
  if (!wkDoc) return { moved: 0 };
  const dayArr = Array.isArray(wkDoc.assigned?.[iso])
    ? wkDoc.assigned[iso]
    : [];
  const toMove = dayArr.filter((s) => s.seq === seq);
  if (!toMove.length) return { moved: 0 };

  const remain = dayArr.filter((s) => s.seq !== seq);

  const dayOriginal = new Map();
  const dayFinal = new Map();
  dayOriginal.set(iso, dayArr);
  dayFinal.set(iso, remain);

  await updateDoc(wkRef, { [`assigned.${iso}`]: remain });

  const splitByCapacity = (slices, cap) => {
    if (!Array.isArray(slices) || !slices.length)
      return { keep: [], overflow: [] };
    if (cap <= 0) return { keep: [], overflow: [...slices] };
    const keep = [];
    let used = 0;
    let index = 0;
    for (; index < slices.length; index++) {
      const slice = slices[index];
      const mins = NUM(slice?.minutes, 0);
      if (mins <= 0) {
        keep.push(slice);
        continue;
      }
      if (used + mins <= cap) {
        keep.push(slice);
        used += mins;
      } else {
        break;
      }
    }
    const overflow = slices.slice(index);
    return { keep, overflow };
  };

  const overflowBySeq = new Map();
  const registerOverflow = (slices) => {
    if (!Array.isArray(slices) || !slices.length) return;
    slices.forEach((slice) => {
      const list = overflowBySeq.get(slice.seq) || [];
      list.push(slice);
      overflowBySeq.set(slice.seq, list);
    });
  };

  let carry = [...toMove];

  for (let j = idx + 1; j < dates.length && carry.length; j++) {
    const targetIso = dates[j];
    const { ref: targetRef, data: targetDoc } = await loadWeekDoc(
      uid,
      targetIso,
    );
    if (!targetDoc || targetDoc.offDays?.[targetIso]) {
      continue;
    }
    const arr = Array.isArray(targetDoc.assigned?.[targetIso])
      ? targetDoc.assigned[targetIso]
      : [];
    dayOriginal.set(targetIso, arr);
    const cap = NUM(targetDoc.dayCaps?.[targetIso], 0);
    const { keep, overflow } = splitByCapacity([...carry, ...arr], cap);
    dayFinal.set(targetIso, keep);
    carry = overflow;
    await updateDoc(targetRef, { [`assigned.${targetIso}`]: keep });
  }

  if (carry.length) {
    registerOverflow(carry);
  }

  const seqContexts = new Map();
  const ensureSeqContext = async (seqId) => {
    if (seqContexts.has(seqId)) return seqContexts.get(seqId);
    const ref = doc(db, "plans", uid, "masterQueue", String(seqId));
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    const ctx = {
      ref,
      subtopics: Array.isArray(data.subtopics) ? data.subtopics : [],
      initialQueueState: data.queueState || "queued",
      sortKey: NUM(data.sortKey, 0),
      scheduled: { ...(data.scheduledDates || {}) },
      moveToFront: false,
    };
    seqContexts.set(seqId, ctx);
    return ctx;
  };

  for (const [isoKey, finalArr] of dayFinal.entries()) {
    const originalArr = dayOriginal.get(isoKey) || [];
    const seqSet = new Set([
      ...originalArr.map((s) => s.seq),
      ...finalArr.map((s) => s.seq),
    ]);
    for (const seqId of seqSet) {
      const seqCtx = await ensureSeqContext(seqId);
      if (!seqCtx) continue;
      const newList = finalArr
        .filter((s) => s.seq === seqId)
        .map((s) => Number(s.subIdx));
      seqCtx.scheduled[isoKey] = newList;
    }
  }

  for (const [seqId, slices] of overflowBySeq.entries()) {
    const seqCtx = await ensureSeqContext(seqId);
    if (!seqCtx) continue;
    const sorted = [...slices].sort(
      (a, b) => Number(a.subIdx) - Number(b.subIdx),
    );
    for (const isoKey of Object.keys(seqCtx.scheduled)) {
      const arr = seqCtx.scheduled[isoKey] || [];
      seqCtx.scheduled[isoKey] = arr.filter(
        (idx) => !sorted.some((sl) => Number(sl.subIdx) === Number(idx)),
      );
    }
    seqCtx.moveToFront = true;
  }

  let overflowCount = 0;
  overflowBySeq.forEach((list) => {
    overflowCount += Array.isArray(list) ? list.length : 0;
  });

  let minSortKey = Infinity;
  for (const ctx of seqContexts.values()) {
    minSortKey = Math.min(minSortKey, ctx.sortKey);
  }
  let nextFrontKey = Number.isFinite(minSortKey) ? minSortKey - 1 : -1;

  for (const seqCtx of seqContexts.values()) {
    const subtopics = Array.isArray(seqCtx.subtopics) ? seqCtx.subtopics : [];
    let scheduledMinutes = 0;
    let scheduledCount = 0;

    const keys = Object.keys(seqCtx.scheduled);
    for (const isoKey of keys) {
      const rawList = seqCtx.scheduled[isoKey] || [];
      const filtered = [];
      for (const rawIdx of rawList) {
        const numericIdx = Number(rawIdx);
        if (Number.isFinite(numericIdx)) {
          filtered.push(numericIdx);
        }
      }
      if (filtered.length) {
        seqCtx.scheduled[isoKey] = filtered;
      } else {
        delete seqCtx.scheduled[isoKey];
      }
    }

    for (const isoKey of Object.keys(seqCtx.scheduled)) {
      const idxs = seqCtx.scheduled[isoKey] || [];
      scheduledCount += idxs.length;
      for (const idx of idxs) {
        scheduledMinutes += NUM(subtopics[idx]?.minutes, 0);
      }
    }

    let queueState = seqCtx.moveToFront
      ? "queued"
      : scheduledCount > 0
        ? "inProgress"
        : "queued";
    if (
      !seqCtx.moveToFront &&
      seqCtx.initialQueueState === "done" &&
      scheduledCount === 0
    ) {
      queueState = "done";
    }

    let sortKey = seqCtx.sortKey;
    if (seqCtx.moveToFront) {
      sortKey = nextFrontKey;
      nextFrontKey -= 1;
    }

    await updateDoc(seqCtx.ref, {
      scheduledDates: seqCtx.scheduled,
      scheduledMinutes,
      sortKey,
      queueState,
    });
  }

  const overflowForSeq = overflowBySeq.get(seq)?.length || 0;
  const movedCount = Math.max(0, toMove.length - overflowForSeq);

  return { moved: movedCount, overflow: overflowCount };
}
