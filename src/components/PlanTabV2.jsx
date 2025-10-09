// src/components/PlanTabV2.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";

// Optional flags hook (kept because it exists in your project)
import { useSchedulerFlags } from "../hooks/useSchedulerFlags";
import { useUnsavedChanges } from "../context/UnsavedChangesContext";

// Services
import {
  loadPlanMeta,
  loadMasterPlanMeta,
  loadSyllabusTotals,
  savePlanMeta,
  loadOrInitWeek,
  patchWeek,
  completeDayAndAdvance,
  weekKeyFromDate,
  autoFillWeekFromMaster,
  listMasterQueueLinear,
  resetPlanData,
} from "../services/planV2Api";

import { buildAndSaveMasterPlan } from "../services/masterPlanBuilder";

// Components
import PlanSummaryCard from "./planv2/HeaderBar";
import MasterQueueSidebar from "./planv2/MasterQueueSidebar";
import MasterGanttTimeline from "./planv2/MasterGanttTimeline";
import WeeklyBoard from "./planv2/WeeklyBoard";
import PlanSetupWizardV2 from "./planv2/PlanSetupWizardV2";

// Local helpers
const toISO = (dLike) => {
  const d = dLike instanceof Date ? new Date(dLike) : new Date(String(dLike));
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};

const startOfWeekSun = (dLike) => {
  const d = dLike instanceof Date ? new Date(dLike) : new Date(String(dLike));
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};

const weekDatesFromKeyLocal = (weekKey) => {
  // weekKey format: YYYY-MM-DD for Sunday week start.
  // We'll support both; fallback to current week.
  if (!weekKey) {
    const sun = startOfWeekSun(new Date());
    return Array.from(
      { length: 7 },
      (_, i) => new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + i),
    );
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    // interpret as Sunday date
    const d = new Date(weekKey);
    return Array.from(
      { length: 7 },
      (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i),
    );
  }
  const sun = startOfWeekSun(new Date());
  return Array.from(
    { length: 7 },
    (_, i) => new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + i),
  );
};

const buildAlreadySet = (topicDoc = {}) => {
  const scheduled = Object.values(topicDoc?.scheduledDates || {});
  const out = new Set();
  scheduled.forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((value) => {
      const num = Number(value);
      if (Number.isFinite(num)) {
        out.add(num);
      }
    });
  });

  const completed = Array.isArray(topicDoc?.completedSubIdx)
    ? topicDoc.completedSubIdx
    : [];
  completed.forEach((value) => {
    const num = Number(value);
    if (Number.isFinite(num)) {
      out.add(num);
    }
  });

  return out;
};

