// src/components/AchievementsHub.jsx
import React, { useMemo, useState } from "react";

import {
  composeAchievementCatalog,
  deriveAchievementHighlight,
} from "../utils/achievements";

const DEFAULT_CATEGORY = "General milestones";

const formatDate = (value) => {
  if (!value) return null;
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
      ? new Date(value)
      : typeof value?.toDate === "function"
      ? value.toDate()
      : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const radialProgressClass =
  "relative h-14 w-14 shrink-0 rounded-full border-8 border-indigo-100 transition-all";

export default function AchievementsHub({
  definitions = [],
  achievements = [],
  meta = null,
  highlight = null,
  onBack,
}) {
  const highlightState = highlight || deriveAchievementHighlight({ meta });

  const catalog = useMemo(
    () => composeAchievementCatalog(definitions, achievements, meta),
    [definitions, achievements, meta],
  );

  const categories = useMemo(() => {
    const map = new Map();
    catalog.forEach((item) => {
      const category = item.category || DEFAULT_CATEGORY;
      if (!map.has(category)) {
        map.set(category, []);
      }
      map.get(category).push(item);
    });
    return Array.from(map.entries()).map(([category, items]) => {
      const unlockedCount = items.filter((x) => x.unlocked).length;
      const sorted = [...items].sort(
        (a, b) =>
          (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
      );
      return { category, items: sorted, unlockedCount };
    });
  }, [catalog]);

  const totalUnlocked = useMemo(
    () => catalog.filter((item) => item.unlocked).length,
    [catalog],
  );

  const totalAchievements = catalog.length;
  const streakDays = Number(highlightState?.currentStreak ?? 0);
  const hoursLogged = Math.max(
    0,
    Math.round(((highlightState?.cumulativeMinutes ?? 0) / 60) * 10) / 10,
  );

  const [selected, setSelected] = useState(null);

  const handleSelect = (item) => {
    setSelected(item);
  };

  const closeModal = () => setSelected(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-emerald-50 pb-16">
      <div className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-500">
              Achievements hub
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-[40px]">
              Celebrate your milestones
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Track consistency streaks, cumulative effort, and upcoming
              unlocks. Each badge celebrates mastery along your RadMentor
              journey.
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center rounded-full border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50"
          >
            ← Back to dashboard
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile
            title="Current streak"
            value={streakDays > 0 ? `${streakDays} days` : "No streak yet"}
            subtitle="Keep your momentum going."
          />
          <SummaryTile
            title="Hours logged"
            value={hoursLogged > 0 ? `${hoursLogged} hrs` : "0 hrs"}
            subtitle="Total focused study time."
          />
          <SummaryTile
            title="Milestones unlocked"
            value={`${totalUnlocked} / ${totalAchievements}`}
            subtitle="Achievements earned so far."
          />
          <SummaryTile
            title="Recent highlights"
            value={
              Array.isArray(highlightState?.recentlyUnlocked) &&
              highlightState.recentlyUnlocked.length
                ? highlightState.recentlyUnlocked[0].name
                : "None yet"
            }
            subtitle="Latest badge collected."
          />
        </div>

        {categories.length === 0 ? (
          <div className="mt-12 rounded-3xl border border-dashed border-indigo-200 bg-white/80 px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
            No achievements defined yet. Check back soon!
          </div>
        ) : (
          <div className="mt-12 space-y-12">
            {categories.map(({ category, items, unlockedCount }) => (
              <section
                key={category}
                className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg shadow-slate-200/50"
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">
                      {category}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {unlockedCount} of {items.length} unlocked
                    </p>
                  </div>
                </header>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => (
                    <AchievementCard
                      key={item.id}
                      item={item}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <AchievementDetailModal item={selected} onClose={closeModal} />
      )}
    </div>
  );
}

const SummaryTile = ({ title, value, subtitle }) => (
  <div className="rounded-2xl border border-indigo-100 bg-white/90 p-5 shadow shadow-indigo-200/50">
    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-indigo-500">
      {title}
    </p>
    <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
    <p className="mt-2 text-xs text-slate-500">{subtitle}</p>
  </div>
);

const AchievementCard = ({ item, onSelect }) => {
  const unlocked = item.unlocked;
  const ratio = Math.min(1, Math.max(0, item.progressRatio ?? 0));

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`group flex items-center gap-4 rounded-2xl border px-4 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-xl ${
        unlocked
          ? "border-emerald-200 bg-emerald-50/70 text-emerald-800"
          : "border-slate-200 bg-white/80 text-slate-700"
      }`}
    >
      <div
        className={`${radialProgressClass} ${
          unlocked
            ? "border-emerald-300 bg-emerald-100/90 shadow-inner shadow-emerald-300/40"
            : "border-slate-200 bg-white shadow-inner shadow-slate-200/40"
        }`}
      >
        <div
          className="absolute inset-0 rounded-full border-8 border-transparent"
          style={{
            borderTopColor: unlocked ? "#047857" : "#4f46e5",
            borderRightColor: unlocked ? "#047857" : "#8b5cf6",
            transform: `rotate(${ratio * 360}deg)`,
            transition: "transform 0.4s ease",
          }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
          {Math.round(ratio * 100)}%
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{item.name}</p>
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
          {item.description}
        </p>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-indigo-500">
          {unlocked
            ? "Unlocked"
            : item.progressDisplay && item.targetDisplay
            ? `${item.progressDisplay.value}${
                item.progressDisplay.unit === "hours" ? " hrs" : ""
              } / ${item.targetDisplay.value}${
                item.targetDisplay.unit === "hours" ? " hrs" : ""
              }`
            : ""}
        </p>
      </div>
    </button>
  );
};

const AchievementDetailModal = ({ item, onClose }) => {
  const unlocked = item?.unlocked;
  const unlockedDate = formatDate(item?.unlockedAt);
  const ratio = Math.min(1, Math.max(0, item.progressRatio ?? 0));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4 py-8 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-2xl shadow-indigo-200/60">
        <div className="flex items-center justify-between border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-emerald-50 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">
              {item?.category || DEFAULT_CATEGORY}
            </p>
            <h3 className="text-xl font-semibold text-slate-900">
              {item?.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="space-y-5 px-5 py-6 text-sm text-slate-600">
          <p>{item?.description}</p>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              <span>{unlocked ? "Achievement unlocked" : "Progress"}</span>
              <span>{Math.round(ratio * 100)}%</span>
            </div>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500 transition-all"
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
            <div className="mt-3 flex justify-between text-xs text-slate-500">
              <span>
                {item?.progressDisplay
                  ? `${item.progressDisplay.value}${
                      item.progressDisplay.unit === "hours" ? " hrs" : ""
                    }`
                  : Math.round(Number(item?.progress ?? 0))}
              </span>
              <span>
                {item?.targetDisplay
                  ? `${item.targetDisplay.value}${
                      item.targetDisplay.unit === "hours" ? " hrs" : ""
                    }`
                  : Math.round(Number(item?.targetValue ?? 0))}
              </span>
            </div>
            {unlockedDate ? (
              <p className="mt-3 text-xs text-emerald-600">
                Unlocked on {unlockedDate}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

