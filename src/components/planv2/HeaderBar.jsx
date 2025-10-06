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

export default function PlanSummaryCard({ stats = {}, onReset }) {
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
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Study Overview
          </h1>
          <p className="text-sm text-gray-500">
            Quick snapshot of your master plan progress
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetClick}
          className="inline-flex items-center justify-center rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={typeof onReset !== "function"}
        >
          Reset Plan
        </button>
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Overall Progress
          </dt>
          <dd className="mt-1 text-lg font-semibold text-gray-900">
            {formatPercent(overallProgress)}
          </dd>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Minutes Studied
          </dt>
          <dd className="mt-1 text-lg font-semibold text-gray-900">
            {minutesLabel}
          </dd>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Topics Completed
          </dt>
          <dd className="mt-1 text-lg font-semibold text-gray-900">
            {topicsLabel}
          </dd>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Projected End Date
          </dt>
          <dd className="mt-1 text-lg font-semibold text-gray-900">
            {formatDate(projectedEndDate)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
