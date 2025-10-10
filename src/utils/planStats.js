// src/utils/planStats.js
import { weekDatesFromKey } from "../services/planV2Api";

const toISODate = (value) => {
  if (!value) return "";
  const date =
    value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  date.setHours(0, 0, 0, 0);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const toDate = (iso) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const diffInDays = (fromIso, toIso) => {
  const fromDate = toDate(fromIso);
  const toDateValue = toDate(toIso);
  if (!fromDate || !toDateValue) return null;
  const diff =
    (toDateValue.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
  return Math.floor(diff);
};

export const defaultPlanOverviewStats = {
  overallProgress: null,
  minutesStudied: 0,
  minutesTotal: 0,
  topicsCompleted: 0,
  topicsTotal: 0,
  projectedEndDate: null,
};

export function calculatePlanOverviewStats(queueRows, weekDoc, meta = {}) {
  const rows = Array.isArray(queueRows) ? queueRows : [];
  const projectedFallback = meta?.projectedEndDate
    ? new Date(meta.projectedEndDate)
    : null;

  if (!rows.length) {
    return {
      ...defaultPlanOverviewStats,
      projectedEndDate: projectedFallback,
    };
  }

  const activeRows = rows.filter((row) => {
    const state = String(row?.queueState || "").toLowerCase();
    return state !== "removed";
  });

  if (!activeRows.length) {
    return {
      ...defaultPlanOverviewStats,
      projectedEndDate: projectedFallback,
    };
  }

  const totals = activeRows.reduce(
    (acc, row) => {
      const minutes = Math.max(0, Number(row?.minutes || 0));
      const state = String(row?.queueState || "").toLowerCase();

      if (minutes > 0) {
        acc.minutesTotal += minutes;
        if (state === "done") {
          acc.minutesStudied += minutes;
        }
      }

      if (state === "done") {
        acc.topicsCompleted += 1;
      }

      acc.topicsTotal += 1;
      return acc;
    },
    {
      minutesTotal: 0,
      minutesStudied: 0,
      topicsCompleted: 0,
      topicsTotal: 0,
    },
  );

  const remainingMinutes = Math.max(
    0,
    totals.minutesTotal - totals.minutesStudied,
  );
  const capValues = Object.values(weekDoc?.dayCaps || {})
    .map((value) => Number(value || 0))
    .filter((value) => value > 0);

  let averageDailyCap = capValues.length
    ? capValues.reduce((sum, value) => sum + value, 0) / capValues.length
    : Number(meta?.dailyMinutes || 0);

  if (
    !averageDailyCap ||
    Number.isNaN(averageDailyCap) ||
    averageDailyCap <= 0
  ) {
    averageDailyCap = 90;
  }

  const baseIso =
    meta?.currentDayISO || meta?.startDate || toISODate(new Date());
  const baseDate = baseIso ? new Date(`${baseIso}T00:00:00`) : new Date();
  const isBaseValid = !Number.isNaN(baseDate.getTime());

  let projected = null;
  if (isBaseValid && averageDailyCap > 0) {
    const daysNeeded = Math.ceil(remainingMinutes / averageDailyCap);
    projected = new Date(
      baseDate.getTime() + Math.max(0, daysNeeded) * 86400000,
    );
  } else if (projectedFallback) {
    projected = projectedFallback;
  }

  const progress =
    totals.minutesTotal > 0
      ? totals.minutesStudied / totals.minutesTotal
      : null;

  return {
    overallProgress: progress,
    minutesStudied: totals.minutesStudied,
    minutesTotal: totals.minutesTotal,
    topicsCompleted: totals.topicsCompleted,
    topicsTotal: totals.topicsTotal,
    projectedEndDate: projected,
  };
}

export function calculateWeeklyAssignmentTotals(weekDoc) {
  const assigned = (weekDoc && weekDoc.assigned) || {};
  const dayCaps = (weekDoc && weekDoc.dayCaps) || {};

  const planned = Object.values(assigned).reduce((sum, list) => {
    if (!Array.isArray(list)) return sum;
    return (
      sum +
      list.reduce(
        (acc, item) => acc + Math.max(0, Number(item?.minutes || 0)),
        0,
      )
    );
  }, 0);

  const capacity = Object.values(dayCaps).reduce(
    (sum, value) => sum + Math.max(0, Number(value || 0)),
    0,
  );

  return { planned, capacity };
}

export function buildQueueSnapshot(queueRows, limit = 3) {
  const rows = Array.isArray(queueRows) ? queueRows : [];
  return rows
    .filter((row) => {
      const state = String(row?.queueState || "").toLowerCase();
      return state === "queued";
    })
    .slice(0, Math.max(0, limit))
    .map((row) => ({
      id: row?.seq ?? row?.topicId ?? row?.chapterId ?? null,
      title:
        row?.topicName ||
        row?.chapterName ||
        row?.section ||
        "Queued topic",
      minutes: Math.max(0, Number(row?.minutes || 0)),
      section: row?.section || null,
    }));
}

export function buildWeeklyStreak(weekDoc, weekKey, todayIso) {
  if (!weekDoc || !weekKey) {
    return { days: [], streakCount: 0 };
  }
  const dates = weekDatesFromKey(weekKey);
  if (!Array.isArray(dates) || !dates.length) {
    return { days: [], streakCount: 0 };
  }
  const doneDays = weekDoc.doneDays || {};
  const days = dates.map((iso) => ({
    iso,
    done: Boolean(doneDays[iso]),
    isToday: iso === todayIso,
  }));

  const todayIndex = dates.indexOf(todayIso);
  let streakCount = 0;
  if (todayIndex >= 0) {
    for (let idx = todayIndex; idx >= 0; idx -= 1) {
      if (days[idx].done) {
        streakCount += 1;
      } else {
        break;
      }
    }
  }
  return { days, streakCount };
}

export function buildAchievementsSummary({
  planStats,
  streakCount,
  weeklyTotals,
  revisionCount = 0,
}) {
  const achievements = [];

  if (streakCount >= 3) {
    achievements.push({
      key: "streak-3",
      title: "Spark",
      description: "3-day consistency streak.",
    });
  }
  if (streakCount >= 7) {
    achievements.push({
      key: "streak-7",
      title: "Rhythm Builder",
      description: "One full week without missing a day.",
    });
  }
  if (streakCount >= 21) {
    achievements.push({
      key: "streak-21",
      title: "Habit Hero",
      description: "21 consecutive days of focused study.",
    });
  }
  if ((planStats?.topicsCompleted || 0) >= 25) {
    achievements.push({
      key: "topics-25",
      title: "Topic Tactician",
      description: `${planStats.topicsCompleted} topics completed.`,
    });
  }
  if ((planStats?.minutesStudied || 0) >= 600) {
    achievements.push({
      key: "minutes-600",
      title: "Time Well Spent",
      description: `${Math.round(
        (planStats.minutesStudied || 0) / 60,
      )} hours logged so far.`,
    });
  }
  if (
    (weeklyTotals?.capacity || 0) > 0 &&
    (weeklyTotals?.planned || 0) >= weeklyTotals.capacity
  ) {
    achievements.push({
      key: "capacity",
      title: "Capacity Master",
      description: "You filled the available minutes for this week.",
    });
  }
  if (revisionCount >= 3) {
    achievements.push({
      key: "revision",
      title: "Retention Champion",
      description: "Multiple revision sessions completed.",
    });
  }

  if (!achievements.length) {
    achievements.push({
      key: "keep-going",
      title: "Keep going",
      description: "Complete study sessions to unlock achievements.",
    });
  }

  return achievements.slice(0, 4);
}

const REVISION_INTERVALS = [1, 3, 7, 14, 30];

export function buildRevisionReminders(queueRows, todayIso, limit = 4) {
  if (!todayIso) return [];
  const today = toISODate(todayIso);
  if (!today) return [];

  const rows = Array.isArray(queueRows) ? queueRows : [];
  const reminders = [];

  rows.forEach((row) => {
    const scheduled = row?.scheduledDates || {};
    const isoKeys = Object.keys(scheduled);
    if (!isoKeys.length) return;
    const latestIso = isoKeys.reduce((latest, current) =>
      !latest || current > latest ? current : latest,
    );
    const daysSince = diffInDays(latestIso, today);
    if (daysSince === null || daysSince < 0) return;

    const nextInterval =
      REVISION_INTERVALS.find((interval) => daysSince < interval) ?? null;
    const dueIn = nextInterval !== null ? nextInterval - daysSince : null;
    let status = "Upcoming";

    if (nextInterval === null) {
      status = "Overdue";
    } else if (dueIn <= 0) {
      status = "Due now";
    } else if (dueIn === 1) {
      status = "Due tomorrow";
    }

    reminders.push({
      id: row?.seq || row?.topicId || row?.chapterId || latestIso,
      title:
        row?.topicName ||
        row?.chapterName ||
        row?.section ||
        "Queued topic",
      section: row?.section || null,
      lastStudied: latestIso,
      daysSince,
      dueIn,
      status,
    });
  });

  reminders.sort((a, b) => {
    const statusOrder = { "Due now": 0, "Overdue": 1, "Due tomorrow": 2, Upcoming: 3 };
    const statusDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    if (statusDiff !== 0) return statusDiff;
    return (b.daysSince ?? 0) - (a.daysSince ?? 0);
  });

  return reminders.slice(0, Math.max(0, limit));
}
