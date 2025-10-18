import React, { useState, useEffect, useMemo, useCallback } from 'react';
// --- Firebase Imports ---
import { db, auth } from './firebase'; 
import { collection, getDocs, getDoc, query, orderBy, doc, where, onSnapshot } from 'firebase/firestore'; 
import { onAuthStateChanged, sendPasswordResetEmail } from "firebase/auth";

// --- Component Imports ---
import Dashboard from './components/Dashboard'; 
import LearnTab from './components/LearnTab'; 
import TestTab from './components/TestTab';
import AdminPanel from './components/AdminPanel';
import PreviewPage from './components/PreviewPage';
import appLogo from './assets/images/logo 1.PNG';
import PlannerPreview from './pages/PlannerPreview';
import StudyItemsDebug from './pages/StudyItemsDebug';
import PlanTabV2 from './components/PlanTabV2';
import TimeReport from './pages/TimeReport.jsx';
import Login from './components/auth/Login';
import ProfileMenu from './components/ProfileMenu';
import LandingPage from './pages/LandingPage';
import AccountSettings from './pages/AccountSettings';
import AchievementsHub from "./components/AchievementsHub";
import { UnsavedChangesProvider, useUnsavedChanges } from './context/UnsavedChangesContext';
import {
  loadOrInitWeek,
  listMasterQueueLinear,
} from "./services/planV2Api";
import {
  calculatePlanOverviewStats,
  calculateWeeklyAssignmentTotals,
  buildQueueSnapshot,
  buildWeeklyStreak,
  buildRevisionReminders,
  defaultPlanOverviewStats,
} from "./utils/planStats";
import {
  fetchAchievementDefinitions,
  listenToAchievementMeta,
  listenToUserAchievements,
} from "./services/achievementsClient";
import { deriveAchievementHighlight } from "./utils/achievements";




