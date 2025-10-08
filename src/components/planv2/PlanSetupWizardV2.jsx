// src/components/planv2/PlanSetupWizardV2.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../Modal";
import { listSections } from "../../services/masterPlanBuilder";
import { fmtISO } from "./utils";

const WIZARD_STEPS = [
  { key: "timeline", title: "Timeline" },
  { key: "capacity", title: "Daily Load" },
  { key: "sections", title: "Section Order" },
];

const PROGRESS_SEQUENCE = [
  { key: "prepare", label: "Saving plan settings" },
  { key: "master", label: "Generating Master Plan" },
  { key: "week", label: "Building weekly blocks" },
  { key: "done", label: "Done" },
];

const MIN_DAILY_MINUTES = 15;
const MAX_DAILY_MINUTES = 720;

const normalizeSection = (value) => String(value || "").trim();

const alignOrderWithPreferences = (allSections, preferred = []) => {
  const preferredSet = new Set();
  const ordered = [];

  (Array.isArray(preferred) ? preferred : []).forEach((item) => {
    const section = normalizeSection(item);
    if (!section || preferredSet.has(section.toLowerCase())) return;
    preferredSet.add(section.toLowerCase());
    ordered.push(section);
  });

  (Array.isArray(allSections) ? allSections : []).forEach((item) => {
    const section = normalizeSection(item);
    if (!section || preferredSet.has(section.toLowerCase())) return;
    preferredSet.add(section.toLowerCase());
    ordered.push(section);
  });

  return ordered;
};

