import React, { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";

const clampMinutes = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
};

const quickAdjustments = [-60, -30, -10, -5, 5, 10, 30, 60];

export default function DayCapacityModal({
  isOpen,
  iso,
  dateLabel,
  initialMinutes = 0,
  usedMinutes = 0,
  summaryItems = [],
  initialIsOff = false,
  onCancel,
  onSave,
}) {
  const safeInitialMinutes = useMemo(
    () => clampMinutes(initialMinutes),
    [initialMinutes],
  );
  const safeUsedMinutes = useMemo(
    () => clampMinutes(usedMinutes),
    [usedMinutes],
  );

  const [minutesValue, setMinutesValue] = useState(safeInitialMinutes);
  const [isOff, setIsOff] = useState(!!initialIsOff);

  useEffect(() => {
    if (!isOpen) return;
    setMinutesValue(safeInitialMinutes);
    setIsOff(!!initialIsOff);
  }, [isOpen, safeInitialMinutes, initialIsOff, iso]);

  const remainingMinutes = useMemo(() => {
    const diff = clampMinutes(minutesValue) - safeUsedMinutes;
    return diff;
  }, [minutesValue, safeUsedMinutes]);

  const handleQuickAdjust = (delta) => {
    setMinutesValue((prev) => {
      const next = clampMinutes(prev + delta);
      return next;
    });
  };

  const handleInputChange = (event) => {
    const raw = event?.target?.value ?? "";
    if (raw === "") {
      setMinutesValue(0);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    setMinutesValue(clampMinutes(parsed));
  };

  const handleBlur = () => {
    setMinutesValue((prev) => clampMinutes(prev));
  };

  const handleSave = () => {
    const minutes = clampMinutes(minutesValue);
    onSave?.({ minutes, isOff });
  };

  const handleCancel = () => {
    onCancel?.();
  };

  const handleToggleOff = () => {
    setIsOff((prev) => !prev);
  };

  const modalTitle = dateLabel
    ? `Adjust ${dateLabel}`
    : iso
      ? `Adjust ${iso}`
      : "Adjust Day";

  const hasSummary = Array.isArray(summaryItems) && summaryItems.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title={modalTitle}
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 shadow-inner shadow-indigo-100/60">
          <div className="text-xs uppercase tracking-wide text-indigo-500">
            Daily Capacity
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-800">
            {clampMinutes(minutesValue)} min planned
          </div>
          <div className="text-xs text-slate-600">
            {safeUsedMinutes} min scheduled &middot;{" "}
            {remainingMinutes >= 0 ? (
              <span className="text-emerald-600">
                {remainingMinutes} min remaining
              </span>
            ) : (
              <span className="text-rose-600">
                Over capacity by {Math.abs(remainingMinutes)} min
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Minutes for this day
            <input
              type="number"
              min={0}
              step={5}
              value={clampMinutes(minutesValue)}
              onChange={handleInputChange}
              onBlur={handleBlur}
              className="mt-2 w-full rounded-xl border border-indigo-100 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-indigo-100/60 focus:border-indigo-300 focus:outline-none"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {quickAdjustments.map((delta) => (
              <button
                key={delta}
                type="button"
                className="rounded-full border border-indigo-100 bg-white px-3 py-1 text-xs font-semibold text-indigo-600 shadow-sm shadow-indigo-100/50 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50"
                onClick={() => handleQuickAdjust(delta)}
              >
                {delta > 0 ? `+${delta}` : delta} min
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-100/60">
          <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
              checked={isOff}
              onChange={handleToggleOff}
            />
            Mark this day as an off day
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Off days keep topics safe but exclude them from daily reminders.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-100/60">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Scheduled summary
          </div>
          {hasSummary ? (
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {summaryItems.slice(0, 6).map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="truncate">{item.label}</span>
                  <span className="text-xs font-semibold text-slate-500">
                    {Number(item.minutes || 0)} min
                  </span>
                </li>
              ))}
              {summaryItems.length > 6 && (
                <li className="text-xs text-slate-400">
                  +{summaryItems.length - 6} more items
                </li>
              )}
            </ul>
          ) : (
            <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">
              Nothing scheduled for this day yet.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:-translate-y-0.5 hover:bg-slate-50"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-full border border-indigo-500 bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleSave}
          >
            Save changes
          </button>
        </div>
      </div>
    </Modal>
  );
}
