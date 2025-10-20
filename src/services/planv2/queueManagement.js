import { db } from "../../firebase";
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
import {
  NUM,
  toDateKey,
  weekKeyFromDate,
  weekDatesFromKey,
  nextWeekKey,
  minutesUsed,
} from "./analyticsHelpers";
import {
  buildAlreadySet,
  loadPlanMeta,
  loadOrInitWeek,
  completeDayAndAdvance,
  ensureNextWeekInitialized,
} from "./planMutations";
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
    completedSubIdx: Array.isArray(d.completedSubIdx)
      ? d.completedSubIdx
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      : [],
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
  const dates = weekDatesFromKey(weekKey);
  const todayISO = toDateKey(new Date());
  const futureDates = dates.filter((iso) => iso >= todayISO);

  const inProgressRows = await getQueueOrdered(uid, "inProgress");
  const queuedRows = await getQueueOrdered(uid, "queued");
  const orderedSeqs = [...inProgressRows, ...queuedRows]
    .map((row) => row?.seq)
    .filter((seq) => seq != null)
    .map((seq) => String(seq));

  if (!orderedSeqs.length || !futureDates.length) {
    const snap = await getDoc(wkRef);
    return snap.exists() ? snap.data() || null : null;
  }

  let updatedWeek = null;

  await runTransaction(db, async (tx) => {
    const wkSnap = await tx.get(wkRef);
    if (!wkSnap.exists()) throw new Error("Week not found");
    const weekDoc = wkSnap.data() || {};

    const assigned = {};
    const originalAssigned = weekDoc.assigned || {};
    dates.forEach((iso) => {
      const source = Array.isArray(originalAssigned[iso])
        ? originalAssigned[iso]
        : [];
      assigned[iso] = source.map((item) => ({ ...item }));
    });

    const dayUsage = new Map();
    dates.forEach((iso) => {
      const arr = assigned[iso] || [];
      dayUsage.set(iso, minutesUsed(arr));
    });

    const dayCaps = weekDoc.dayCaps || {};
    const offDays = weekDoc.offDays || {};

    const changes = [];
    let weekChanged = false;

    const computeScheduledMinutes = (subs, schedule) => {
      let total = 0;
      Object.values(schedule || {}).forEach((list) => {
        if (!Array.isArray(list)) return;
        list.forEach((idx) => {
          const mins = NUM(subs[idx]?.minutes, 0);
          if (mins > 0) total += mins;
        });
      });
      return total;
    };

    let totalRemainingCapacity = futureDates.reduce((sum, iso) => {
      const capTotal = NUM(dayCaps?.[iso], 0);
      const used = dayUsage.get(iso) || 0;
      const available = Math.max(0, capTotal - used);
      return sum + available;
    }, 0);

    if (totalRemainingCapacity <= 0) {
      updatedWeek = weekDoc;
      return;
    }

    for (const seq of orderedSeqs) {
      if (totalRemainingCapacity <= 0) break;
      const topicRef = doc(db, "plans", uid, "masterQueue", String(seq));
      const topicSnap = await tx.get(topicRef);
      if (!topicSnap.exists()) continue;

      const topic = topicSnap.data() || {};
      const subs = Array.isArray(topic.subtopics) ? topic.subtopics : [];
      if (!subs.length) continue;

      const scheduledDates = {};
      Object.entries(topic.scheduledDates || {}).forEach(([iso, list]) => {
        const normalized = Array.isArray(list)
          ? list
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value))
          : [];
        const uniq = Array.from(new Set(normalized)).sort((a, b) => a - b);
        if (uniq.length) {
          scheduledDates[iso] = uniq;
        }
      });

      const completed =
        Array.isArray(topic.completedSubIdx) && topic.completedSubIdx.length
          ? topic.completedSubIdx.map((value) => Number(value)).filter((value) =>
              Number.isFinite(value),
            )
          : [];

      const remainingIndices = () => {
        const base = {
          scheduledDates,
          completedSubIdx: completed,
        };
        const already = buildAlreadySet(base);
        return subs
          .map((_, index) => index)
          .filter(
            (index) =>
              !already.has(index) && NUM(subs[index]?.minutes, 0) > 0,
          );
      };

      let topicChanged = false;

      for (const iso of futureDates) {
        if (totalRemainingCapacity <= 0) break;
        const remainIdx = remainingIndices();
        if (!remainIdx.length) break;
        if (offDays?.[iso]) continue;

        const capTotal = NUM(dayCaps?.[iso], 0);
        let available = Math.max(0, capTotal - (dayUsage.get(iso) || 0));
        if (available <= 0) continue;

        const picked = [];
        for (const subIdx of remainIdx) {
          const mins = NUM(subs[subIdx]?.minutes, 0);
          if (mins <= 0) continue;
          if (mins > available) break;
          picked.push(subIdx);
          available -= mins;
        }
        if (!picked.length) continue;

        const slices = slicesForSubIdxes(topic, picked);
        if (!assigned[iso]) assigned[iso] = [];
        assigned[iso] = [...assigned[iso], ...slices];
        const addedMinutes = slices.reduce(
          (sum, slice) => sum + NUM(slice.minutes, 0),
          0,
        );
        dayUsage.set(iso, (dayUsage.get(iso) || 0) + addedMinutes);
        totalRemainingCapacity = Math.max(
          0,
          totalRemainingCapacity - addedMinutes,
        );

        const existing = Array.isArray(scheduledDates[iso])
          ? scheduledDates[iso]
          : [];
        const merged = Array.from(
          new Set([
            ...existing,
            ...picked.map((value) => Number(value)).filter((value) =>
              Number.isFinite(value),
            ),
          ]),
        ).sort((a, b) => a - b);
        scheduledDates[iso] = merged;

        topicChanged = true;
        weekChanged = true;
      }

      if (topicChanged) {
        const scheduledMinutes = computeScheduledMinutes(subs, scheduledDates);
        changes.push({
          ref: topicRef,
          data: {
            scheduledDates,
            scheduledMinutes,
            queueState: "inProgress",
          },
        });
      }
    }

    if (weekChanged) {
      const compactAssigned = {};
      Object.entries(assigned).forEach(([iso, arr]) => {
        if (Array.isArray(arr) && arr.length) {
          compactAssigned[iso] = arr;
        }
      });
      tx.update(wkRef, { assigned: compactAssigned });
      updatedWeek = { ...weekDoc, assigned: compactAssigned };
    } else {
      updatedWeek = weekDoc;
    }

    changes.forEach((change) => {
      tx.update(change.ref, change.data);
    });
  });

  return updatedWeek;
}

