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
  { base: "#3B82F6", border: "#1D4ED8", text: "#FFFFFF" },
  { base: "#10B981", border: "#047857", text: "#FFFFFF" },
  { base: "#F97316", border: "#C2410C", text: "#FFFFFF" },
  { base: "#8B5CF6", border: "#6D28D9", text: "#FFFFFF" },
  { base: "#EF4444", border: "#B91C1C", text: "#FFFFFF" },
  { base: "#FBBF24", border: "#D97706", text: "#1F2937" },
  { base: "#14B8A6", border: "#0F766E", text: "#FFFFFF" },
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
