import React from "react";

const clampPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.min(100, Math.max(0, numeric));
};

const formatProjectedDate = (value) => {
  if (!value) {
    return "--";
  }
  const date =
    value instanceof Date ? value : new Date(typeof value === "number" ? value : String(value));
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const formatDayLabel = (value) => {
  if (value === null || value === undefined) {
    return "--";
  }
  if (typeof value === "string" && value.trim().toLowerCase() === "n/a") {
    return "N/A";
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }
  if (numeric <= 0) {
    return "Today";
  }
  if (numeric === 1) {
    return "1 day";
  }
  return `${numeric} days`;
};

const statusStyles = {
  "Due now": "border border-rose-300 bg-gradient-to-r from-rose-500/15 to-rose-400/20 text-rose-700 shadow shadow-rose-200/50",
  Overdue: "border border-amber-300 bg-gradient-to-r from-amber-500/15 to-amber-400/20 text-amber-700 shadow shadow-amber-200/50",
  "Due tomorrow": "border border-sky-300 bg-gradient-to-r from-sky-500/15 to-sky-400/20 text-sky-700 shadow shadow-sky-200/50",
  Upcoming: "border border-emerald-300 bg-gradient-to-r from-emerald-500/15 to-emerald-400/20 text-emerald-700 shadow shadow-emerald-200/50",
};

const SectionCard = ({
  title,
  description,
  actionArea,
  children,
  tone = "bg-slate-50",
  accentShadow = "shadow-xl shadow-slate-900/5",
  className = "",
}) => (
  <section
    className={`rounded-3xl border border-slate-100 ${tone} p-6 sm:p-8 transition-colors ${accentShadow} ${className}`.trim()}
  >
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-slate-500 sm:text-base">{description}</p>
        ) : null}
      </div>
      {actionArea ?? null}
    </header>
    <div className="mt-5">{children}</div>
  </section>
);

const StatTile = ({ label, value, helper, accent, children }) => (
  <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-lg shadow-slate-900/5 backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-900/10">
    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">
      {label}
    </p>
    <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
    {helper ? <p className="mt-2 text-sm text-slate-500">{helper}</p> : null}
    {typeof accent === "string" ? (
      <p className="mt-2 text-xs font-medium text-indigo-600">{accent}</p>
    ) : (
      accent ?? null
    )}
    {children ? <div className="mt-4">{children}</div> : null}
  </div>
);

