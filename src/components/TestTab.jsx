import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import QuestionPaperViewer from "./QuestionPaperViewer";
import TopicTestViewer from "./TopicTestViewer";

const TestTab = ({ organSystems }) => {
  const [view, setView] = useState("hub");
  const [topics, setTopics] = useState([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState(null);

  useEffect(() => {
    if (view !== "section-selection" || topics.length > 0) return;

    let isMounted = true;
    (async () => {
      setIsLoadingTopics(true);
      try {
        const topicQuery = query(
          collection(db, "questionTopics"),
          orderBy("name")
        );
        const snapshot = await getDocs(topicQuery);
        if (!isMounted) return;
        const topicsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setTopics(topicsData);
      } catch (error) {
        console.error("Error fetching topics:", error);
      } finally {
        if (isMounted) setIsLoadingTopics(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [view, topics.length]);

  const primaryButtonClass =
    "inline-flex items-center justify-center rounded-full border border-indigo-200 bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-lg disabled:translate-y-0 disabled:bg-indigo-300";
  const secondaryButtonClass =
    "inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-lg disabled:translate-y-0 disabled:bg-emerald-300";
  const backButtonClass =
    "inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50 hover:shadow-lg";
  const cardShellClass =
    "relative overflow-hidden rounded-3xl border border-indigo-100 bg-white/90 shadow-2xl shadow-indigo-200/40 backdrop-blur";
  const topicButtonClass =
    "flex h-full flex-col justify-between rounded-2xl border border-indigo-100 bg-white/80 px-5 py-4 text-left shadow-sm shadow-indigo-200/40 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50";

  const handleTopicSelect = (topic) => {
    setSelectedTopic(topic);
    setView("topic-viewer");
  };

  const handleBackToSections = () => {
    setSelectedTopic(null);
    setView("section-selection");
  };

  let content = null;

  if (view === "hub") {
    content = (
      <div className="mx-auto w-full max-w-6xl">
        <div className={cardShellClass}>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50/60 via-white/70 to-transparent" />
          <div className="relative flex flex-col gap-10 px-6 py-8 sm:px-10 sm:py-12">
            <header>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">
                Assessment hub
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">
                Test Center
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-500 sm:text-base">
                Select your practice mode. Mix focused topic drills with
                authentic past paper simulations to sharpen recall.
              </p>
            </header>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="flex flex-col rounded-3xl border border-indigo-100 bg-white/85 p-6 shadow-lg shadow-indigo-200/40 transition hover:-translate-y-1 hover:shadow-xl sm:p-7">
                <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-indigo-500">
                  Section focus
                </span>
                <h2 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">
                  Section-wise Tests
                </h2>
                <p className="mt-3 flex-grow text-sm text-slate-600 sm:text-base">
                  Target specific organ systems with curated MCQs and theory
                  prompts. Perfect for high-yield refreshers.
                </p>
                <div className="mt-6 flex items-center">
                  <button
                    onClick={() => setView("section-selection")}
                    className={primaryButtonClass}
                  >
                    Start Sectional Test
                  </button>
                </div>
              </div>
              <div className="flex flex-col rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-emerald-100/60 p-6 shadow-lg shadow-emerald-200/40 transition hover:-translate-y-1 hover:shadow-xl sm:p-7">
                <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-emerald-500">
                  Full practice
                </span>
                <h2 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">
                  Past Year Papers
                </h2>
                <p className="mt-3 flex-grow text-sm text-slate-600 sm:text-base">
                  Browse official PYQs, filter by exam and year, and simulate
                  authentic test conditions.
                </p>
                <div className="mt-6 flex items-center">
                  <button
                    onClick={() => setView("pyq-filter")}
                    className={secondaryButtonClass}
                  >
                    View Papers
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } else if (view === "pyq-filter") {
    content = (
      <div className="mx-auto w-full max-w-6xl">
        <div className={cardShellClass}>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50/55 via-white/70 to-transparent" />
          <div className="relative flex flex-col gap-8 px-6 py-8 sm:px-10 sm:py-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button onClick={() => setView("hub")} className={backButtonClass}>
                <span className="text-base leading-none text-indigo-500">
                  {"\u2190"}
                </span>
                Back
              </button>
              <span className="inline-flex items-center rounded-full border border-white/60 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                Past Year Question Papers
              </span>
            </div>
            <header>
              <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
                Revise with official PYQs
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-500 sm:text-base">
                Filter by exam, year, and paper code. Review, download, or
                simulate timed attempts to benchmark readiness.
              </p>
            </header>
            <div className="mt-4 overflow-hidden rounded-2xl border border-indigo-50 bg-white/85 shadow-inner">
              <QuestionPaperViewer />
            </div>
          </div>
        </div>
      </div>
    );
  } else if (view === "section-selection") {
    content = (
      <div className="mx-auto w-full max-w-6xl">
        <div className={cardShellClass}>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50/60 via-white/70 to-transparent" />
          <div className="relative flex flex-col gap-8 px-6 py-8 sm:px-10 sm:py-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button onClick={() => setView("hub")} className={backButtonClass}>
                <span className="text-base leading-none text-indigo-500">
                  {"\u2190"}
                </span>
                Back
              </button>
              <span className="inline-flex items-center rounded-full border border-white/60 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                Section-wise practice
              </span>
            </div>
            <header>
              <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
                Choose an organ system
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-500 sm:text-base">
                Drill into focused topic sets. Each section blends MCQs with
                short theory prompts to reinforce understanding.
              </p>
            </header>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {isLoadingTopics
                ? Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={`topic-skeleton-${index}`}
                      className="h-24 animate-pulse rounded-2xl border border-dashed border-indigo-100 bg-white/60"
                    />
                  ))
                : topics.length > 0
                ? topics.map((topic) => (
                    <button
                      key={topic.id}
                      onClick={() => handleTopicSelect(topic)}
                      className={topicButtonClass}
                    >
                      <span className="text-base font-semibold text-slate-900">
                        {topic.name}
                      </span>
                      <span className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-indigo-500">
                        {Number(topic.questionCount || 0)} questions
                      </span>
                    </button>
                  ))
                : (
                    <div className="col-span-full rounded-2xl border border-dashed border-indigo-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500 shadow-inner shadow-indigo-100/40">
                      No topics available yet. Check back soon for curated drills.
                    </div>
                  )}
            </div>
          </div>
        </div>
      </div>
    );
  } else if (view === "topic-viewer") {
    content = (
      <div className="mx-auto w-full max-w-6xl">
        <div className={cardShellClass}>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50/55 via-white/70 to-transparent" />
          <div className="relative flex flex-col gap-8 px-6 py-8 sm:px-10 sm:py-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button onClick={handleBackToSections} className={backButtonClass}>
                <span className="text-base leading-none text-indigo-500">
                  {"\u2190"}
                </span>
                Back
              </button>
              {selectedTopic?.questionCount ? (
                <span className="inline-flex items-center rounded-full border border-white/60 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                  {Number(selectedTopic.questionCount)} questions
                </span>
              ) : null}
            </div>
            <header>
              <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
                {selectedTopic?.name || "Section Test"}
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-500 sm:text-base">
                Work through the curated question set. Submit responses,
                analyse explanations, and refine weak areas.
              </p>
            </header>
            <div className="overflow-hidden rounded-2xl border border-indigo-50 bg-white/85 shadow-inner">
              <TopicTestViewer topic={selectedTopic} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-emerald-50 px-4 py-6 sm:px-6 lg:px-8">
      {content}
    </div>
  );
};

export default TestTab;
