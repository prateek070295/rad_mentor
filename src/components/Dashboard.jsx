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
  "Due now": "bg-rose-100 text-rose-700 border border-rose-200",
  Overdue: "bg-orange-100 text-orange-700 border border-orange-200",
  "Due tomorrow": "bg-amber-100 text-amber-700 border border-amber-200",
  Upcoming: "bg-emerald-100 text-emerald-700 border border-emerald-200",
};

const chipColors = [
  "bg-sky-100 text-sky-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
  "bg-purple-100 text-purple-700",
  "bg-blue-100 text-blue-700",
];

const SectionCard = ({
  title,
  description,
  actionArea,
  children,
  className = "",
}) => (
  <section
    className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`.trim()}
  >
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description ? (
          <p className="text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {actionArea ?? null}
    </header>
    <div className="mt-4">{children}</div>
  </section>
);

const StatTile = ({ label, value, helper, accent, children }) => (
  <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </p>
    <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    {helper ? <p className="mt-1 text-sm text-slate-500">{helper}</p> : null}
    {typeof accent === "string" ? (
      <p className="mt-2 text-xs font-medium text-indigo-600">{accent}</p>
    ) : (
      accent ?? null
    )}
    {children ? <div className="mt-3">{children}</div> : null}
  </div>
);

const Pill = ({ children, toneIndex = 0 }) => {
  const tone = chipColors[toneIndex % chipColors.length];
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${tone}`}
    >
      {children}
    </span>
  );
};