const AchievementHighlightCard = ({ highlight, onOpenAchievements }) => {
  const data = highlight || {};
  const currentStreak = Number(data.currentStreak ?? 0);
  const cumulativeMinutes = Number(data.cumulativeMinutes ?? 0);
  const cumulativeHours = Math.max(
    0,
    Math.round((cumulativeMinutes / 60) * 10) / 10,
  );
  const hoursDisplay =
    cumulativeHours % 1 === 0
      ? String(Math.trunc(cumulativeHours))
      : cumulativeHours.toFixed(1);
  const nextAchievement = data.nextAchievement ?? null;
  const recentlyUnlocked = Array.isArray(data.recentlyUnlocked)
    ? data.recentlyUnlocked
    : [];

  const nextPercent =
    nextAchievement && Number(nextAchievement.targetValue) > 0
      ? Math.min(
          100,
          Math.round(
            (Number(nextAchievement.progress || 0) /
              Number(nextAchievement.targetValue || 1)) *
              100,
          ),
        )
      : 0;

  const formatDisplay = (display) => {
    if (!display) return null;
    const numeric = Number(display.value ?? 0);
    const rounded = Math.round(numeric * 10) / 10;
    if (display.unit === "hours") {
      return `${rounded}${rounded === 1 ? " hr" : " hrs"}`;
    }
    if (!display.unit || display.unit === "count") {
      return `${Math.round(numeric)}`;
    }
    return `${rounded} ${display.unit}`;
  };

  const progressLabel = nextAchievement
    ? formatDisplay(nextAchievement.progressDisplay) ??
      `${Math.round(Number(nextAchievement.progress || 0))}`
    : null;
  const targetLabel = nextAchievement
    ? formatDisplay(nextAchievement.targetDisplay) ??
      `${Math.round(Number(nextAchievement.targetValue || 0))}`
    : null;

  const handleOpen = () => {
    if (typeof onOpenAchievements === "function") {
      onOpenAchievements();
    }
  };

  return (
    <section className="rounded-3xl border border-indigo-100 bg-white/85 p-6 shadow-xl shadow-indigo-200/60 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">
            Achievement highlight
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">
            {currentStreak > 0
              ? `${currentStreak}-day streak`
              : "Start your streak"}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {nextAchievement
              ? `Keep going to unlock "${nextAchievement.name}".`
              : "All core milestones unlocked. New challenges coming soon."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpen}
          disabled={typeof onOpenAchievements !== "function"}
          className="inline-flex items-center rounded-full border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-600 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:translate-y-0"
        >
          View achievements
        </button>
      </div>

      <div className="mt-6 space-y-5 text-sm text-slate-600">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-indigo-700">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em]">
              Current streak
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {currentStreak > 0 ? `${currentStreak} days` : "0 days"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-slate-700">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em]">
              Hours logged
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {cumulativeHours > 0 ? `${hoursDisplay}h` : "0h"}
            </p>
          </div>
        </div>

        {nextAchievement ? (
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Next unlock: {nextAchievement.name}</span>
              <span>{nextPercent}%</span>
            </div>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500 transition-all"
                style={{ width: `${nextPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {progressLabel ?? Math.round(Number(nextAchievement.progress || 0))} /{" "}
              {targetLabel ?? Math.round(Number(nextAchievement.targetValue || 0))}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            No upcoming milestone ó stay tuned for fresh challenges.
          </div>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Recently unlocked
          </p>
          {recentlyUnlocked.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {recentlyUnlocked.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                >
                  <span role="img" aria-hidden="true">
                    üèÜ
                  </span>
                  {item.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              Unlock achievements by logging consistent study sessions.
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
function Dashboard({
  userName = "there",
  todayFocus = "",
  todayFocusDetails = [],
  syllabusCompletion = 0,
  testScores = [],
  daysUntilExam = "N/A",
  planOverview = {},
  planOverviewLoading = false,
  studyStreak = [],
  streakCount = 0,
  achievements = [],
  revisionReminders = [],
  achievementHighlight = null,
  onStartLearning,
  onReviewTopic,
  onOpenPlan,
  onOpenTest,
  onOpenAchievements,
}) {
  const safeFocusDetails = React.useMemo(

    () => (Array.isArray(todayFocusDetails) ? todayFocusDetails : []),

    [todayFocusDetails],

  );

  const streakDays = Array.isArray(studyStreak) ? studyStreak : [];
  const achievementItems = Array.isArray(achievements) ? achievements : [];
  const reminderItems = Array.isArray(revisionReminders)
    ? revisionReminders
    : [];
  const scoreList = Array.isArray(testScores)
    ? testScores
        .map((value) => {
          const numeric = Number(value);
          return Number.isFinite(numeric) ? numeric : null;
        })
        .filter((value) => value !== null)
    : [];
  // topTopics and bottomTopics retained for future use but currently unused after card removal

  const normalizeFocusKey = (value) =>
    value == null ? "" : String(value).trim().toLowerCase();

  const focusGroups = React.useMemo(() => {
    const groups = new Map();

    const addDetail = (detail) => {
      if (!detail) return;
      const sectionName = detail.sectionName?.trim();
      const chapterName = detail.chapterName?.trim();
      if (!sectionName && !chapterName) return;
      const key = `${normalizeFocusKey(sectionName)}|${normalizeFocusKey(chapterName)}`;
      if (!groups.has(key)) {
        groups.set(key, {
          sectionName: sectionName || "Study plan",
          chapterName:
            chapterName ||
            (Array.isArray(detail?.topics) && detail.topics.length
              ? detail.topics[0]
              : todayFocus || "No focus selected"),
          topics: [],
        });
      }
      const entry = groups.get(key);
      const topicSet = new Set(
        entry.topics.map((topic) => normalizeFocusKey(topic)),
      );
      if (Array.isArray(detail?.topics)) {
        detail.topics.forEach((topic) => {
          if (!topic) return;
          const label = String(topic).trim();
          const topicKey = normalizeFocusKey(label);
          if (!topicKey || topicSet.has(topicKey)) return;
          topicSet.add(topicKey);
          entry.topics.push(label);
        });
      }
    };

    if (safeFocusDetails.length > 0) {
      safeFocusDetails.forEach(addDetail);
    }

    if (!groups.size && todayFocus) {
      const parts = todayFocus.split(":");
      if (parts.length >= 2) {
        const sectionName = parts[0].trim();
        const chapterName = parts
          .slice(1)
          .join(":")
          .replace(/\(Day \d+ of \d+\)/, "")
          .trim();
        groups.set("fallback", {
          sectionName: sectionName || "Study plan",
          chapterName: chapterName || todayFocus,
          topics: [],
        });
      }
    }

    return Array.from(groups.values()).map((group, index) => ({
      key: group.key || `${group.sectionName}-${group.chapterName}-${index}`,
      sectionName: group.sectionName || "Study plan",
      chapterName: group.chapterName || todayFocus || "No focus selected",
      topics: Array.isArray(group.topics) ? group.topics : [],
    }));
  }, [safeFocusDetails, todayFocus]);

  const hasFocusDetails = focusGroups.length > 0;
  const planStats = planOverview || {};
  const hasHighlight =
    achievementHighlight &&
    typeof achievementHighlight === "object" &&
    Object.keys(achievementHighlight).length > 0;
  const highlightData = hasHighlight
    ? achievementHighlight
    : {
        currentStreak: streakCount,
        cumulativeMinutes: planStats.minutesStudied || 0,
        nextAchievement: null,
        recentlyUnlocked: [],
      };
  const planProgressPercent =
    typeof planStats?.overallProgress === "number"
      ? clampPercent(planStats.overallProgress * 100)
      : null;
  const minutesStudied = Number(planStats?.minutesStudied || 0);
  const minutesTotal = Number(planStats?.minutesTotal || 0);
  const topicsCompleted = Number(planStats?.topicsCompleted || 0);
  const topicsTotal = Number(planStats?.topicsTotal || 0);
  const projectedEnd = formatProjectedDate(planStats?.projectedEndDate);
  const hasPlanData =
    (planProgressPercent !== null && planProgressPercent > 0) ||
    minutesTotal > 0 ||
    topicsTotal > 0;
  const sparklinePoints = Array.isArray(streakDays)
    ? streakDays.map((day) => (day.done ? 100 : 30))
    : [];
  const syllabusPercent = clampPercent(syllabusCompletion);

  const maxScore = scoreList.reduce(
    (acc, value) => (value > acc ? value : acc),
    0,
  );
  const scoreDenominator = maxScore > 0 ? maxScore : 100;
  const scoreAverage =
    scoreList.length > 0
      ? Math.round(
          scoreList.reduce((sum, value) => sum + value, 0) / scoreList.length,
        )
      : null;
  const latestDelta =
    scoreList.length > 1
      ? scoreList[scoreList.length - 1] - scoreList[scoreList.length - 2]
      : null;
  const reminderOrder = ["Due now", "Overdue", "Due tomorrow", "Upcoming"];
  const reminderGroups = reminderItems.reduce((acc, reminder) => {
    const key = reminder.status || "Upcoming";
    if (!acc[key]) acc[key] = [];
    acc[key].push(reminder);
    return acc;
  }, {});
  const reminderDecor = {
    "Due now": {
      header: "from-rose-500/20 to-rose-400/10",
      border: "border-rose-200",
    },
    Overdue: {
      header: "from-amber-500/20 to-amber-400/10",
      border: "border-amber-200",
    },
    "Due tomorrow": {
      header: "from-sky-500/20 to-sky-400/10",
      border: "border-sky-200",
    },
    Upcoming: {
      header: "from-emerald-500/20 to-emerald-400/10",
      border: "border-emerald-200",
    },
  };

  const streakSummary =
    streakCount > 0 ? `${streakCount} day streak` : "No streak yet";
  const examIsUnset =
    daysUntilExam === undefined ||
    daysUntilExam === null ||
    (typeof daysUntilExam === "string" &&
      daysUntilExam.trim().toLowerCase() === "n/a");

  const handleStartLearning = () => {
    if (typeof onStartLearning === "function") {
      onStartLearning();
    }
  };

  const handleReview = (payload, action) => {
    if (typeof onReviewTopic === "function") {
      onReviewTopic(payload, action);
    }
  };
  const handleOpenPlan = () => {
    if (typeof onOpenPlan === "function") {
      onOpenPlan();
    }
  };
  const handleOpenTest = () => {
    if (typeof onOpenTest === "function") {
      onOpenTest();
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-500 p-6 text-white shadow-2xl shadow-indigo-600/30 sm:p-8 lg:p-10 xl:col-span-2 xl:h-full">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-indigo-400/20 mix-blend-screen" />
        <div className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-gradient-to-br from-cyan-400/40 to-indigo-500/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-80 w-80 rounded-full bg-gradient-to-tr from-violet-500/35 to-pink-400/35 blur-3xl" />
        <div className="pointer-events-none absolute right-10 top-10 h-32 w-32 rounded-full border border-white/20 bg-white/10 blur-md" />
        <div className="relative flex flex-col gap-8">

          <div className="w-full space-y-6">

            <div className="inline-flex items-center rounded-full bg-white/20 px-5 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/85">

              Good morning

            </div>

            <div>

              <h1 className="text-[34px] font-semibold leading-tight tracking-tight sm:text-[40px] lg:text-[44px]">

                {userName ? `${userName}, a fresh start for the day.` : "A fresh start for the day."}

              </h1>

              <p className="mt-3 text-base text-white/85 sm:text-lg">

                Here's what's lined up for you today.

              </p>

            </div>



            <div className="w-full rounded-[32px] border border-white/20 bg-white/12 p-6 shadow-xl shadow-indigo-900/25 backdrop-blur-lg sm:p-8">

              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/70">

                Today's focus

              </p>

              {hasFocusDetails ? (

                <div className="mt-5 w-full space-y-6 text-white">

                  {focusGroups.map((group, index) => (

                    <div

                      key={group.key || `${group.sectionName}-${group.chapterName}-${index}`}

                      className="w-full rounded-3xl border border-white/20 bg-white/10 p-4 shadow-sm shadow-white/10"

                    >

                      <div className="space-y-3">

                        <div>

                          <p className="text-xs uppercase tracking-wide text-white/60">

                            Section

                          </p>

                          <p className="mt-1 text-lg font-semibold leading-tight">

                            {group.sectionName || "Study plan"}

                          </p>

                        </div>

                        <div>

                          <p className="text-xs uppercase tracking-wide text-white/60">

                            Chapter

                          </p>

                          <p className="mt-1 text-lg font-semibold leading-snug text-white">

                            {group.chapterName || "No focus selected"}

                          </p>

                        </div>

                        <div>

                          <p className="text-xs uppercase tracking-wide text-white/60">

                            Topics

                          </p>

                          {group.topics.length > 0 ? (

                            <ul className="mt-3 space-y-2 text-sm">

                              {group.topics.map((topic, topicIndex) => (

                                <li

                                  key={`${group.chapterName || group.sectionName}-${topic}-${topicIndex}`}

                                  className="flex items-center gap-3 rounded-full bg-white/10 px-3 py-1 text-sm font-medium uppercase tracking-wide text-white/85"

                                >

                                  <span className="h-2 w-2 rounded-full bg-white/80" />

                                  {topic}

                                </li>

                              ))}

                            </ul>

                          ) : (

                            <p className="mt-3 text-sm text-white/80">

                              Focus on the core objectives for this chapter.

                            </p>

                          )}

                        </div>

                      </div>

                    </div>

                  ))}

                </div>

              ) : (

                <p className="mt-4 text-sm text-white/80">

                  Nothing scheduled for today yet. When you assign work to this date, it will appear here for quick access.

                </p>

              )}

            </div>



            <div className="mt-6 flex flex-wrap items-center gap-3">

              <div className="rounded-full border border-white/40 bg-white/10 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white/80 shadow-inner shadow-white/20 backdrop-blur">

                {streakSummary}

              </div>

              <button

                type="button"

                onClick={handleStartLearning}

                className="inline-flex items-center justify-center rounded-full bg-white/95 px-7 py-3 text-sm font-semibold text-indigo-600 shadow-lg shadow-indigo-900/20 transition hover:-translate-y-0.5 hover:bg-white"

              >

                Start learning session

              </button>

            </div>

          </div>

        </div>
      </section>
      <div className="flex flex-col gap-6 xl:col-span-1">
        <AchievementHighlightCard
          highlight={highlightData}
          onOpenAchievements={onOpenAchievements}
        />
        <SectionCard
          tone="bg-white/75"
          className="flex h-full flex-col justify-between"
          title="At a glance"
          description="Your key vitals for today."
        >
          <div className="space-y-3">
            <StatTile
              label="Syllabus completion"
              value={
                syllabusPercent === null ? "--" : `${Math.round(syllabusPercent)}%`
              }
              helper="Tracked topics completed."
            />
            <StatTile
              label="Next exam"
              value={examIsUnset ? "--" : formatDayLabel(daysUntilExam)}
              helper={
                examIsUnset ? "No exam date set yet." : "Time left until exam day."
              }
            >
              {examIsUnset ? (
                <button
                  type="button"
                  onClick={handleOpenPlan}
                  className="inline-flex items-center rounded-full border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50"
                >
                  Set exam date
                </button>
              ) : null}
            </StatTile>
            <StatTile
              label="Current streak"
              value={streakCount > 0 ? `${streakCount} days` : "0 days"}
              helper="Complete at least one study session per day."
            />
          </div>
        </SectionCard>
      </div>
      <SectionCard
        tone="bg-gradient-to-br from-indigo-50 via-white to-sky-50"
        accentShadow="shadow-2xl shadow-indigo-200/60"
        className="xl:col-span-3"
        title="Plan pulse"
        description="An intelligent snapshot of your trajectory and daily cadence."
        actionArea={
          <div className="flex items-center gap-2">
            {planOverviewLoading ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                <span className="h-2 w-2 animate-ping rounded-full bg-indigo-500/80" />
                Refreshing...
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleOpenPlan}
              className="inline-flex items-center rounded-full border border-indigo-300 bg-white/70 px-4 py-2 text-xs font-semibold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:bg-white"
            >
              Refine plan
            </button>
          </div>
        }
      >
        {planOverviewLoading ? (
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-4">
              <div className="h-8 rounded-xl bg-white/60" />
              <div className="h-3 rounded-full bg-white/50" />
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="h-20 rounded-2xl bg-white/60" />
                <div className="h-20 rounded-2xl bg-white/60" />
                <div className="h-20 rounded-2xl bg-white/60" />
              </div>
            </div>
            <div className="h-32 rounded-2xl bg-white/60" />
          </div>
        ) : hasPlanData ? (
          <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between text-sm font-medium text-slate-600">
                  <span>Overall progress</span>
                  <span>{planProgressPercent === null ? "--" : `${planProgressPercent}%`}</span>
                </div>
                <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-white/60">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-400 shadow-inner shadow-indigo-500/30"
                    style={{ width: `${planProgressPercent ?? 0}%` }}
                  />
                  <div className="absolute inset-0 rounded-full border border-white/20" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-md shadow-indigo-200/40 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Minutes</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {minutesStudied} <span className="text-base font-medium text-slate-500">/ {minutesTotal}</span>
                  </p>
                  <p className="mt-2 text-xs text-slate-500">Logged vs scheduled</p>
                </div>
                <div className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-md shadow-indigo-200/40 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Topics</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {topicsCompleted} <span className="text-base font-medium text-slate-500">/ {topicsTotal}</span>
                  </p>
                  <p className="mt-2 text-xs text-slate-500">Completed so far</p>
                </div>
                <div className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-md shadow-indigo-200/40 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Projected finish</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {projectedEnd}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">Based on current cadence</p>
                </div>
              </div>
            </div>
            <div className="flex h-full flex-col justify-between rounded-2xl border border-white/60 bg-white/70 p-4 shadow-md shadow-indigo-200/40 backdrop-blur-sm">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Consistency</p>
                <p className="mt-2 text-sm text-slate-600">Past seven days</p>
              </div>
              <div className="mt-4 flex h-24 items-end gap-1">
                {sparklinePoints.map((value, index) => (
                  <div
                    key={`spark-${index}`}
                    className="flex-1 rounded-t-full bg-gradient-to-t from-indigo-200 to-indigo-500 transition hover:from-indigo-300 hover:to-indigo-600"
                    style={{ height: `${Math.max(20, value)}%` }}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {streakCount > 0
                  ? `You're on a ${streakCount}-day streak. Keep that momentum going!`
                  : "Complete a session today to start your streak."}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-indigo-200 bg-white/70 p-6 text-sm text-slate-600 shadow-inner shadow-indigo-100/60 backdrop-blur">
            You haven't created a detailed plan yet. Once you do, we'll give you a personal progress pulse here.
          </div>
        )}
      </SectionCard>
      <SectionCard
        tone="bg-indigo-50"
        className="xl:col-span-1"
        title="Performance trend"
        description="Keep tabs on your assessment progress."
      >
        {scoreList.length > 0 ? (
          <div className="space-y-4">
            {latestDelta !== null ? (
              <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${latestDelta >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                {latestDelta >= 0 ? "+ " : "- "}{Math.abs(latestDelta)} vs last test
              </div>
            ) : null}
            <div className="relative flex h-32 items-end gap-2 rounded-2xl border border-indigo-100 bg-white/80 p-4 shadow-inner shadow-indigo-200/40">
              {scoreList.map((score, index) => {
                const height = Math.max(
                  8,
                  Math.round((score / scoreDenominator) * 100),
                );
                return (
                  <div
                    key={`${score}-${index}`}
                    className="group flex-1 rounded-t-md bg-gradient-to-t from-indigo-400 to-indigo-600 transition hover:from-indigo-500 hover:to-indigo-700"
                    style={{ height: `${height}%` }}
                    title={`Attempt ${index + 1}: ${score}`}
                  >
                    <div className="hidden select-none text-center text-[10px] font-semibold text-indigo-900/70 group-hover:block">
                      {score}
                    </div>
                  </div>
                );
              })}
              {scoreAverage !== null ? (
                <div
                  className="pointer-events-none absolute inset-x-3"
                  style={{ bottom: `${Math.min(100, Math.max(0, (scoreAverage / scoreDenominator) * 100))}%` }}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-indigo-400 to-transparent" />
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 shadow-sm">
                      Avg {scoreAverage}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-indigo-400 to-transparent" />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Latest</span>
              <span>Best: {maxScore}</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-indigo-200 bg-white/70 p-6 text-center text-sm text-slate-500">
            <p>No tests taken yet.</p>
            <button
              type="button"
              onClick={handleOpenTest}
              className="inline-flex items-center rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              Go to tests
            </button>
          </div>
        )}
      </SectionCard>
      <SectionCard
        tone="bg-indigo-50"
        className="xl:col-span-1"
        title="Revision reminders"
        description="Stay sharp by spacing out review sessions."
      >
        {reminderItems.length > 0 ? (
          <div className="space-y-4">
            {reminderOrder
              .filter((status) => reminderGroups[status])
              .map((status) => {
                const entries = reminderGroups[status];
                const decor = reminderDecor[status] || reminderDecor.Upcoming;
                const badgeStyle =
                  statusStyles[status] ||
                  "bg-slate-100 text-slate-600 border border-slate-200 shadow-sm";
                return (
                  <div
                    key={status}
                    className={`rounded-2xl border ${decor.border} bg-gradient-to-r ${decor.header} p-4`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700">{status}</p>
                      <span className="text-xs text-slate-500">
                        {entries.length} reminder{entries.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    <ul className="space-y-3">
                      {entries.map((reminder, index) => (
                        <li
                          key={reminder.id || `${reminder.title}-${index}`}
                          className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-white/60 bg-white/80 px-4 py-3 shadow-sm shadow-slate-200/40 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-200/60"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              {reminder.title}
                            </p>
                            <p className="text-xs text-slate-500">
                              Last studied: {formatProjectedDate(reminder.lastStudied)} - {reminder.daysSince || 0} days ago
                            </p>
                            {reminder.section ? (
                              <p className="mt-1 text-xs text-slate-400">
                                {reminder.section}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badgeStyle}`}
                            >
                              {reminder.status}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleReview(reminder, "revision-reminder")}
                              className="inline-flex items-center rounded-full border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50"
                            >
                              Review
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-indigo-200 bg-white/70 p-6 text-center text-sm text-slate-500">
            No revision items are pending. Completed topics will prompt reminders once they reach their spaced revision window.
          </div>
        )}
      </SectionCard>
      <SectionCard
        tone="bg-emerald-50"
        accentShadow="shadow-xl shadow-emerald-200/40"
        className="xl:col-span-1"
        title="Achievements"
        description="Milestones unlocked from recent progress."
      >
        {achievementItems.length > 0 ? (
          <ul className="space-y-3">
            {achievementItems.map((achievement, index) => (
              <li
                key={achievement.key || `${achievement.title}-${index}`}
                className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm"
              >
                <p className="font-semibold">{achievement.title}</p>
                <p className="text-xs text-emerald-700/80">
                  {achievement.description}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">
            Achievements will appear as you complete study sessions and hit consistency streaks.
          </p>
        )}
      </SectionCard>
      <SectionCard
        tone="bg-white/80"
        className="xl:col-span-3"
        title="Weekly streak"
        description="Mark at least one session per day to grow your streak."
      >
        {streakDays.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
            {streakDays.map((day) => {
              const date = formatProjectedDate(day.iso);
              const isDone = Boolean(day.done);
              const isToday = Boolean(day.isToday);
              return (
                <div
                  key={day.iso}
                  className={`flex h-full flex-col items-center justify-center rounded-xl border px-3 py-3 text-xs font-medium transition ${
                    isDone
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                  } ${isToday ? "ring-2 ring-indigo-300" : ""} hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/70`}
                >
                  <span>{date}</span>
                  <span className="mt-1 text-[11px] uppercase tracking-wide">
                    {isToday ? "Today" : isDone ? "Complete" : "Pending"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-center text-sm text-slate-500">
            Complete a study session to start building your streak.
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default Dashboard;








