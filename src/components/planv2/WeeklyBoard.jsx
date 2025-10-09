// src/components/planv2/WeeklyBoard.jsx
import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  scheduleTopicToDay,
  scheduleTopicPackFromDay,
  moveTopicSlicesToNextDay,
  unscheduleTopicReturnToQueue,
  searchMasterQueueTopics,
  ensureMasterQueueBuilt,
} from "../../services/planV2Api";

const toISO = (input) => {
  const date =
    input instanceof Date
      ? new Date(input)
      : new Date(typeof input === "string" ? input : Date.now());
  if (Number.isNaN(date.getTime())) return "";
  date.setHours(0, 0, 0, 0);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatDateDisplay = (value, options) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, options);
};

const daySummaryFormat = { weekday: "short", month: "short", day: "numeric" };
const dayTitleFormat = { weekday: "long", month: "long", day: "numeric" };

const defaultSearchFields = (row) => {
  const out = [
    row.section,
    row.chapterName,
    row.topicName,
    row.seq,
    row.topicId,
  ];
  if (Array.isArray(row.subtopics)) {
    row.subtopics.forEach((sub) => out.push(sub?.name));
  }
  return out.filter(Boolean).map((x) => String(x).toLowerCase());
};

export default function WeeklyBoard({
  uid,
  weekKey,
  weekDates = [],
  offDays = {},
  dayCaps = {},
  assigned = {},
  doneDays = {},
  currentDayISO,
  onToggleOffDay,
  onUpdateDayCap,
  onAdjustDayCap,
  onMarkDayDone,
  onAddFromMaster,
  onAutoFillWeek,
  isAutoFilling = false,
  onRefresh,
  weekLabel,
  totalPlannedThisWeek,
}) {
  const [expandedISO, setExpandedISO] = useState(() => {
    const todayISO = toISO(new Date());
    const todayInWeek = weekDates.some((date) => toISO(date) === todayISO);
    if (todayInWeek) return todayISO;
    return weekDates.length ? toISO(weekDates[0]) : "";
  });
  const [mode, setMode] = useState("week");
  const [hidePastDays, setHidePastDays] = useState(true);
  const [uiMsg, setUiMsg] = useState("");

  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");

  const [dragOverISO, setDragOverISO] = useState(null);

  const weekIsoList = useMemo(
    () => weekDates.map((d) => toISO(d)),
    [weekDates],
  );

  useEffect(() => {
    if (!weekIsoList.length) return;
    const currentIsValid =
      expandedISO && weekIsoList.includes(expandedISO);
    const preferred =
      currentDayISO && weekIsoList.includes(currentDayISO)
        ? currentDayISO
        : weekIsoList[0];
    if (!currentIsValid && preferred !== expandedISO) {
      setExpandedISO(preferred);
    }
  }, [weekIsoList, currentDayISO, expandedISO]);

  const expandedIsDone = useMemo(
    () => (expandedISO ? !!doneDays?.[expandedISO] : false),
    [expandedISO, doneDays],
  );

  const usedByDay = useMemo(() => {
    const out = {};
    weekIsoList.forEach((iso) => {
      const items = Array.isArray(assigned?.[iso]) ? assigned[iso] : [];
      out[iso] = items.reduce(
        (sum, item) => sum + Number(item?.minutes || 0),
        0,
      );
    });
    return out;
  }, [assigned, weekIsoList]);

  const remainingByDay = useMemo(() => {
    const out = {};
    weekIsoList.forEach((iso) => {
      const cap = Number(dayCaps?.[iso] || 0);
      const used = Number(usedByDay?.[iso] || 0);
      out[iso] = Math.max(0, cap - used);
    });
    return out;
  }, [dayCaps, usedByDay, weekIsoList]);

  const summaryByDay = useMemo(() => {
    const map = {};
    weekIsoList.forEach((iso) => {
      const items = Array.isArray(assigned?.[iso]) ? assigned[iso] : [];
      const perTopic = new Map();
      items.forEach((item, index) => {
        const topicKey = String(
          item?.topicId ??
            item?.seq ??
            item?.chapterId ??
            item?.chapterName ??
            `topic-${index}`,
        );
        if (!perTopic.has(topicKey)) {
          perTopic.set(topicKey, {
            key: topicKey,
            label:
              item?.title || item?.topicName || item?.chapterName || "Topic",
            minutes: 0,
          });
        }
        const entry = perTopic.get(topicKey);
        entry.minutes += Number(item?.minutes || 0);
      });
      map[iso] = Array.from(perTopic.values());
    });
    return map;
  }, [assigned, weekIsoList]);

  const dayList = useMemo(() => {
    if (!hidePastDays) return weekDates;
    const todayISO = toISO(new Date());
    return weekDates.filter((date) => toISO(date) >= todayISO);
  }, [weekDates, hidePastDays]);

  const groupedItems = useMemo(() => {
    if (!expandedISO) return [];
    const items = Array.isArray(assigned?.[expandedISO])
      ? assigned[expandedISO]
      : [];
    const chapters = new Map();

    items.forEach((item, index) => {
      const chapterKey = String(
        item?.chapterId ?? item?.chapterName ?? `chapter-${index}`,
      );
      if (!chapters.has(chapterKey)) {
        chapters.set(chapterKey, {
          key: chapterKey,
          name: item?.chapterName || "Unassigned",
          section: item?.section || "",
          totalMinutes: 0,
          topics: new Map(),
        });
      }
      const chapter = chapters.get(chapterKey);
      const minutes = Number(item?.minutes || 0);
      chapter.totalMinutes += minutes;

      const topicKey = String(item?.topicId ?? item?.seq ?? `topic-${index}`);
      if (!chapter.topics.has(topicKey)) {
        chapter.topics.set(topicKey, {
          key: topicKey,
          seq: item?.seq || null,
          topicId: item?.topicId || String(topicKey),
          name: item?.title || item?.topicName || "Topic",
          section: item?.section || "",
          totalMinutes: 0,
          subtopics: [],
        });
      }
      const topic = chapter.topics.get(topicKey);
      topic.totalMinutes += minutes;
      const subName =
        item?.subName ||
        (Number.isFinite(Number(item?.subIdx))
          ? `Part ${Number(item.subIdx) + 1}`
          : `Subtopic ${topic.subtopics.length + 1}`);
      topic.subtopics.push({
        key: `${topicKey}-${topic.subtopics.length}`,
        name: subName,
        minutes,
        order: Number.isFinite(Number(item?.subIdx))
          ? Number(item.subIdx)
          : topic.subtopics.length,
      });
    });

    return Array.from(chapters.values()).map((chapter) => ({
      key: chapter.key,
      name: chapter.name,
      section: chapter.section,
      totalMinutes: chapter.totalMinutes,
      topics: Array.from(chapter.topics.values()).map((topic) => ({
        key: topic.key,
        seq: topic.seq,
        topicId: topic.topicId,
        name: topic.name,
        section: topic.section,
        totalMinutes: topic.totalMinutes,
        subtopics: topic.subtopics
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((sub) => ({
            key: sub.key,
            name: sub.name,
            minutes: sub.minutes,
          })),
      })),
    }));
  }, [assigned, expandedISO]);

  const filteredSearchResults = useMemo(() => {
    if (!searchQuery.trim()) return searchResults;
    const needle = searchQuery.trim().toLowerCase();
    return searchResults.filter((row) =>
      defaultSearchFields(row).some((field) => field.includes(needle)),
    );
  }, [searchResults, searchQuery]);

  const removeFromDay = useCallback(
    async (iso, seq) => {
      if (!uid || !iso || !seq) return;
      if (doneDays?.[iso]) return;
      try {
        setUiMsg("Moving to next day...");
        const res = await moveTopicSlicesToNextDay(uid, iso, seq);
        if (res?.overflow) {
          setUiMsg(`Moved ${res.overflow} subtopics back to queue`);
          setTimeout(() => setUiMsg(""), 2500);
        } else {
          setUiMsg("Moved to next day");
          setTimeout(() => setUiMsg(""), 1500);
        }
        onRefresh?.();
      } catch (err) {
        console.error(err);
        setUiMsg(err?.message || "Failed to move");
        setTimeout(() => setUiMsg(""), 2000);
      }
    },
    [uid, onRefresh, doneDays],
  );

  const openSearchModal = useCallback(() => {
    setSearchQuery("");
    setSearchError("");
    setShowSearchModal(true);
  }, []);

  const closeSearchModal = useCallback(() => {
    setShowSearchModal(false);
  }, []);

  const fetchSearchData = useCallback(async () => {
    if (!uid) return;
    try {
      setSearchLoading(true);
      setSearchError("");
      await ensureMasterQueueBuilt(uid);
      const rows = await searchMasterQueueTopics(uid);
      setSearchResults(Array.isArray(rows) ? rows : []);
    } catch (err) {
      console.error(err);
      setSearchError(err?.message || "Failed to load topics");
    } finally {
      setSearchLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    if (showSearchModal) {
      fetchSearchData();
    }
  }, [showSearchModal, fetchSearchData]);

  const unscheduleToQueue = useCallback(
    async (seq) => {
      try {
        if (!uid || !seq) return;
        if (expandedIsDone) return;
        setUiMsg("Unscheduling...");
        await unscheduleTopicReturnToQueue(uid, seq);
        onRefresh?.();
        setUiMsg("");
      } catch (err) {
        console.error(err);
        setUiMsg(err?.message || "Failed to unschedule");
        setTimeout(() => setUiMsg(""), 2000);
      }
    },
    [uid, expandedIsDone, onRefresh],
  );

  const handleSelectSearchResult = useCallback(
    async (topic) => {
      if (!uid || !expandedISO || !topic?.seq || doneDays?.[expandedISO])
        return;
      try {
        setUiMsg("Scheduling...");
        await scheduleTopicPackFromDay(uid, expandedISO, topic.seq);
        setShowSearchModal(false);
        onRefresh?.();
        setUiMsg("");
      } catch (err) {
        console.error(err);
        setUiMsg(err?.message || "Failed to schedule");
        setTimeout(() => setUiMsg(""), 2000);
      }
    },
    [uid, expandedISO, doneDays, onRefresh],
  );

  const expandedDate = useMemo(() => {
    if (!expandedISO) return null;
    return weekDates.find((date) => toISO(date) === expandedISO) || null;
  }, [weekDates, expandedISO]);

  const promptForCap = useCallback(
    (iso, existing) => {
      const next =
        typeof window !== "undefined"
          ? window.prompt(
              "Set daily minutes",
              existing != null ? String(existing) : "",
            )
          : null;
      if (next == null) return;
      const parsed = Number(next);
      if (!Number.isFinite(parsed)) return;
      onUpdateDayCap?.(iso, parsed);
    },
    [onUpdateDayCap],
  );

  const canAcceptDragPayload = useCallback((event) => {
    if (!event?.dataTransfer) return false;
    const types = Array.from(event.dataTransfer.types || []);
    return (
      types.includes("application/x-rad-run") ||
      types.includes("text/plain") ||
      types.includes("application/json")
    );
  }, []);

  const handleDayDragOver = useCallback(
    (event, iso) => {
      if (doneDays?.[iso]) return;
      if (canAcceptDragPayload(event)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }
    },
    [canAcceptDragPayload, doneDays],
  );

  const handleDayDragEnter = useCallback(
    (event, iso) => {
      if (doneDays?.[iso]) return;
      if (canAcceptDragPayload(event)) {
        event.preventDefault();
        setDragOverISO(iso);
      }
    },
    [canAcceptDragPayload, doneDays],
  );

  const handleDayDragLeave = useCallback(
    (event, iso) => {
      if (!canAcceptDragPayload(event)) return;
      if (
        event?.currentTarget &&
        event?.relatedTarget &&
        event.currentTarget.contains(event.relatedTarget)
      ) {
        return;
      }
      if (dragOverISO === iso) {
        setDragOverISO(null);
      }
    },
    [canAcceptDragPayload, dragOverISO],
  );

  const handleQueueDrop = useCallback(
    async (event, iso, remainingMinutes, capMinutes) => {
      if (!uid || !iso || !canAcceptDragPayload(event) || doneDays?.[iso])
        return;
      event.preventDefault();
      setDragOverISO(null);

      let raw = event.dataTransfer.getData("application/x-rad-run");
      if (!raw) raw = event.dataTransfer.getData("text/plain");
      let payload;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch (err) {
        payload = null;
      }
      if (!payload || payload.kind !== "queue-run" || !payload.seq) return;

      if (Number(remainingMinutes) <= 0) {
        setUiMsg(
          "No capacity left for this day. Increase minutes to add topics.",
        );
        setTimeout(() => setUiMsg(""), 2000);
        if (typeof window !== "undefined") {
          const adjust = window.confirm(
            "This day is at capacity. Increase daily minutes to schedule this topic?",
          );
          if (adjust) {
            promptForCap(iso, capMinutes);
          }
        }
        return;
      }

      try {
        setUiMsg("Scheduling...");
        await scheduleTopicToDay(uid, iso, payload.seq);
        setUiMsg("Scheduled from queue");
        setTimeout(() => setUiMsg(""), 1500);
        onRefresh?.();
      } catch (err) {
        console.error(err);
        setUiMsg(err?.message || "Failed to schedule");
        setTimeout(() => setUiMsg(""), 2000);
      }
    },
    [uid, canAcceptDragPayload, doneDays, promptForCap, onRefresh],
  );

  const handleMarkDoneClick = useCallback(
    async (iso) => {
      if (!onMarkDayDone || !iso) return;
      if (doneDays?.[iso]) {
        setUiMsg("Day already marked done.");
        setTimeout(() => setUiMsg(""), 1800);
        return;
      }
      try {
        setUiMsg("Locking day...");
        const result = await onMarkDayDone(iso);
        const completedCount =
          typeof result?.completedCount === "number"
            ? result.completedCount
            : null;
        if (completedCount != null) {
          const suffix =
            completedCount > 0 ? ` (${completedCount} items completed)` : "";
          setUiMsg(`Day marked done${suffix}`);
        } else {
          setUiMsg("Day marked done");
        }

        const currentIdx = weekIsoList.indexOf(iso);
        let targetISO =
          result?.nextISO && weekIsoList.includes(result.nextISO)
            ? result.nextISO
            : null;
        if (!targetISO) {
          if (currentIdx >= 0 && currentIdx < weekIsoList.length - 1) {
            targetISO = weekIsoList[currentIdx + 1];
          } else {
            targetISO =
              weekIsoList.find(
                (candidate) => candidate !== iso && !doneDays?.[candidate],
              ) || null;
          }
        }
        if (targetISO && targetISO !== iso) {
          setExpandedISO(targetISO);
          setMode("day");
        }
        onRefresh?.();
      } catch (err) {
        console.error(err);
        setUiMsg(err?.message || "Failed to mark day done");
      } finally {
        setTimeout(() => setUiMsg(""), 2200);
      }
    },
    [onMarkDayDone, weekIsoList, doneDays, onRefresh],
  );

  const currentCap = expandedISO ? Number(dayCaps?.[expandedISO] || 0) : 0;
  const currentUsed = expandedISO ? Number(usedByDay?.[expandedISO] || 0) : 0;
  const currentRemaining = expandedISO
    ? Number(
        remainingByDay?.[expandedISO] ?? Math.max(0, currentCap - currentUsed),
      )
    : 0;

  return (
    <div className="relative w-full">
      {isAutoFilling && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl bg-white/80 text-sm text-gray-700 backdrop-blur">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span className="mt-3 font-medium">Auto-filling your week&hellip;</span>
          <span className="text-xs text-gray-500">
            Hang tight&mdash;updates land once every day is packed.
          </span>
        </div>
      )}
      <div
        className={`transition-opacity duration-150 ${
          isAutoFilling ? "pointer-events-none select-none opacity-0" : "opacity-100"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">
            {weekLabel || "This Week"}
          </div>
          <div className="text-sm text-gray-500">
            Planned: {Number(totalPlannedThisWeek || 0)} min
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex border rounded overflow-hidden">
            <button
              className={`px-3 py-1 text-sm ${mode === "week" ? "bg-gray-200" : "bg-white"}`}
              onClick={() => setMode("week")}
            >
              Week
            </button>
            <button
              className={`px-3 py-1 text-sm ${mode === "day" ? "bg-gray-200" : "bg-white"}`}
              onClick={() => setMode("day")}
              disabled={!expandedISO}
            >
              Day
            </button>
          </div>
          <label className="text-xs text-gray-600 flex items-center gap-1">
            <input
              type="checkbox"
              checked={hidePastDays}
              onChange={() => setHidePastDays((prev) => !prev)}
            />
            Hide past days
          </label>
          {onAutoFillWeek && (
            <button
              className={`relative px-3 py-1 text-sm border rounded hover:bg-gray-50 flex items-center justify-center ${
                isAutoFilling ? "opacity-60 cursor-not-allowed" : ""
              } min-w-[150px]`}
              onClick={onAutoFillWeek}
              disabled={isAutoFilling}
            >
              <span
                className={`transition-opacity ${isAutoFilling ? "opacity-0" : "opacity-100"}`}
              >
                Auto-fill week
              </span>
              <span
                className={`absolute inset-0 flex items-center justify-center gap-2 transition-opacity ${
                  isAutoFilling ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
              >
                <span className="inline-flex h-3 w-3 animate-spin rounded-full border border-blue-500 border-t-transparent" />
                Auto-filling...
              </span>
            </button>
          )}
          <button
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
            onClick={openSearchModal}
            disabled={expandedIsDone}
          >
            Search queue
          </button>
        </div>
      </div>

      {uiMsg && (
        <div className="mt-3 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {uiMsg}
        </div>
      )}

      <div className="mt-4">
        {mode === "week" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(dayList.length ? dayList : weekDates).map((date) => {
              const iso = toISO(date);
              const isExpanded = expandedISO === iso;
              const isToday = currentDayISO === iso;
              const isOff = !!offDays?.[iso];
              const isDone = !!doneDays?.[iso];
              const summaryItems = Array.isArray(summaryByDay?.[iso])
                ? summaryByDay[iso]
                : [];
              const used = Number(usedByDay?.[iso] || 0);
              const cap = Number(dayCaps?.[iso] || 0);
              const remaining = Number(
                remainingByDay?.[iso] ?? Math.max(0, cap - used),
              );
              const dropActive = dragOverISO === iso;
              const borderClasses = isDone
                ? "border-green-300 ring-1 ring-green-200"
                : dropActive
                  ? "border-green-400 ring-2 ring-green-200"
                  : isExpanded
                    ? "border-blue-400 ring-1 ring-blue-200"
                    : "border-gray-200";

              return (
                <div
                  key={iso}
                  className={`min-h-[340px] rounded border bg-white p-4 shadow-sm transition focus-within:ring ${borderClasses} ${
                    isOff ? "opacity-70" : ""
                  } ${isDone ? "opacity-75" : ""}`}
                  onDragOver={(event) => handleDayDragOver(event, iso)}
                  onDragEnter={(event) => handleDayDragEnter(event, iso)}
                  onDragLeave={(event) => handleDayDragLeave(event, iso)}
                  onDrop={(event) =>
                    handleQueueDrop(event, iso, remaining, cap)
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-400">
                        {formatDateDisplay(date, daySummaryFormat)}
                      </div>
                      <div className="text-lg font-semibold text-gray-900">
                        {used} / {cap} min
                      </div>
                      <div className="text-xs text-gray-500">
                        {remaining} min remaining{isToday ? " - Today" : ""}
                      </div>
                      {isOff && (
                        <div className="mt-1 text-xs font-medium text-amber-600">
                          Marked off day
                        </div>
                      )}
                      {isDone && (
                        <div className="mt-1 text-xs font-medium text-green-600">
                          Marked complete
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <button
                        className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50"
                        onClick={() => {
                          setExpandedISO(iso);
                          setMode("day");
                        }}
                      >
                        Inspect
                      </button>
                    </div>
                  </div>

                  <ul className="mt-3 space-y-1 text-xs text-gray-600">
                    {summaryItems.slice(0, 4).map((item) => (
                      <li
                        key={`${iso}-${item.key}`}
                        className="flex justify-between gap-2"
                      >
                        <span className="truncate">{item.label}</span>
                        <span>{Number(item.minutes || 0)}m</span>
                      </li>
                    ))}
                    {summaryItems.length === 0 && (
                      <li className="text-gray-400">No topics scheduled.</li>
                    )}
                    {summaryItems.length > 4 && (
                      <li className="text-gray-400">
                        +{summaryItems.length - 4} more...
                      </li>
                    )}
                  </ul>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <button
                      className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50"
                      onClick={() => onToggleOffDay?.(iso, !isOff)}
                      disabled={isDone}
                    >
                      {isOff ? "Mark study day" : "Mark off day"}
                    </button>
                    <button
                      className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50"
                      onClick={() => onAdjustDayCap?.(iso, -10)}
                      disabled={isDone}
                    >
                      -10 min
                    </button>
                    <button
                      className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50"
                      onClick={() => onAdjustDayCap?.(iso, 10)}
                      disabled={isDone}
                    >
                      +10 min
                    </button>
                    <button
                      className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50"
                      onClick={() => handleMarkDoneClick(iso)}
                      disabled={isDone}
                    >
                      {isDone ? "Done" : "Mark done"}
                    </button>
                    <button
                      className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50"
                      onClick={() => promptForCap(iso, cap)}
                      disabled={isDone}
                    >
                      Set capacity
                    </button>
                    {onAddFromMaster && (
                      <button
                        className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50"
                        onClick={() => onAddFromMaster(iso)}
                        disabled={isDone}
                      >
                        Autofill day
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {!dayList.length && !weekDates.length && (
              <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">
                No days available for this week.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded border border-gray-200 bg-white p-4 shadow-sm">
            {expandedISO ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">
                      {formatDateDisplay(
                        expandedDate || expandedISO,
                        dayTitleFormat,
                      ) || expandedISO}
                    </div>
                    <div className="text-sm text-gray-500">
                      {currentUsed} / {currentCap} min planned -{" "}
                      {currentRemaining} min remaining
                    </div>
                    {offDays?.[expandedISO] && (
                      <div className="text-xs font-medium text-amber-600">
                        Marked as off day
                      </div>
                    )}
                    {expandedIsDone && (
                      <div className="text-xs font-medium text-green-600">
                        Marked complete
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded border border-gray-200 px-3 py-1 text-xs hover:bg-gray-50"
                      onClick={() => setMode("week")}
                    >
                      Back to week
                    </button>
                    <button
                      className="rounded border border-gray-200 px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
                      onClick={() => {
                        const idx = weekIsoList.indexOf(expandedISO);
                        if (idx > 0) setExpandedISO(weekIsoList[idx - 1]);
                      }}
                      disabled={weekIsoList.indexOf(expandedISO) <= 0}
                    >
                      Prev day
                    </button>
                    <button
                      className="rounded border border-gray-200 px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
                      onClick={() => {
                        const idx = weekIsoList.indexOf(expandedISO);
                        if (idx > -1 && idx < weekIsoList.length - 1) {
                          setExpandedISO(weekIsoList[idx + 1]);
                        }
                      }}
                      disabled={
                        weekIsoList.indexOf(expandedISO) >=
                        weekIsoList.length - 1
                      }
                    >
                      Next day
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <button
                    className="rounded border border-gray-200 px-3 py-1 hover:bg-gray-50"
                    onClick={() =>
                      onToggleOffDay?.(expandedISO, !offDays?.[expandedISO])
                    }
                    disabled={expandedIsDone}
                  >
                    {offDays?.[expandedISO] ? "Mark study day" : "Mark off day"}
                  </button>
                  <button
                    className="rounded border border-gray-200 px-3 py-1 hover:bg-gray-50"
                    onClick={() => onAdjustDayCap?.(expandedISO, -10)}
                    disabled={expandedIsDone}
                  >
                    -10 min
                  </button>
                  <button
                    className="rounded border border-gray-200 px-3 py-1 hover:bg-gray-50"
                    onClick={() => onAdjustDayCap?.(expandedISO, 10)}
                    disabled={expandedIsDone}
                  >
                    +10 min
                  </button>
                  <button
                    className="rounded border border-gray-200 px-3 py-1 hover:bg-gray-50"
                    onClick={() => handleMarkDoneClick(expandedISO)}
                    disabled={expandedIsDone}
                  >
                    {expandedIsDone ? "Done" : "Mark done"}
                  </button>
                  <button
                    className="rounded border border-gray-200 px-3 py-1 hover:bg-gray-50"
                    onClick={() => promptForCap(expandedISO, currentCap)}
                    disabled={expandedIsDone}
                  >
                    Set capacity
                  </button>
                  {onAddFromMaster && (
                    <button
                      className="rounded border border-gray-200 px-3 py-1 hover:bg-gray-50"
                      onClick={() => onAddFromMaster(expandedISO)}
                      disabled={expandedIsDone}
                    >
                      Autofill day
                    </button>
                  )}
                </div>

                <div
                  className={`mt-4 space-y-4 min-h-[4rem] ${
                    dragOverISO === expandedISO
                      ? "rounded border border-green-300 ring-2 ring-green-200"
                      : ""
                  } ${expandedIsDone ? "opacity-75" : ""}`}
                  onDragOver={(event) => handleDayDragOver(event, expandedISO)}
                  onDragEnter={(event) =>
                    handleDayDragEnter(event, expandedISO)
                  }
                  onDragLeave={(event) =>
                    handleDayDragLeave(event, expandedISO)
                  }
                  onDrop={(event) =>
                    handleQueueDrop(
                      event,
                      expandedISO,
                      currentRemaining,
                      currentCap,
                    )
                  }
                >
                  {groupedItems.length ? (
                    groupedItems.map((chapter) => (
                      <div
                        key={chapter.key}
                        className="rounded border border-gray-100 bg-gray-50 p-3"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-semibold text-gray-800">
                              {chapter.name}
                            </div>
                            {chapter.section && (
                              <div className="text-xs uppercase tracking-wide text-gray-500">
                                {chapter.section}
                              </div>
                            )}
                          </div>
                          <div className="text-sm font-medium text-gray-600">
                            {Number(chapter.totalMinutes || 0)} min
                          </div>
                        </div>

                        <div className="mt-3 space-y-3">
                          {chapter.topics.map((topic) => (
                            <div
                              key={topic.key}
                              className="rounded border border-white bg-white p-3 shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-medium text-gray-800">
                                    {topic.name}
                                  </div>
                                  {topic.section && (
                                    <div className="text-xs uppercase tracking-wide text-gray-500">
                                      {topic.section}
                                    </div>
                                  )}
                                </div>
                                <div className="text-sm font-medium text-gray-600">
                                  {Number(topic.totalMinutes || 0)} min
                                </div>
                              </div>

                              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                <button
                                  className="rounded border border-gray-200 px-3 py-1 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                  onClick={() =>
                                    removeFromDay(expandedISO, topic.seq)
                                  }
                                  disabled={!topic.seq || expandedIsDone}
                                >
                                  Move to next day
                                </button>
                                <button
                                  className="rounded border border-gray-200 px-3 py-1 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                  onClick={() => unscheduleToQueue(topic.seq)}
                                  disabled={!topic.seq || expandedIsDone}
                                >
                                  Return to queue
                                </button>
                              </div>

                              {topic.subtopics.length > 0 && (
                                <ul className="mt-3 space-y-1 text-xs text-gray-600">
                                  {topic.subtopics.map((sub) => (
                                    <li
                                      key={sub.key}
                                      className="flex justify-between gap-2"
                                    >
                                      <span className="truncate">
                                        {sub.name}
                                      </span>
                                      <span>
                                        {Number(sub.minutes || 0)} min
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
                      No topics scheduled for this day.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-500">
                Select a day to inspect.
              </div>
            )}
          </div>
        )}
      </div>

      {showSearchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="flex w-full max-w-2xl max-h-[80vh] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-base font-semibold">Search Master Queue</h3>
              <button
                className="rounded border border-transparent p-1 text-sm hover:bg-gray-100"
                onClick={closeSearchModal}
              >
                ×
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-3 px-4 py-3 overflow-hidden">
              <input
                type="search"
                placeholder="Search by section, topic, or subtopic"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              />
              {searchError && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {searchError}
                </div>
              )}
              <div className="flex-1 overflow-y-auto pr-1">
                {searchLoading ? (
                  <div className="py-6 text-center text-sm text-gray-500">
                    Loading...
                  </div>
                ) : filteredSearchResults.length ? (
                  <ul className="space-y-2">
                    {filteredSearchResults.map((row, index) => {
                      const key =
                        row.seq || row.topicId || row.chapterName || index;
                      const minutes = Number(
                        row.totalMinutes || row.minutes || 0,
                      );
                      return (
                        <li
                          key={key}
                          className="rounded border border-gray-200 bg-white p-3 hover:border-blue-300"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="font-medium text-gray-800">
                                {row.topicName ||
                                  row.chapterName ||
                                  row.section ||
                                  "Topic"}
                              </div>
                              <div className="text-xs text-gray-500">
                                {row.section ? `${row.section} - ` : ""}
                                Seq: {row.seq || "n/a"}
                              </div>
                            </div>
                            <div className="text-xs text-gray-500">
                              {minutes} min
                            </div>
                          </div>
                          <button
                            className="mt-2 w-full rounded border border-gray-200 px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
                            onClick={() => handleSelectSearchResult(row)}
                            disabled={!expandedISO || expandedIsDone}
                          >
                            Schedule to{" "}
                            {formatDateDisplay(
                              expandedDate || expandedISO,
                              daySummaryFormat,
                            ) || "selected day"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="py-6 text-center text-sm text-gray-500">
                    No results.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
);
}