const computeRecommendedDaily = (startDate, examDate, totalMinutes) => {
  const total = Number(totalMinutes);
  if (!startDate || !examDate || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  const start = new Date(startDate);
  const exam = new Date(examDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(exam.getTime())) {
    return 0;
  }

  const diffMs = exam.getTime() - start.getTime();
  if (diffMs < 0) {
    return 0;
  }

  const diffDays = Math.max(1, Math.floor(diffMs / 86400000) + 1);
  const raw = Math.ceil(total / diffDays);
  const rounded = Math.ceil(raw / 10) * 10;
  const clamped = Math.min(
    MAX_DAILY_MINUTES,
    Math.max(MIN_DAILY_MINUTES, rounded),
  );
  return clamped;
};

const computeTimelineStats = (startDate, examDate, dailyMinutes) => {
  const parsedDaily = Number(dailyMinutes);
  const hasDaily = Number.isFinite(parsedDaily) && parsedDaily > 0;
  const hoursPerWeek = hasDaily ? Math.round((parsedDaily * 7) / 60) : null;

  if (!startDate) {
    return {
      hoursPerWeek,
      daysUntilExam: null,
      status: "neutral",
      message: "Pick a start date to begin planning.",
    };
  }

  if (!examDate) {
    return {
      hoursPerWeek,
      daysUntilExam: null,
      status: "neutral",
      message: "Add an exam date to see how much runway you have.",
    };
  }

  const start = new Date(startDate);
  const exam = new Date(examDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(exam.getTime())) {
    return {
      hoursPerWeek,
      daysUntilExam: null,
      status: "neutral",
      message: "Use valid dates to estimate your timeline.",
    };
  }

  const diffDays = Math.ceil((exam.getTime() - start.getTime()) / 86400000);
  if (diffDays < 0) {
    return {
      hoursPerWeek,
      daysUntilExam: diffDays,
      status: "error",
      message: "Exam date must be on or after the start date.",
    };
  }

  let status = "ok";
  if (diffDays <= 30) status = "tight";
  if (diffDays <= 14) status = "critical";

  const descriptor =
    status === "ok"
      ? "Plenty of runway."
      : status === "tight"
        ? "This timeline is tight. Consider raising your daily minutes."
        : "Very little runway left. Longer sessions may be required.";

  const message = hasDaily
    ? `${diffDays} days until exam: ~${hoursPerWeek} h/week at your target. ${descriptor}`
    : `${diffDays} days between your start and exam dates. ${descriptor}`;

  return {
    hoursPerWeek,
    daysUntilExam: diffDays,
    status,
    message,
  };
};

const describeStrategy = (strategy) => {
  if (strategy === "exam") return "Exam date driven";
  if (strategy === "capacity") return "Daily capacity driven";
  return "Custom";
};

const formatDisplayDate = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const initialFormState = (initial, defaultDaily) => {
  const daily =
    initial && initial.dailyMinutes != null
      ? String(initial.dailyMinutes)
      : "";
  const strategy =
    initial?.strategy ||
    (initial?.examDate ? "exam" : initial?.dailyMinutes ? "capacity" : "exam");

  return {
    startDate: initial?.startDate || fmtISO(new Date()),
    examDate: initial?.examDate || "",
    dailyMinutes: daily,
    strategy,
  };
};

export default function PlanSetupWizardV2({
  initial = {},
  defaultDaily = 90,
  onCancel,
  onSave,
}) {
  const [form, setForm] = useState(() => initialFormState(initial, defaultDaily));
  const [activeStep, setActiveStep] = useState(0);
  const [order, setOrder] = useState([]);
  const [disabledSections, setDisabledSections] = useState(() => {
    return new Set(
      (Array.isArray(initial?.disabledSections) ? initial.disabledSections : [])
        .map((value) => normalizeSection(value))
        .filter(Boolean),
    );
  });
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [errorSteps, setErrorSteps] = useState([]);
  const [submitError, setSubmitError] = useState("");
  const [progressState, setProgressState] = useState({ active: false, key: null, label: "" });
  const [confirmation, setConfirmation] = useState(null);
  const [mode, setMode] = useState("wizard");
  const [onlyMustChapters, setOnlyMustChapters] = useState(
    !!initial?.onlyMustChapters,
  );
  const startDateRef = useRef(null);
  const examDateRef = useRef(null);
  const lastExamDateRef = useRef(initial?.examDate || "");

  const planTotalMinutes = useMemo(() => {
    const raw = Number(initial?.totalMinutes);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }, [initial?.totalMinutes]);

  const hasPlanMinutes = planTotalMinutes > 0;

  const studyWindowDays = useMemo(() => {
    if (!form.startDate || !form.examDate) return null;
    const start = new Date(form.startDate);
    const exam = new Date(form.examDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(exam.getTime())) return null;
    const diff = exam.getTime() - start.getTime();
    if (diff < 0) return null;
        return Math.max(1, Math.floor(diff / 86400000) + 1);
  }, [form.startDate, form.examDate]);
  const recommendedDaily = useMemo(
    () =>
      computeRecommendedDaily(
        form.startDate,
        form.strategy === "exam" ? form.examDate : "",
        planTotalMinutes,
        defaultDaily,
      ),
    [form.startDate, form.examDate, form.strategy, planTotalMinutes],
  );

  const dailyMinutesNumber = useMemo(() => {
    const parsed = Number(form.dailyMinutes);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return parsed;
  }, [form.dailyMinutes]);

  const timelineStats = useMemo(
    () => computeTimelineStats(form.startDate, form.examDate, form.dailyMinutes),
    [form.startDate, form.examDate, form.dailyMinutes],
  );

  const enabledSections = useMemo(
    () => order.filter((section) => !disabledSections.has(section)),
    [order, disabledSections],
  );

  const errorsByStep = useMemo(() => {
    const timelineErrors = {};
    if (!form.startDate) {
      timelineErrors.startDate = "Start date is required.";
    }
    if (form.strategy === "exam" && !form.examDate) {
      timelineErrors.examDate = "Exam date is required when planning toward a test.";
    }
    if (form.startDate && form.examDate) {
      const start = new Date(form.startDate);
      const exam = new Date(form.examDate);
      if (
        !Number.isNaN(start.getTime()) &&
        !Number.isNaN(exam.getTime()) &&
        exam.getTime() < start.getTime()
      ) {
        timelineErrors.examDate = "Exam date must be on or after the start date.";
      }
    }

    const capacityErrors = {};
    const hasDailyInput = String(form.dailyMinutes || "").length > 0;
    if (!hasDailyInput) {
      capacityErrors.dailyMinutes = "Enter your daily minutes per day.";
    } else if (dailyMinutesNumber < MIN_DAILY_MINUTES) {
      capacityErrors.dailyMinutes = `Enter at least ${MIN_DAILY_MINUTES} minutes per day.`;
    } else if (dailyMinutesNumber > MAX_DAILY_MINUTES) {
      capacityErrors.dailyMinutes = "Please choose a realistic daily target (under 12 hours).";
    }

    const sectionsErrors = {};
    if (!enabledSections.length) {
      sectionsErrors.enabled = "Include at least one section to build your plan.";
    }
    if (!order.length && !sectionsLoading) {
      sectionsErrors.order = "We could not load sections. Try again or check your connection.";
    }

    return {
      timeline: timelineErrors,
      capacity: capacityErrors,
      sections: sectionsErrors,
    };
  }, [form, enabledSections.length, order.length, sectionsLoading]);

  useEffect(() => {
    let active = true;
    (async () => {
      setSectionsLoading(true);
      try {
        const sections = await listSections();
        if (!active) return;
        const aligned = alignOrderWithPreferences(sections, initial?.sectionOrder);
        setOrder(aligned);
        setDisabledSections((prev) => {
          const next = new Set();
          aligned.forEach((section) => {
            if (prev.has(section)) {
              next.add(section);
            }
          });
          return next;
        });
      } catch {
        // keep defaults; wizard can still continue
      } finally {
        if (active) {
          setSectionsLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [initial?.sectionOrder]);

  const revealErrorsForStep = (stepKey) => {
    setErrorSteps((prev) => {
      if (prev.includes(stepKey)) return prev;
      return [...prev, stepKey];
    });
  };

  const clearErrors = () => {
    setErrorSteps([]);
    setSubmitError("");
  };

  const handleUpdateForm = (key, value) => {
    if (key === "dailyMinutes") {
      const cleaned = String(value ?? "")
        .replace(/[^\d]/g, "")
        .slice(0, 4);
      setForm((prev) => ({
        ...prev,
        dailyMinutes: cleaned,
      }));
      return;
    }
  setForm((prev) => ({
    ...prev,
    [key]: value,
  }));

  if (key === "examDate") {
    lastExamDateRef.current = value || "";
  }

  if (key === "startDate" || key === "examDate") {
    requestAnimationFrame(() => {
      const target =
        key === "startDate" ? startDateRef.current : examDateRef.current;
      if (target && typeof target.showPicker === "function") {
        if (typeof target.focus === "function") {
          target.focus({ preventScroll: true });
        }
        target.showPicker();
      }
    });
  }
  };

  const handleStrategyChange = (value) => {
    if (value === "exam") {
      setForm((prev) => ({
        ...prev,
        strategy: value,
        examDate: prev.examDate || lastExamDateRef.current || "",
      }));
      return;
    }

    lastExamDateRef.current = form.examDate || lastExamDateRef.current || "";
    setForm((prev) => ({
      ...prev,
      strategy: value,
      examDate: "",
    }));
  };

  const handleDragStart = (idx) => setDragIdx(idx);
  const handleDragOver = (event) => event.preventDefault();
  const handleDrop = (idx) => {
    if (dragIdx === null || dragIdx === idx) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIdx(null);
  };

  const toggleSectionEnabled = (section) => {
    setDisabledSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const goToStep = (index) => {
    if (index < 0 || index >= WIZARD_STEPS.length) return;
    setActiveStep(index);
    setSubmitError("");
  };

  const handleNext = () => {
    const currentKey = WIZARD_STEPS[activeStep]?.key;
    const currentErrors = errorsByStep[currentKey] || {};
    if (Object.keys(currentErrors).length) {
      revealErrorsForStep(currentKey);
      return;
    }
    goToStep(activeStep + 1);
  };

  const handleBack = () => {
    goToStep(activeStep - 1);
  };

  const setProgressStage = (stageKey, message) => {
    if (!stageKey) {
      setProgressState({ active: false, key: null, label: "" });
      return;
    }
    const stage = PROGRESS_SEQUENCE.find((item) => item.key === stageKey);
    setProgressState({
      active: true,
      key: stageKey,
      label: message || stage?.label || "Working...",
    });
  };

  const handleSubmit = async () => {
    const aggregatedErrors = WIZARD_STEPS.reduce((acc, step) => {
      const stepErrors = errorsByStep[step.key] || {};
      if (Object.keys(stepErrors).length) {
        acc[step.key] = stepErrors;
      }
      return acc;
    }, {});

    const keysWithErrors = Object.keys(aggregatedErrors);
    if (keysWithErrors.length) {
      keysWithErrors.forEach((key) => revealErrorsForStep(key));
      const firstKey = keysWithErrors[0];
      const stepIndex = WIZARD_STEPS.findIndex((step) => step.key === firstKey);
      if (stepIndex >= 0) {
        setActiveStep(stepIndex);
      }
      return;
    }

    setSubmitError("");
    setProgressStage("prepare");

    try {
      const payload = {
        form,
        sectionOrder: order,
        disabledSections: Array.from(disabledSections),
        enabledSections,
        recommendedDaily,
        onlyMustChapters,
      };

      const summary = await onSave?.(payload, (stageKey, message) => {
        if (stageKey) {
          setProgressStage(stageKey, message);
        }
      });

      setProgressStage(null);
      if (summary) {
        setConfirmation(summary);
        setMode("confirmation");
      } else {
        onCancel?.();
      }
    } catch (error) {
      console.error(error);
      setProgressStage(null);
      setSubmitError(error?.message || "Failed to save plan. Try again.");
    }
  };

  const resetWizard = () => {
    setMode("wizard");
    setProgressStage(null);
    clearErrors();
  };

  const handleClose = () => {
    resetWizard();
    onCancel?.();
  };

  const showErrorsForStep = (stepKey) => errorSteps.includes(stepKey);

  const StepContent = () => {
    const stepKey = WIZARD_STEPS[activeStep]?.key;
    if (stepKey === "timeline") {
      const errors = errorsByStep.timeline;
      const showErrors = showErrorsForStep("timeline");
      const timelineDays = (() => {
        if (!form.startDate || !form.examDate) return null;
        const start = new Date(form.startDate);
        const exam = new Date(form.examDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(exam.getTime()))
          return null;
        const diff = exam.getTime() - start.getTime();
        if (diff < 0) return null;
        return Math.max(1, Math.floor(diff / 86400000) + 1);
      })();

      const timelineMessage =
        form.strategy === "capacity" && !form.examDate
          ? "We'll keep your pace steady without an exam date. Add one later if you want recommendations."
          : timelineStats.message;
      return (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Start date *" error={showErrors ? errors.startDate : ""}>
              <input
                ref={startDateRef}
                type="date"
                value={form.startDate || ""}
                onChange={(event) => handleUpdateForm("startDate", event.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
            </Field>

            <Field label="Planning approach">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="plan-strategy"
                    value="exam"
                    checked={form.strategy === "exam"}
                    onChange={() => handleStrategyChange("exam")}
                    className="h-4 w-4"
                  />
                  <span>Work toward an exam date</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="plan-strategy"
                    value="capacity"
                    checked={form.strategy === "capacity"}
                    onChange={() => handleStrategyChange("capacity")}
                    className="h-4 w-4"
                  />
                  <span>Set a steady daily pace</span>
                </label>
              </div>
            </Field>
          </div>

          <div
            className={`grid grid-cols-1 gap-4 ${
              form.strategy === "exam" ? "md:grid-cols-2" : ""
            }`}
          >
            {form.strategy === "exam" && (
              <Field
                label="Exam date"
                hint="Select when you have a target test date."
                error={showErrors ? errors.examDate : ""}
              >
                <input
                  ref={examDateRef}
                  type="date"
                  value={form.examDate || ""}
                  min={form.startDate || undefined}
                  onChange={(event) => handleUpdateForm("examDate", event.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />
              </Field>
            )}

            <Field label="At a glance">
              <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-3 text-sm text-blue-800">
                {timelineMessage}
              </div>
            </Field>
          </div>
        </div>
      );
    }

    if (stepKey === "capacity") {
      const errors = errorsByStep.capacity;
      const showErrors = showErrorsForStep("capacity");
      const showRecommendation =
        form.strategy === "exam" && !!form.examDate && hasPlanMinutes;
      const recommendedNumber = showRecommendation
        ? Number(recommendedDaily || 0)
        : 0;
      const isUsingRecommendation =
        showRecommendation &&
        recommendedNumber > 0 &&
        dailyMinutesNumber === recommendedNumber;

      return (
        <div className="flex flex-col gap-6">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-800">
            {showRecommendation ? (
              <div className="flex flex-col gap-2">
                <div className="font-semibold text-indigo-900">Recommended daily target</div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-indigo-700">
                    {recommendedNumber} min/day
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateForm("dailyMinutes", String(recommendedNumber))
                    }
                    className="rounded-md border border-indigo-200 px-3 py-1 text-sm font-medium text-indigo-700 hover:bg-white"
                  >
                    {isUsingRecommendation ? "In use" : "Use recommendation"}
                  </button>
                </div>
                {studyWindowDays != null && hasPlanMinutes && (
                  <p className="text-xs text-indigo-700">
                {`Plan workload: ${(planTotalMinutes / 60).toFixed(1)} hrs across ${studyWindowDays} day${
                  studyWindowDays === 1 ? "" : "s"
                }. Next, we'll plan week by week.`}
                  </p>
                )}
              </div>
            ) : (
              <div>
                {form.strategy === "exam"
                  ? hasPlanMinutes
                    ? "Add your exam date to preview a recommended daily target."
                    : "We'll calculate a recommendation once your Master Plan is generated."
                  : "Pick a daily target that fits your routine."}
              </div>
            )}
          </div>

          <Field label="Time per day * (minutes)" error={showErrors ? errors.dailyMinutes : ""}>
            <input
              type="number"
              min={MIN_DAILY_MINUTES}
              max={MAX_DAILY_MINUTES}
              value={form.dailyMinutes}
              onChange={(event) => handleUpdateForm("dailyMinutes", event.target.value)}
              onBlur={() => revealErrorsForStep("capacity")}
              className="w-full rounded-md border px-3 py-2"
            />
          </Field>

          <div
            className={`rounded-md border px-3 py-3 text-sm ${
              timelineStats.status === "critical"
                ? "border-red-200 bg-red-50 text-red-800"
                : timelineStats.status === "tight"
                  ? "border-yellow-200 bg-yellow-50 text-yellow-800"
                  : timelineStats.status === "error"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-blue-100 bg-blue-50 text-blue-800"
            }`}
          >
            {timelineStats.message}
          </div>
        </div>
      );
    }

    const errors = errorsByStep.sections;
    const showErrors = showErrorsForStep("sections");
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-semibold text-sm text-gray-800">Section order</div>
            <p className="text-xs text-gray-500">Included sections are scheduled in the order shown below.</p>
          </div>
          <span
            className="rounded-full border border-gray-300 px-2 py-1 text-xs text-gray-500"
            title="We prioritize earlier sections when building your Master Plan. Disable a section to skip it for now."
          >
            ?
          </span>
        </div>

        {showErrors && (errors.enabled || errors.order) && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errors.enabled || errors.order}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white">
          {sectionsLoading ? (
            <div className="px-4 py-6 text-sm text-gray-500">Loading sections...</div>
          ) : order.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-500">
              No sections found. You can still continue; we will use the default ordering.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {order.map((section, index) => {
                const isDisabled = disabledSections.has(section);
                return (
                  <li
                    key={section}
                    draggable={!progressState.active}
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(index)}
                    className={`flex items-center justify-between gap-3 px-4 py-3 ${
                      dragIdx === index ? "bg-gray-50" : ""
                    }`}
                    title="Drag to reorder"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="cursor-grab text-sm text-gray-400"
                        onMouseDown={() => setDragIdx(index)}
                        onMouseUp={() => setDragIdx(null)}
                        aria-label="Drag handle"
                      >
                        <span className="inline-block rotate-90">::</span>
                      </button>
                      <div className="flex flex-col">
                        <span className={`text-sm font-medium ${isDisabled ? "text-gray-400" : "text-gray-800"}`}>
                          {section}
                        </span>
                        <span className="text-xs text-gray-500">Position #{index + 1}</span>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                      <input
                        type="checkbox"
                        checked={!isDisabled}
                        onChange={() => toggleSectionEnabled(section)}
                      />
                      <span>{isDisabled ? "Excluded" : "Included"}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <label className="flex items-start gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={onlyMustChapters}
              onChange={() => setOnlyMustChapters((prev) => !prev)}
            />
            <span>
              <span className="block font-medium text-gray-800">
                Focus on must-have chapters only
              </span>
              <span className="block text-xs text-gray-500">
                When selected, we will skip "good" and "nice to have" content for the included sections so the plan stays lean.
              </span>
            </span>
          </label>
        </div>

        {enabledSections.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            <div className="font-medium text-gray-800">First up in your plan</div>
            <p className="text-xs text-gray-500">We will start with these sections:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {enabledSections.slice(0, 3).map((section) => (
                <span
                  key={section}
                  className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700"
                >
                  {section}
                </span>
              ))}
              {enabledSections.length > 3 && (
                <span className="text-xs text-gray-500">+{enabledSections.length - 3} more</span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderConfirmation = () => {
    if (!confirmation) return null;
    const {
      startDate,
      examDate,
      dailyMinutes,
      strategy,
      enabledSections: enabled,
      recommendedDaily: rec,
      onlyMustChapters: scopeMustOnly,
    } = confirmation;

    return (
      <div className="flex flex-col gap-6 p-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Master Plan ready!</h2>
          <p className="text-sm text-gray-600">Here is a quick snapshot of what we set up.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <SummaryTile label="Start date" value={formatDisplayDate(startDate)} />
          <SummaryTile
            label="Exam date"
            value={examDate ? formatDisplayDate(examDate) : "Not set"}
          />
          <SummaryTile label="Planning approach" value={describeStrategy(strategy)} />
          <SummaryTile
            label="Daily target"
            value={`${dailyMinutes} min/day${rec && rec !== dailyMinutes ? ` (recommended ${rec})` : ""}`}
          />
          <SummaryTile
            label="Content scope"
            value={scopeMustOnly ? "Must-have chapters only" : "Must, good & nice content"}
          />
        </div>

        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <div className="font-semibold text-sm text-gray-800">Top sections</div>
          {enabled && enabled.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {enabled.slice(0, 6).map((section) => (
                <span
                  key={section}
                  className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700"
                >
                  {section}
                </span>
              ))}
              {enabled.length > 6 && (
                <span className="text-xs text-gray-500">+{enabled.length - 6} more enabled</span>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-600">All sections were disabled. You can adjust them any time.</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("wizard");
              setConfirmation(null);
            }}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Make changes
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Go to planner
          </button>
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={true}
      onClose={progressState.active ? undefined : handleClose}
      title="Plan setup"
    >
      <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl max-h-[78vh] flex flex-col mx-auto">
        {mode === "wizard" ? (
          <>
            <div className="border-b border-gray-200 bg-gray-50 px-4 pb-3 pt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                Guided setup
              </h3>
              <p className="text-xs text-gray-500">
                We will walk through your timeline, daily pacing, and section priorities.
              </p>
              <WizardStepIndicator steps={WIZARD_STEPS} activeIndex={activeStep} />
            </div>

            <div className="relative flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="flex flex-col gap-6 p-4 pb-8">
                  <StepContent />

                  {submitError && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {submitError}
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={progressState.active}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleBack}
                      disabled={activeStep === 0 || progressState.active}
                      className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Back
                    </button>
                    {activeStep < WIZARD_STEPS.length - 1 ? (
                      <button
                        type="button"
                        onClick={handleNext}
                        disabled={progressState.active}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={progressState.active}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Generate plan
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {progressState.active && (
                <ProgressOverlay
                  steps={PROGRESS_SEQUENCE}
                  currentKey={progressState.key}
                  label={progressState.label}
                />
              )}
            </div>
          </>
        ) : (
          renderConfirmation()
        )}
      </div>
    </Modal>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-gray-700">
        {label}
        {hint ? <span className="ml-1 text-xs font-normal text-gray-400">{hint}</span> : null}
      </span>
      {children}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

function WizardStepIndicator({ steps, activeIndex }) {
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium">
      {steps.map((step, index) => {
        const isActive = index === activeIndex;
        const isComplete = index < activeIndex;
        let classes = "bg-gray-100 border-gray-200 text-gray-500";
        if (isComplete) classes = "bg-green-50 border-green-200 text-green-700";
        if (isActive) classes = "bg-blue-50 border-blue-300 text-blue-700";
        return (
          <div
            key={step.key}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 ${classes}`}
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px] font-semibold">
              {index + 1}
            </span>
            <span className="pr-1">{step.title}</span>
          </div>
        );
      })}
    </div>
  );
}

function ProgressOverlay({ steps, currentKey, label }) {
  const currentIndex = steps.findIndex((step) => step.key === currentKey);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-white bg-opacity-80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-3">
          <span className="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <div className="text-sm font-semibold text-gray-700">{label || "Working..."}</div>
        </div>
        <ol className="space-y-2 text-sm">
          {steps.map((step, index) => {
            const status =
              index < currentIndex ? "complete" : index === currentIndex ? "active" : "pending";
            const dotClass =
              status === "complete"
                ? "bg-green-500"
                : status === "active"
                  ? "bg-blue-500 animate-pulse"
                  : "bg-gray-300";
            const textClass =
              status === "complete"
                ? "text-green-700"
                : status === "active"
                  ? "text-blue-700"
                  : "text-gray-400";
            return (
              <li key={step.key} className={`flex items-center gap-3 ${textClass}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                <span>{step.label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function SummaryTile({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-800">{value || "-"}</div>
    </div>
  );
}



