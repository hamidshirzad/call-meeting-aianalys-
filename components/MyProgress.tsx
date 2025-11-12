import React from 'react';
import { SalesCallAnalysisReport } from '../types';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface MyProgressProps {
  historicalData: SalesCallAnalysisReport[];
}

const MyProgress: React.FC<MyProgressProps> = ({ historicalData }) => {
  if (historicalData.length === 0) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-lg text-center">
          <h2 className="text-2xl font-bold mb-4 text-slate-800 dark:text-slate-200">My Progress</h2>
          <p className="text-slate-500 dark:text-slate-400">No analysis data available yet. Analyze a few calls on the dashboard to see your progress over time.</p>
        </div>
      </div>
    );
  }

  // Prepare data for charts. Reverse for chronological order.
  const chartData = historicalData.map(report => ({
    name: new Date(report.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    avgSentiment: report.sentimentData.reduce((acc, curr) => acc + curr.score, 0) / report.sentimentData.length,
    strengths: report.coachingCard.strengths.length,
    opportunities: report.coachingCard.opportunities.length,
  })).reverse();

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-200">My Progress</h2>
      
      {/* Sentiment Trend Chart */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg">
        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Average Sentiment Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(200, 200, 200, 0.2)" />
            <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 12 }} />
            <YAxis domain={[-1, 1]} tick={{ fill: '#6B7280', fontSize: 12 }} />
            <Tooltip
              contentStyle={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.8)', 
                backdropFilter: 'blur(5px)',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                color: '#1e293b'
              }}
            />
            <Legend />
            <Line type="monotone" dataKey="avgSentiment" name="Average Sentiment" stroke="#4F46E5" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 8 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Strengths and Opportunities Trend */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg">
        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Coaching Insights Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(200, 200, 200, 0.2)" />
            <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 12 }} />
            <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} />
            <Tooltip
              contentStyle={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.8)', 
                backdropFilter: 'blur(5px)',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                color: '#1e293b'
              }}
            />
            <Legend />
            <Bar dataKey="strengths" fill="#22C55E" name="Strengths Identified" />
            <Bar dataKey="opportunities" fill="#EF4444" name="Opportunities Found" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MyProgress;
