import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs } from "firebase/firestore";
// UPDATED: Import the helper from its new location
import { daysBetween } from '../services/scheduleGenerator';

const SetupWizard = ({ organSystems, onFinish, onSkip }) => {
    const getLocalDate = () => {
        const todayDate = new Date();
        const year = todayDate.getFullYear();
        const month = String(todayDate.getMonth() + 1).padStart(2, '0');
        const day = String(todayDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const today = getLocalDate();

    const [setupStep, setSetupStep] = useState(1);
    const [startDate, setStartDate] = useState(today);
    const [examDate, setExamDate] = useState('');
    const [maxChaptersPerDay, setMaxChaptersPerDay] = useState(3);
    const [confidenceRatings, setConfidenceRatings] = useState(() => 
        organSystems.reduce((acc, system) => ({ ...acc, [system.name]: 3 }), {})
    );

    const [wizardSystemInfo, setWizardSystemInfo] = useState([]);
    const [isLoadingWizardInfo, setIsLoadingWizardInfo] = useState(false);
    const [totalMinDays, setTotalMinDays] = useState(0);
    const [totalIdealDays, setTotalIdealDays] = useState(0);

    // This state now lives in the wizard to manage the initial configuration
    const [organSystemConfig, setOrganSystemConfig] = useState([]);

    useEffect(() => {
        const fetchWizardInfo = async () => {
            setIsLoadingWizardInfo(true);
            const info = [];
            const normalizeCategory = (cat) => {
                const s = String(cat || '').toLowerCase().trim().replace(/[_\s]+/g, '-');
                if (s.startsWith('must')) return 'must-know';
                return 'other';
            };

            for (const system of organSystems) {
                const nodesRef = collection(db, 'sections', system.id, 'nodes');
                const chaptersQuery = query(nodesRef, where("parentId", "==", null));
                const chaptersSnapshot = await getDocs(chaptersQuery);
                const chapters = chaptersSnapshot.docs.map(d => ({...d.data(), category: normalizeCategory(d.data().category)}));
                const mustKnowCount = chapters.filter(c => c.category === 'must-know').length;
                info.push({ ...system, mustKnowCount });
            }
            setWizardSystemInfo(info);
            // Initialize the local config with all system data
            setOrganSystemConfig(info.map(sys => ({ id: sys.id, name: sys.name, days: sys.defaultDays, defaultDays: sys.defaultDays })));
            
            const minDays = info.reduce((acc, system) => acc + Math.ceil(system.mustKnowCount / maxChaptersPerDay), 0);
            const idealDays = info.reduce((acc, system) => acc + system.defaultDays, 0);
            setTotalMinDays(minDays);
            setTotalIdealDays(idealDays);
            
            setIsLoadingWizardInfo(false);
        };
        if (organSystems.length > 0) {
            fetchWizardInfo();
        }
    }, [organSystems, maxChaptersPerDay]);
    
    const handleNextStep = () => {
        if (setupStep < 2) {
            setSetupStep(prev => prev + 1);
        } else {
            if (!startDate || !examDate) {
                alert("Please select a valid start and exam date.");
                return;
            }
            setSetupStep(3);
            // Pass the complete config from the wizard's state
            onFinish({ startDate, examDate, confidenceRatings, maxChaptersPerDay, organSystemConfig });
        }
    };
    const handleBackStep = () => setupStep > 1 && setSetupStep(prev => prev - 1);
    const handleRatingChange = (systemName, rating) => setConfidenceRatings(prev => ({ ...prev, [systemName]: rating }));

    // Calculate the actual number of STUDY days, excluding the exam date.
    const selectedDuration = (startDate && examDate) ? daysBetween(startDate, examDate) - 1 : 0;

    let durationFeedback = { text: '', color: 'text-gray-600' };
    if (examDate && startDate) {
        // Now compare the actual study days against the requirements
        if (selectedDuration < totalMinDays) {
            durationFeedback = { text: 'Insufficient time for must-know topics.', color: 'text-red-600' };
        } else if (selectedDuration < totalIdealDays) {
            durationFeedback = { text: 'Compressed schedule. Some topics may be dropped.', color: 'text-orange-600' };
        } else {
            durationFeedback = { text: 'Ample time for a comprehensive schedule.', color: 'text-green-600' };
        }
    }

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 sm:p-8 w-full max-w-lg mx-auto flex flex-col">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Personalized Plan Setup</h2>
            {setupStep === 1 && (
              <div className="flex-grow flex flex-col items-center justify-center">
                <p className="text-lg text-gray-700 mb-4">Step 1: Set your timeline.</p>
                <div className="w-full max-w-sm">
                    <div className="flex flex-col sm:flex-row gap-4 mb-6">
                        <div className="flex-1"><label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label><input type="date" id="startDate" className="mt-1 block w-full rounded-md border-gray-300" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
                        <div className="flex-1"><label htmlFor="examDate" className="block text-sm font-medium text-gray-700 mb-1">Exam Date</label><input type="date" id="examDate" className="mt-1 block w-full rounded-md border-gray-300" min={startDate} disabled={!startDate} value={examDate} onChange={(e) => setExamDate(e.target.value)} /></div>
                    </div>
                    <div className="mb-6">
                        <label htmlFor="max-chapters" className="block text-sm font-medium text-gray-700 mb-1">Max Chapters / Day</label>
                        <input type="number" min="1" id="max-chapters" value={maxChaptersPerDay} onChange={(e) => setMaxChaptersPerDay(Math.max(1, Number(e.target.value) || 1))} className="w-full px-2 py-1 rounded-md border text-sm" />
                    </div>
                    {isLoadingWizardInfo ? <p className="text-center text-sm">Loading recommendations...</p> :
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p>Selected duration: <strong>{selectedDuration > 0 ? `${selectedDuration} days` : '...'}</strong></p>
                        <p className="text-sm">Ideal duration: {totalIdealDays} days</p>
                        <p className="text-sm">Minimum feasible: {totalMinDays} days</p>
                        {examDate && <p className={`text-sm font-semibold mt-2 ${durationFeedback.color}`}>{durationFeedback.text}</p>}
                    </div>
                    }
                </div>
              </div>
            )}
            {setupStep === 2 && wizardSystemInfo && (
              <div className="flex-grow flex flex-col">
                <p className="text-lg text-gray-700 mb-4 text-center">Step 2: Adjust & Rate Confidence</p>
                {isLoadingWizardInfo ? <p className="text-center">Calculating recommendations...</p> :
                <div className="overflow-y-auto max-h-64 pr-2 -mr-2">
                  {wizardSystemInfo.map(system => (
                    <div key={system.id} className="py-2 border-b">
                        <div className="flex items-center justify-between">
                            <span className="text-gray-800 text-base">{system.name}</span>
                            <div className="flex space-x-1">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <button
                                        key={star}
                                        type="button"
                                        className={`text-xl ${star <= confidenceRatings[system.name] ? 'text-yellow-400' : 'text-gray-300'}`}
                                        onClick={() => handleRatingChange(system.name, star)}
                                    >
                                        {'\u2605'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            (Min: {Math.ceil(system.mustKnowCount / maxChaptersPerDay)}, Ideal: {system.defaultDays} days)
                        </p>
                    </div>
                  ))}
                </div>
                }
              </div>
            )}
            {setupStep === 3 && (
              <div className="flex-grow flex flex-col items-center justify-center text-center">
                <p className="text-lg text-gray-700 mb-4">Generating your personalized plan...</p>
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
              </div>
            )}
            <div className="flex justify-between mt-6 pt-4 border-t">
              <button className={`px-4 py-2 rounded-lg border ${setupStep === 1 || setupStep === 3 ? 'invisible' : ''}`} onClick={handleBackStep} disabled={setupStep === 1}>Back</button>
              <button className="px-4 py-2 rounded-lg text-blue-700" onClick={onSkip}>Skip Setup</button>
              <button className="px-4 py-2 rounded-lg bg-blue-600 text-white" onClick={handleNextStep} disabled={setupStep === 3}>{setupStep === 2 ? 'Finish' : 'Next'}</button>
            </div>
          </div>
        </div>
      );
};

export default SetupWizard;

