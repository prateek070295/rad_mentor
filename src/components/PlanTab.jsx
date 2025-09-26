import React, { useState, useEffect, useMemo } from 'react';
// --- Firebase Imports ---
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
// --- Component Imports ---
import SetupWizard from './SetupWizard';
// --- Service Imports ---
import { generateSchedule, daysBetween } from '../services/scheduleGenerator';
// --- Scheduler Flags ---
import { useSchedulerFlags } from "../hooks/useSchedulerFlags";
// flags debug
import FlagsDebug from "./FlagsDebug";


// new code
const { flags, loading } = useSchedulerFlags();
if (loading) {
  // while flags load, keep UI stable
  return null; 
}

// You now have booleans to gate future features:
const enableNewRoadmap = flags.useMasterPlan === true;
const enableWeekly = flags.useWeeklyPlanner === true;




const PlanTab = ({ organSystems }) => {
  // --- State Management ---
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [studyPlan, setStudyPlan] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  
  const [displayDate, setDisplayDate] = useState(new Date());
  const [maxChaptersPerDay, setMaxChaptersPerDay] = useState(3);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState(null);

  // --- Auth & Data Fetching Hook ---
  useEffect(() => {
    if (!organSystems || organSystems.length === 0) {
        setLoading(false);
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const planRef = doc(db, 'plans', currentUser.uid);
        const planSnap = await getDoc(planRef);

        const initializeNewPlan = () => {
            const initialConfig = organSystems.map(system => ({ id: system.id, name: system.name, days: system.defaultDays, defaultDays: system.defaultDays }));
            setStudyPlan({ organSystemConfig: initialConfig, hasCompletedSetup: false });
            setShowSetup(true);
        };

        if (planSnap.exists()) {
          const planData = planSnap.data();
          if (planData && planData.organSystemConfig && Array.isArray(planData.organSystemConfig)) {
            const mergedConfig = planData.organSystemConfig.map(savedSystem => {
                const fullSystemInfo = organSystems.find(os => (os.id || os.name) === (savedSystem.id || savedSystem.name));
                return {
                    ...savedSystem,
                    defaultDays: fullSystemInfo ? fullSystemInfo.defaultDays : savedSystem.days
                };
            });
            const mergedPlan = { ...planData, organSystemConfig: mergedConfig };
            setStudyPlan(mergedPlan);
            
            if (planData.startDate) setDisplayDate(new Date(`${planData.startDate}T00:00:00`));
            if (planData.maxChaptersPerDay) setMaxChaptersPerDay(planData.maxChaptersPerDay);
            setShowSetup(false);
          } else {
            initializeNewPlan();
          }
        } else {
          initializeNewPlan();
        }
      } else {
        setUser(null);
        setStudyPlan(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [organSystems]);


  // --- Handlers ---
  const handleCreatePlan = async (wizardData) => {
    const { startDate, examDate, confidenceRatings, maxChaptersPerDay: wizardMaxChapters, organSystemConfig: wizardConfig } = wizardData;
    if (!user) return;
    
    // Use the config directly from the wizard
    const planDetails = { startDate, examDate, organSystemConfig: wizardConfig, maxChaptersPerDay: wizardMaxChapters };
    const result = await generateSchedule(planDetails);
    
    if (!result) { 
        alert("Schedule generation failed. Please check your settings and try again.");
        return;
    }
    
    const { newSchedule, updatedConfig } = result;
    const newPlan = { startDate, examDate, confidenceRatings, organSystemConfig: updatedConfig, schedule: newSchedule, hasCompletedSetup: true, maxChaptersPerDay: wizardMaxChapters };
    
    await setDoc(doc(db, 'plans', user.uid), newPlan);
    setStudyPlan(newPlan);
    setDisplayDate(new Date(`${startDate}T00:00:00`));
    setMaxChaptersPerDay(wizardMaxChapters);
    setShowSetup(false);
  };
  
  const handleUpdateSchedule = async () => {
    if (!user || !studyPlan || !studyPlan.examDate) return alert("Please set an exam date.");
    
    const planDetails = { ...studyPlan, maxChaptersPerDay };
    const result = await generateSchedule(planDetails);

    if (!result) return;
    
    const { newSchedule, updatedConfig } = result;
    const updatedPlan = { ...studyPlan, schedule: newSchedule, organSystemConfig: updatedConfig, maxChaptersPerDay };
    
    await setDoc(doc(db, 'plans', user.uid), updatedPlan, { merge: true });
    setStudyPlan(updatedPlan);
    alert("Schedule Updated!");
  };
  
  const handleToggleDayCompletion = async (dateKey) => {
    if (!user || !studyPlan || !studyPlan.schedule[dateKey]) return;
    const updatedSchedule = { ...studyPlan.schedule, [dateKey]: { ...studyPlan.schedule[dateKey], completed: !studyPlan.schedule[dateKey].completed }};
    const updatedPlan = { ...studyPlan, schedule: updatedSchedule };
    setStudyPlan(updatedPlan);
    await setDoc(doc(db, 'plans', user.uid), updatedPlan, { merge: true });
  };
  
  const handleDaysChange = (systemName, newDaysValue) => {
    const newDays = Math.max(1, Number(newDaysValue) || 1);
    
    const currentSystem = studyPlan.organSystemConfig.find(s => s.name === systemName);
    if (!currentSystem) return;
    const currentDays = Number(currentSystem.days);

    if (newDays > currentDays) {
        const increaseAmount = newDays - currentDays;
        if (increaseAmount > freeDays) {
            alert(`Not enough free days available. You only have ${freeDays} free day(s) to add.`);
            return;
        }
    }
    
    const updatedConfig = studyPlan.organSystemConfig.map(system => 
      // Add the userLocked flag here
      system.name === systemName ? { ...system, days: newDays, userLocked: true } : system
    );
    setStudyPlan(prev => ({...prev, organSystemConfig: updatedConfig}));
  };

  const handlePrevMonth = () => setDisplayDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const handleNextMonth = () => setDisplayDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  
  const handleSkipSetup = () => {
      setStudyPlan(prev => ({...prev, hasCompletedSetup: false}));
      setShowSetup(false);
  };
  
  const handleDragStart = (e, index) => setDraggedItemIndex(index);
  const handleDragEnter = (e, index) => { e.preventDefault(); setDragOverItemIndex(index); };
  const handleDragLeave = () => setDragOverItemIndex(null);
  const handleDragOver = (e) => e.preventDefault();
  const handleDragEnd = () => { setDraggedItemIndex(null); setDragOverItemIndex(null); };

  const handleDrop = (e, dropIndex) => {
    if (draggedItemIndex === null || !studyPlan) return;
    const newOrder = [...studyPlan.organSystemConfig];
    const [draggedItem] = newOrder.splice(draggedItemIndex, 1);
    newOrder.splice(dropIndex, 0, draggedItem);
    setStudyPlan(prev => ({ ...prev, organSystemConfig: newOrder }));
  };

  const { availableStudyDays, usedDays, freeDays } = useMemo(() => {
    if (!studyPlan || !studyPlan.startDate || !studyPlan.examDate || !studyPlan.organSystemConfig) {
        return { availableStudyDays: 0, usedDays: 0, freeDays: 0 };
    }
    const available = daysBetween(studyPlan.startDate, studyPlan.examDate) - 1;
    const used = studyPlan.organSystemConfig.reduce((sum, s) => sum + (Number(s.days) || 0), 0);
    const free = available - used;
    return { availableStudyDays: available, usedDays: used, freeDays: free };
  }, [studyPlan]);


  const renderMainCalendarView = () => {
    if (!studyPlan.hasCompletedSetup) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <p className="text-xl">You haven't set up a study plan yet.</p>
          <button onClick={() => { setShowSetup(true); }} className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700">Create a Plan</button>
        </div>
      );
    }

    const monthName = displayDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let startDayOfMonth = new Date(year, month, 1).getDay();
    startDayOfMonth = startDayOfMonth === 0 ? 6 : startDayOfMonth - 1;

    const planStartDate = new Date(`${studyPlan.startDate}T00:00:00`);
    const planExamDate = new Date(`${studyPlan.examDate}T00:00:00`);
    const isPrevDisabled = displayDate <= new Date(planStartDate.getFullYear(), planStartDate.getMonth(), 1);
    const isNextDisabled = displayDate >= new Date(planExamDate.getFullYear(), planExamDate.getMonth(), 1);

    return (
      <div className="flex flex-col md:flex-row h-full">
        <div className={`bg-white rounded-xl shadow-lg p-6 flex-shrink-0 transition-all ${isSidebarOpen ? 'w-full md:w-72' : 'w-0 md:w-12 overflow-hidden'}`}>
            <div className="flex justify-between items-center mb-4">
              <h4 className={`text-lg font-bold ${!isSidebarOpen && 'md:hidden'}`}>Schedule Controls</h4>
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-full hover:bg-gray-100">{isSidebarOpen ? '←' : '→'}</button>
            </div>
            <div className={`${!isSidebarOpen && 'md:hidden'}`}>
                <div className="mb-6">
                    <label htmlFor="max-chapters" className="block text-sm font-medium text-gray-700 mb-1">Max Chapters / Day</label>
                    <input type="number" min="1" id="max-chapters" value={maxChaptersPerDay} onChange={(e) => {
                        const v = Math.max(1, Number(e.target.value) || 1);
                        setMaxChaptersPerDay(v);
                    }} className="w-full px-2 py-1 rounded-md border text-sm" />
                </div>
                <div className="p-3 bg-blue-50 rounded-lg text-center mb-6 border border-blue-200">
                    <p className="text-sm">Total Study Days: <span className="font-bold">{availableStudyDays}</span></p>
                    <p className="text-sm">Used Days: <span className="font-bold">{usedDays}</span></p>
                    <p className={`text-sm font-bold mt-1 ${freeDays < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        Free Days: {freeDays}
                    </p>
                </div>

                <p className="text-sm text-gray-600 mb-3">Adjust days (Drag to reorder):</p>
                <ul className="space-y-2 mb-6">
                  {studyPlan.organSystemConfig.map((system, index) => (
                    <li key={system.id || system.name} draggable="true" onDragStart={(e) => handleDragStart(e, index)} onDragEnter={(e) => handleDragEnter(e, index)} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, index)} onDragEnd={handleDragEnd}
                      className={`flex items-center justify-between py-2 px-3 rounded-md bg-gray-50 hover:bg-gray-100 cursor-grab ${dragOverItemIndex === index ? 'border-b-2 border-blue-500' : ''} ${draggedItemIndex === index ? 'opacity-50' : ''}`}>
                      <span className="text-gray-700">{system.name}:</span>
                      <input type="number" min="1" value={system.days} onChange={(e) => handleDaysChange(system.name, e.target.value)} className="w-16 px-2 py-1 rounded-md border text-sm text-center" onClick={(e) => e.stopPropagation()} />
                      <span className="text-gray-500 text-sm">days</span>
                    </li>
                  ))}
                </ul>
                <button onClick={handleUpdateSchedule} className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg">Update & Recalculate</button>
            </div>
        </div>
        <div className="flex-grow bg-white rounded-xl shadow-lg p-6 ml-0 md:ml-6 mt-6 md:mt-0">
          <div className="flex justify-between items-center mb-6">
              <button onClick={handlePrevMonth} disabled={isPrevDisabled} className={`p-2 rounded-full transition-colors ${isPrevDisabled ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <h4 className="text-xl font-bold">{monthName}</h4>
              <button onClick={handleNextMonth} disabled={isNextDisabled} className={`p-2 rounded-full transition-colors ${isNextDisabled ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-sm">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="font-semibold">{day}</div>)}
            {Array.from({ length: startDayOfMonth }).map((_, i) => <div key={`empty-${i}`}></div>)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const currentDay = new Date(year, month, dayNum);
              const dateKey = [ currentDay.getFullYear(), String(currentDay.getMonth() + 1).padStart(2, '0'), String(currentDay.getDate()).padStart(2, '0') ].join('-');
              const event = studyPlan.schedule && studyPlan.schedule[dateKey];
              const isExamDay = dateKey === studyPlan.examDate;

              return (
                <div key={dateKey} onClick={() => event && !isExamDay && handleToggleDayCompletion(dateKey)} 
                     className={`relative py-4 rounded-md border flex flex-col items-center justify-center transition-colors
                               ${isExamDay ? 'bg-red-600 text-white font-bold cursor-default' : 
                                event?.completed ? 'bg-green-100 hover:bg-green-200 cursor-pointer' : 
                                'bg-white hover:bg-blue-50 cursor-pointer'}`}>
                  <span className="font-bold text-lg">{dayNum}</span>
                  {isExamDay ? (
                      <p className="text-xs mt-1 px-1 font-semibold">EXAM DAY</p>
                  ) : (
                      event && <p className="text-xs mt-1 px-1 text-gray-700">{event.topic}</p>
                  )}
                  {event?.completed && !isExamDay && <span className="absolute top-1 right-1">✅</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };
  
  if (loading || !studyPlan) {
    return <div className="flex items-center justify-center h-full">Loading Your Plan...</div>;
  }
  
  return (
    <div className="relative h-full">
      {showSetup ? (
        <SetupWizard 
            organSystems={organSystems}
            onFinish={handleCreatePlan}
            onSkip={handleSkipSetup}
        />
      ) : (
        renderMainCalendarView()
      )}

      <FlagsDebug />

    </div>
  );
};

export default PlanTab;

