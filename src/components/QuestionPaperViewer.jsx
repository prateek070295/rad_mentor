import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";

const QuestionPaperViewer = () => {
    const [view, setView] = useState('filter');
    const [exam, setExam] = useState('DNB');
    const [year, setYear] = useState('');
    const [month, setMonth] = useState('');
    const [paper, setPaper] = useState('');
    const [yearOptions, setYearOptions] = useState([]);
    const [monthOptions, setMonthOptions] = useState([]);
    const [paperOptions, setPaperOptions] = useState([]);
    const [selectedPaper, setSelectedPaper] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [timeLeft, setTimeLeft] = useState(3 * 60 * 60);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAnswerVisible, setIsAnswerVisible] = useState(false);

    // All the logic and handler functions are unchanged...
    useEffect(() => {
        const fetchYears = async () => {
            setIsLoading(true);
            const snapshot = await getDocs(collection(db, "questionBank"));
            const years = [...new Set(snapshot.docs.map(doc => Number(doc.data().year)))].sort((a, b) => b - a);
            setYearOptions(years);
            setIsLoading(false);
        };
        fetchYears();
    }, []);

    useEffect(() => {
        if (!year) return;
        const fetchMonths = async () => {
            setMonth(''); setPaper(''); setMonthOptions([]); setPaperOptions([]);
            const q = query(collection(db, "questionBank"), where("year", "==", Number(year)));
            const snapshot = await getDocs(q);
            const months = [...new Set(snapshot.docs.map(doc => doc.data().month))];
            setMonthOptions(months);
        };
        fetchMonths();
    }, [year]);

    useEffect(() => {
        if (!month || !year) return;
        const fetchPapers = async () => {
            setPaper(''); setPaperOptions([]);
            const q = query(
                collection(db, "questionBank"),
                where("year", "==", Number(year)),
                where("month", "==", month)
            );
            const snapshot = await getDocs(q);
            const papers = [...new Set(snapshot.docs.map(doc => doc.data().paper))].sort();
            setPaperOptions(papers);
        };
        fetchPapers();
    }, [month, year]);
    
    useEffect(() => {
        if ((view === 'test_mode' || view === 'practice_mode') && selectedPaper) {
            const fetchQuestions = async () => {
                setIsLoading(true); setError(''); setQuestions([]);
                try {
                    const q = query(
                        collection(db, "questionBank"),
                        where("exam", "==", selectedPaper.exam),
                        where("year", "==", Number(selectedPaper.year)),
                        where("month", "==", selectedPaper.month),
                        where("paper", "==", selectedPaper.paper),
                        orderBy("createdAt")
                    );
                    const querySnapshot = await getDocs(q);
                    if (querySnapshot.empty) {
                        setError("No questions found for the selected paper.");
                    } else {
                        const fetchedQuestions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        setQuestions(fetchedQuestions);
                    }
                } catch (err) {
                    console.error("Error fetching questions:", err);
                    setError("An error occurred while fetching the question paper.");
                } 
                finally { setIsLoading(false); }
            };
            fetchQuestions();
        }
    }, [view, selectedPaper]);

    useEffect(() => {
        if (view !== 'test_mode' || timeLeft <= 0) return;
        const timerId = setInterval(() => setTimeLeft(prevTime => prevTime - 1), 1000);
        return () => clearInterval(timerId);
    }, [view, timeLeft]);

    const handleProceed = (e) => { e.preventDefault(); setSelectedPaper({ exam, year, month, paper }); setView('confirmation'); };
    const startTest = () => { setTimeLeft(3 * 60 * 60); setView('test_mode'); };
    const startPractice = () => { setCurrentIndex(0); setIsAnswerVisible(false); setView('practice_mode'); };
    const goBackToFilter = () => { setView('filter'); setQuestions([]); };
    const handleEndTest = () => { if (window.confirm('Are you sure you want to end the test?')) { goBackToFilter(); } };
    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };
    
    const handleNextQuestion = () => {
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setIsAnswerVisible(false);
        }
    };
    const handlePreviousQuestion = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
            setIsAnswerVisible(false);
        }
    };
    const handleRevealAnswer = () => setIsAnswerVisible(true);

    if (view === 'filter') {
        return ( <form onSubmit={handleProceed} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 mb-8 items-end"><div><label htmlFor="exam-type" className="block text-sm font-medium text-gray-700">Exam</label><select id="exam-type" value={exam} onChange={(e) => setExam(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 rounded-md"><option>DNB</option><option>MD</option></select></div><div><label htmlFor="year" className="block text-sm font-medium text-gray-700">Year</label><select id="year" value={year} onChange={(e) => setYear(e.target.value)} disabled={isLoading} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 rounded-md"><option value="">{isLoading ? 'Loading...' : 'Select Year'}</option>{yearOptions.map(y => <option key={y} value={y}>{y}</option>)}</select></div><div><label htmlFor="month" className="block text-sm font-medium text-gray-700">Month</label><select id="month" value={month} onChange={(e) => setMonth(e.target.value)} disabled={!year} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 rounded-md"><option value="">Select Month</option>{monthOptions.map(m => <option key={m} value={m}>{m}</option>)}</select></div><div><label htmlFor="paper" className="block text-sm font-medium text-gray-700">Paper</label><select id="paper" value={paper} onChange={(e) => setPaper(e.target.value)} disabled={!month} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 rounded-md"><option value="">Select Paper</option>{paperOptions.map(p => <option key={p} value={p}>{p}</option>)}</select></div><div className="sm:col-span-2 md:col-span-1"><button type="submit" disabled={!paper} className="w-full px-6 py-2 rounded-lg font-semibold transition-colors duration-200 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400">Proceed</button></div></form>);
    }
    
    if (view === 'confirmation' && selectedPaper) {
        return ( <div className="text-center bg-gray-50 p-8 rounded-lg"><button onClick={goBackToFilter} className="text-blue-600 hover:underline mb-6">&larr; Change Selection</button><h3 className="text-2xl font-bold text-gray-800">You have selected:</h3><p className="text-xl text-gray-600 mt-2 mb-8">{selectedPaper.exam} {selectedPaper.month} {selectedPaper.year} - {selectedPaper.paper}</p><p className="text-lg text-gray-700 mb-6">Please choose a mode to begin.</p><div className="flex justify-center gap-4"><button onClick={startTest} className="px-8 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700">Start Timed Test</button><button onClick={startPractice} className="px-8 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">Start Practice Session</button></div></div>);
    }

    if (view === 'test_mode') {
        if (isLoading) return <p className="text-center">Loading Questions...</p>;
        if (error) return <p className="text-center text-red-500">{error}</p>;
        return ( <div><div className="bg-gray-100 p-4 rounded-lg mb-6 flex justify-between items-center"><h2 className="text-xl font-bold">Test in Progress: {selectedPaper.paper}</h2><div className="text-right"><div className={`text-2xl font-bold ${timeLeft < 600 ? 'text-red-500' : 'text-gray-800'}`}>{formatTime(timeLeft)}</div><div className="text-xs text-gray-600">Time Remaining</div></div></div><div className="space-y-4 mb-6">{questions.map((q, index) => ( <div key={q.id} className="p-4 border rounded-lg bg-white"><p className="font-semibold text-gray-800">{index + 1}. {q.questionText}</p><div className="text-sm text-gray-500 mt-2 flex items-center gap-4">
            {/* ✅ **CHANGE**: Display marksDistribution in Test Mode */}
            <span>
                Marks: <strong>{q.marks}</strong>
                {q.marksDistribution && <span className="text-gray-400 ml-1">({q.marksDistribution})</span>}
            </span>
            <span>Topic: <strong>{q.topic}</strong></span>
        </div></div>))}</div><div className="text-center"><button onClick={handleEndTest} className="px-8 py-3 bg-gray-700 text-white rounded-lg font-semibold hover:bg-gray-800">End Test</button></div></div>);
    }
    
    if (view === 'practice_mode') {
        if (isLoading) return <p className="text-center">Loading Questions...</p>;
        if (error) return <p className="text-center text-red-500">{error}</p>;
        if (questions.length === 0) return <p className="text-center">No questions available.</p>;

        const currentQuestion = questions[currentIndex];

        return (
            <div>
                 <div className="bg-gray-100 p-4 rounded-lg mb-6 flex justify-between items-center">
                    <h2 className="text-xl font-bold">Practice Session: {selectedPaper.paper}</h2>
                    <button onClick={goBackToFilter} className="text-sm text-blue-600 hover:underline">
                        &larr; Back to Selection
                    </button>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                    <div className="flex justify-between items-center text-sm font-semibold text-gray-500 mb-4">
                        <span>Question {currentIndex + 1} of {questions.length}</span>
                        {/* ✅ **CHANGE**: Display marksDistribution in Practice Mode */}
                        <span>
                            Marks: <strong>{currentQuestion.marks}</strong>
                            {currentQuestion.marksDistribution && <span className="text-gray-400 ml-1">({currentQuestion.marksDistribution})</span>}
                        </span>
                    </div>
                    <p className="text-xl font-semibold text-gray-800 mb-6 min-h-[100px]">
                        {currentQuestion.questionText}
                    </p>
                    
                    {isAnswerVisible ? (
                        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                           <p className="text-sm font-bold text-green-800">Topic:</p>
                           <p className="text-lg text-green-900">{currentQuestion.topic}</p>
                        </div>
                    ) : (
                        <button 
                            onClick={handleRevealAnswer}
                            className="w-full py-2 px-4 bg-blue-100 text-blue-700 font-semibold rounded-lg hover:bg-blue-200"
                        >
                            Reveal Answer
                        </button>
                    )}
                </div>

                <div className="flex justify-between items-center mt-6">
                    <button 
                        onClick={handlePreviousQuestion}
                        disabled={currentIndex === 0}
                        className="px-6 py-2 rounded-lg font-semibold transition-colors duration-200 bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-50"
                    >
                        &larr; Previous
                    </button>
                    <button 
                        onClick={handleNextQuestion}
                        disabled={currentIndex === questions.length - 1}
                        className="px-6 py-2 rounded-lg font-semibold transition-colors duration-200 bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-50"
                    >
                        Next &rarr;
                    </button>
                </div>
            </div>
        );
    }

    return null;
};

export default QuestionPaperViewer;