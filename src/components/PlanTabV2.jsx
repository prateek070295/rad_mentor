// src/components/PlanTabV2.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";

// Optional flags hook (kept because it exists in your project)
import { useSchedulerFlags } from "../hooks/useSchedulerFlags";

// Services
import {
  loadPlanMeta,
  savePlanMeta,
  loadOrInitWeek,
  patchWeek,
  completeDayAndAdvance,
  weekKeyFromDate,
  autoFillWeekFromMaster,
  listMasterQueueLinear,
  scheduleSubtopicToDay,
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

  const flags = useSchedulerFlags?.() || {};

  // load queue summary for overview card
  useEffect(() => {
    if (!uid || metaLoading || showWizard) {
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
      setMetaLoading(true);
      try {
        const m = await loadPlanMeta(uid);
        if (!active) return;
        setMeta(m || {});
        setShowWizard(!m?.hasCompletedSetup);
      } finally {
        active && setMetaLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [uid, refreshSignal]);

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
    }
  }, [uid, refreshAll]);

  const handleSaveWizard = async (form, setBusyText, sectionOrder) => {
    if (!uid) return;
    try {
      setBusyText?.("Saving plan...");
      await savePlanMeta(uid, {
        startDate: form.startDate,
        examDate: form.examDate || "",
        dailyMinutes: Number(form.dailyMinutes || 0),
        hasCompletedSetup: true,
        sectionOrder: Array.isArray(sectionOrder) ? sectionOrder : [],
        currentDayISO: form.startDate
          ? toISO(form.startDate)
          : toISO(new Date()),
        updatedAt: new Date().toISOString(),
      });

      setBusyText?.("Building Master Plan...");
      await buildAndSaveMasterPlan(uid, {
        sectionPrefs: Array.isArray(sectionOrder) ? sectionOrder : [],
        forceRebuild: true,
      });

      setBusyText?.("Preparing This Week...");
      // Use the week that contains today's date; if you want startDate week, swap below to form.startDate
      const wk = weekKeyFromDate
        ? weekKeyFromDate(new Date())
        : toISO(startOfWeekSun(new Date()));
      setWeekKey(wk);
      const wizardDaily = Math.max(
        0,
        Number(form.dailyMinutes || defaultDailyMinutes),
      );
      await loadOrInitWeek(uid, wk, wizardDaily);

      setBusyText?.("Refreshing...");
      setShowWizard(false);
      refreshAll();
    } catch (e) {
      console.error(e);
      setBusyText?.(e?.message || "Failed to save plan");
    }
  };

  const handleToggleOffDay = async (iso) => {
    if (!uid || !weekKey) return;
    const next = !offDays[iso];
    await patchWeek(uid, weekKey, { [`offDays.${iso}`]: next });
    refreshAll();
  };

  const handleUpdateDayCap = async (iso, minutes) => {
    if (!uid || !weekKey) return;
    const m = Math.max(0, Number(minutes || 0));
    await patchWeek(uid, weekKey, { [`dayCaps.${iso}`]: m });
    refreshAll();
  };

  const handleAdjustDayCap = async (iso, delta) => {
    if (!uid || !weekKey) return;
    const cur = Number(dayCaps?.[iso] || 0);
    const m = Math.max(0, cur + Number(delta || 0));
    await patchWeek(uid, weekKey, { [`dayCaps.${iso}`]: m });
    refreshAll();
  };

  const handleMarkDayDone = async (iso) => {
    if (!uid || !weekKey) return null;

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
    let remaining = calcRemaining(iso);
    if (remaining <= 0) return;

    try {
      // get runs (inProgress, then queued)
      const [ip, qd] = await Promise.all([
        listMasterQueueLinear(uid, { filter: "inProgress" }),
        listMasterQueueLinear(uid, { filter: "queued" }),
      ]);
      const runs = [...(ip || []), ...(qd || [])];

      // schedule subtopics in order until we run out of space
      outer: for (const run of runs) {
        if (remaining <= 0) break;
        const subs = Array.isArray(run.subtopics) ? run.subtopics : [];
        // Build a set of already-scheduled subIdx across all days (skip dupes)
        const scheduledDates = run.scheduledDates || {};
        const already = new Set(
          Object.values(scheduledDates)
            .flat()
            .map((x) => Number(x))
            .filter((x) => Number.isFinite(x)),
        );

        for (const s of subs) {
          if (remaining <= 0) break outer;
          const subIdx = Number(s.subIdx);
          const minutes = Number(s.minutes || 0);
          if (!Number.isFinite(subIdx) || minutes <= 0) continue;
          if (already.has(subIdx)) continue; // skip scheduled slices

          if (minutes <= remaining) {
            // schedule this specific subtopic into the day
            await scheduleSubtopicToDay(uid, iso, run.seq, subIdx);
            remaining -= minutes;
          } else {
            // not enough room for this slice; try next run
            break;
          }
        }
      }

      // refresh UI
      refreshAll();
    } catch (e) {
      console.error(e);
      // swallow; UI shows current state anyway
    }
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
          initial={{
            startDate: meta?.startDate || "",
            examDate: meta?.examDate || "",
            dailyMinutes:
              meta?.dailyMinutes != null
                ? Number(meta.dailyMinutes)
                : Number(flags?.dailyCapacityMinsDefault ?? 90),
          }}
          defaultDaily={Number(flags?.dailyCapacityMinsDefault ?? 90)}
          onCancel={() => setShowWizard(false)}
          onSave={handleSaveWizard}
        />
      )}
    </div>
  );
}
