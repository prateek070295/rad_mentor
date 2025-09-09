import React, { useState, useEffect } from 'react';
// --- Firebase Imports ---
import { db, auth } from './firebase'; 
import { collection, getDocs, query, orderBy, doc, where, onSnapshot } from 'firebase/firestore'; 
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";

// --- Component Imports ---
import Dashboard from './components/Dashboard'; 
import PlanTab from './components/PlanTab';     
import LearnTab from './components/LearnTab'; 
import TestTab from './components/TestTab';
import AdminPanel from './components/AdminPanel';
import PreviewPage from './components/PreviewPage';
import appLogo from './assets/images/logo 1.PNG';

// Helper function to get today's date in YYYY-MM-DD format
const getLocalDate = () => {
    const todayDate = new Date();
    const year = todayDate.getFullYear();
    const month = String(todayDate.getMonth() + 1).padStart(2, '0');
    const day = String(todayDate.getDate()).padStart(2, '0');
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


function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const [organSystems, setOrganSystems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- State for all dashboard-related data ---
  const [dashboardData, setDashboardData] = useState({
    userName: "User",
    todayFocus: "No topic scheduled for today.",
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
        console.log("Auto-login successful for testing!");
      } catch (error) {
        // This is expected if already logged in, so we can ignore the error.
      }
    };
    autoLogin();
  }, []);

  // --- Main Data Fetching Effect ---
  useEffect(() => {
    let planUnsubscribe = null; 

    const authUnsubscribe = onAuthStateChanged(auth, async (user) => {
      if (planUnsubscribe) {
        planUnsubscribe(); 
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
          setOrganSystems(systemsList);

          const planRef = doc(db, 'plans', user.uid);
          planUnsubscribe = onSnapshot(planRef, (planSnap) => {
            setDashboardData(currentDashboardData => {
                let newDashboardData = { ...currentDashboardData, userName: user.displayName || "Dr. Test" };

                if (planSnap.exists()) {
                    const planData = planSnap.data();
                    const today = getLocalDate();

                    if (planData.examDate) {
                        newDashboardData.daysUntilExam = daysBetween(today, planData.examDate);
                    }
                    if (planData.schedule && planData.schedule[today]) {
                        newDashboardData.todayFocus = planData.schedule[today].topic;
                    } else {
                        newDashboardData.todayFocus = "No topic scheduled for today.";
                    }
                    
                    if (planData.schedule) {
                        const schedule = planData.schedule;
                        const totalTopics = Object.keys(schedule).length;
                        const completedTopics = Object.values(schedule).filter(day => day.completed).length;
                        
                        if (totalTopics > 0) {
                            newDashboardData.syllabusCompletion = Math.round((completedTopics / totalTopics) * 100);
                        } else {
                            newDashboardData.syllabusCompletion = 0;
                        }
                    } else {
                        newDashboardData.syllabusCompletion = 0;
                    }

                } else {
                    newDashboardData.todayFocus = "No plan created yet.";
                    newDashboardData.daysUntilExam = 'N/A';
                    newDashboardData.syllabusCompletion = 0;
                }
                return newDashboardData;
            });
          });

        } catch (error) {
          console.error("Failed to fetch user data:", error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
        setDashboardData({
            userName: "User",
            todayFocus: "Please log in.",
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
      authUnsubscribe();
      if (planUnsubscribe) {
        planUnsubscribe();
      }
    };
  }, []);

  const isPreviewPage = window.location.pathname === '/preview';

  if (isPreviewPage) {
    return <PreviewPage />;
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
      case 'learn':
        return <LearnTab todayFocus={dashboardData.todayFocus} userName={dashboardData.userName} />;
      case 'test':
        return <TestTab />;
      case 'admin':
        return <AdminPanel />; 
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 font-inter">
      <header className="sticky top-0 bg-white shadow-md p-4 flex items-center justify-between z-10">
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

      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;