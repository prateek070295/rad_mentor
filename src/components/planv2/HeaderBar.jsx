// src/components/planv2/HeaderBar.jsx
import React from "react";

const formatNumber = (value) => {
  if (value == null || Number.isNaN(value)) return "\u2014";
  return Number(Math.round(value)).toLocaleString();
};

const formatPercent = (value) => {
  if (value == null || Number.isNaN(value)) return "\u2014";
  return `${Math.round(value * 100)}%`;
};

const formatDate = (value) => {
  if (!value) return "\u2014";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "\u2014";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function PlanSummaryCard({
  stats = {},
  onReset,
  isLoading = false,
  showResetButton = true,
  containerClassName = "",
}) {
  const gradientContainer =
    `relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-500 ` +
    `text-white shadow-2xl shadow-indigo-600/30 ${containerClassName}`;

  if (isLoading) {
    return (
      <div className={gradientContainer + " p-6 sm:p-8"}>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-indigo-400/30 mix-blend-screen" />
        <div className="pointer-events-none absolute -right-16 top-2 h-40 w-40 rounded-full bg-gradient-to-tr from-cyan-400/40 to-indigo-400/40 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <div className="h-4 w-32 rounded-full bg-white/30" />
            <div className="h-8 w-64 rounded-full bg-white/40" />
            <div className="h-3 w-48 rounded-full bg-white/20" />
          </div>
          <div className="h-9 w-32 rounded-full border border-white/30 bg-white/20 backdrop-blur animate-pulse" />
        </div>
        <div className="relative mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-white/20 bg-white/15 px-5 py-4 shadow-inner shadow-indigo-900/20 backdrop-blur animate-pulse"
            >
              <div className="h-3 w-24 rounded-full bg-white/30" />
              <div className="mt-4 h-5 w-32 rounded-full bg-white/40" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const {
    overallProgress = null,
    minutesStudied = 0,
    minutesTotal = 0,
    topicsCompleted = 0,
    topicsTotal = 0,
    projectedEndDate = null,
  } = stats;

  const minutesLabel = `${formatNumber(minutesStudied)} / ${formatNumber(minutesTotal)}`;
  const topicsLabel = `${formatNumber(topicsCompleted)} / ${formatNumber(topicsTotal)}`;

  const handleResetClick = () => {
    if (typeof onReset === "function") {
      onReset();
    }
  };

  return (
    <div className={gradientContainer + " p-6 sm:p-8"}>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-indigo-400/30 mix-blend-screen" />
      <div className="pointer-events-none absolute -right-20 top-0 h-48 w-48 rounded-full bg-gradient-to-tr from-cyan-400/40 to-indigo-400/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-gradient-to-tr from-violet-400/35 to-rose-400/35 blur-3xl" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-white/70">
            Study pulse
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Your plan at a glance
          </h1>
          <p className="mt-3 text-sm text-white/80 sm:text-base">
            Momentum, milestones, and projected landing zone for your prep.
          </p>
        </div>
        {showResetButton && (
          <button
            type="button"
            onClick={handleResetClick}
            className="inline-flex items-center justify-center rounded-full border border-white/40 bg-white/15 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={typeof onReset !== "function"}
          >
            Reset plan
          </button>
        )}
      </div>

      <dl className="relative mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/25 bg-white/10 px-5 py-4 shadow-inner shadow-indigo-900/20 backdrop-blur">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/70">
            Overall progress
          </dt>
          <dd className="mt-3 text-2xl font-semibold text-white">
            {formatPercent(overallProgress)}
          </dd>
          <dd className="mt-2 text-xs text-white/70">
            Proportion of scheduled minutes already completed.
          </dd>
        </div>
        <div className="rounded-2xl border border-white/25 bg-white/10 px-5 py-4 shadow-inner shadow-indigo-900/20 backdrop-blur">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/70">
            Minutes studied
          </dt>
          <dd className="mt-3 text-2xl font-semibold text-white">
            {minutesLabel}
          </dd>
          <dd className="mt-2 text-xs text-white/70">Logged vs scheduled.</dd>
        </div>
        <div className="rounded-2xl border border-white/25 bg-white/10 px-5 py-4 shadow-inner shadow-indigo-900/20 backdrop-blur">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/70">
            Topics completed
          </dt>
          <dd className="mt-3 text-2xl font-semibold text-white">
            {topicsLabel}
          </dd>
          <dd className="mt-2 text-xs text-white/70">Steady wins carried.</dd>
        </div>
        <div className="rounded-2xl border border-white/25 bg-white/10 px-5 py-4 shadow-inner shadow-indigo-900/20 backdrop-blur">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/70">
            Projected finish
          </dt>
          <dd className="mt-3 text-2xl font-semibold text-white">
            {formatDate(projectedEndDate)}
          </dd>
          <dd className="mt-2 text-xs text-white/70">
            Based on current pace and daily capacity.
          </dd>
        </div>
      </dl>
    </div>
  );
}