/* ---------------------------- DAY DONE / ADVANCE --------------------------- */

export async function markDayDoneAndAdvance(uid, weekKey, iso) {
  if (!uid || !weekKey || !iso)
    throw new Error("markDayDoneAndAdvance: bad args");
  const ref = doc(db, "plans", uid, "weeks", weekKey);
  const weekSnap = await getDoc(ref);
  const weekDoc = weekSnap.exists() ? weekSnap.data() || {} : {};
  await updateDoc(ref, { [`doneDays.${iso}`]: true });

  // Advance currentDayISO in meta to next day (or next week's Monday when week ends)
  const metaRef = doc(db, "plans", uid);
  const arr = weekDatesFromKey(weekKey);
  const idx = arr.indexOf(iso);
  const fallbackDailyMinutes = (() => {
    const caps = weekDoc?.dayCaps || {};
    for (const dayIso of arr) {
      const minutes = NUM(caps?.[dayIso], NaN);
      if (Number.isFinite(minutes) && minutes > 0) {
        return minutes;
      }
    }
    return 90;
  })();
  let nextISO = iso;
  let rolledWeekKey = null;
  if (idx >= 0 && idx < 6) {
    nextISO = arr[idx + 1];
  } else if (idx === 6) {
    const ensureRes = await ensureNextWeekInitialized(
      uid,
      weekKey,
      metaRef,
      fallbackDailyMinutes,
    );
    rolledWeekKey = ensureRes.weekKey || nextWeekKey(weekKey);
    nextISO = rolledWeekKey; // Next week's start
  }
  await updateDoc(metaRef, {
    currentDayISO: nextISO,
    updatedAt: new Date().toISOString(),
  });
  return { nextISO, rolledWeekKey };
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

    await setDoc(
      seqCtx.ref,
      {
        scheduledDates: seqCtx.scheduled,
        scheduledMinutes,
        sortKey,
        queueState,
      },
      { merge: true },
    );
  }

  const overflowForSeq = overflowBySeq.get(seq)?.length || 0;
  const movedCount = Math.max(0, toMove.length - overflowForSeq);

  return { moved: movedCount, overflow: overflowCount };
}

export async function debugForceAdvanceWeek(uid, weekKey) {
  if (!uid || !weekKey)
    throw new Error("debugForceAdvanceWeek: missing uid/weekKey");
  const dates = weekDatesFromKey(weekKey);
  if (!dates.length) {
    return { message: "No dates found for week", success: false };
  }
  const lastIso = dates[dates.length - 1];
  const result = await completeDayAndAdvance(uid, weekKey, lastIso);
  return { ...result, success: true };
}


