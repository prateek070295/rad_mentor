// functions/achievements/definitions.js
// Achievement catalog (Phase 1: Consistency & Volume)

export const ACHIEVEMENT_DEFINITIONS = [
  {
    id: "streak_3_day",
    name: "Spark Starter",
    description: "Complete study sessions 3 days in a row.",
    category: "Consistency & Cadence",
    criteriaType: "streak_days",
    progressType: "count",
    targetValue: 3,
    sortOrder: 10,
    iconKey: "streak-3",
    nextAchievementId: "streak_7_day",
  },
  {
    id: "streak_7_day",
    name: "Rhythm Builder",
    description: "Maintain a 7-day study streak.",
    category: "Consistency & Cadence",
    criteriaType: "streak_days",
    progressType: "count",
    targetValue: 7,
    sortOrder: 11,
    iconKey: "streak-7",
    nextAchievementId: "streak_14_day",
  },
  {
    id: "streak_14_day",
    name: "Momentum Keeper",
    description: "Stay consistent for 14 consecutive days.",
    category: "Consistency & Cadence",
    criteriaType: "streak_days",
    progressType: "count",
    targetValue: 14,
    sortOrder: 12,
    iconKey: "streak-14",
    nextAchievementId: "streak_21_day",
  },
  {
    id: "streak_21_day",
    name: "Habit Hero",
    description: "Keep your streak alive for 21 days.",
    category: "Consistency & Cadence",
    criteriaType: "streak_days",
    progressType: "count",
    targetValue: 21,
    sortOrder: 13,
    iconKey: "streak-21",
    nextAchievementId: "streak_30_day",
  },
  {
    id: "streak_30_day",
    name: "Unstoppable",
    description: "Log at least one study session per day for 30 days.",
    category: "Consistency & Cadence",
    criteriaType: "streak_days",
    progressType: "count",
    targetValue: 30,
    sortOrder: 14,
    iconKey: "streak-30",
  },
  {
    id: "volume_5h",
    name: "Focused Five",
    description: "Accumulate 5 hours of focused study.",
    category: "Volume & Mastery",
    criteriaType: "cumulative_minutes",
    progressType: "count",
    targetValue: 5 * 60,
    sortOrder: 20,
    iconKey: "volume-5h",
    nextAchievementId: "volume_10h",
    displayUnit: "hours",
  },
  {
    id: "volume_10h",
    name: "Dedicated Ten",
    description: "Reach 10 hours of total study time.",
    category: "Volume & Mastery",
    criteriaType: "cumulative_minutes",
    progressType: "count",
    targetValue: 10 * 60,
    sortOrder: 21,
    iconKey: "volume-10h",
    nextAchievementId: "volume_25h",
    displayUnit: "hours",
  },
  {
    id: "volume_25h",
    name: "Quarter Marathon",
    description: "Log 25 hours of cumulative study.",
    category: "Volume & Mastery",
    criteriaType: "cumulative_minutes",
    progressType: "count",
    targetValue: 25 * 60,
    sortOrder: 22,
    iconKey: "volume-25h",
    nextAchievementId: "volume_50h",
    displayUnit: "hours",
  },
  {
    id: "volume_50h",
    name: "Fifty Hour Finish",
    description: "Reach 50 hours of cumulative study time.",
    category: "Volume & Mastery",
    criteriaType: "cumulative_minutes",
    progressType: "count",
    targetValue: 50 * 60,
    sortOrder: 23,
    iconKey: "volume-50h",
    nextAchievementId: "volume_100h",
    displayUnit: "hours",
  },
  {
    id: "volume_100h",
    name: "Century Scholar",
    description: "Accumulate 100 hours of study.",
    category: "Volume & Mastery",
    criteriaType: "cumulative_minutes",
    progressType: "count",
    targetValue: 100 * 60,
    sortOrder: 24,
    iconKey: "volume-100h",
    displayUnit: "hours",
  },
];

export const ACHIEVEMENTS_BY_ID = ACHIEVEMENT_DEFINITIONS.reduce(
  (map, def) => {
    map[def.id] = def;
    return map;
  },
  {},
);

export const CRITERIA_TO_DEFINITIONS = ACHIEVEMENT_DEFINITIONS.reduce(
  (map, def) => {
    if (!map.has(def.criteriaType)) {
      map.set(def.criteriaType, []);
    }
    map.get(def.criteriaType).push(def);
    return map;
  },
  new Map(),
);

export function getDefinitionsForCriteria(criteriaType) {
  return CRITERIA_TO_DEFINITIONS.get(criteriaType) ?? [];
}

