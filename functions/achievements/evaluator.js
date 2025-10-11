// functions/achievements/evaluator.js
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { ACHIEVEMENT_DEFINITIONS } from "./definitions.js";

const db = getFirestore();

const SESSION_CRITERIA = new Set(["streak_days", "cumulative_minutes"]);

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normaliseMinutes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return numeric;
}

function extractMetaProgress(definition, meta) {
  switch (definition.criteriaType) {
    case "streak_days":
      return toNumber(meta?.currentStudyStreak);
    case "cumulative_minutes":
      return normaliseMinutes(meta?.cumulativeStudyMinutes);
    case "topics_completed":
      return toNumber(meta?.topicsCompletedCount);
    default:
      return 0;
  }
}

function computeUnlockedState(definition, progress) {
  if (progress >= definition.targetValue) {
    return { unlocked: true, progress };
  }
  return { unlocked: false, progress };
}

/**
 * Ensures a user achievement doc exists and updates its progress/unlocked state.
 * Returns boolean indicating whether the achievement was newly unlocked.
 */
async function upsertAchievementDoc(tx, uid, definition, meta) {
  const achievementRef = db
    .collection("users")
    .doc(uid)
    .collection("achievements")
    .doc(definition.id);

  const snapshot = await tx.get(achievementRef);
  const existing = snapshot.exists ? snapshot.data() : null;
  const progress = extractMetaProgress(definition, meta);
  const { unlocked } = computeUnlockedState(definition, progress);

  const payload = {
    id: definition.id,
    criteriaType: definition.criteriaType,
    progress,
    targetValue: definition.targetValue,
    progressType: definition.progressType,
    updatedAt: FieldValue.serverTimestamp(),
    lastEvaluatedAt: FieldValue.serverTimestamp(),
  };

  let newlyUnlocked = false;

  if (!snapshot.exists) {
    payload.createdAt = FieldValue.serverTimestamp();
  }

  if (unlocked) {
    payload.unlocked = true;
    if (existing?.unlocked && existing.unlockedAt instanceof Timestamp) {
      payload.unlockedAt = existing.unlockedAt;
    } else {
      payload.unlockedAt = FieldValue.serverTimestamp();
      newlyUnlocked = !existing?.unlocked;
    }
  } else {
    payload.unlocked = false;
  }

  tx.set(achievementRef, payload, { merge: true });
  return newlyUnlocked;
}

export async function evaluateSessionAchievements(tx, uid, meta) {
  const unlockedIds = [];

  for (const definition of ACHIEVEMENT_DEFINITIONS) {
    if (!SESSION_CRITERIA.has(definition.criteriaType)) continue;
    const newlyUnlocked = await upsertAchievementDoc(tx, uid, definition, meta);
    if (newlyUnlocked) {
      unlockedIds.push(definition.id);
    }
  }

  return unlockedIds;
}

export function determineNextUnlock(meta) {
  const streakProgress = toNumber(meta?.currentStudyStreak);
  const minutesProgress = normaliseMinutes(meta?.cumulativeStudyMinutes);

  const pending = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    const progress =
      def.criteriaType === "streak_days" ? streakProgress : minutesProgress;
    if (progress < def.targetValue) {
      pending.push({ def, remaining: def.targetValue - progress });
    }
  }

  if (!pending.length) return null;

  pending.sort((a, b) => a.remaining - b.remaining || a.def.sortOrder - b.def.sortOrder);
  const [next] = pending;
  return {
    id: next.def.id,
    name: next.def.name,
    description: next.def.description,
    category: next.def.category,
    targetValue: next.def.targetValue,
    criteriaType: next.def.criteriaType,
    progressType: next.def.progressType,
    iconKey: next.def.iconKey,
  };
}

export function projectAchievementProgress(definition, meta) {
  const progress = extractMetaProgress(definition, meta);
  return {
    id: definition.id,
    progress,
    targetValue: definition.targetValue,
    unlocked: progress >= definition.targetValue,
  };
}
