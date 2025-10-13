import React, { useState, useCallback } from 'react';

/**
 * Handles uploading a PDF question paper and extracting structured questions.
 * Emits high-level status updates via the optional `onNotify` callback so the
 * parent can surface feedback consistently within the admin workspace.
 */
const QuestionUploader = ({ onExtracted, onNotify }) => {
  const [file, setFile] = useState(null);
  const [examType, setExamType] = useState('DNB');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().toLocaleString('default', { month: 'long' }));
  const [paper, setPaper] = useState('Paper I');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const notify = useCallback(
    (type, text) => {
      if (!text) return;
      if (typeof onNotify === 'function') {
        onNotify({ type, text });
      }
    },
    [onNotify],
  );

  const handleFileChange = (event) => {
    if (event.target.files?.length) {
      setFile(event.target.files[0]);
      setError(null);
    }
  };

  const handleExtract = async () => {
    if (!file) {
      const message = 'Please select a PDF file first.';
      setError(message);
      notify('error', message);
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('examType', examType);
    formData.append('year', year);
    formData.append('month', month);
    formData.append('paper', paper);

    try {
      const response = await fetch('https://asia-south1-radmentor-app.cloudfunctions.net/api/extract-questions', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error ? `${errorData.step}: ${errorData.error}` : errorMessage;
        } catch {
          // Ignore JSON parse errors; fallback to the default message.
        }
        throw new Error(errorMessage);
      }

      const extractedQuestions = await response.json();
      onExtracted({
        questions: extractedQuestions,
        metadata: { exam: examType, year, month, paper },
      });
      notify('success', 'Questions extracted. Review them below before saving.');
    } catch (extractionError) {
      console.error('Failed to extract questions:', extractionError);
      const message = `Failed to extract questions. Please check the file and try again. | ${extractionError.message}`;
      setError(message);
      notify('error', extractionError.message || 'Failed to extract questions.');
    } finally {
      setIsLoading(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, index) => currentYear - index);
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const papers = ['Paper I', 'Paper II', 'Paper III', 'Paper IV'];

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
      <h3 className="text-2xl font-bold text-gray-800">Question Bank Uploader</h3>
      <p className="text-gray-600 mt-1 mb-6">
        Upload a PDF question paper and select its details to begin.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 mb-4 items-center">
        <div className="sm:col-span-2 md:col-span-5">
          <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-1">
            PDF Question Paper
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
          />
        </div>
        <div>
          <label htmlFor="exam-type" className="block text-sm font-medium text-gray-700">
            Exam
          </label>
          <select
            id="exam-type"
            value={examType}
            onChange={(event) => setExamType(event.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            <option>DNB</option>
            <option>MD</option>
          </select>
        </div>
        <div>
          <label htmlFor="year" className="block text-sm font-medium text-gray-700">
            Year
          </label>
          <select
            id="year"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            {years.map((yearOption) => (
              <option key={yearOption}>{yearOption}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="month" className="block text-sm font-medium text-gray-700">
            Month
          </label>
          <select
            id="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            {months.map((monthOption) => (
              <option key={monthOption}>{monthOption}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="paper" className="block text-sm font-medium text-gray-700">
            Paper
          </label>
          <select
            id="paper"
            value={paper}
            onChange={(event) => setPaper(event.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            {papers.map((paperOption) => (
              <option key={paperOption}>{paperOption}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="text-red-500 text-center mb-4">{error}</div>}

      <div className="flex justify-end">
        <button
          onClick={handleExtract}
          disabled={isLoading}
          className={`w-full sm:w-auto px-6 py-2 rounded-lg font-semibold transition-colors duration-200 ${
            isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isLoading ? 'Extracting...' : 'Extract Questions'}
        </button>
      </div>
    </div>
  );
};

export default QuestionUploader;