// Helper function to get today's date in YYYY-MM-DD format
const getLocalDate = (dateLike = new Date()) => {
    const candidate = dateLike instanceof Date ? new Date(dateLike) : new Date(String(dateLike));
    if (Number.isNaN(candidate.getTime())) {
        return getLocalDate(new Date());
    }
    const year = candidate.getFullYear();
    const month = String(candidate.getMonth() + 1).padStart(2, '0');
    const day = String(candidate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper function to calculate days between two date strings
const daysBetween = (start, end) => {
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    if (isNaN(startDate) || isNaN(endDate) || endDate < startDate) return 'N/A';
    const diffTime = Math.abs(endDate - startDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const timestampToMillis = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === "function") {
        return value.toMillis();
    }
    if (typeof value.toDate === "function") {
        const date = value.toDate();
        return date instanceof Date ? date.getTime() : 0;
    }
    if (value instanceof Date) {
        return value.getTime();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const getWeekStartKey = (isoDate) => {
    if (!isoDate) return '';
    const base = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(base.getTime())) return '';
    const dayOfWeek = base.getDay(); // Sunday = 0
    base.setDate(base.getDate() - dayOfWeek);
    return getLocalDate(base);
};

const buildDefaultFocus = () => ({
    focusText: "No topic scheduled for today.",
    focusDetails: [],
});

const EMPTY_WEEKLY_CAPACITY = { planned: 0, capacity: 0 };

const initialDashboardState = {
  userName: "User",
  todayFocus: "No topic scheduled for today.",
  todayFocusDetails: [],
  syllabusCompletion: 0,
  testScores: [],
  topTopics: ["Breast", "MSK", "GIT"],
  bottomTopics: ["Neuroradiology", "Physics", "Cardiac"],
  daysUntilExam: 'N/A',
  daysUntilWeeklyTest: 5,
  planOverview: defaultPlanOverviewStats,
  planOverviewLoading: false,
  weeklyCapacity: EMPTY_WEEKLY_CAPACITY,
  queueSnapshot: [],
  studyStreak: [],
  streakCount: 0,
  achievements: [],
  revisionReminders: [],
  achievementHighlight: null,
};

const buildPlanV2Focus = async (uid, todayIso) => {
    if (!uid || !todayIso) {
        return buildDefaultFocus();
    }

    try {
        const weekKey = getWeekStartKey(todayIso);
        if (!weekKey) {
            return buildDefaultFocus();
        }

        const weekRef = doc(db, 'plans', uid, 'weeks', weekKey);
        const weekSnap = await getDoc(weekRef);
        if (!weekSnap.exists()) {
            return buildDefaultFocus();
        }

        const weekData = weekSnap.data() || {};
        const todaysAssignments = Array.isArray(weekData.assigned?.[todayIso])
            ? weekData.assigned[todayIso]
            : [];

        if (!todaysAssignments.length) {
            return buildDefaultFocus();
        }

        const grouped = new Map();
        const cleanString = (value) => {
            if (value === undefined || value === null) return '';
            return String(value).trim();
        };

        todaysAssignments.forEach((item) => {
            const sectionName = cleanString(item.section) || 'Study Plan';
            const chapterName = cleanString(item.chapterName || item.title);
            const topicName = cleanString(item.title);
            const subTopic = cleanString(item.subName);
            const topicIdRaw = cleanString(item.topicId);
            const chapterIdRaw = cleanString(item.chapterId);
            const subIdRaw = cleanString(item.subId);
            const key = `${sectionName}|||${chapterName}`;

            if (!grouped.has(key)) {
                grouped.set(key, {
                    sectionName,
                    chapterName,
                    topics: new Set(),
                    topicIds: new Set(),
                    subtopics: new Set(),
                    subtopicIds: new Set(),
                });
            }

            const entry = grouped.get(key);
            if (chapterName) {
                entry.chapterName = chapterName;
            }
            if (topicName) {
                entry.topics.add(topicName);
            }
            if (subTopic) {
                entry.subtopics.add(subTopic);
            }
            if (topicIdRaw) {
                entry.topicIds.add(topicIdRaw);
            } else if (chapterIdRaw) {
                entry.topicIds.add(chapterIdRaw);
            }
            if (subIdRaw) {
                entry.subtopicIds.add(subIdRaw);
            }
        });

        const focusDetails = Array.from(grouped.values()).map((detail) => {
            const topicList = Array.from(detail.topics);
            const chapterLabel = detail.chapterName || topicList[0] || 'Study Session';
            return {
                sectionName: detail.sectionName,
                chapterName: chapterLabel,
                topics: topicList,
                topicIds: Array.from(detail.topicIds),
                subtopics: Array.from(detail.subtopics),
                subtopicIds: Array.from(detail.subtopicIds),
            };
        });

        const focusText = focusDetails
            .map((detail) => {
                const chapterLabel = detail.chapterName || detail.topics[0] || 'Study Session';
                const additionalTopics = detail.topics.filter(
                    (topic) => topic && topic !== chapterLabel,
                );
                const suffix = additionalTopics.length
                    ? ` (${additionalTopics.join(', ')})`
                    : '';
                return `${detail.sectionName}: ${chapterLabel}${suffix}`;
            })
            .join(' | ');

        return {
            focusText: focusText || buildDefaultFocus().focusText,
            focusDetails,
        };
    } catch (error) {
        console.error('Failed to build Plan V2 focus:', error);
        return buildDefaultFocus();
    }
};

function AppShell() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isFocusMode, setIsFocusMode] = useState(false); // State for focus mode

  const [organSystems, setOrganSystems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [planV2Context, setPlanV2Context] = useState({ uid: null, weekKey: null, todayIso: null });
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const { hasUnsavedChanges, markClean } = useUnsavedChanges();

  const currentUid = currentUser?.uid || null;
  const storageKey = useMemo(
    () => (currentUid ? `radmentor:lastTab:${currentUid}` : null),
    [currentUid],
  );

  const persistTabSelection = useCallback(
    (nextTab) => {
      setActiveTab(nextTab);
      if (storageKey && typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, nextTab);
      }
    },
    [storageKey, setActiveTab],
  );

  // --- State for all dashboard-related data ---
  const [dashboardData, setDashboardData] = useState(initialDashboardState);
  const [achievementDefinitions, setAchievementDefinitions] = useState([]);
  const [achievementMeta, setAchievementMeta] = useState(null);
  const [userAchievements, setUserAchievements] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const loadDefinitions = async () => {
      if (!currentUser) {
        setAchievementDefinitions([]);
        return;
      }

      try {
        const defs = await fetchAchievementDefinitions();
        if (cancelled) return;
        const ordered = Array.isArray(defs)
          ? [...defs].sort(
              (a, b) =>
                (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
                (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
            )
          : [];
        setAchievementDefinitions(ordered);
      } catch (error) {
        console.error("Failed to load achievement definitions:", error);
        if (!cancelled) {
          setAchievementDefinitions([]);
        }
      }
    };

    loadDefinitions();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);
  // --- Main Data Fetching Effect ---

  useEffect(() => {
    let planUnsubscribe = null;
    let achievementMetaUnsubscribe = null;
    let userAchievementsUnsubscribe = null;
    let isMounted = true;

    const clearAchievementListeners = () => {
      if (achievementMetaUnsubscribe) {
        achievementMetaUnsubscribe();
        achievementMetaUnsubscribe = null;
      }
      if (userAchievementsUnsubscribe) {
        userAchievementsUnsubscribe();
        userAchievementsUnsubscribe = null;
      }
    };

    const authUnsubscribe = onAuthStateChanged(auth, async (user) => {
      if (planUnsubscribe) {
        planUnsubscribe();
        planUnsubscribe = null;
      }
      clearAchievementListeners();

      setCurrentUser(user);
      setAuthReady(true);

      if (!user) {
        if (isMounted) {
          setAchievementMeta(null);
          setUserAchievements([]);
          setIsAdmin(false);
          setOrganSystems([]);
          setPlanV2Context({ uid: null, weekKey: null, todayIso: null });
          setDashboardData(initialDashboardState);
          setIsLoading(false);
          setActiveTab("dashboard");
        }
        markClean?.();
        return;
      }

      if (isMounted) {
        setIsLoading(true);
        setAchievementMeta(null);
        setUserAchievements([]);
      }

      achievementMetaUnsubscribe = listenToAchievementMeta(
        user.uid,
        (metaDoc) => {
          setAchievementMeta(metaDoc);
        },
      );
      userAchievementsUnsubscribe = listenToUserAchievements(
        user.uid,
        (rows) => {
          setUserAchievements(rows);
        },
      );

      let adminStatus = false;
      try {
        const adminSnapshot = await getDoc(doc(db, "admins", user.uid));
        adminStatus = adminSnapshot.exists();
      } catch (adminError) {
        console.error("Failed to fetch admin status:", adminError);
      }
      if (isMounted) {
        setIsAdmin(adminStatus);
      }

      try {
        const sectionsCollectionRef = collection(db, "sections");
        const sectionsQuery = query(sectionsCollectionRef, orderBy("title"));
        const sectionsSnapshot = await getDocs(sectionsQuery);

        const systemsList = [];
        for (const sectionDoc of sectionsSnapshot.docs) {
          const sectionData = sectionDoc.data();
          const nodesRef = collection(db, "sections", sectionDoc.id, "nodes");
          const chaptersQuery = query(nodesRef, where("parentId", "==", null));
          const chaptersSnapshot = await getDocs(chaptersQuery);

          systemsList.push({
            id: sectionDoc.id,
            name: sectionData.title,
            defaultDays: chaptersSnapshot.size,
          });
        }
        if (isMounted) {
          setOrganSystems(systemsList);
        }

        const displayName = user.displayName || user.email || "Rad Mentor";
        const planRef = doc(db, "plans", user.uid);
        planUnsubscribe = onSnapshot(planRef, async (planSnap) => {
          if (!isMounted) return;

          const today = getLocalDate();
          const defaultFocus = buildDefaultFocus();

          if (planSnap.exists()) {
            const planData = planSnap.data() || {};
            const update = {
              userName: displayName,
              todayFocus: defaultFocus.focusText,
              todayFocusDetails: [],
              syllabusCompletion: 0,
              daysUntilExam: "N/A",
            };

            if (planData.examDate) {
              update.daysUntilExam = daysBetween(today, planData.examDate);
            }

            const hasSchedule =
              planData.schedule && Object.keys(planData.schedule).length > 0;

            if (hasSchedule) {
              setPlanV2Context({ uid: null, weekKey: null, todayIso: null });
              const schedule = planData.schedule;
              if (schedule[today] && schedule[today].topic) {
                update.todayFocus = schedule[today].topic;
              } else {
                update.todayFocus = defaultFocus.focusText;
              }
              const totalTopics = Object.keys(schedule).length;
              const completedTopics = Object.values(schedule).filter(
                (day) => day.completed,
              ).length;
              update.syllabusCompletion =
                totalTopics > 0
                  ? Math.round((completedTopics / totalTopics) * 100)
                  : 0;

              if (!isMounted) return;
              setDashboardData((prev) => ({
                ...prev,
                ...update,
                planOverview: defaultPlanOverviewStats,
                planOverviewLoading: false,
                weeklyCapacity: EMPTY_WEEKLY_CAPACITY,
                queueSnapshot: [],
                studyStreak: [],
                streakCount: 0,
                revisionReminders: [],
              }));
            } else {
              const focus = await buildPlanV2Focus(user.uid, today);
              update.todayFocus = focus.focusText;
              update.todayFocusDetails = focus.focusDetails;
              const weekKey = getWeekStartKey(today);
              setPlanV2Context({
                uid: user.uid,
                weekKey,
                todayIso: today,
              });

              if (!isMounted) return;
              setDashboardData((prev) => ({
                ...prev,
                ...update,
                planOverviewLoading: true,
              }));

              try {
                const [weekDoc, queueRows] = await Promise.all([
                  loadOrInitWeek(
                    user.uid,
                    weekKey,
                    Number(planData.dailyMinutes || 90),
                  ),
                  listMasterQueueLinear(user.uid, {}),
                ]);

                if (!isMounted) return;
                const overview = calculatePlanOverviewStats(
                  queueRows,
                  weekDoc,
                  planData,
                );
                const weeklyTotals =
                  calculateWeeklyAssignmentTotals(weekDoc);
                const snapshot = buildQueueSnapshot(queueRows);
                const streakData = buildWeeklyStreak(weekDoc, weekKey, today);
                const revisionReminders = buildRevisionReminders(
                  queueRows,
                  today,
                );
                setDashboardData((prev) => ({
                  ...prev,
                  planOverview: overview,
                  weeklyCapacity: weeklyTotals,
                  queueSnapshot: snapshot,
                  planOverviewLoading: false,
                  studyStreak: streakData.days,
                  streakCount: streakData.streakCount,
                  revisionReminders,
                }));
              } catch (err) {
                console.error("Failed to compute dashboard overview", err);
                if (!isMounted) return;
                setDashboardData((prev) => ({
                  ...prev,
                  planOverview: defaultPlanOverviewStats,
                  weeklyCapacity: EMPTY_WEEKLY_CAPACITY,
                  queueSnapshot: [],
                  planOverviewLoading: false,
                  studyStreak: [],
                  streakCount: 0,
                  revisionReminders: [],
                }));
              }
            }
          } else {
            setPlanV2Context({ uid: null, weekKey: null, todayIso: null });
            if (!isMounted) return;
            setDashboardData((prev) => ({
              ...prev,
              userName: displayName,
              todayFocus: "No plan created yet.",
              todayFocusDetails: [],
              daysUntilExam: "N/A",
              syllabusCompletion: 0,
              planOverview: defaultPlanOverviewStats,
              planOverviewLoading: false,
              weeklyCapacity: EMPTY_WEEKLY_CAPACITY,
              queueSnapshot: [],
              studyStreak: [],
              streakCount: 0,
              revisionReminders: [],
            }));
          }
        });
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      authUnsubscribe();
      if (planUnsubscribe) {
        planUnsubscribe();
      }
      clearAchievementListeners();
    };
  }, [markClean]);

  const achievementHighlightState = useMemo(
    () =>
      deriveAchievementHighlight({
        meta: achievementMeta,
        definitions: achievementDefinitions,
        achievements: userAchievements,
      }),
    [achievementMeta, achievementDefinitions, userAchievements],
  );

  const achievementFeed = useMemo(() => {
    if (!achievementDefinitions.length) return [];
    const definitionMap = achievementDefinitions.reduce((acc, def) => {
      acc[def.id] = def;
      return acc;
    }, {});
    const unlocked = Array.isArray(userAchievements)
      ? userAchievements.filter((row) => row?.unlocked)
      : [];
    const sorted = [...unlocked].sort(
      (a, b) =>
        timestampToMillis(b?.unlockedAt) - timestampToMillis(a?.unlockedAt),
    );
    return sorted.slice(0, 4).map((entry) => {
      const definition = definitionMap[entry.id] || {};
      const unlockedMillis = timestampToMillis(entry.unlockedAt);
      return {
        key: entry.id,
        title: definition.name || entry.id,
        description: definition.description || "",
        unlockedAt:
          unlockedMillis > 0 ? new Date(unlockedMillis).toISOString() : null,
      };
    });
  }, [userAchievements, achievementDefinitions]);

  useEffect(() => {
    setDashboardData((prev) => ({
      ...prev,
      achievements: achievementFeed,
      achievementHighlight: achievementHighlightState,
    }));
  }, [achievementFeed, achievementHighlightState]);

  useEffect(() => {
    if (!authReady) {
      return;
    }
    if (!isAdmin && activeTab === "admin") {
      if (typeof window !== "undefined" && storageKey) {
        window.localStorage.setItem(storageKey, "dashboard");
      }
      setActiveTab("dashboard");
    }
  }, [isAdmin, activeTab, storageKey, authReady]);

  useEffect(() => {
    if (
      !planV2Context.uid ||
      !planV2Context.weekKey ||
      !planV2Context.todayIso
    ) {
      return;
    }

    let cancelled = false;
    const weekRef = doc(
      db,
      'plans',
      planV2Context.uid,
      'weeks',
      planV2Context.weekKey,
    );

    const unsubscribe = onSnapshot(weekRef, async () => {
      const focus = await buildPlanV2Focus(
        planV2Context.uid,
        planV2Context.todayIso,
      );
      if (cancelled) return;
      setDashboardData((prev) => ({
        ...prev,
        todayFocus: focus.focusText,
        todayFocusDetails: focus.focusDetails,
      }));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [planV2Context]);

  const userDisplayName =
    currentUser?.displayName || currentUser?.email || "User";
  const userEmail = currentUser?.email || "";
  const userInitials = useMemo(() => {
    return (
      userDisplayName
        .split(" ")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase())
        .slice(0, 2)
        .join("") || "U"
    );
  }, [userDisplayName]);

  const handleProfileUpdated = useCallback(
    (nextName) => {
      setCurrentUser((prev) => (prev ? { ...prev, displayName: nextName } : prev));
    },
    [setCurrentUser],
  );

  const handleSignOut = useCallback(async () => {
    if (hasUnsavedChanges && typeof window !== "undefined") {
      const confirmSignOut = window.confirm(
        "You have unsaved work. Are you sure you want to sign out?",
      );
      if (!confirmSignOut) {
        return;
      }
    }
    try {
      await auth.signOut();
      markClean?.();
    } catch (signOutError) {
      console.error("Failed to sign out:", signOutError);
      if (typeof window !== "undefined") {
        window.alert(
          signOutError?.message || "Unable to sign out right now. Please try again.",
        );
      }
    }
  }, [hasUnsavedChanges, markClean]);

  const handleSendPasswordReset = useCallback(async () => {
    if (!userEmail) {
      if (typeof window !== "undefined") {
        window.alert("No email address is associated with this account.");
      }
      return;
    }
    try {
      await sendPasswordResetEmail(auth, userEmail);
      if (typeof window !== "undefined") {
        window.alert(`Password reset email sent to ${userEmail}.`);
      }
    } catch (resetError) {
      console.error("Failed to send password reset email:", resetError);
      if (typeof window !== "undefined") {
        window.alert(
          resetError?.message || "Unable to send password reset email right now.",
        );
      }
    }
  }, [userEmail]);

  const handleNavigateToAccount = useCallback(() => {
    persistTabSelection("account");
  }, [persistTabSelection]);

  const handleReviewTopic = useCallback(
    (topic, action) => {
      console.info("Requested review action:", action, "for topic:", topic);
      persistTabSelection("learn");
    },
    [persistTabSelection],
  );

  const handleStartLearning = useCallback(() => {
    persistTabSelection("learn");
  }, [persistTabSelection]);

  const handleGoToPlan = useCallback(() => {
    persistTabSelection("plan");
  }, [persistTabSelection]);

  const handleGoToTest = useCallback(() => {
    persistTabSelection("test");
  }, [persistTabSelection]);

  const handleOpenAchievements = useCallback(() => {
    persistTabSelection("achievements");
  }, [persistTabSelection]);

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="flex flex-col items-center gap-3 text-gray-600">
          <img src={appLogo} alt="Rad Mentor" className="h-12 w-12 animate-pulse" />
          <p className="text-sm font-medium">Loading Rad Mentor...</p>
        </div>
      </div>
    );
  }

  const isPreviewPage = window.location.pathname === '/preview';

  if (isPreviewPage) {
    return <PreviewPage />;
  }

  const isPlannerPreviewPage = window.location.pathname === '/planner/preview';
  if (isPlannerPreviewPage) {
    return <PlannerPreview />;
  }

  const isTimeReportPage = window.location.pathname === '/planner/time';
  if (isTimeReportPage) {
    return <TimeReport />;
  }

  const isStudyItemsDebug = window.location.pathname === '/study-items-debug';
  if (isStudyItemsDebug) {
    return <StudyItemsDebug />;
  }

  const isPlanV2Page = window.location.pathname === '/plan-v2';
  if (isPlanV2Page) {
  if (!currentUser) {
    if (typeof window !== 'undefined' && window.location && window.location.pathname === '/login') {
      return <Login />;
    }
    return <LandingPage />;
  }
  return <PlanTabV2 />;
}

  if (!currentUser) {
  if (typeof window !== 'undefined' && window.location && window.location.pathname === '/login') {
    return <Login />;
  }
  return <LandingPage />;
}

  const renderContent = () => {
    if (isLoading) {
      return <div className="text-center p-10">Loading Rad Mentor...</div>;
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            {...dashboardData}
            onStartLearning={handleStartLearning}
            onReviewTopic={handleReviewTopic}
            onOpenPlan={handleGoToPlan}
            onOpenTest={handleGoToTest}
            onOpenAchievements={handleOpenAchievements}
          />
        );
      case 'achievements':
        return (
          <AchievementsHub
            definitions={achievementDefinitions}
            achievements={userAchievements}
            meta={achievementMeta}
            highlight={achievementHighlightState}
            onBack={() => persistTabSelection('dashboard')}
          />
        );
      case 'plan':
        return <PlanTabV2 />;
      case 'learn':
        return (
          <LearnTab
            todayFocus={dashboardData.todayFocus}
            todayFocusDetails={dashboardData.todayFocusDetails}
            userName={dashboardData.userName}
            setIsFocusMode={setIsFocusMode}
            planContext={planV2Context}
            isAdmin={isAdmin}
          />
        );
      case 'test':
        return <TestTab organSystems={organSystems} />;
      case 'admin':
        return isAdmin ? (
          <AdminPanel />
        ) : (
          <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-700">
            You need admin access to view this section. Contact your administrator if you believe this is a mistake.
          </div>
        );
      case 'account':
        return (
          <AccountSettings
            user={currentUser}
            onProfileUpdated={handleProfileUpdated}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-gradient-to-br from-slate-100 via-slate-50 to-white font-inter text-[16.5px] leading-relaxed">
      {/* Conditionally render the header based on focus mode */}
      {!isFocusMode && (
        <header className="sticky top-0 z-30 flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-md transition-colors">
          <div className="flex items-center space-x-3">
            <img src={appLogo} alt="Rad Mentor App Logo" className="h-10 w-10 drop-shadow" />
            <span className="text-2xl font-semibold text-slate-900">Rad Mentor</span>
          </div>
          <div className="flex items-center space-x-4">
            <nav className="hidden items-center gap-1 rounded-full border border-slate-200 bg-white/70 p-1 shadow-inner shadow-slate-200/60 backdrop-blur md:flex">
              <button
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  activeTab === 'dashboard'
                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-300/40'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => persistTabSelection('dashboard')}
              >
                Dashboard
              </button>
              <button
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  activeTab === 'plan'
                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-300/40'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => persistTabSelection('plan')}
              >
                Plan
              </button>
              <button
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  activeTab === 'learn'
                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-300/40'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => persistTabSelection('learn')}
              >
                Learn
              </button>
              <button
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  activeTab === 'test'
                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-300/40'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => persistTabSelection('test')}
              >
                Test
              </button>
              <button
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  activeTab === 'achievements'
                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-300/40'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => persistTabSelection('achievements')}
              >
                Achievements
              </button>
              {isAdmin && (
                <button
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    activeTab === 'admin'
                      ? 'bg-indigo-500 text-white shadow-md shadow-indigo-300/40'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  onClick={() => persistTabSelection('admin')}
                >
                  Admin
                </button>
              )}
            </nav>
            <div className="flex items-center space-x-3">
              <div className="hidden text-right text-sm sm:block">
                <p className="font-semibold text-slate-800">{userDisplayName}</p>
                <p className="text-xs text-slate-500">{userEmail || 'Signed in'}</p>
              </div>
              <ProfileMenu
                displayName={userDisplayName}
                email={userEmail}
                initials={userInitials}
                onNavigateToAccount={handleNavigateToAccount}
                onSignOut={handleSignOut}
                onSendPasswordReset={handleSendPasswordReset}
                hasUnsavedChanges={hasUnsavedChanges}
              />
            </div>
          </div>
        </header>
      )}

      {/* Main content area now grows and handles its own scrolling */}
      <main className="flex-grow overflow-y-auto">
        <div className={isFocusMode || activeTab === 'learn' ? "" : "mx-auto w-full max-w-[1440px] px-4 pb-10 pt-6 sm:px-8 lg:px-12"}>
            {renderContent()}
        </div>
      </main>
    </div>
  );
}

const App = () => (
  <UnsavedChangesProvider>
    <AppShell />
  </UnsavedChangesProvider>
);

export default App;



