import React, { useState } from 'react';

// This component is well-structured. The only change is to pass metadata along with the questions.
const QuestionUploader = ({ onExtracted }) => {
  const [file, setFile] = useState(null);
  const [examType, setExamType] = useState('DNB');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().toLocaleString('default', { month: 'long' }));
  const [paper, setPaper] = useState('Paper I');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleExtract = async () => {
    if (!file) {
      alert('Please select a PDF file first.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file, file.name);
    // Note: The backend currently doesn't use these fields, but it's good practice to send them.
    // They will be used by the parent component after extraction.
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
        } catch (e) {
          // Response was not JSON.
        }
        throw new Error(errorMessage);
      }

      const extractedQuestions = await response.json();
      
      // ✅ **FIX:** Pass an object containing both the questions AND the metadata to the parent.
      // This is crucial for the next step (preview & save).
      onExtracted({ 
        questions: extractedQuestions,
        metadata: { exam: examType, year, month, paper }
      });

    } catch (e) {
      console.error("Failed to extract questions:", e);
      setError("Failed to extract questions. Please check the file and try again. | " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const papers = ["Paper I", "Paper II", "Paper III", "Paper IV"];

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
      <h3 className="text-2xl font-bold text-gray-800">Question Bank Uploader</h3>
      <p className="text-gray-600 mt-1 mb-6">Upload a PDF question paper and select its details to begin.</p>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 mb-4 items-center">
        <div className="sm:col-span-2 md:col-span-5">
          <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-1">
            PDF Question Paper
          </label>
          <input id="file-upload" type="file" accept=".pdf" onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"/>
        </div>
        <div>
          <label htmlFor="exam-type" className="block text-sm font-medium text-gray-700">Exam</label>
          <select id="exam-type" value={examType} onChange={(e) => setExamType(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            <option>DNB</option>
            <option>MD</option>
          </select>
        </div>
        <div>
          <label htmlFor="year" className="block text-sm font-medium text-gray-700">Year</label>
          <select id="year" value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="month" className="block text-sm font-medium text-gray-700">Month</label>
          <select id="month" value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            {months.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="paper" className="block text-sm font-medium text-gray-700">Paper</label>
          <select id="paper" value={paper} onChange={(e) => setPaper(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            {papers.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      
      {error && <div className="text-red-500 text-center mb-4">{error}</div>}

      <div className="flex justify-end">
          <button onClick={handleExtract} disabled={isLoading} className={`w-full sm:w-auto px-6 py-2 rounded-lg font-semibold transition-colors duration-200 ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {isLoading ? 'Extracting...' : 'Extract Questions'}
          </button>
      </div>
    </div>
  );
};

export default QuestionUploader;