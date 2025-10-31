// src/components/PlanTabV2.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
  weekKeyFromDate,
  autoFillWeekFromMaster,
  scheduleTopicToDay,
  listMasterQueueLinear,
  resetPlanData,
} from "../services/planV2Api";

import { buildAndSaveMasterPlan } from "../services/masterPlanBuilder";
import {
  calculatePlanOverviewStats,
} from "../utils/planStats";

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
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [weekRefreshKey, setWeekRefreshKey] = useState(0);
  const pendingDayCapValuesRef = useRef({});
  const pendingDayCapTimersRef = useRef({});
  const metaLoadedRef = useRef(false);
  const [queueSummaryRows, setQueueSummaryRows] = useState([]);
  const [queueSummaryLoading, setQueueSummaryLoading] = useState(false);
  const [masterTotals, setMasterTotals] = useState(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [isAutoFillingDay, setIsAutoFillingDay] = useState(false);
  const [isPlannerUpdating, setIsPlannerUpdating] = useState(false);
  const [, setHasPendingRefresh] = useState(false);
  console.log(`%c[PlanTabV2] RENDER`, "color: red; font-weight: bold;");

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
  }, [uid, metaLoading, showWizard, queueRefreshKey]);

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
    if (!uid) return;
    if (!metaLoadedRef.current) {
      setMetaLoading(true);
    }
    let active = true;
    (async () => {
      try {
        const m = await loadPlanMeta(uid);
        if (!active) return;
        setMeta(m || {});
        metaLoadedRef.current = true;
        setShowWizard((prev) => prev || !m?.hasCompletedSetup);
      } finally {
        if (active) {
          setMetaLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [uid]);
  

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
  }, [uid, meta?.updatedAt, queueRefreshKey]);

  // choose active week based on currentDayISO (fall back to calendar week)
  useEffect(() => {
    if (!uid) return;
    const sourceIso = toISO(new Date());
    let baseDate = new Date(sourceIso);
    if (Number.isNaN(baseDate.getTime())) {
      baseDate = new Date();
    }
    let computedWeek = "";
    try {
      computedWeek = weekKeyFromDate
        ? weekKeyFromDate(baseDate)
        : toISO(startOfWeekSun(baseDate));
    } catch {
      computedWeek = toISO(startOfWeekSun(baseDate));
    }
    if (computedWeek && computedWeek !== weekKey) {
      setWeekKey(computedWeek);
    }
  }, [uid, meta?.currentDayISO, weekKey]);

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
  }, [uid, weekKey, metaLoading, defaultDailyMinutes, weekRefreshKey]);

  const weekDates = useMemo(() => {
    return weekDatesFromKeyLocal(weekKey);
  }, [weekKey]);

  // Memoize these to avoid ESLint "logical expression changes deps" warning
  const offDays = useMemo(() => weekDoc?.offDays ?? {}, [weekDoc]);
  const dayCaps = useMemo(() => weekDoc?.dayCaps ?? {}, [weekDoc]);
  const assigned = useMemo(() => weekDoc?.assigned ?? {}, [weekDoc]);
  const plannerUpdatingPrevAssignedRef = useRef(assigned);
  const isAutoFillBusy = isAutoFilling || isAutoFillingDay;
  useEffect(() => {
    if (isPlannerUpdating && plannerUpdatingPrevAssignedRef.current !== assigned) {
      setIsPlannerUpdating(false);
    }
    plannerUpdatingPrevAssignedRef.current = assigned;
  }, [assigned, isPlannerUpdating]);
  useEffect(() => {
    if (!isPlannerUpdating) return undefined;
    const timeoutId = setTimeout(() => {
      setIsPlannerUpdating(false);
    }, 4000);
    return () => clearTimeout(timeoutId);
  }, [isPlannerUpdating]);

  const isUpdatingOverlayActive =
    isAutoFillBusy || isPlannerUpdating || queueSummaryLoading;
  useEffect(() => {
    setHasPendingRefresh(isUpdatingOverlayActive);
  }, [isUpdatingOverlayActive]);
  const handlePlannerUpdatingChange = useCallback(
    (value) => {
      console.log(`%c[PlanTabV2] handlePlannerUpdatingChange called with: ${value}`, "color: orange;");
      setIsPlannerUpdating(value);
      if (value) {
        setHasPendingRefresh(true);
      }
    },
    [],
  );
  const doneDays = useMemo(() => weekDoc?.doneDays ?? {}, [weekDoc]);

  const currentDayISO = useMemo(() => {
    if (meta?.currentDayISO) return meta.currentDayISO;
    return toISO(new Date());
  }, [meta]);

  // --------- handlers ----------
  const refreshQueue = useCallback(() => {
    setQueueRefreshKey((value) => value + 1);
  }, []);

  const refreshWeekData = useCallback(() => {
    console.log(`%c[PlanTabV2] REFRESH_WEEK_DATA called`, "color: purple;");
    setWeekRefreshKey((value) => value + 1);
  }, []);

  const refreshAll = useCallback(() => {
    refreshQueue();
    refreshWeekData();
  }, [refreshQueue, refreshWeekData]);

  const flushDayCapPatch = useCallback(
    async (iso) => {
      const timer = pendingDayCapTimersRef.current?.[iso];
      if (timer) {
        clearTimeout(timer);
        delete pendingDayCapTimersRef.current[iso];
      }
      if (!uid || !weekKey) {
        delete pendingDayCapValuesRef.current[iso];
        return;
      }
      const value = pendingDayCapValuesRef.current?.[iso];
      if (value == null) return;
      delete pendingDayCapValuesRef.current[iso];
      try {
        await patchWeek(uid, weekKey, { [`dayCaps.${iso}`]: value });
      } catch (error) {
        console.error("Failed to persist day cap", error);
        refreshWeekData();
      }
    },
    [uid, weekKey, refreshWeekData],
  );

  const scheduleDayCapUpdate = useCallback(
    (iso, minutes) => {
      setWeekDoc((prev) => {
        if (!prev) return prev;
        const current = Number(prev.dayCaps?.[iso] ?? 0);
        if (current === minutes) return prev;
        return {
          ...prev,
          dayCaps: {
            ...(prev.dayCaps || {}),
            [iso]: minutes,
          },
        };
      });

      pendingDayCapValuesRef.current[iso] = minutes;
      if (pendingDayCapTimersRef.current[iso]) {
        clearTimeout(pendingDayCapTimersRef.current[iso]);
      }
      pendingDayCapTimersRef.current[iso] = setTimeout(
        () => flushDayCapPatch(iso),
        400,
      );
    },
    [flushDayCapPatch],
  );

  useEffect(() => {
    return () => {
      const timers = pendingDayCapTimersRef.current || {};
      Object.keys(timers).forEach((iso) => {
        clearTimeout(timers[iso]);
      });
      const pending = { ...(pendingDayCapValuesRef.current || {}) };
      pendingDayCapTimersRef.current = {};
      pendingDayCapValuesRef.current = {};
      if (!uid || !weekKey) return;
      Object.entries(pending).forEach(([iso, value]) => {
        patchWeek(uid, weekKey, { [`dayCaps.${iso}`]: value }).catch((err) =>
          console.error("Failed to persist day cap during cleanup", err),
        );
      });
    };
  }, [uid, weekKey]);

  const handleTopicUnscheduled = useCallback((iso, seq) => {
    if (!iso || !seq) return;
    setWeekDoc((prev) => {
      if (!prev?.assigned) return prev;
      const isoKey = String(iso);
      const seqKey = String(seq);
      const dayEntries = Array.isArray(prev.assigned[isoKey])
        ? prev.assigned[isoKey]
        : null;
      if (!dayEntries || dayEntries.length === 0) {
        return prev;
      }
      const nextEntries = dayEntries.filter(
        (slice) => String(slice?.seq) !== seqKey,
      );
      if (nextEntries.length === dayEntries.length) {
        return prev;
      }
      return {
        ...prev,
        assigned: {
          ...(prev.assigned || {}),
          [isoKey]: nextEntries,
        },
      };
    });
  }, []);

  const handleAutoFillWeek = useCallback(
    async (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (!uid || !weekKey || isAutoFilling) return;
      setIsAutoFilling(true);
      setHasPendingRefresh(true);
      setIsPlannerUpdating(true);
      try {
        await runWithPending(async () => {
          const updatedWeek = await autoFillWeekFromMaster(uid, weekKey);
          const updatedQueueSummary = await listMasterQueueLinear(uid, {});
          let nextWeek = updatedWeek;
          if (!nextWeek) {
            const fallback = await loadOrInitWeek(
              uid,
              weekKey,
              defaultDailyMinutes,
            );
            nextWeek = fallback || {};
          }
          setWeekDoc(nextWeek);
          setQueueSummaryRows(
            Array.isArray(updatedQueueSummary) ? updatedQueueSummary : [],
          );
          refreshQueue();
          refreshWeekData();
        });
      } catch (error) {
        console.error("Auto-fill failed:", error);
      } finally {
        setIsAutoFilling(false);
        setIsPlannerUpdating(false);
      }
    },
    [
      uid,
      weekKey,
      defaultDailyMinutes,
      runWithPending,
      isAutoFilling,
      refreshQueue,
      refreshWeekData,
    ],
  );

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
          metaLoadedRef.current = false;
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

          metaLoadedRef.current = true;
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

  const handleToggleOffDay = async (iso, explicitNext) => {
    if (!uid || !weekKey) return;
    const next =
      explicitNext != null ? !!explicitNext : !offDays[iso];
    await runWithPending(async () => {
      await patchWeek(uid, weekKey, { [`offDays.${iso}`]: next });
      setWeekDoc((prev) => {
        if (!prev) return prev;
        const nextOff = { ...(prev.offDays || {}) };
        nextOff[iso] = next;
        return { ...prev, offDays: nextOff };
      });
    });
  };

  const handleUpdateDayCap = useCallback(
    (iso, minutes) => {
      const m = Math.max(0, Number(minutes || 0));
      scheduleDayCapUpdate(iso, m);
    },
    [scheduleDayCapUpdate],
  );

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

    setIsAutoFillingDay(true);
    try {
      await runWithPending(async () => {
        // persist any pending cap changes so scheduling sees latest capacity
        await flushDayCapPatch(iso);

        let remaining = calcRemaining(iso);
        if (remaining <= 0) return;

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

        let fillCount = 0;

        for (const topic of runs) {
          if (remaining <= 0) break;
          const seq = topic?.seq;
          if (seq == null) continue;

          const res = await scheduleTopicToDay(uid, iso, seq);
          const slices = Array.isArray(res?.slices) ? res.slices : [];
          if (!slices.length) {
            if (res?.message === "No remaining capacity") {
              remaining = 0;
              break;
            }
            continue;
          }

          const addedMinutes = slices.reduce(
            (sum, slice) => sum + Number(slice?.minutes || 0),
            0,
          );
          remaining = Math.max(0, remaining - addedMinutes);
          fillCount += slices.length;

          // optimistic update so the board reflects new slices immediately
          setWeekDoc((prev) => {
            if (!prev) return prev;
            const prevAssigned = Array.isArray(prev.assigned?.[iso])
              ? prev.assigned[iso]
              : [];
            return {
              ...prev,
              assigned: {
                ...(prev.assigned || {}),
                [iso]: [...prevAssigned, ...slices],
              },
            };
          });
        }

        if (!fillCount) {
          if (typeof window !== "undefined") {
            window.alert("Unable to add more items within today's capacity.");
          }
          return;
        }

        const nextWeekDoc = await loadOrInitWeek(
          uid,
          weekKey,
          defaultDailyMinutes,
        );
        if (nextWeekDoc) {
          setWeekDoc(nextWeekDoc);
        }
        refreshWeekData();
        refreshQueue();

        if (typeof window !== "undefined") {
          window.alert(`Added ${fillCount} study blocks to ${iso}.`);
        }
      });
    } catch (err) {
      console.error(err);
      if (typeof window !== "undefined") {
        window.alert(err?.message || "Failed to add from the master queue");
      }
      throw err;
    } finally {
      setIsAutoFillingDay(false);
    }
  };

  const handleScheduleQueueRun = useCallback(
    async (iso, seq) => {
      if (!uid || !weekKey || !iso || !seq) return null;
      await flushDayCapPatch(iso);
      const result = await scheduleTopicToDay(uid, iso, seq);
      const slices = Array.isArray(result?.slices) ? result.slices : [];
      if (slices.length) {
        setWeekDoc((prev) => {
          if (!prev) return prev;
          const prevAssigned = Array.isArray(prev.assigned?.[iso])
            ? prev.assigned[iso]
            : [];
          return {
            ...prev,
            assigned: {
              ...(prev.assigned || {}),
              [iso]: [...prevAssigned, ...slices],
            },
          };
        });
      }
      refreshQueue();
      return result;
    },
    [uid, weekKey, flushDayCapPatch, refreshQueue],
  );

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

  const planOverviewStats = useMemo(
    () =>
      calculatePlanOverviewStats(
        queueSummaryRows,
        weekDoc,
        meta,
      ),
    [queueSummaryRows, weekDoc, meta],
  );

  const handleBoardRefresh = useCallback(() => {
    refreshWeekData();
    refreshQueue();
  }, [refreshWeekData, refreshQueue]);

  const isOverlayActive = isUpdatingOverlayActive;

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
      <div className="h-48 rounded-3xl border border-indigo-100 bg-white/70 shadow-2xl shadow-indigo-200/40 backdrop-blur animate-pulse" />
      <div className="h-80 rounded-3xl border border-indigo-100 bg-white/60 shadow-xl shadow-indigo-200/30 backdrop-blur animate-pulse" />
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(300px,340px)_1fr] lg:gap-6">
        <div className="h-[540px] rounded-3xl border border-indigo-100 bg-white/60 shadow-xl shadow-indigo-200/30 backdrop-blur animate-pulse" />
        <div className="h-[540px] rounded-3xl border border-indigo-100 bg-white/60 shadow-xl shadow-indigo-200/30 backdrop-blur animate-pulse" />
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

      <div className="w-full rounded-3xl border border-indigo-100 bg-white/70 p-4 shadow-xl shadow-indigo-200/50 backdrop-blur">
        <MasterGanttTimeline
          uid={uid}
          meta={meta}
          week={weekDoc}
          refreshSignal={queueRefreshKey}
        />
      </div>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(300px,340px)_1fr] lg:gap-8">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="max-h-[calc(100vh-6rem)] overflow-y-auto rounded-3xl border border-indigo-100 bg-white/70 shadow-xl shadow-indigo-200/40 backdrop-blur">
            <MasterQueueSidebar uid={uid} refreshSignal={queueRefreshKey} />
          </div>
        </aside>

        {/* Main column */}
        <main className="flex min-w-0 flex-col gap-6">
          <div className="rounded-3xl border border-indigo-100 bg-white/80 p-4 shadow-xl shadow-indigo-200/50 backdrop-blur">
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
              onAddFromMaster={handleAddFromMaster}
              onScheduleQueueRun={handleScheduleQueueRun}
              onRefresh={handleBoardRefresh}
              onPrevWeek={undefined}
              onNextWeek={undefined}
              onThisWeek={undefined}
              onAutoFillWeek={handleAutoFillWeek}
              isAutoFilling={isAutoFillBusy}
              weekLabel={weekLabel}
              totalPlannedThisWeek={totalPlannedThisWeek}
              onUpdatingChange={handlePlannerUpdatingChange}
              onTopicUnscheduled={handleTopicUnscheduled}
            />
          </div>
        </main>
      </div>
    </>
  );

  return (
    <div className="relative">
      <div
        className={`space-y-10 ${
          isOverlayActive ? "opacity-40" : ""
        }`}
      >
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
              totalMinutes:
                Number(
                  masterTotals?.minutes || planOverviewStats?.minutesTotal || 0,
                ),
            }}
            defaultDaily={Number(flags?.dailyCapacityMinsDefault ?? 90)}
            onCancel={() => setShowWizard(false)}
            onSave={handleSaveWizard}
          />
        )}
      </div>

      {isUpdatingOverlayActive && (
        <div className="pointer-events-auto fixed inset-0 z-[1500] flex flex-col items-center justify-center bg-white/75 backdrop-blur-sm">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span className="mt-3 text-sm font-semibold text-slate-700">
            Updating planner...
          </span>
        </div>
      )}
    </div>
  );
}
