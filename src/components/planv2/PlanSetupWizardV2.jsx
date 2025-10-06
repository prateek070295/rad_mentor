// src/components/planv2/PlanSetupWizardV2.jsx
import React, { useEffect, useState } from "react";
import Modal from "../Modal";
import { listSections } from "../../services/masterPlanBuilder";
import { fmtISO } from "./utils";

export default function PlanSetupWizardV2({
  initial,
  defaultDaily = 90,
  onCancel,
  onSave,
}) {
  const [form, setForm] = useState(() => ({
    startDate: initial?.startDate || fmtISO(new Date()),
    examDate: initial?.examDate || "",
    dailyMinutes:
      initial && initial.dailyMinutes != null
        ? Number(initial.dailyMinutes)
        : Number(defaultDaily),
  }));
  const [feasibility, setFeasibility] = useState("");
  const [busyText, setBusyText] = useState("");

  // section ordering
  const [order, setOrder] = useState([]);
  const [secLoading, setSecLoading] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);

  // derive feasibility text
  useEffect(() => {
    const daily = Math.max(0, Number(form.dailyMinutes) || 0);
    const hoursPerWeek = Math.round((daily * 7) / 60);
    if (form.startDate && form.examDate) {
      const s = new Date(form.startDate);
      const e = new Date(form.examDate);
      const days = Math.max(0, Math.ceil((e - s) / 86400000));
      setFeasibility(
        `${days} days until exam - ~${hoursPerWeek} h/week at your current daily target`,
      );
    } else {
      setFeasibility(`~${hoursPerWeek} h/week at your current daily target`);
    }
  }, [form]);

  // load sections for ordering (optional)
  useEffect(() => {
    let active = true;
    (async () => {
      setSecLoading(true);
      try {
        const arr = await listSections(); // returns array of section names
        if (!active) return;
        setOrder(arr);
      } catch (_e) {
        // ignore; Save should still be enabled when sections fail to load
      } finally {
        active && setSecLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const update = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const disabled =
    !form.startDate || Number(form.dailyMinutes) <= 0 || !!busyText;

  // simple drag to reorder
  const onDragStart = (idx) => setDragIdx(idx);
  const onDragOver = (e) => e.preventDefault();
  const onDrop = (idx) => {
    if (dragIdx === null || dragIdx === idx) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIdx(null);
  };

  return (
    <Modal isOpen={true} onClose={disabled ? undefined : onCancel}>
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b">
        <h2 className="text-lg font-semibold">Plan setup</h2>
        <p className="text-xs text-gray-500">
          Save to generate your Master Plan and timeline. Drag to reorder
          sections (optional).
        </p>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Start date *">
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => update("startDate", e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              disabled={!!busyText}
            />
          </Field>

          <Field label="Exam date (optional)">
            <input
              type="date"
              value={form.examDate}
              onChange={(e) => update("examDate", e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              disabled={!!busyText}
            />
          </Field>

          <Field label="Time per day * (minutes)">
            <input
              type="number"
              min={0}
              value={form.dailyMinutes}
              onChange={(e) => update("dailyMinutes", e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              disabled={!!busyText}
            />
          </Field>
        </div>

        {/* Feasibility */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
          {feasibility}
        </div>

        {/* Section order (drag, optional) */}
        <div className="rounded-xl border p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-semibold text-sm">Section order</div>
            {secLoading && (
              <div className="text-xs text-gray-500">Loading...</div>
            )}
          </div>

          {order.length === 0 ? (
            <div className="text-xs text-gray-500">
              No sections found yet. You can still save - we'll use the default
              ordering.
            </div>
          ) : (
            <ul className="space-y-2">
              {order.map((s, idx) => (
                <li
                  key={s}
                  draggable={!busyText}
                  onDragStart={() => onDragStart(idx)}
                  onDragOver={onDragOver}
                  onDrop={() => onDrop(idx)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 bg-white ${
                    dragIdx === idx ? "opacity-70" : ""
                  }`}
                  title="Drag to reorder"
                >
                  <div className="flex items-center gap-2">
                    <span className="cursor-grab select-none">⋮⋮</span>
                    <div className="font-semibold truncate">{s}</div>
                  </div>
                  <div className="text-xs text-gray-400">#{idx + 1}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Busy/progress text */}
        {busyText && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-900">
            {busyText}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={!!busyText}
            className="rounded-md border px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form, setBusyText, order)}
            disabled={disabled}
            className={`rounded-md px-4 py-2 text-white ${
              disabled ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {busyText ? "Working..." : "Save plan"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-gray-700">{label}</span>
      {children}
    </label>
  );
}
