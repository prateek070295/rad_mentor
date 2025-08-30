// src/components/Dashboard.jsx
import React from 'react';

const Dashboard = ({ userName, todayFocus, syllabusCompletion, testScores, topTopics, bottomTopics, daysUntilExam, daysUntilWeeklyTest }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
      {/* Welcome & Today's Goal Card */}
      <div className="lg:col-span-2 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl shadow-lg p-6 flex flex-col justify-between h-full">
        <div>
          <h2 className="text-3xl font-bold mb-2">Welcome back, {userName}! 👋</h2>
          <p className="text-xl font-light mb-4">Today's Focus:</p>
          <p className="text-2xl font-bold">{todayFocus}</p>
        </div>
        <button className="mt-6 w-full md:w-auto self-end bg-white text-blue-700 font-bold py-3 px-6 rounded-lg shadow-md hover:bg-blue-50 transition duration-300 transform hover:scale-105">
          Start Learning Session
        </button>
      </div>

      {/* Progress Overview Card */}
      <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col h-full">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Your Progress Overview</h3>
        <div className="flex flex-col md:flex-row items-center justify-center flex-wrap gap-y-6 md:gap-x-8 mt-4">
          {/* Syllabus Completion */}
          <div className="flex flex-col items-center flex-shrink-0">
            <div className="relative w-28 h-28">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                <circle className="text-gray-300" strokeWidth="10" stroke="currentColor" fill="transparent" r="50" cx="60" cy="60" />
                <circle
                  className="text-blue-500"
                  strokeWidth="10"
                  strokeDasharray={2 * Math.PI * 50}
                  strokeDashoffset={2 * Math.PI * 50 - (syllabusCompletion / 100) * (2 * Math.PI * 50)}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                  r="50"
                  cx="60"
                  cy="60"
                  style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
                />
              </svg>
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-bold text-gray-800">
                {syllabusCompletion}%
              </span>
            </div>
            <p className="text-center text-sm text-gray-600 mt-2">Syllabus Completion</p>
          </div>

          {/* Test Score Trend (simplified line chart using SVG) */}
          <div className="flex flex-col items-center w-full max-w-xs md:max-w-none flex-grow">
            <p className="text-sm text-gray-600 mb-2">Test Score Trend</p>
            <div className="relative w-full h-20">
              <svg className="w-full h-full" viewBox="-2 -2 110 22" preserveAspectRatio="none">
                <line x1="0" y1="10" x2="100" y2="10" stroke="#e0e0e0" strokeDasharray="1,1" />
                <polyline
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="1.5"
                  points={testScores.map((score, index) => `${(index / (testScores.length - 1)) * 100},${20 - (score / 100) * 20}`).join(' ')}
                />
                {testScores.map((score, index) => (
                  <circle
                    key={index}
                    cx={(index / (testScores.length - 1)) * 100}
                    cy={20 - (score / 100) * 20}
                    r="1.5"
                    fill="#3B82F6"
                  />
                ))}
              </svg>
            </div>
          </div>
        </div>

        {/* Strengths & Weaknesses */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 flex-grow">
          <div>
            <h4 className="font-semibold text-gray-700 mb-2">Top 3 Topics 💪</h4>
            <ul className="list-disc list-inside text-sm text-gray-600">
              {topTopics.map((topic, index) => (
                <li key={index}>{topic}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-700 mb-2">Bottom 3 Topics 📉</h4>
            <ul className="list-disc list-inside text-sm text-gray-600">
              {bottomTopics.map((topic, index) => (
                <li key={index}>{topic}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Upcoming Deadlines Card */}
      <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col justify-center items-center text-center h-full">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Upcoming Deadlines</h3>
        <div className="mb-4">
          <p className="text-5xl font-extrabold text-red-600">{daysUntilExam}</p>
          <p className="text-lg text-gray-600">DAYS until your exam</p>
        </div>
        <div>
          <p className="text-4xl font-extrabold text-orange-500">{daysUntilWeeklyTest}</p>
          <p className="text-lg text-gray-600">DAYS until your next Weekly Test</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;