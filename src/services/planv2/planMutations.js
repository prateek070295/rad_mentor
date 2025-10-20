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
  writeBatch,
  documentId,
  startAfter,
} from "firebase/firestore";
import {
  NUM,
  weekKeyFromDate,
  weekDatesFromKey,
  nextWeekKey,
} from "./analyticsHelpers";

export { weekDatesFromKey, nextWeekKey, minutesUsed } from "./analyticsHelpers";

function pruneUndefined(obj = {}) {
  const result = {};
  Object.entries(obj || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      result[key] = value;
    }
  });
  return result;
}

async function deleteCollectionDocs(colRef, dryRun = false) {
  const batchSize = 100;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let totalDeleted = 0;
  let lastDoc = null;

  while (true) {
    const refs = lastDoc
      ? query(
          colRef,
          orderBy(documentId()),
          startAfter(lastDoc),
          limit(batchSize),
        )
      : query(colRef, orderBy(documentId()), limit(batchSize));

    const snap = await getDocs(refs);
    if (snap.empty) break;

    const docIds = snap.docs.map((docSnap) => docSnap.id);
    if (dryRun) {
      console.info(
        `deleteCollectionDocs dryRun would remove: ${docIds.join(", ")}`,
      );
      totalDeleted += snap.size;
    } else {
      const batch = writeBatch(db);
      snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
      await batch.commit();
      totalDeleted += snap.size;
      console.info(
        `deleteCollectionDocs removed batch of ${snap.size}: ${docIds.join(", ")}`,
      );
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    await sleep(100);
  }

  return totalDeleted;
}

async function loadWeekDoc(uid, iso) {
  const wkKey = weekKeyFromDate(iso);
  const ref = doc(db, "plans", uid, "weeks", wkKey);
  const snap = await getDoc(ref);
  return { ref, data: snap.exists() ? snap.data() || null : null, wkKey };
}

export async function loadPlanMeta(uid) {
  if (!uid) return null;
  const ref = doc(db, "plans", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { ...snap.data(), id: ref.id };
}

export async function savePlanMeta(uid, updates = {}) {
  if (!uid) throw new Error("savePlanMeta: missing uid");
  if (!updates || typeof updates !== "object") return await loadPlanMeta(uid);
  const ref = doc(db, "plans", uid);
  const timestamp = new Date().toISOString();
  const payload = pruneUndefined({
    ...updates,
    updatedAt: timestamp,
  });
  if (!Object.keys(payload).length) {
    return await loadPlanMeta(uid);
  }
  await setDoc(ref, payload, { merge: true });
  return await loadPlanMeta(uid);
}

export async function loadMasterPlanMeta(uid) {
  if (!uid) return null;
  const ref = doc(db, "plans", uid, "master", "meta");
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() || null : null;
}

const SYLLABUS_TOTALS_URL =
  (typeof process !== "undefined" && process.env?.REACT_APP_SYLLABUS_TOTALS_URL) || "";

export async function loadSyllabusTotals() {
  const basePublicUrl =
    (typeof process !== "undefined" && process.env?.PUBLIC_URL) || "";
  const normalizedBase = basePublicUrl.replace(/\/$/, "");
  const fallbackPath = normalizedBase
    ? `${normalizedBase}/assets/breast_syllabus_prioritized.json`
    : "/assets/breast_syllabus_prioritized.json";
  const targetUrl = SYLLABUS_TOTALS_URL || fallbackPath;

  if (typeof fetch !== "function") {
    throw new Error("loadSyllabusTotals: Fetch API unavailable in this environment");
  }

  const response = await fetch(targetUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `loadSyllabusTotals: request failed (${response.status} ${response.statusText})`,
    );
  }
  return response.json();
}

export async function loadOrInitWeek(
  uid,
  weekKeyInput,
  defaultDailyMinutes = 90,
) {
  if (!uid) throw new Error("loadOrInitWeek: missing uid");
  const normalizedDefault = Number.isFinite(Number(defaultDailyMinutes))
    ? Math.max(0, Number(defaultDailyMinutes))
    : 90;
  const targetKey =
    weekKeyInput && /^\d{4}-\d{2}-\d{2}$/.test(String(weekKeyInput))
      ? String(weekKeyInput)
      : weekKeyFromDate(weekKeyInput || new Date());

  const ref = doc(db, "plans", uid, "weeks", targetKey);
  const snap = await getDoc(ref);
  const isoList = weekDatesFromKey(targetKey);
  const timestamp = new Date().toISOString();

  if (!snap.exists()) {
    const assigned = {};
    const dayCaps = {};
    isoList.forEach((iso) => {
      assigned[iso] = [];
      dayCaps[iso] = normalizedDefault;
    });
    const newDoc = {
      weekKey: targetKey,
      assigned,
      dayCaps,
      offDays: {},
      doneDays: {},
      defaultDailyMinutes: normalizedDefault,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await setDoc(ref, newDoc, { merge: false });
    return { ...newDoc };
  }

  const data = snap.data() || {};
  const existingAssigned =
    data.assigned && typeof data.assigned === "object" ? { ...data.assigned } : {};
  const normalizedAssigned = {};
  let assignedChanged = false;

  Object.keys(existingAssigned).forEach((key) => {
    const value = existingAssigned[key];
    if (Array.isArray(value)) {
      normalizedAssigned[key] = value.map((entry) =>
        entry && typeof entry === "object" ? { ...entry } : entry,
      );
    }
  });

  isoList.forEach((iso) => {
    if (!Array.isArray(normalizedAssigned[iso])) {
      normalizedAssigned[iso] = [];
      assignedChanged = true;
    }
  });

  const dayCaps = { ...(data.dayCaps || {}) };
  const missingCaps = [];
  isoList.forEach((iso) => {
    if (!Number.isFinite(Number(dayCaps[iso]))) {
      dayCaps[iso] = normalizedDefault;
      missingCaps.push(iso);
    }
  });

  const defaultDaily = Number.isFinite(Number(data.defaultDailyMinutes))
    ? Number(data.defaultDailyMinutes)
    : normalizedDefault;

  const normalizedDoc = {
    ...data,
    weekKey: targetKey,
    assigned: normalizedAssigned,
    dayCaps,
    offDays: data.offDays || {},
    doneDays: data.doneDays || {},
    defaultDailyMinutes: defaultDaily,
  };

  const patch = {};
  if (assignedChanged) {
    patch.assigned = normalizedAssigned;
  }
  if (missingCaps.length) {
    missingCaps.forEach((iso) => {
      patch[`dayCaps.${iso}`] = dayCaps[iso];
    });
  }
  if (defaultDaily !== data.defaultDailyMinutes) {
    patch.defaultDailyMinutes = defaultDaily;
  }
  if (Object.keys(patch).length) {
    patch.updatedAt = timestamp;
    await updateDoc(ref, patch);
    normalizedDoc.updatedAt = timestamp;
  }

  return normalizedDoc;
}

export async function patchWeek(uid, weekKeyInput, patch = {}) {
  if (!uid) throw new Error("patchWeek: missing uid");
  if (!weekKeyInput) throw new Error("patchWeek: missing weekKey");
  if (!patch || typeof patch !== "object") return;

  const sanitized = pruneUndefined(patch);
  if (!Object.keys(sanitized).length) return;

  const targetKey =
    weekKeyInput && /^\d{4}-\d{2}-\d{2}$/.test(String(weekKeyInput))
      ? String(weekKeyInput)
      : weekKeyFromDate(weekKeyInput || new Date());

  const ref = doc(db, "plans", uid, "weeks", targetKey);
  try {
    const timestamp = new Date().toISOString();
    await updateDoc(ref, { ...sanitized, updatedAt: timestamp });
  } catch (error) {
    if (error?.code === "not-found") {
      await loadOrInitWeek(uid, targetKey);
      const timestamp = new Date().toISOString();
      await updateDoc(ref, { ...sanitized, updatedAt: timestamp });
    } else {
      throw error;
    }
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

export function buildAlreadySet(topicDoc = {}) {
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

function arraysEqualNumeric(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function scheduledMapsEqual(aMap = {}, bMap = {}) {
  const normalize = (map) => {
    const entries = [];
    Object.keys(map || {}).forEach((key) => {
      const list = map[key];
      if (!Array.isArray(list) || list.length === 0) return;
      const normalized = list
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .sort((x, y) => x - y);
      if (normalized.length === 0) return;
      entries.push([key, normalized]);
    });
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    return entries;
  };

  const aEntries = normalize(aMap);
  const bEntries = normalize(bMap);
  if (aEntries.length !== bEntries.length) return false;
  for (let i = 0; i < aEntries.length; i += 1) {
    const [aKey, aList] = aEntries[i];
    const [bKey, bList] = bEntries[i];
    if (aKey !== bKey) return false;
    if (!arraysEqualNumeric(aList, bList)) return false;
  }
  return true;
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
        const scheduledBefore = {};
        Object.keys(scheduledDatesRaw).forEach((key) => {
          const list = scheduledDatesRaw[key];
          if (!Array.isArray(list)) return;
          const cleaned = list
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value));
          if (cleaned.length) {
            scheduledDates[key] = cleaned.slice();
            scheduledBefore[key] = cleaned.slice();
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

        const existingCompleted = Array.isArray(data.completedSubIdx)
          ? data.completedSubIdx
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value))
          : [];
        const completedSet = new Set(existingCompleted);

        const subs = Array.isArray(data.subtopics) ? data.subtopics : [];

        if (info.markTopic && subs.length) {
          subs.forEach((_sub, index) => completedSet.add(index));
        }

        info.subIdx.forEach((idx) => completedSet.add(idx));

        const completedSubIdx = Array.from(completedSet).sort((a, b) => a - b);
        const prevCompletedSubIdx = [...existingCompleted].sort(
          (a, b) => a - b,
        );

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

        const prevScheduledMinutes = NUM(data.scheduledMinutes, 0);
        const prevCompletedMinutes = NUM(data.completedMinutes, 0);
        const prevQueueState = data.queueState || "queued";
        const prevCompletedAt =
          typeof data.completedAt === "string" ? data.completedAt : "";

        const scheduledChanged = !scheduledMapsEqual(
          scheduledBefore,
          scheduledDates,
        );
        const completedIdxChanged = !arraysEqualNumeric(
          prevCompletedSubIdx,
          completedSubIdx,
        );
        const scheduledMinutesChanged =
          prevScheduledMinutes !== scheduledMinutes;
        const completedMinutesChanged =
          prevCompletedMinutes !== completedMinutes;
        const queueStateChanged = prevQueueState !== queueState;
        const shouldClearCompletedAt =
          queueState !== "done" && !!prevCompletedAt;
        const shouldSetCompletedAt =
          queueState === "done" && !prevCompletedAt;

        let shouldUpdate =
          scheduledChanged ||
          completedIdxChanged ||
          scheduledMinutesChanged ||
          completedMinutesChanged ||
          queueStateChanged ||
          shouldClearCompletedAt ||
          shouldSetCompletedAt;

        if (!shouldUpdate) {
          return;
        }

        const timestamp = new Date().toISOString();
        const updatePayload = {
          scheduledDates,
          scheduledMinutes,
          completedSubIdx,
          completedMinutes,
          queueState,
          updatedAt: timestamp,
          completedAt:
            queueState === "done" ? prevCompletedAt || timestamp : "",
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

  const completedCount = collectScheduledItemIds(dayAssignments).length;

  await finalizeQueueAfterDayCompletion(uid, iso, dayAssignments);
  await applyCompletionToWeekAssignments(uid, weekKey, iso, dayAssignments);
  await updateDoc(weekRef, { [`doneDays.${iso}`]: true });

  const metaRef = doc(db, "plans", uid);
  const arr = weekDatesFromKey(weekKey);
  const idx = arr.indexOf(iso);
  let nextISO = iso;
  let rolledWeekKey = null;
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
    nextISO = rolledWeekKey;
  }
  await updateDoc(metaRef, {
    currentDayISO: nextISO,
    updatedAt: new Date().toISOString(),
  });

  return { nextISO, completedCount, rolledWeekKey };
}

export async function loadDayAssignments(uid, iso) {
  if (!uid || !iso) {
    return { assignments: [], weekDoc: null, weekKey: null };
  }

  const { ref: weekRef, data: weekDoc, wkKey } = await loadWeekDoc(uid, iso);
  if (!weekDoc) {
    return { assignments: [], weekDoc: null, weekKey: wkKey, weekRef };
  }

  const assignments = Array.isArray(weekDoc.assigned?.[iso])
    ? [...weekDoc.assigned[iso]]
    : [];

  return { assignments, weekDoc, weekKey: wkKey, weekRef };
}

function normalizeId(value) {
  if (value == null) return "";
  return String(value).trim();
}

function makeSliceMatchKeys(slice = {}) {
  const keys = [];
  const seq = slice?.seq;
  if (seq != null) {
    const seqKey = `seq:${String(seq)}`;
    const subIdxValue = Number(slice?.subIdx);
    if (Number.isFinite(subIdxValue)) {
      keys.push(`${seqKey}|subIdx:${subIdxValue}`);
    } else {
      keys.push(seqKey);
    }
  }
  const topicId = normalizeId(
    slice?.topicId ??
      slice?.topicID ??
      slice?.id ??
      slice?.chapterId ??
      slice?.chapterID ??
      "",
  ).toLowerCase();
  const subId = normalizeId(
    slice?.subId ??
      slice?.subID ??
      slice?.itemId ??
      slice?.itemID ??
      slice?.subtopicId ??
      slice?.subtopicID ??
      "",
  ).toLowerCase();
  const subIdx = Number(slice?.subIdx);
  const hasSubIdx = Number.isFinite(subIdx);

  if (topicId && subId) {
    keys.push(`topic:${topicId}|sub:${subId}`);
  }
  if (subId) {
    keys.push(`sub:${subId}`);
  }
  if (topicId && hasSubIdx) {
    keys.push(`topic:${topicId}|subIdx:${subIdx}`);
  }
  if (topicId && !subId && !hasSubIdx) {
    keys.push(`topic:${topicId}`);
  }
  return keys;
}

export async function ensureNextWeekInitialized(
  uid,
  currentWeekKey,
  metaRef,
  fallbackDailyMinutes = 90,
) {
  if (!uid || !currentWeekKey) {
    return { weekKey: null };
  }
  const upcomingWeekKey = nextWeekKey(currentWeekKey);
  let defaultDailyMinutes = Number.isFinite(Number(fallbackDailyMinutes))
    ? Number(fallbackDailyMinutes)
    : 90;
  try {
    const metaSnap = metaRef
      ? await getDoc(metaRef)
      : await getDoc(doc(db, "plans", uid));
    if (metaSnap.exists()) {
      defaultDailyMinutes = NUM(
        metaSnap.data()?.dailyMinutes,
        defaultDailyMinutes,
      );
    }
  } catch (error) {
    console.error(
      "Failed to load plan meta for next-week initialization:",
      error,
    );
  }

  await loadOrInitWeek(uid, upcomingWeekKey, defaultDailyMinutes);
  return { weekKey: upcomingWeekKey };
}

async function applyCompletionToWeekAssignments(
  uid,
  weekKey,
  iso,
  slices = [],
) {
  if (!uid || !weekKey || !iso) return;
  if (!Array.isArray(slices) || !slices.length) return;

  const weekRef = doc(db, "plans", uid, "weeks", weekKey);
  const sliceKeySet = new Set();
  slices.forEach((slice) => {
    makeSliceMatchKeys(slice).forEach((key) => {
      if (key) sliceKeySet.add(key);
    });
  });
  if (!sliceKeySet.size) return;
  const timestamp = new Date().toISOString();

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(weekRef);
    if (!snap.exists()) return;
    const data = snap.data() || {};
    const assigned = Array.isArray(data.assigned?.[iso])
      ? data.assigned[iso].map((entry) => (entry ? { ...entry } : entry))
      : [];
    if (!assigned.length) return;

    let changed = false;
    const updated = assigned.map((entry) => {
      if (!entry) return entry;
      const keys = makeSliceMatchKeys(entry);
      const matched = keys.some((key) => sliceKeySet.has(key));
      if (!matched) return entry;
      if (entry.completed === true && entry.status === "completed") {
        return entry;
      }
      changed = true;
      return {
        ...entry,
        completed: true,
        status: "completed",
        completedAt: entry.completedAt || timestamp,
        percentComplete: 100,
      };
    });

    if (changed) {
      tx.update(weekRef, { [`assigned.${iso}`]: updated });
    }
  });
}

export async function resetAssignmentsCompletion(
  uid,
  weekKey,
  iso,
  entries = [],
) {
  if (!uid || !weekKey || !iso) return 0;
  if (!Array.isArray(entries) || !entries.length) return 0;

  const weekRef = doc(db, "plans", uid, "weeks", weekKey);
  const keySet = new Set();
  const percentByKey = new Map();

  entries.forEach((entry) => {
    if (!entry) return;
    const topicIdRaw = entry.topicId ?? entry.topicID ?? "";
    const subIdRaw = entry.subId ?? entry.subID ?? entry.itemId ?? "";
    const fakeSlice = {
      topicId: topicIdRaw,
      subId: subIdRaw,
      seq: entry.seq ?? null,
      subIdx: entry.subIdx ?? null,
    };
    const keys = makeSliceMatchKeys(fakeSlice);
    const percent = Number.isFinite(Number(entry.percentComplete))
      ? Math.max(0, Math.min(99, Number(entry.percentComplete)))
      : 0;
    keys.forEach((key) => {
      if (!key) return;
      keySet.add(key);
      if (!percentByKey.has(key)) {
        percentByKey.set(key, percent);
      }
    });
  });

  if (!keySet.size) return 0;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(weekRef);
    if (!snap.exists()) return;
    const data = snap.data() || {};
    const assigned = Array.isArray(data.assigned?.[iso])
      ? data.assigned[iso].map((entry) => (entry ? { ...entry } : entry))
      : [];
    if (!assigned.length) return;

    let changed = false;
    const updated = assigned.map((entry) => {
      if (!entry) return entry;
      const keys = makeSliceMatchKeys(entry);
      const matchedKey = keys.find((key) => keySet.has(key));
      if (!matchedKey) return entry;

      const previousCompleted =
        entry.completed === true || entry.status === "completed";
      const percent =
        percentByKey.get(matchedKey) ??
        (Number.isFinite(Number(entry.percentComplete))
          ? Math.max(0, Math.min(99, Number(entry.percentComplete)))
          : 0);
      const nextStatus = percent > 0 ? "inProgress" : "queued";

      if (
        previousCompleted ||
        entry.completed !== false ||
        entry.status !== nextStatus ||
        entry.completedAt ||
        Number(entry.percentComplete) !== percent
      ) {
        changed = true;
        return {
          ...entry,
          completed: false,
          status: nextStatus,
          completedAt: "",
          percentComplete: percent,
        };
      }
      return entry;
    });

    if (changed) {
      tx.update(weekRef, { [`assigned.${iso}`]: updated });
    }
  });

  return keySet.size;
}

export async function markAssignmentsCompleteFromProgress(
  uid,
  iso,
  descriptors = [],
) {
  if (!uid || !iso || !Array.isArray(descriptors) || descriptors.length === 0) {
    return { matchedSlices: 0, matchedTopics: 0, weekKey: null };
  }

  const normalizeTopicId = (value) => {
    if (value == null) return "";
    const trimmed = String(value).trim();
    return trimmed ? trimmed : "";
  };

  const topicKey = (value) => normalizeTopicId(value).toLowerCase();

  const normalizeSubId = (value) => {
    if (value == null) return "";
    if (typeof value === "object") {
      return normalizeSubId(
        value.subtopicId ??
          value.subId ??
          value.itemId ??
          value.id ??
          value.topicId ??
          "",
      );
    }
    const trimmed = String(value).trim();
    return trimmed ? trimmed.toLowerCase() : "";
  };

  const normalizeSubIdx = (value) => {
    if (value == null || value === "") return null;
    if (typeof value === "object") {
      return normalizeSubIdx(
        value.subIdx ??
          value.subIndex ??
          value.subindices ??
          value.index ??
          value.subtopicIndex ??
          null,
      );
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const selections = new Map();

  descriptors.forEach((input) => {
    if (input == null) return;

    if (typeof input === "string" || typeof input === "number") {
      const topicIdRaw = normalizeTopicId(input);
      const key = topicKey(topicIdRaw);
      if (!key) return;
      const entry =
        selections.get(key) || {
          topicId: topicIdRaw,
          includeTopic: false,
          subIds: new Set(),
          subIdxs: new Set(),
        };
      if (!(entry.subIds instanceof Set)) {
        entry.subIds = new Set(entry.subIds || []);
      }
      if (!(entry.subIdxs instanceof Set)) {
        entry.subIdxs = new Set(entry.subIdxs || []);
      }
      entry.includeTopic = true;
      if (!entry.topicId) entry.topicId = topicIdRaw;
      selections.set(key, entry);
      return;
    }

    if (typeof input === "object") {
      const topicIdRaw = normalizeTopicId(
        input.topicId ??
          input.topicID ??
          input.id ??
          input.topic ??
          input.chapterId ??
          "",
      );
      const key = topicKey(topicIdRaw);
      if (!key) return;
      const entry =
        selections.get(key) || {
          topicId: topicIdRaw,
          includeTopic: false,
          subIds: new Set(),
          subIdxs: new Set(),
        };
      if (!(entry.subIds instanceof Set)) {
        entry.subIds = new Set(entry.subIds || []);
      }
      if (!(entry.subIdxs instanceof Set)) {
        entry.subIdxs = new Set(entry.subIdxs || []);
      }

      if (input.includeTopic === true || input.completeTopic === true) {
        entry.includeTopic = true;
      }

      const candidateLists = [];
      if (Array.isArray(input.subtopicIds)) candidateLists.push(input.subtopicIds);
      if (Array.isArray(input.subIds)) candidateLists.push(input.subIds);

      candidateLists.forEach((list) => {
        list.forEach((value) => {
          const normalized = normalizeSubId(value);
          if (normalized) {
            entry.subIds.add(normalized);
          }
        });
      });

      const idxLists = [];
      if (Array.isArray(input.subIdxs)) idxLists.push(input.subIdxs);
      if (Array.isArray(input.subIndices)) idxLists.push(input.subIndices);
      if (Array.isArray(input.subindexes)) idxLists.push(input.subindexes);
      if (Array.isArray(input.subtopicIndices)) idxLists.push(input.subtopicIndices);

      idxLists.forEach((list) => {
        list.forEach((value) => {
          const parsed = normalizeSubIdx(value);
          if (parsed != null) {
            entry.subIdxs.add(parsed);
          }
        });
      });

      const singleIdx = normalizeSubIdx(
        input.subIdx ??
          input.subIndex ??
          input.subindices ??
          input.subtopicIndex ??
          null,
      );
      if (singleIdx != null) {
        entry.subIdxs.add(singleIdx);
      }

      if (!entry.topicId) entry.topicId = topicIdRaw;
      selections.set(key, entry);
    }
  });

  if (!selections.size) {
    return { matchedSlices: 0, matchedTopics: 0, weekKey: null };
  }

  const { assignments, weekDoc, weekKey } = await loadDayAssignments(uid, iso);
  if (!assignments.length || !weekDoc) {
    return { matchedSlices: 0, matchedTopics: 0, weekKey };
  }

  const matchedSlices = [];
  const matchedTopics = new Set();

  assignments.forEach((slice) => {
    if (!slice) return;
    const sliceTopicRaw =
      slice.topicId ??
      slice.topicID ??
      slice.id ??
      slice.topic ??
      slice.chapterId ??
      "";
    const sliceTopicKey = topicKey(sliceTopicRaw);
    if (!sliceTopicKey) return;
    const selection = selections.get(sliceTopicKey);
    if (!selection) return;

    const subIdKey = normalizeSubId(
      slice.subId ??
        slice.subID ??
        slice.subtopicId ??
        slice.subtopicID ??
        slice.itemId ??
        slice.itemID ??
        "",
    );

    const hasSubIds = selection.subIds.size > 0;
    const hasSubIdxs = selection.subIdxs.size > 0;
    const sliceSubIdx = Number(slice.subIdx);
    const sliceSubIdxValid = Number.isFinite(sliceSubIdx);

    let isMatch = false;
    if (hasSubIds && subIdKey && selection.subIds.has(subIdKey)) {
      isMatch = true;
    }
    if (!isMatch && hasSubIdxs && sliceSubIdxValid && selection.subIdxs.has(sliceSubIdx)) {
      isMatch = true;
    }
    if (!isMatch && selection.includeTopic && !hasSubIds && !hasSubIdxs) {
      isMatch = true;
    }

    if (!isMatch) {
      return;
    }

    matchedSlices.push(slice);
    matchedTopics.add(sliceTopicKey);
  });

  if (!matchedSlices.length) {
    return { matchedSlices: 0, matchedTopics: 0, weekKey };
  }

  await applyCompletionToWeekAssignments(uid, weekKey, iso, matchedSlices);
  await finalizeQueueAfterDayCompletion(uid, iso, matchedSlices);

  return {
    matchedSlices: matchedSlices.length,
    matchedTopics: matchedTopics.size,
    weekKey,
  };
}
