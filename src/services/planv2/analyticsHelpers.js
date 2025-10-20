/**
 * Shared math/date helpers for Plan V2 calculations.
 */
export function NUM(n, d = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : d;
}

export function toDateKey(d) {
  const x = d instanceof Date ? new Date(d) : new Date(String(d));
  x.setHours(0, 0, 0, 0);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const da = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export function weekKeyFromDate(dateLike) {
  const d = new Date(dateLike ? new Date(dateLike) : new Date());
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - dow);
  return toDateKey(d);
}

export function weekDatesFromKey(weekKey) {
  if (!weekKey) return [];
  const start = new Date(weekKey);
  if (Number.isNaN(start.getTime())) return [];
  const dates = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const copy = new Date(start);
    copy.setDate(copy.getDate() + offset);
    dates.push(toDateKey(copy));
  }
  return dates;
}

export function nextWeekKey(weekKey) {
  if (!weekKey) return '';
  const d = new Date(weekKey);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + 7);
  return toDateKey(d);
}

export function minutesUsed(arr = []) {
  return arr.reduce((total, item) => total + NUM(item?.minutes, 0), 0);
}
