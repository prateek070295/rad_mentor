import React, { useState, useEffect } from 'react';
// --- Firebase Imports ---
import { db, auth } from './firebase'; 
import { collection, getDocs, getDoc, query, orderBy, doc, where, onSnapshot } from 'firebase/firestore'; 
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";

// --- Component Imports ---
import Dashboard from './components/Dashboard'; 
import PlanTab from './components/PlanTab';     
import LearnTab from './components/LearnTab'; 
import TestTab from './components/TestTab';
import AdminPanel from './components/AdminPanel';
import PreviewPage from './components/PreviewPage';
import appLogo from './assets/images/logo 1.PNG';
import PlannerPreview from './pages/PlannerPreview';
import StudyItemsDebug from './pages/StudyItemsDebug';
import PlanTabV2 from './components/PlanTabV2';
import TimeReport from './pages/TimeReport.jsx';




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


function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isFocusMode, setIsFocusMode] = useState(false); // State for focus mode
  
  const [organSystems, setOrganSystems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [planV2Context, setPlanV2Context] = useState({ uid: null, weekKey: null, todayIso: null });

  // --- State for all dashboard-related data ---
  const [dashboardData, setDashboardData] = useState({
    userName: "User",
    todayFocus: "No topic scheduled for today.",
    todayFocusDetails: [],
    syllabusCompletion: 0,
    testScores: [80, 75, 85, 90, 82, 88], 
    topTopics: ["Breast", "MSK", "GIT"], 
    bottomTopics: ["Neuroradiology", "Physics", "Cardiac"],
    daysUntilExam: 'N/A',
    daysUntilWeeklyTest: 5,
  });

  // --- TEMPORARY: AUTO-LOGIN FOR TESTING ---
  useEffect(() => {
    const autoLogin = async () => {
      try {
        await signInWithEmailAndPassword(auth, "test@test.com", "123456");
      } catch (error) {
        // This is expected if already logged in.
      }
    };
    autoLogin();
  }, []);

  // --- Main Data Fetching Effect ---
  useEffect(() => {
    let planUnsubscribe = null;
    let isMounted = true;

    const authUnsubscribe = onAuthStateChanged(auth, async (user) => {
      if (planUnsubscribe) {
        planUnsubscribe();
        planUnsubscribe = null;
      }

      if (user) {
        try {
          const sectionsCollectionRef = collection(db, 'sections');
          const sectionsQuery = query(sectionsCollectionRef, orderBy("title"));
          const sectionsSnapshot = await getDocs(sectionsQuery);

          const systemsList = [];
          for (const sectionDoc of sectionsSnapshot.docs) {
            const sectionData = sectionDoc.data();
            const nodesRef = collection(db, 'sections', sectionDoc.id, 'nodes');
            const chaptersQuery = query(nodesRef, where("parentId", "==", null));
            const chaptersSnapshot = await getDocs(chaptersQuery);

            systemsList.push({
              id: sectionDoc.id,
              name: sectionData.title,
              defaultDays: chaptersSnapshot.size
            });
          }
          if (isMounted) {
            setOrganSystems(systemsList);
          }

          const planRef = doc(db, 'plans', user.uid);
          planUnsubscribe = onSnapshot(planRef, async (planSnap) => {
            if (!isMounted) return;

            const today = getLocalDate();
            const defaultFocus = buildDefaultFocus();

            if (planSnap.exists()) {
              const planData = planSnap.data() || {};
              const update = {
                userName: user.displayName || "Dr. Test",
                todayFocus: defaultFocus.focusText,
                todayFocusDetails: [],
                syllabusCompletion: 0,
                daysUntilExam: 'N/A',
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
              } else {
                const focus = await buildPlanV2Focus(user.uid, today);
                update.todayFocus = focus.focusText;
                update.todayFocusDetails = focus.focusDetails;
                setPlanV2Context({
                  uid: user.uid,
                  weekKey: getWeekStartKey(today),
                  todayIso: today,
                });
              }

              if (!isMounted) return;
              setDashboardData((prev) => ({
                ...prev,
                ...update,
              }));
            } else {
              setPlanV2Context({ uid: null, weekKey: null, todayIso: null });
              if (!isMounted) return;
              setDashboardData((prev) => ({
                ...prev,
                userName: user.displayName || "Dr. Test",
                todayFocus: "No plan created yet.",
                todayFocusDetails: [],
                daysUntilExam: 'N/A',
                syllabusCompletion: 0,
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
      } else {
        if (isMounted) {
          setIsLoading(false);
        }
        setPlanV2Context({ uid: null, weekKey: null, todayIso: null });
        setDashboardData({
            userName: "User",
            todayFocus: "Please log in.",
            todayFocusDetails: [],
            daysUntilExam: 'N/A',
          syllabusCompletion: 0,
          testScores: [80, 75, 85, 90, 82, 88],
          topTopics: ["Breast", "MSK", "GIT"],
          bottomTopics: ["Neuroradiology", "Physics", "Cardiac"],
          daysUntilWeeklyTest: 5,
        });
      }
    });

    return () => {
      isMounted = false;
      authUnsubscribe();
      if (planUnsubscribe) {
        planUnsubscribe();
      }
    };
  }, []);

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
    return <PlanTabV2 />;
  }




  const renderContent = () => {
    if (isLoading) {
      return <div className="text-center p-10">Loading Rad Mentor...</div>;
    }

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard {...dashboardData} />;
      case 'plan':
        return <PlanTab organSystems={organSystems} />;
      case 'planV2':                       // ⬅️ add this block
        return <PlanTabV2 />;
      case 'learn':
        return (
          <LearnTab
            todayFocus={dashboardData.todayFocus}
            todayFocusDetails={dashboardData.todayFocusDetails}
            userName={dashboardData.userName}
            setIsFocusMode={setIsFocusMode}
          />
        );
      case 'test':
        return <TestTab organSystems={organSystems} />;
      case 'admin':
        return <AdminPanel />; 
      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-screen bg-gray-100 font-inter flex flex-col">
      {/* Conditionally render the header based on focus mode */}
      {!isFocusMode && (
        <header className="flex-shrink-0 bg-white shadow-md p-4 flex items-center justify-between z-20">
          <div className="flex items-center space-x-2">
            <img src={appLogo} alt="Rad Mentor App Logo" className="w-8 h-8" />
            <span className="text-xl font-bold text-gray-800">Rad Mentor</span>
          </div>
          <div className="flex items-center space-x-4">
            <nav className="hidden md:flex space-x-4">
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'dashboard' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-200'}`}
                onClick={() => setActiveTab('dashboard')}
              >
                Dashboard
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'plan' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-200'}`}
                onClick={() => setActiveTab('plan')}
              >
                Plan
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'planV2' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-200'}`}
                onClick={() => setActiveTab('planV2')}
              >
                Plan (V2)
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'learn' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-200'}`}
                onClick={() => setActiveTab('learn')}
              >
                Learn
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'test' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-200'}`}
                onClick={() => setActiveTab('test')}
              >
                Test
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'admin' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-200'}`}
                onClick={() => setActiveTab('admin')}
              >
              Admin
              </button>
            </nav>
            <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center text-blue-800 font-semibold text-lg">
              S
            </div>
          </div>
        </header>
      )}

      {/* Main content area now grows and handles its own scrolling */}
      <main className="flex-grow overflow-y-auto">
        <div className={isFocusMode || activeTab === 'learn' ? "" : "container mx-auto p-4 sm:p-6 lg:p-8"}>
            {renderContent()}
        </div>
      </main>
    </div>
  );
}

export default App;
