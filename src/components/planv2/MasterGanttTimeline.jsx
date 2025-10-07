// src/components/planv2/MasterGanttTimeline.jsx
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { fmtISO, sectionPalette } from "./utils";

const DEFAULT_DAILY_CAP = 180;
const DAY_WIDTH_PX = 28;
const TODAY_COLOR = "#0ea5e9";

export default function MasterGanttTimeline({
  uid,
  meta,
  week,
  refreshSignal = 0,
}) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!uid) return;
      setLoading(true);
      try {
        const qRef = collection(db, "plans", uid, "masterQueue");
        const qSnap = await getDocs(query(qRef, orderBy("sortKey", "asc")));
        const runs = [];
        qSnap.forEach((s) => {
          const d = s.data() || {};
          runs.push({
            id: s.id,
            seq: d.seq || s.id,
            section: d.section || "",
            chapterId: d.chapterId || "",
            chapterName: d.chapterName || "",
            topicId: d.topicId || "",
            topicName: d.topicName || "",
            minutes: Number(d.minutes || 0),
            scheduledMinutes: Number(d.scheduledMinutes || 0),
            queueState: (d.queueState || "queued").toLowerCase(),
          });
        });
        if (!active) return;
        setQueue(runs);
      } catch (e) {
        console.error(e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [uid, refreshSignal]);

  const contiguousBlocks = useMemo(() => {
    if (!Array.isArray(queue) || queue.length === 0) return [];
    const out = [];
    let current = null;
    for (const entry of queue) {
      if (entry.queueState === "removed") continue;
      const totalMinutes = Math.max(0, Number(entry.minutes || 0));
      if (totalMinutes <= 0) continue;

      const scheduled = Math.max(0, Number(entry.scheduledMinutes || 0));
      const completed = entry.queueState === "done" ? totalMinutes : 0;
      const inProgressMinutes =
        entry.queueState === "inProgress"
          ? Math.min(totalMinutes, scheduled)
          : 0;

      const sectionName = entry.section || "Section";
      if (!current || current.section !== sectionName) {
        if (current) out.push(current);
        current = {
          section: sectionName,
          chapters: [],
          totalMinutes: 0,
          completedMinutes: 0,
          inProgressMinutes: 0,
        };
      }
      current.totalMinutes += totalMinutes;
      current.completedMinutes += completed;
      current.inProgressMinutes += inProgressMinutes;
      const chapterLabel =
        entry.chapterName ||
        (entry.chapterId ? `Chapter ${entry.chapterId}` : "");
      if (chapterLabel) {
        const lastChapter = current.chapters[current.chapters.length - 1];
        if (lastChapter !== chapterLabel) current.chapters.push(chapterLabel);
      }
    }
    if (current) out.push(current);
    return out;
  }, [queue]);

  const totalMinutesPlanned = useMemo(
    () =>
      contiguousBlocks.reduce(
        (sum, block) => sum + Number(block.totalMinutes || 0),
        0,
      ),
    [contiguousBlocks],
  );
  const totalMinutesRemaining = useMemo(
    () =>
      contiguousBlocks.reduce(
        (sum, block) =>
          sum +
          Math.max(
            0,
            Number(block.totalMinutes || 0) -
              Number(block.completedMinutes || 0),
          ),
        0,
      ),
    [contiguousBlocks],
  );

  const pattern = useMemo(() => {
    const caps = new Array(7).fill(0);
    const w = week || {};
    const dayCaps = w.dayCaps || {};
    const offDays = w.offDays || {};
    const keys = Object.keys(dayCaps).sort();
    if (keys.length >= 7) {
      let sum = 0;
      for (let i = 0; i < 7; i++) {
        const iso = keys[i];
        const cap = offDays[iso] ? 0 : Number(dayCaps[iso] || 0);
        caps[i] = cap;
        sum += cap;
      }
      if (sum > 0) return caps;
    }
    const fallback = Math.max(0, Number(meta?.dailyMinutes || 0));
    const fallbackValue = fallback > 0 ? fallback : DEFAULT_DAILY_CAP;
    return caps.map(() => fallbackValue);
  }, [week, meta?.dailyMinutes]);

  const schedule = useMemo(() => {
    const dayWidth = DAY_WIDTH_PX;
    if (!contiguousBlocks.length || totalMinutesPlanned <= 0) {
      return { days: [], bands: [], totalDays: 0, dayWidth };
    }

    const startISO =
      meta?.currentDayISO || meta?.startDate || fmtISO(new Date());
    const startDate = new Date(`${startISO}T00:00:00`);

    const days = [];
    let capacityAccumulated = 0;
    let di = 0;
    const maxDays = 900;
    while (capacityAccumulated < totalMinutesPlanned && di < maxDays) {
      const cap = Math.max(0, Number(pattern[di % pattern.length] || 0));
      const date = new Date(startDate.getTime() + di * 86400000);
      days.push({ iso: fmtISO(date), cap, used: 0, date, index: di });
      capacityAccumulated += cap;
      di++;
    }

    if (!days.length) {
      const date = new Date(startDate);
      days.push({
        iso: fmtISO(date),
        cap: DEFAULT_DAILY_CAP,
        used: 0,
        date,
        index: 0,
      });
    }

    const posPx = (idx) => {
      if (idx >= days.length) return days.length * dayWidth;
      const d = days[idx];
      const ratio = d.cap ? d.used / d.cap : 0;
      return idx * dayWidth + ratio * dayWidth;
    };

    const bands = [];
    let cursorDay = 0;

    for (const block of contiguousBlocks) {
      let remaining = Number(block.totalMinutes || 0);
      if (remaining <= 0) continue;

      const leftPx = posPx(cursorDay);
      let rightPx = leftPx;

      while (remaining > 0 && cursorDay < days.length) {
        const day = days[cursorDay];
        if (day.cap <= 0) {
          rightPx = (cursorDay + 1) * dayWidth;
          cursorDay++;
          continue;
        }
        const free = Math.max(0, day.cap - day.used);
        if (free <= 0) {
          rightPx = (cursorDay + 1) * dayWidth;
          cursorDay++;
          continue;
        }
        const consume = Math.min(remaining, free);
        day.used += consume;
        remaining -= consume;
        rightPx = posPx(cursorDay);
        if (day.used >= day.cap) {
          rightPx = (cursorDay + 1) * dayWidth;
          cursorDay++;
        }
      }

      const widthPx = Math.max(10, rightPx - leftPx);
      bands.push({
        section: block.section,
        chapters: block.chapters,
        leftPx,
        widthPx,
        totalMinutes: block.totalMinutes,
        completedMinutes: block.completedMinutes,
        inProgressMinutes: block.inProgressMinutes || 0,
      });
    }

    const totalDays = Math.max(days.length, 1);
    return { days, bands, totalDays, dayWidth };
  }, [
    contiguousBlocks,
    totalMinutesPlanned,
    pattern,
    meta?.currentDayISO,
    meta?.startDate,
  ]);

  const trackWidthPx = Math.max(schedule.totalDays * schedule.dayWidth, 1);

  const timelineBlocks = useMemo(() => {
    if (!schedule.bands.length) return [];
    return schedule.bands.map((band, idx) => {
      const label = band.section || `Section ${idx + 1}`;
      const palette = sectionPalette(band.section);
      const completionRatio =
        band.totalMinutes > 0
          ? Math.max(0, Math.min(1, band.completedMinutes / band.totalMinutes))
          : 0;
      const scheduledRatio =
        band.totalMinutes > 0
          ? Math.max(
              completionRatio,
              Math.min(
                1,
                (band.completedMinutes + band.inProgressMinutes) /
                  band.totalMinutes,
              ),
            )
          : completionRatio;
      const tooltipParts = [label];
      tooltipParts.push(
        `${Math.round(band.completedMinutes)} / ${Math.round(band.totalMinutes)} minutes complete`,
      );
      if (band.inProgressMinutes > 0) {
        tooltipParts.push(
          `${Math.round(band.inProgressMinutes)} min scheduled`,
        );
      }
      if (band.chapters && band.chapters.length) {
        tooltipParts.push(`Chapters: ${band.chapters.join(", ")}`);
      }
      return {
        key: `${band.section || "section"}-${idx}`,
        label,
        palette,
        leftPx: band.leftPx,
        widthPx: band.widthPx,
        completionRatio,
        scheduledRatio,
        tooltip: tooltipParts.join("\n"),
      };
    });
  }, [schedule.bands]);

  const axis = useMemo(() => {
    if (!schedule.totalDays) return { weeks: [], months: [] };
    const weeks = schedule.days
      .filter((_, index) => index % 7 === 0)
      .map((day) => ({
        leftPx: day.index * schedule.dayWidth,
        iso: day.iso,
      }));

    const months = [];
    const startYear = schedule.days.length
      ? schedule.days[0].date.getFullYear()
      : null;
    const seen = new Set();
    schedule.days.forEach((day, idx) => {
      const date = day.date;
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if ((idx === 0 || date.getDate() === 1) && !seen.has(key)) {
        const showYear =
          date.getFullYear() !== startYear || date.getMonth() === 0;
        months.push({
          leftPx: day.index * schedule.dayWidth,
          label: formatMonthLabel(date, showYear),
        });
        seen.add(key);
      }
    });

    return { weeks, months };
  }, [schedule.days, schedule.totalDays, schedule.dayWidth]);

  const todayOffsetPx = useMemo(() => {
    if (!schedule.totalDays) return null;
    const startISO =
      meta?.currentDayISO || meta?.startDate || fmtISO(new Date());
    const startDate = new Date(`${startISO}T00:00:00`);
    const todayDate = new Date(`${fmtISO(new Date())}T00:00:00`);
    const diffDays = (todayDate - startDate) / 86400000;
    if (!Number.isFinite(diffDays)) return null;
    const px = diffDays * schedule.dayWidth;
    return Math.max(0, Math.min(px, schedule.totalDays * schedule.dayWidth));
  }, [
    schedule.totalDays,
    schedule.dayWidth,
    meta?.currentDayISO,
    meta?.startDate,
  ]);

  const startLabel =
    meta?.currentDayISO || meta?.startDate || fmtISO(new Date());
  const hasData = timelineBlocks.length > 0;

  if (loading) {
    return (
      <div className="w-full bg-white px-6 py-4">
        <div className="text-sm text-gray-500">Loading timeline...</div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="text-sm text-gray-700">
          <span className="font-semibold">Master plan timeline</span>{" "}
          <span className="text-gray-500">starting {startLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <Chip
            label="Remaining minutes"
            value={Math.round(totalMinutesRemaining)}
          />
          <Chip label="Blocks" value={contiguousBlocks.length} />
          <Chip label="Modeled days" value={schedule.totalDays} />
        </div>
      </div>

      {hasData ? (
        <div className="overflow-x-auto overflow-y-hidden">
          <div
            className="space-y-5 px-6 pb-6"
            style={{ width: `${trackWidthPx}px`, minWidth: "100%" }}
          >
            <div className="relative h-12">
              <div className="pointer-events-none absolute inset-0">
                {axis.weeks.map((tick) => (
                  <div
                    key={`week-${tick.iso}`}
                    className="absolute top-0 bottom-0 border-l border-gray-200"
                    style={{ left: `${tick.leftPx}px` }}
                  />
                ))}
              </div>

              <div className="absolute inset-0">
                {timelineBlocks.map((block) => (
                  <div
                    key={block.key}
                    className="absolute inset-y-1 rounded-md shadow-sm"
                    style={{
                      left: `${block.leftPx}px`,
                      width: `${block.widthPx}px`,
                      minWidth: "12px",
                      backgroundColor: block.palette.base,
                      border: `1px solid ${block.palette.border}`,
                    }}
                    title={block.tooltip}
                  >
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${block.scheduledRatio * 100}%`,
                        backgroundColor: block.palette.scheduled,
                        borderTopLeftRadius: "inherit",
                        borderBottomLeftRadius: "inherit",
                      }}
                    />
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${block.completionRatio * 100}%`,
                        backgroundColor: block.palette.completed,
                        borderTopLeftRadius: "inherit",
                        borderBottomLeftRadius: "inherit",
                      }}
                    />
                    <span
                      className="relative z-10 flex h-full items-center justify-center px-3 text-xs font-semibold tracking-wide truncate"
                      style={{ color: block.palette.text }}
                    >
                      {block.label}
                    </span>
                  </div>
                ))}
                \r\n{" "}
              </div>

              {todayOffsetPx !== null && (
                <div
                  className="pointer-events-none absolute inset-y-0 flex justify-center"
                  style={{ left: `${todayOffsetPx}px` }}
                >
                  <div className="flex h-full flex-col items-center">
                    <div
                      className="h-full w-[2px]"
                      style={{ backgroundColor: TODAY_COLOR }}
                    />
                    <div
                      className="h-2 w-2 -mb-1 rounded-full"
                      style={{ backgroundColor: TODAY_COLOR }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="relative h-10">
              <div className="absolute inset-x-0 top-0 h-px bg-gray-200" />
              {axis.weeks.map((tick) => (
                <div
                  key={`axis-week-${tick.iso}`}
                  className="absolute top-0 h-2 w-px bg-gray-300"
                  style={{ left: `${tick.leftPx}px` }}
                />
              ))}
              {axis.months.map((tick) => (
                <div
                  key={`axis-month-${tick.label}-${tick.leftPx}`}
                  className="absolute top-0 h-3 w-[2px] bg-gray-500"
                  style={{ left: `${tick.leftPx}px` }}
                />
              ))}
              {axis.months.map((tick) => (
                <div
                  key={`label-month-${tick.label}-${tick.leftPx}`}
                  className="absolute top-3 text-[11px] font-medium text-gray-600"
                  style={{
                    left: `${tick.leftPx}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  {tick.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="border-t border-gray-200 bg-white/70 px-6 py-8 text-sm text-gray-500">
          Master queue is empty.
        </div>
      )}
    </div>
  );
}

function Chip({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700">
      <div className="text-[11px] uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="font-semibold truncate">{value}</div>
    </div>
  );
}

function formatMonthLabel(date, includeYear = false) {
  const month = date.toLocaleString(undefined, { month: "short" });
  if (!includeYear) return month;
  const yearSuffix = String(date.getFullYear()).slice(-2);
  return `${month} '${yearSuffix}`;
}
