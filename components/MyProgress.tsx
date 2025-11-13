import React from 'react';
import { SalesCallAnalysisReport } from '../types';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface MyProgressProps {
  historicalData: SalesCallAnalysisReport[];
}

const MyProgress: React.FC<MyProgressProps> = ({ historicalData }) => {
  const hasData = historicalData.length > 0;

  const chartData = hasData 
    ? historicalData.map(report => ({
        name: new Date(report.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        "Average Sentiment": parseFloat((report.sentimentData.reduce((acc, curr) => acc + curr.score, 0) / report.sentimentData.length || 0).toFixed(2)),
        "Strengths": report.coachingCard.strengths.length,
        "Opportunities": report.coachingCard.opportunities.length,
      })).reverse()
    : [ // Mock data for empty state
        { name: 'Call 1', "Average Sentiment": 0.2, "Strengths": 4, "Opportunities": 2 },
        { name: 'Call 2', "Average Sentiment": -0.1, "Strengths": 2, "Opportunities": 5 },
        { name: 'Call 3', "Average Sentiment": 0.5, "Strengths": 5, "Opportunities": 1 },
        { name: 'Call 4', "Average Sentiment": 0.3, "Strengths": 3, "Opportunities": 3 },
        { name: 'Call 5', "Average Sentiment": 0.6, "Strengths": 6, "Opportunities": 1 },
      ];

  const isDarkMode = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');

  const tooltipStyles = {
    contentStyle: { 
      backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)', 
      backdropFilter: 'blur(5px)',
      border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
      borderRadius: '0.5rem',
    },
    itemStyle: {
      color: isDarkMode ? '#cbd5e1' : '#1e293b',
    },
    labelStyle: {
      color: isDarkMode ? '#f1f5f9' : '#1e293b',
      fontWeight: 'bold',
    }
  };

  return (
    <div>
      <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-8">My Progress</h2>
      
      {!hasData && (
        <div className="bg-blue-100 dark:bg-blue-900/50 border-l-4 border-blue-500 text-blue-800 dark:text-blue-200 p-4 mb-8 rounded-r-lg shadow-md">
          <p className="font-bold">Welcome to your Progress Dashboard!</p>
          <p>Once you analyze your sales calls, your performance trends will appear here. Below is an example of what you can expect.</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-lg shadow-lg">
            <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Average Sentiment Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(200, 200, 200, 0.2)" />
                <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis domain={[-1, 1]} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <Tooltip {...tooltipStyles} />
                <Legend />
                <Line type="monotone" dataKey="Average Sentiment" stroke="#4F46E5" strokeWidth={2} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-lg shadow-lg">
            <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Coaching Insights Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(200, 200, 200, 0.2)" />
                <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <Tooltip {...tooltipStyles} />
                <Legend />
                <Bar dataKey="Strengths" fill="#22C55E" />
                <Bar dataKey="Opportunities" fill="#EF4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
      </div>
    </div>
  );
};

export default MyProgress;