function Dashboard({
  userName = "there",
  todayFocus = "",
  todayFocusDetails = [],
  syllabusCompletion = 0,
  testScores = [],
  topTopics = [],
  bottomTopics = [],
  daysUntilExam = "N/A",
  queueSnapshot = [],
  studyStreak = [],
  streakCount = 0,
  achievements = [],
  revisionReminders = [],
  onStartLearning,
  onReviewTopic,
  onOpenPlan,
  onOpenTest,
}) {
  const safeFocusDetails = Array.isArray(todayFocusDetails)
    ? todayFocusDetails
    : [];
  const queueItems = Array.isArray(queueSnapshot) ? queueSnapshot : [];
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
  const topTopicList = Array.isArray(topTopics) ? topTopics : [];
  const bottomTopicList = Array.isArray(bottomTopics) ? bottomTopics : [];

  const hasFocusDetails = safeFocusDetails.length > 0;
  const primaryFocus = hasFocusDetails ? safeFocusDetails[0] : null;
  const focusSection = primaryFocus?.sectionName || "Study plan";
  const focusChapter =
    primaryFocus?.chapterName ||
    (Array.isArray(primaryFocus?.topics) ? primaryFocus.topics[0] : null) ||
    todayFocus ||
    "No focus selected";
  const focusTopics = Array.isArray(primaryFocus?.topics)
    ? primaryFocus.topics.filter(Boolean)
    : [];
  const syllabusPercent = clampPercent(syllabusCompletion);

  const maxScore = scoreList.reduce(
    (acc, value) => (value > acc ? value : acc),
    0,
  );
  const scoreDenominator = maxScore > 0 ? maxScore : 100;

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
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500 via-indigo-500 to-blue-500 p-8 text-white shadow-xl sm:p-10 lg:p-12 xl:col-span-2">
        <div className="absolute inset-y-0 right-[-20%] h-full w-2/3 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-[-40%] left-[-10%] h-2/3 w-1/2 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-2xl space-y-6">
            <div className="inline-flex items-center rounded-full bg-white/15 px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-white/80">
              Good morning
            </div>
            <div>
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
                {userName ? `${userName}, a fresh start for the day.` : "A fresh start for the day."}
              </h1>
              <p className="mt-3 text-base text-white/80">
                Here's what's lined up for you today.
              </p>
            </div>

            <div className="rounded-[32px] border border-white/20 bg-white/10 p-6 shadow-inner backdrop-blur-sm sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                Today's focus
              </p>
              {primaryFocus || todayFocus ? (
                <div className="mt-4 space-y-4 text-white">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/60">
                      Section
                    </p>
                    <p className="mt-1 text-lg font-semibold">{focusSection}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/60">
                      Chapter
                    </p>
                    <p className="mt-1 text-lg font-semibold leading-snug">
                      {focusChapter}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/60">
                      Topics
                    </p>
                    {focusTopics.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-sm">
                        {focusTopics.map((topic, index) => (
                          <li key={`${topic}-${index}`} className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                            <span className="font-medium">{topic}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-white/80">
                        {todayFocus || "Add topics to your plan to populate this section."}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-white/80">
                  Nothing scheduled for today yet. When you assign work to this date, it will appear here for quick access.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-4">
            <div className="rounded-full border border-white/30 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white/80">
              {streakSummary}
            </div>
            <button
              type="button"
              onClick={handleStartLearning}
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-indigo-600 shadow-lg shadow-black/10 transition hover:translate-y-[1px] hover:bg-slate-50"
            >
              Start learning session
            </button>
          </div>
        </div>
      </section>
      <SectionCard
        className="xl:col-span-1"
        title="At a glance"
        description="A quick snapshot of where things stand."
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
            helper={examIsUnset ? "No exam date set yet." : "Time left until exam day."}
          >
            {examIsUnset ? (
              <button
                type="button"
                onClick={handleOpenPlan}
                className="inline-flex items-center rounded-full border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50"
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
      <SectionCard
        className="xl:col-span-1"
        title="Performance trend"
        description="Keep tabs on your assessment progress."
      >
        {scoreList.length > 0 ? (
          <div className="space-y-4">
            <div className="flex h-32 items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {scoreList.map((score, index) => {
                const height = Math.max(
                  8,
                  Math.round((score / scoreDenominator) * 100),
                );
                return (
                  <div
                    key={`${score}-${index}`}
                    className="group flex-1 rounded-t bg-gradient-to-t from-indigo-200 to-indigo-500 transition hover:from-indigo-300 hover:to-indigo-600"
                    style={{ height: `${height}%` }}
                    title={`Attempt ${index + 1}: ${score}`}
                  >
                    <div className="hidden select-none text-center text-[10px] font-semibold text-indigo-900/70 group-hover:block">
                      {score}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Latest</span>
              <span>Best: {maxScore}</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
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
        className="xl:col-span-1"
        title="Revision reminders"
        description="Stay sharp by spacing out review sessions."
      >
        {reminderItems.length > 0 ? (
          <ul className="space-y-3">
            {reminderItems.map((reminder, index) => {
              const badgeStyle =
                statusStyles[reminder.status] ||
                "bg-slate-100 text-slate-600 border border-slate-200";
              return (
                <li
                  key={reminder.id || `${reminder.title}-${index}`}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
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
                      className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      Review
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No revision items are pending. Completed topics will prompt reminders once they reach their spaced revision window.
          </div>
        )}
      </SectionCard>
      <SectionCard
        className="xl:col-span-1"
        title="Queue snapshot"
        description="The next few topics waiting in your master queue."
      >
        {queueItems.length > 0 ? (
          <ul className="space-y-3">
            {queueItems.map((item, index) => (
              <li
                key={item.id || `${item.title}-${index}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {item.title || "Queued topic"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.section || "Plan queue"} - {Math.round(Number(item.minutes || 0))} minutes
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleReview(item, "queue-item")}
                  className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Review
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            Your queue is empty. Add more topics from the planner to keep momentum going.
          </div>
        )}
      </SectionCard>
      <SectionCard
        className="xl:col-span-1"
        title="Strongest topics"
        description="Keep reinforcing what is already working."
      >
        {topTopicList.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {topTopicList.map((topic, index) => (
              <Pill key={`${topic}-${index}`} toneIndex={index}>
                {topic}
              </Pill>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            We will highlight your best-performing areas once you log some assessments.
          </p>
        )}
      </SectionCard>
      <SectionCard
        className="xl:col-span-1"
        title="Needs attention"
        description="Plan extra review sessions for these areas."
      >
        {bottomTopicList.length > 0 ? (
          <ul className="space-y-2 text-sm text-slate-600">
            {bottomTopicList.map((topic, index) => (
              <li
                key={`${topic}-${index}`}
                className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-rose-700"
              >
                <span>{topic}</span>
                <button
                  type="button"
                  onClick={() => handleReview({ topic }, "needs-attention")}
                  className="text-xs font-semibold text-rose-600 underline-offset-2 hover:underline"
                >
                  Add review
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">
            Once you have enough results, we will surface topics that need more work.
          </p>
        )}
      </SectionCard>
      <SectionCard
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
        className="xl:col-span-2"
        title="Weekly streak"
        description="Mark at least one session per day to grow your streak."
      >
        {streakDays.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {streakDays.map((day) => {
              const date = formatProjectedDate(day.iso);
              const isDone = Boolean(day.done);
              const isToday = Boolean(day.isToday);
              return (
                <div
                  key={day.iso}
                  className={`flex min-w-[90px] flex-col items-center rounded-xl border px-3 py-2 text-xs font-medium ${
                    isDone
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                  } ${isToday ? "ring-2 ring-indigo-300" : ""}`}
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
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            Complete a study session to start building your streak.
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default Dashboard;
