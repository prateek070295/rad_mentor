// functions/triggers/achievementsStudySession.js
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getApp, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { ACHIEVEMENTS_BY_ID } from "../achievements/definitions.js";
import { evaluateSessionAchievements } from "../achievements/evaluator.js";

try {
  getApp();
} catch {
  initializeApp();
}

const db = getFirestore();

const SESSION_DOCUMENT_PATH = "users/{uid}/studySessions/{sessionId}";
const COMPLETE_STATUS = new Set(["complete", "completed", "done", "finished"]);

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolveDurationMinutes(session = {}) {
  const orderedKeys = [
    "durationMinutes",
    "minutes",
    "totalMinutes",
    "duration",
  ];
  for (const key of orderedKeys) {
    if (session[key] === undefined || session[key] === null) continue;
    const numeric = Number(session[key]);
    if (!Number.isFinite(numeric)) continue;
    if (key === "duration" && numeric > 1000) {
      return Math.round(numeric / 60);
    }
    return numeric;
  }
  if (Number.isFinite(session.durationMs)) {
    return Math.round(Number(session.durationMs) / 60000);
  }
  return 0;
}

function resolveTimestamp(session = {}) {
  const candidates = [
    session.completedAt,
    session.endedAt,
    session.finishedAt,
    session.timestamp,
    session.updatedAt,
    session.createdAt,
    session.startedAt,
  ];
  for (const value of candidates) {
    if (!value) continue;
    if (typeof value.toDate === "function") {
      return value.toDate();
    }
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  return null;
}

function resolveDateISO(session = {}) {
  const direct = session.dateISO || session.dayISO || session.sessionDate;
  if (typeof direct === "string" && direct.length >= 10) {
    return direct.slice(0, 10);
  }
  const ts = resolveTimestamp(session);
  if (!ts) return null;
  const copy = new Date(ts);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

function isSessionComplete(session = {}) {
  if (session.achievementProcessed) return true;
  if (session.isComplete === true || session.completed === true) return true;
  if (session.completedAt) return true;
  if (typeof session.status === "string") {
    return COMPLETE_STATUS.has(session.status.toLowerCase());
  }
  return false;
}

function diffInDays(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  try {
    const from = new Date(`${fromIso}T00:00:00Z`);
    const to = new Date(`${toIso}T00:00:00Z`);
    return Math.round((to.getTime() - from.getTime()) / 86400000);
  } catch {
    return null;
  }
}

function computeMetaPatch(meta = {}, session = {}) {
  const duration = Math.max(0, resolveDurationMinutes(session));
  const sessionDateISO = resolveDateISO(session);
  const sessionTimestamp = resolveTimestamp(session);

  const baseMinutes = toNumber(meta.cumulativeStudyMinutes);
  const baseSessions = toNumber(meta.totalStudySessions);
  const baseTopics = toNumber(meta.topicsCompletedCount);
  const baseStreak = toNumber(meta.currentStudyStreak);
  const lastDay =
    typeof meta.lastStudyDayISO === "string" ? meta.lastStudyDayISO : null;

  const totalMinutes = baseMinutes + duration;
  const totalSessions = baseSessions + 1;

  let topicsCompleted = baseTopics;
  if (Array.isArray(session.completedTopicIds)) {
    topicsCompleted += session.completedTopicIds.length;
  } else if (session.topicCompleted === true) {
    topicsCompleted += 1;
  }

  let streak = baseStreak;
  let newLastDay = lastDay;

  if (sessionDateISO) {
    if (!lastDay) {
      streak = Math.max(baseStreak, 0) + 1;
      newLastDay = sessionDateISO;
    } else {
      const gap = diffInDays(lastDay, sessionDateISO);
      if (gap === 0) {
        streak = Math.max(baseStreak, 1);
        if (sessionDateISO > lastDay) {
          newLastDay = sessionDateISO;
        }
      } else if (gap === 1) {
        streak = Math.max(baseStreak, 0) + 1;
        newLastDay = sessionDateISO;
      } else if (gap > 1) {
        streak = 1;
        newLastDay = sessionDateISO;
      }
    }
  } else {
    streak = Math.max(baseStreak, 0) + 1;
  }

  if (streak <= 0) {
    streak = 1;
  }

  let latestSessionIso;
  if (sessionTimestamp) {
    latestSessionIso = sessionTimestamp.toISOString();
  } else if (sessionDateISO) {
    latestSessionIso = `${sessionDateISO}T00:00:00.000Z`;
  } else {
    latestSessionIso = new Date().toISOString();
  }

  const patch = {
    cumulativeStudyMinutes: totalMinutes,
    totalStudySessions,
    topicsCompletedCount: topicsCompleted,
    currentStudyStreak: streak,
    latestStudySessionAt: latestSessionIso,
  };

  if (newLastDay) {
    patch.lastStudyDayISO = newLastDay;
  }

  const recent =
    Array.isArray(meta.recentlyUnlockedAchievements) &&
    meta.recentlyUnlockedAchievements.length
      ? meta.recentlyUnlockedAchievements
          .filter((id) => typeof id === "string" && id.length)
          .slice(0, 3)
      : [];

  const updatedMeta = {
    ...meta,
    ...patch,
    lastStudyDayISO: patch.lastStudyDayISO ?? meta.lastStudyDayISO ?? null,
    recentlyUnlockedAchievements: recent,
  };

  return { patch, updatedMeta };
}

function shouldProcessSession(beforeData, afterData) {
  if (!afterData) return false;
  if (afterData.achievementProcessed === true) return false;
  const duration = resolveDurationMinutes(afterData);
  if (duration <= 0) return false;
  if (!beforeData) return true;

  const beforeComplete = isSessionComplete(beforeData);
  const afterComplete = isSessionComplete(afterData);
  if (!beforeComplete && afterComplete) return true;

  if (!beforeComplete && !afterComplete) {
    const beforeDuration = resolveDurationMinutes(beforeData);
    return beforeDuration <= 0;
  }

  return false;
}

export const onStudySessionWrite = onDocumentWritten(
  { region: "asia-south1", document: SESSION_DOCUMENT_PATH, retry: false },
  async (event) => {
    const beforeData = event.data.before.exists
      ? event.data.before.data()
      : null;
    const afterData = event.data.after.exists
      ? event.data.after.data()
      : null;

    if (!afterData) {
      return;
    }

    if (!shouldProcessSession(beforeData, afterData)) {
      return;
    }

    const { uid, sessionId } = event.params;
    const sessionRef = db
      .collection("users")
      .doc(uid)
      .collection("studySessions")
      .doc(sessionId);
    const metaRef = db.collection("users").doc(uid);

    await db.runTransaction(async (tx) => {
      const metaSnap = await tx.get(metaRef);
      const meta = metaSnap.exists
        ? metaSnap.data() || {}
        : {
            cumulativeStudyMinutes: 0,
            topicsCompletedCount: 0,
            currentStudyStreak: 0,
            totalStudySessions: 0,
            recentlyUnlockedAchievements: [],
          };

      const { patch, updatedMeta } = computeMetaPatch(meta, afterData);

      const unlockedIds = await evaluateSessionAchievements(
        tx,
        uid,
        updatedMeta,
      );

      if (unlockedIds.length) {
        const existingRecent = Array.isArray(
          updatedMeta.recentlyUnlockedAchievements,
        )
          ? updatedMeta.recentlyUnlockedAchievements
          : [];
        const mergedRecent = [
          ...unlockedIds,
          ...existingRecent.filter((id) => !unlockedIds.includes(id)),
        ].slice(0, 3);
        patch.recentlyUnlockedAchievements = mergedRecent;
        updatedMeta.recentlyUnlockedAchievements = mergedRecent;
      }

      const writePayload = {
        ...patch,
        updatedAt: FieldValue.serverTimestamp(),
        achievementsUpdatedAt: FieldValue.serverTimestamp(),
      };
      if (!metaSnap.exists) {
        writePayload.createdAt = FieldValue.serverTimestamp();
      }

      tx.set(metaRef, writePayload, { merge: true });

      tx.set(
        sessionRef,
        {
          achievementProcessed: true,
          achievementProcessedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      if (unlockedIds.length) {
        unlockedIds.forEach((id) => {
          const definition = ACHIEVEMENTS_BY_ID[id] || {};
          const notificationRef = db
            .collection("users")
            .doc(uid)
            .collection("notifications")
            .doc();
          tx.set(notificationRef, {
            type: "achievement_unlocked",
            achievementId: id,
            title: definition.name ?? "Achievement unlocked",
            category: definition.category ?? "Achievements",
            createdAt: FieldValue.serverTimestamp(),
            read: false,
          });
        });
      }
    });
  },
);
