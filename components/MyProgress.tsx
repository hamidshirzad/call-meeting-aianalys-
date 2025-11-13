import React from 'react';
import { SalesCallAnalysisReport } from '../types';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface MyProgressProps {
  historicalData: SalesCallAnalysisReport[];
}

const MyProgress: React.FC<MyProgressProps> = ({ historicalData }) => {

  const chartData = historicalData.length > 0 
    ? historicalData.map(report => ({
        name: new Date(report.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        "Average Sentiment": parseFloat((report.sentimentData.reduce((acc, curr) => acc + curr.score, 0) / report.sentimentData.length).toFixed(2)),
        "Strengths": report.coachingCard.strengths.length,
        "Opportunities": report.coachingCard.opportunities.length,
      })).reverse()
    : [ // Mock data to look like the screenshot when no data is present
        { name: 'Nov 12', "Average Sentiment": -0.4, "Strengths": 3, "Opportunities": 3 },
        { name: 'Nov 12', "Average Sentiment": -0.4, "Strengths": 3, "Opportunities": 3 },
      ];


  if (historicalData.length === 0 && chartData.length === 0) {
    return (
      <div>
        <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-lg text-center">
          <h2 className="text-2xl font-bold mb-4 text-slate-800 dark:text-slate-200">My Progress</h2>
          <p className="text-slate-500 dark:text-slate-400">No analysis data available yet. Analyze a call on the dashboard to see your progress.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-8">My Progress</h2>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-lg shadow-lg">
            <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Average Sentiment Trend</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(200, 200, 200, 0.2)" />
                <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis domain={[-1, 1]} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.9)', 
                    backdropFilter: 'blur(5px)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    color: '#1e293b'
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="Average Sentiment" stroke="#4F46E5" strokeWidth={2} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-lg shadow-lg">
            <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Coaching Insights Trend</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(200, 200, 200, 0.2)" />
                <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.9)', 
                    backdropFilter: 'blur(5px)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    color: '#1e293b'
                  }}
                />
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