// src/utils/achievements.js

const SESSION_CRITERIA = new Set(["streak_days", "cumulative_minutes"]);

const MINUTES_PER_HOUR = 60;

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normaliseMinutes = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric;
};

const computeProgressFromMeta = (meta, definition) => {
  if (!meta || !definition) return 0;
  switch (definition.criteriaType) {
    case "streak_days":
      return toNumber(meta.currentStudyStreak);
    case "cumulative_minutes":
      return normaliseMinutes(meta.cumulativeStudyMinutes);
    case "topics_completed":
      return toNumber(meta.topicsCompletedCount);
    default:
      return 0;
  }
};

export const formatProgressDisplay = (definition, progress) => {
  if (definition.criteriaType === "cumulative_minutes") {
    if (definition.displayUnit === "hours") {
      const hours = progress / MINUTES_PER_HOUR;
      return {
        value: Math.floor(hours * 10) / 10,
        unit: "hours",
      };
    }
  }
  return {
    value: progress,
    unit: definition.progressType === "count" ? "count" : "",
  };
};

export const deriveAchievementHighlight = ({
  meta,
  definitions = [],
  achievements = [],
}) => {
  if (!meta) {
    return {
      currentStreak: 0,
      cumulativeMinutes: 0,
      nextAchievement: null,
      recentlyUnlocked: [],
    };
  }

  const streak = toNumber(meta.currentStudyStreak);
  const minutes = normaliseMinutes(meta.cumulativeStudyMinutes);

  const unlockedSet = new Set(
    Array.isArray(achievements)
      ? achievements.filter((row) => row?.unlocked).map((row) => row.id)
      : [],
  );

  let nextCandidate = null;
  for (const definition of definitions) {
    if (!SESSION_CRITERIA.has(definition.criteriaType)) continue;
    const progress = computeProgressFromMeta(meta, definition);
    const remaining = definition.targetValue - progress;
    if (remaining <= 0) continue;
    if (!nextCandidate || remaining < nextCandidate.remaining) {
      nextCandidate = {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        criteriaType: definition.criteriaType,
        targetValue: definition.targetValue,
        progress,
        remaining,
        displayUnit: definition.displayUnit,
        iconKey: definition.iconKey,
      };
    }
  }

  const recentIds = Array.isArray(meta.recentlyUnlockedAchievements)
    ? meta.recentlyUnlockedAchievements.filter(
        (id) => typeof id === "string" && id.length,
      )
    : [];

  const definitionMap = definitions.reduce((acc, def) => {
    acc[def.id] = def;
    return acc;
  }, {});

  const recentlyUnlocked = recentIds
    .map((id) => {
      const def = definitionMap[id];
      if (!def) return null;
      return {
        id,
        name: def.name,
        description: def.description,
        iconKey: def.iconKey,
        category: def.category,
      };
    })
    .filter(Boolean);

  if (nextCandidate) {
    nextCandidate.progressDisplay = formatProgressDisplay(
      definitionMap[nextCandidate.id] || nextCandidate,
      nextCandidate.progress,
    );
    nextCandidate.targetDisplay = formatProgressDisplay(
      definitionMap[nextCandidate.id] || nextCandidate,
      nextCandidate.targetValue,
    );
  }

  return {
    currentStreak: streak,
    cumulativeMinutes: minutes,
    nextAchievement: nextCandidate,
    recentlyUnlocked,
    unlockedIds: unlockedSet,
  };
};

export const composeAchievementCatalog = (
  definitions = [],
  achievements = [],
  meta = {},
) => {
  if (!Array.isArray(definitions) || !definitions.length) return [];

  const achievementMap = achievements.reduce((acc, entry) => {
    if (entry?.id) {
      acc.set(entry.id, entry);
    }
    return acc;
  }, new Map());

  return definitions.map((definition) => {
    const entry = achievementMap.get(definition.id) || {};
    const targetDefault =
      definition.targetValue != null ? Number(definition.targetValue) : 0;
    const targetValue =
      entry.targetValue != null
        ? toNumber(entry.targetValue, targetDefault)
        : targetDefault;
    const progress =
      entry.progress != null
        ? toNumber(entry.progress, 0)
        : computeProgressFromMeta(meta, definition);
    const unlocked =
      Boolean(entry.unlocked) ||
      (targetValue > 0 ? progress >= targetValue : false);
    const unlockedAt = entry.unlockedAt || null;
    const ratio =
      targetValue > 0
        ? Math.min(1, Math.max(0, progress / targetValue))
        : unlocked
        ? 1
        : 0;

    return {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      category: definition.category,
      iconKey: definition.iconKey,
      criteriaType: definition.criteriaType,
      progressType: definition.progressType,
      displayUnit: definition.displayUnit,
      sortOrder: definition.sortOrder,
      progress,
      targetValue,
      progressDisplay: formatProgressDisplay(definition, progress),
      targetDisplay: formatProgressDisplay(definition, targetValue),
      unlocked,
      unlockedAt,
      progressRatio: ratio,
    };
  });
};
