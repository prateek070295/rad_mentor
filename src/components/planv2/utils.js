// src/components/planv2/utils.js
import { weekKeyFromDate } from "../../services/planV2Api";

/** Local YYYY-MM-DD (no UTC shift) */
export const fmtISO = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const da = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};

export const addDays = (date, n) => {
  const x = new Date(date);
  x.setDate(x.getDate() + n);
  return x;
};

export const getWeekDates = (anchor) => {
  const key = weekKeyFromDate(anchor); // Monday start, local
  const start = new Date(`${key}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

const THEME_PALETTES = [
  { base: "#1d4ed8", scheduled: "#3b82f6", completed: "#1e40af", border: "#1e3a8a", text: "#ffffff" },
  { base: "#0f766e", scheduled: "#14b8a6", completed: "#0d9488", border: "#0f766e", text: "#ffffff" },
  { base: "#7c3aed", scheduled: "#a855f7", completed: "#6d28d9", border: "#5b21b6", text: "#ffffff" },
  { base: "#dc2626", scheduled: "#f97316", completed: "#b91c1c", border: "#7f1d1d", text: "#ffffff" },
  { base: "#0ea5e9", scheduled: "#38bdf8", completed: "#0284c7", border: "#0369a1", text: "#0f172a" },
  { base: "#facc15", scheduled: "#fde047", completed: "#f59e0b", border: "#d97706", text: "#1f2937" },
  { base: "#6366f1", scheduled: "#a5b4fc", completed: "#4f46e5", border: "#4338ca", text: "#ffffff" },
  { base: "#22d3ee", scheduled: "#67e8f9", completed: "#06b6d4", border: "#0e7490", text: "#0f172a" },
  { base: "#fb7185", scheduled: "#fda4af", completed: "#f43f5e", border: "#be123c", text: "#7f1d1d" },
  { base: "#84cc16", scheduled: "#bef264", completed: "#65a30d", border: "#3f6212", text: "#1f2937" },
];

export function sectionPalette(name) {
  const s = String(name || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  const palette = THEME_PALETTES[hash % THEME_PALETTES.length];
  return { ...palette };
}