export default function PlanTabV2() {
  const [uid, setUid] = useState("");
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);

  const [weekKey, setWeekKey] = useState("");
  const [weekDoc, setWeekDoc] = useState(null);

  const [showWizard, setShowWizard] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0); // bump to refetch children
  const [queueSummaryRows, setQueueSummaryRows] = useState([]);
  const [queueSummaryLoading, setQueueSummaryLoading] = useState(false);
  const [masterTotals, setMasterTotals] = useState(null);

  const flags = useSchedulerFlags?.() || {};
  const { beginPending, endPending, markDirty, markClean } =
    useUnsavedChanges() || {};

  const runWithPending = useCallback(
    async (operation, options = {}) => {
      if (typeof operation !== "function") {
        return undefined;
      }
      const { markAsDirty = false } = options;
      beginPending?.();
      if (markAsDirty) {
        markDirty?.();
      }
      try {
        return await operation();
      } finally {
        endPending?.();
        if (markAsDirty) {
          markClean?.();
        }
      }
    },
    [beginPending, endPending, markDirty, markClean],
  );

  // load queue summary for overview card
  useEffect(() => {
    if (!uid) {
      setQueueSummaryRows([]);
      setQueueSummaryLoading(false);
      return;
    }
    if (metaLoading || showWizard) {
      return;
    }
    let active = true;
    setQueueSummaryLoading(true);
    const timeoutId = setTimeout(async () => {
      try {
        const rows = await listMasterQueueLinear(uid, {});
        if (active) {
          setQueueSummaryRows(Array.isArray(rows) ? rows : []);
        }
      } catch (err) {
        console.error(err);
        if (active) {
          setQueueSummaryRows([]);
        }
      } finally {
        if (active) {
          setQueueSummaryLoading(false);
        }
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timeoutId);
      setQueueSummaryLoading(false);
    };
  }, [uid, metaLoading, showWizard, refreshSignal]);

  // auth -> uid
  useEffect(() => {
    const auth = getAuth();
    const off = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid || "");
    });
    return () => off();
  }, []);

  // load meta
  useEffect(() => {
    let active = true;
    (async () => {
      if (!uid) return;
      if (!meta) {
        setMetaLoading(true);
      }
      try {
        const m = await loadPlanMeta(uid);
        if (!active) return;
        setMeta(m || {});
        setShowWizard((prev) => prev || !m?.hasCompletedSetup);
      } finally {
        active && setMetaLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [uid, refreshSignal]);

  useEffect(() => {
    let active = true;
    if (!uid) {
      setMasterTotals(null);
      return () => {
        active = false;
      };
    }
    (async () => {
      try {
        let totals = null;
        try {
          const metaDoc = await loadMasterPlanMeta(uid);
          totals = metaDoc?.totals || null;
        } catch (_err) {
          totals = null;
        }

        if (!totals || !Number(totals.minutes)) {
          try {
            const fallback = await loadSyllabusTotals();
            totals = fallback
              ? {
                  minutes: Number(fallback.minutes || 0),
                  topics: Number(fallback.chapters || 0),
                }
              : null;
          } catch (_err) {
            totals = null;
          }
        }

        if (!active) return;
        if (totals && Number(totals.minutes) > 0) {
          setMasterTotals({
            minutes: Number(totals.minutes || 0),
            topics: Number(totals.topics || 0),
          });
        } else {
          setMasterTotals(null);
        }
      } catch (err) {
        console.error("Failed to load syllabus totals", err);
        if (active) {
          setMasterTotals(null);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [uid, meta?.updatedAt, refreshSignal]);

  // choose "This Week" key from today
  useEffect(() => {
    if (!uid) return;
    try {
      const wk = weekKeyFromDate
        ? weekKeyFromDate(new Date())
        : toISO(startOfWeekSun(new Date()));
      setWeekKey(wk);
    } catch {
      const wk = toISO(startOfWeekSun(new Date()));
      setWeekKey(wk);
    }
  }, [uid]);

  const defaultDailyMinutes = useMemo(() => {
    if (meta?.dailyMinutes != null) return Number(meta.dailyMinutes);
    if (flags?.dailyCapacityMinsDefault != null)
      return Number(flags.dailyCapacityMinsDefault);
    return 90;
  }, [meta?.dailyMinutes, flags?.dailyCapacityMinsDefault]);

  // load/init week doc
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!uid || !weekKey || metaLoading) return;
      try {
        let wk = await loadOrInitWeek(uid, weekKey, defaultDailyMinutes);
        const isoList = weekKey
          ? weekDatesFromKeyLocal(weekKey).map((d) => toISO(d))
          : [];

        if (wk && defaultDailyMinutes > 0 && isoList.length) {
          const values = isoList.map((iso) => Number(wk?.dayCaps?.[iso] ?? 0));
          const unique = Array.from(new Set(values));
          const uniformVal = unique.length === 1 ? unique[0] : null;

          if (
            uniformVal != null &&
            uniformVal !== defaultDailyMinutes &&
            (uniformVal === 0 || uniformVal === 90)
          ) {
            const patch = {};
            isoList.forEach((iso) => {
              patch[`dayCaps.${iso}`] = defaultDailyMinutes;
            });

            try {
              await patchWeek(uid, weekKey, patch);
              wk = {
                ...wk,
                dayCaps: { ...(wk.dayCaps || {}) },
              };
              isoList.forEach((iso) => {
                wk.dayCaps[iso] = defaultDailyMinutes;
              });
            } catch (err) {
              console.error(err);
            }
          }
        }

        if (!mounted) return;
        setWeekDoc(wk || {});
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [uid, weekKey, metaLoading, refreshSignal, defaultDailyMinutes]);

  const weekDates = useMemo(() => {
    return weekDatesFromKeyLocal(weekKey);
  }, [weekKey]);

  // Memoize these to avoid ESLint "logical expression changes deps" warning
  const offDays = useMemo(() => weekDoc?.offDays ?? {}, [weekDoc]);
  const dayCaps = useMemo(() => weekDoc?.dayCaps ?? {}, [weekDoc]);
  const assigned = useMemo(() => weekDoc?.assigned ?? {}, [weekDoc]);
  const doneDays = useMemo(() => weekDoc?.doneDays ?? {}, [weekDoc]);

  const currentDayISO = useMemo(() => {
    if (meta?.currentDayISO) return meta.currentDayISO;
    return toISO(new Date());
  }, [meta]);

  // --------- handlers ----------
  const refreshAll = useCallback(() => {
    setRefreshSignal((x) => x + 1);
  }, []);

  const handleResetPlan = useCallback(async () => {
    if (!uid) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Resetting the plan will clear your current progress and queue. Continue?",
      );
      if (!confirmed) {
        return;
      }
    }
    await runWithPending(
      async () => {
        try {
          await resetPlanData(uid);
          setQueueSummaryRows([]);
          setMeta(null);
          setWeekDoc(null);
          setWeekKey("");
          setShowWizard(true);
          refreshAll();
        } catch (err) {
          console.error(err);
          if (typeof window !== "undefined") {
            window.alert(err?.message || "Failed to reset plan");
          }
          throw err;
        }
      },
      { markAsDirty: true },
    );
  }, [uid, refreshAll, runWithPending]);

  const handleSaveWizard = async (payload, reportStage) => {
    if (!uid) return null;

    const normalizeList = (list) =>
      Array.from(
        new Set(
          (Array.isArray(list) ? list : [])
            .map((value) => (value == null ? "" : String(value).trim()))
            .filter((value) => value.length > 0),
        ),
      );

    return await runWithPending(
      async () => {
        const form = payload?.form ?? {};
        const sectionOrder = normalizeList(payload?.sectionOrder);
        const disabledSections = normalizeList(payload?.disabledSections);
        const onlyMustChapters = !!payload?.onlyMustChapters;
        const stageReporter =
          typeof reportStage === "function" ? reportStage : () => {};
        const enabledSections = normalizeList(
          payload?.enabledSections && payload.enabledSections.length
            ? payload.enabledSections
            : sectionOrder.filter(
                (value) => !disabledSections.includes(value),
              ),
        );
        const recommendedDailyValue = Number(payload?.recommendedDaily || 0);
        const recommendedDaily =
          Number.isFinite(recommendedDailyValue) && recommendedDailyValue > 0
            ? recommendedDailyValue
            : null;

        try {
          stageReporter("prepare", "Saving plan settings...");

          const startDateRaw = form.startDate ? String(form.startDate) : "";
          const examDateRaw = form.examDate ? String(form.examDate) : "";
          const startDateKey = startDateRaw ? toISO(startDateRaw) : "";
          const examDateKey = examDateRaw ? toISO(examDateRaw) : "";
          const currentIso = startDateKey || toISO(new Date());
          const dailyMinutes = Math.max(
            0,
            Number(form.dailyMinutes ?? defaultDailyMinutes) || 0,
          );

          await savePlanMeta(uid, {
            startDate: startDateRaw,
            examDate: examDateRaw,
            dailyMinutes,
            hasCompletedSetup: true,
            sectionOrder,
            disabledSections,
            strategy: form.strategy,
            recommendedDaily,
            onlyMustChapters,
            currentDayISO: currentIso,
            updatedAt: new Date().toISOString(),
          });

          setMeta((prev) => ({
            ...(prev || {}),
            startDate: startDateKey,
            examDate: examDateKey,
            dailyMinutes,
            hasCompletedSetup: true,
            sectionOrder,
            disabledSections,
            strategy: form.strategy,
            recommendedDaily,
            onlyMustChapters,
            currentDayISO: currentIso,
          }));

          stageReporter("master", "Generating Master Plan...");
          await buildAndSaveMasterPlan(uid, {
            sectionPrefs: enabledSections,
            disabledSections,
            onlyMustChapters,
            forceRebuild: true,
          });

          stageReporter("week", "Building weekly blocks...");
          const wk = weekKeyFromDate
            ? weekKeyFromDate(new Date())
            : toISO(startOfWeekSun(new Date()));
          setWeekKey(wk);
          const wizardDaily = Math.max(0, dailyMinutes);
          const nextWeekDoc = await loadOrInitWeek(uid, wk, wizardDaily);
          setWeekDoc(nextWeekDoc);

          refreshAll();

          stageReporter("done", "Plan ready!");
          return {
            startDate: startDateRaw || startDateKey,
            examDate: examDateRaw || "",
            dailyMinutes,
            strategy: form.strategy,
            enabledSections,
            recommendedDaily,
            onlyMustChapters,
          };
        } catch (e) {
          console.error(e);
          throw e;
        }
      },
      { markAsDirty: true },
    );
  };

  const handleToggleOffDay = async (iso) => {
    if (!uid || !weekKey) return;
    await runWithPending(async () => {
      const next = !offDays[iso];
      await patchWeek(uid, weekKey, { [`offDays.${iso}`]: next });
      refreshAll();
    });
  };

  const handleUpdateDayCap = async (iso, minutes) => {
    if (!uid || !weekKey) return;
    await runWithPending(async () => {
      const m = Math.max(0, Number(minutes || 0));
      await patchWeek(uid, weekKey, { [`dayCaps.${iso}`]: m });
      refreshAll();
    });
  };

  const handleAdjustDayCap = async (iso, delta) => {
    if (!uid || !weekKey) return;
    await runWithPending(async () => {
      const cur = Number(dayCaps?.[iso] || 0);
      const m = Math.max(0, cur + Number(delta || 0));
      await patchWeek(uid, weekKey, { [`dayCaps.${iso}`]: m });
      refreshAll();
    });
  };

  const handleMarkDayDone = async (iso) => {
    if (!uid || !weekKey) return null;

    return runWithPending(async () => {
      try {
        const result = await completeDayAndAdvance(uid, weekKey, iso);

        setWeekDoc((prev) => {
          if (!prev) return prev;
          const nextDoneDays = { ...(prev.doneDays || {}), [iso]: true };
          return { ...prev, doneDays: nextDoneDays };
        });

        if (result?.nextISO) {
          setMeta((prev) =>
            prev
              ? {
                  ...prev,
                  currentDayISO: result.nextISO,
                  updatedAt: new Date().toISOString(),
                }
              : prev,
          );
        }

        refreshAll();
        return result;
      } catch (err) {
        console.error(err);
        if (typeof window !== "undefined") {
          window.alert(err?.message || "Failed to mark the day as done");
        }
        throw err;
      }
    });
  };

  const calcRemaining = (iso) => {
    const cap = Number(dayCaps?.[iso] || 0);
    const items = assigned?.[iso] || [];
    const used = items.reduce((sum, it) => sum + Number(it.minutes || 0), 0);
    return Math.max(0, cap - used);
  };

  /**
   * Fills the given day ONLY, from the head of master queue:
   * - inProgress topics first, then queued
   * - schedules the next unscheduled subtopics (in order) that fit capacity
   */
  const handleAddFromMaster = async (iso) => {
    if (!uid || !weekKey) return;

    await runWithPending(async () => {
      let remaining = calcRemaining(iso);
      if (remaining <= 0) return;

      try {
        const [ip, qd] = await Promise.all([
          listMasterQueueLinear(uid, { filter: "inProgress" }),
          listMasterQueueLinear(uid, { filter: "queued" }),
        ]);
        const runs = [...(ip || []), ...(qd || [])];

        if (!runs.length) {
          if (typeof window !== "undefined") {
            window.alert("Master queue is empty.");
          }
          return;
        }

        const dayAssignments = Array.isArray(assigned?.[iso]) ? assigned[iso] : [];
        const existingSeqs = new Set(dayAssignments.map((a) => String(a.seq || "")));

        const newAssignments = [];
        let fillCount = 0;

        for (const topic of runs) {
          if (remaining <= 0) break;
          const subs = Array.isArray(topic.subtopics) ? topic.subtopics : [];
          const already = buildAlreadySet(topic);

          for (let idx = 0; idx < subs.length && remaining > 0; idx += 1) {
            if (already.has(idx)) continue;
            const sub = subs[idx];
            const mins = Number(sub?.minutes || 0);
            if (!Number.isFinite(mins) || mins <= 0) continue;
            if (mins > remaining) continue;

            const assignment = {
              seq: topic.seq || "",
              section: topic.section || "",
              chapterId: topic.chapterId || "",
              chapterName: topic.chapterName || "",
              topicId: topic.topicId || "",
              title: topic.topicName || "",
              subIdx: idx,
              subId: sub?.itemId || "",
              subName: sub?.name || "",
              minutes: mins,
            };

            newAssignments.push(assignment);
            remaining -= mins;
            fillCount += 1;

            if (!existingSeqs.has(String(topic.seq || ""))) {
              existingSeqs.add(String(topic.seq || ""));
            }
          }
        }

        if (!newAssignments.length) {
          if (typeof window !== "undefined") {
            window.alert("Unable to add more items within today's capacity.");
          }
          return;
        }

        const batchUpdate = {};
        batchUpdate[`assigned.${iso}`] = [
          ...dayAssignments,
          ...newAssignments.map((item, idx) => ({
            ...item,
            minutes: Number(item.minutes || 0),
            addedAt: Date.now(),
            seq: item.seq || `tmp-${Date.now()}-${idx}`,
          })),
        ];

        await patchWeek(uid, weekKey, batchUpdate);
        refreshAll();

        if (typeof window !== "undefined") {
          window.alert(`Added ${fillCount} study blocks to ${iso}.`);
        }
      } catch (err) {
        console.error(err);
        if (typeof window !== "undefined") {
          window.alert(err?.message || "Failed to add from the master queue");
        }
        throw err;
      }
    });
  };

  // labels/metrics
  const weekLabel = useMemo(() => {
    const [monday, sunday] = [weekDates[0], weekDates[6]];
    if (!monday || !sunday) return "This Week";
    return `${monday.toLocaleDateString()} - ${sunday.toLocaleDateString()}`;
  }, [weekDates]);

  const totalPlannedThisWeek = useMemo(() => {
    const sum = weekDates.reduce((acc, d) => {
      const iso = toISO(d);
      const items = assigned?.[iso] || [];
      const mins = items.reduce((s, it) => s + Number(it.minutes || 0), 0);
      return acc + mins;
    }, 0);
    return sum;
  }, [weekDates, assigned]);

  const planOverviewStats = useMemo(() => {
    const rows = Array.isArray(queueSummaryRows) ? queueSummaryRows : [];
    const fallbackProjected = meta?.projectedEndDate
      ? new Date(meta.projectedEndDate)
      : null;

    if (!rows.length) {
      return {
        overallProgress: null,
        minutesStudied: 0,
        minutesTotal: 0,
        topicsCompleted: 0,
        topicsTotal: 0,
        projectedEndDate:
          fallbackProjected && !Number.isNaN(fallbackProjected.getTime())
            ? fallbackProjected
            : null,
      };
    }

    const activeRows = rows.filter((row) => {
      const state = String(row?.queueState || "").toLowerCase();
      return state !== "removed";
    });

    if (!activeRows.length) {
      return {
        overallProgress: null,
        minutesStudied: 0,
        minutesTotal: 0,
        topicsCompleted: 0,
        topicsTotal: 0,
        projectedEndDate:
          fallbackProjected && !Number.isNaN(fallbackProjected.getTime())
            ? fallbackProjected
            : null,
      };
    }

    const totals = activeRows.reduce(
      (acc, row) => {
        const minutes = Math.max(0, Number(row?.minutes || 0));
        const state = String(row?.queueState || "").toLowerCase();

        if (minutes > 0) {
          acc["minutesTotal"] += minutes;
          if (state === "done") {
            acc["minutesStudied"] += minutes;
          }
        }

        if (state === "done") {
          acc["topicsCompleted"] += 1;
        }

        acc["topicsTotal"] += 1;
        return acc;
      },
      {
        minutesTotal: 0,
        minutesStudied: 0,
        topicsCompleted: 0,
        topicsTotal: 0,
      },
    );

    const progress =
      totals["minutesTotal"] > 0
        ? totals["minutesStudied"] / totals["minutesTotal"]
        : null;
    const remainingMinutes = Math.max(
      0,
      totals["minutesTotal"] - totals["minutesStudied"],
    );

    const capValues = Object.values(weekDoc?.dayCaps || {})
      .map((value) => Number(value || 0))
      .filter((value) => value > 0);
    let averageDailyCap = capValues.length
      ? capValues.reduce((sum, value) => sum + value, 0) / capValues.length
      : Number(meta?.dailyMinutes || 0);
    if (
      !averageDailyCap ||
      Number.isNaN(averageDailyCap) ||
      averageDailyCap <= 0
    ) {
      averageDailyCap = 90;
    }

    const baseIso = meta?.currentDayISO || meta?.startDate || toISO(new Date());
    const baseDate = new Date(`${baseIso}T00:00:00`);
    const isBaseValid = !Number.isNaN(baseDate.getTime());
    const daysNeeded =
      averageDailyCap > 0
        ? Math.ceil(remainingMinutes / averageDailyCap)
        : null;
    let projected = null;
    if (isBaseValid && Number.isFinite(daysNeeded)) {
      projected = new Date(
        baseDate.getTime() + Math.max(0, daysNeeded) * 86400000,
      );
    } else if (
      fallbackProjected &&
      !Number.isNaN(fallbackProjected.getTime())
    ) {
      projected = fallbackProjected;
    }

    return {
      overallProgress: progress,
      minutesStudied: totals["minutesStudied"],
      minutesTotal: totals["minutesTotal"],
      topicsCompleted: totals["topicsCompleted"],
      topicsTotal: totals["topicsTotal"],
      projectedEndDate: projected,
    };
  }, [queueSummaryRows, weekDoc, meta]);

  const shouldShowSkeleton = metaLoading || (!weekDoc && !showWizard);

  if (!uid) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 p-4">
          Sign in to use the planner.
        </div>
      </div>
    );
  }

  const SkeletonLayout = () => (
    <>
      <div className="h-36 rounded-xl bg-gray-100 animate-pulse" />
      <div className="h-72 rounded-xl bg-gray-100 animate-pulse" />
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(280px,340px)_1fr] lg:gap-6">
        <div className="h-[520px] rounded-xl bg-gray-100 animate-pulse" />
        <div className="h-[520px] rounded-xl bg-gray-100 animate-pulse" />
      </div>
    </>
  );

  const PlannerContent = () => (
    <>
      <PlanSummaryCard
        stats={planOverviewStats}
        onReset={handleResetPlan}
        isLoading={queueSummaryLoading}
      />

      <div className="w-full">
        <MasterGanttTimeline
          uid={uid}
          meta={meta}
          week={weekDoc}
          refreshSignal={refreshSignal}
        />
      </div>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(280px,340px)_1fr] lg:gap-6">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="max-h-[calc(100vh-3rem)] overflow-y-auto rounded-lg border bg-white shadow-sm">
            <MasterQueueSidebar uid={uid} refreshSignal={refreshSignal} />
          </div>
        </aside>

        {/* Main column */}
        <main className="flex flex-col gap-4 min-w-0">
          <div className="mt-2">
            <WeeklyBoard
              uid={uid}
              weekKey={weekKey}
              weekDates={weekDates}
              offDays={offDays}
              dayCaps={dayCaps}
              assigned={assigned}
              doneDays={doneDays}
              currentDayISO={currentDayISO}
              onToggleOffDay={handleToggleOffDay}
              onUpdateDayCap={handleUpdateDayCap}
              onAdjustDayCap={handleAdjustDayCap}
              onMarkDayDone={handleMarkDayDone}
              onAddFromMaster={handleAddFromMaster}
              onRefresh={refreshAll}
              onPrevWeek={undefined}
              onNextWeek={undefined}
              onThisWeek={undefined}
              onAutoFillWeek={async () => {
                await autoFillWeekFromMaster(uid, weekKey);
                refreshAll();
              }}
              weekLabel={weekLabel}
              totalPlannedThisWeek={totalPlannedThisWeek}
            />
          </div>
        </main>
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      {shouldShowSkeleton ? <SkeletonLayout /> : <PlannerContent />}

      {showWizard && (
        <PlanSetupWizardV2
          planMeta={meta}
          initial={{
            startDate: meta?.startDate || "",
            examDate: meta?.examDate || "",
            dailyMinutes:
              meta?.dailyMinutes != null
                ? String(meta.dailyMinutes)
                : "",
            strategy: meta?.strategy || undefined,
            disabledSections: meta?.disabledSections || [],
            sectionOrder: meta?.sectionOrder || [],
            recommendedDaily: meta?.recommendedDaily ?? undefined,
            onlyMustChapters: !!meta?.onlyMustChapters,
            totalMinutes: Number(masterTotals?.minutes || planOverviewStats?.minutesTotal || 0),
          }}
          defaultDaily={Number(flags?.dailyCapacityMinsDefault ?? 90)}
          onCancel={() => setShowWizard(false)}
          onSave={handleSaveWizard}
        />
      )}
    </div>
  );
}
