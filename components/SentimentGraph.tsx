import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import { SentimentData } from '../types';

interface SentimentGraphProps {
  sentimentData: SentimentData[];
  isLoading: boolean;
  thresholds: {
    negative: number;
    positive: number;
  };
}

const SentimentGraph: React.FC<SentimentGraphProps> = ({ sentimentData, isLoading, thresholds }) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg flex items-center justify-center h-80">
        <div className="h-full w-full bg-slate-200 dark:bg-slate-700 rounded-md animate-pulse"></div>
      </div>
    );
  }

  if (sentimentData.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg text-center text-gray-500 h-80 flex items-center justify-center">
        No sentiment data available.
      </div>
    );
  }

  const formatSentiment = (score: number) => {
    if (score <= thresholds.negative) return 'Negative';
    if (score >= thresholds.positive) return 'Positive';
    return 'Neutral';
  };
  
  const getSentimentColor = (score: number) => {
    if (score <= thresholds.negative) return '#EF4444'; // red-500
    if (score >= thresholds.positive) return '#22C55E'; // green-500
    return '#6B7280'; // gray-500
  };


  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg">
      <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Call Engagement Sentiment</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={sentimentData}
          margin={{
            top: 20, // Increased top margin for reference area label
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(200, 200, 200, 0.2)" />
          <XAxis dataKey="segmentIndex" label={{ value: 'Call Segment', position: 'insideBottom', offset: -5, fill: '#6B7280' }} tick={{ fill: '#6B7280', fontSize: 12 }} />
          <YAxis
            domain={[-1, 1]}
            ticks={[-1, -0.5, 0, 0.5, 1]}
            label={{ value: 'Sentiment Score', angle: -90, position: 'insideLeft', fill: '#6B7280' }}
            tick={{ fill: '#6B7280', fontSize: 12 }}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                const score = payload[0].value as number;
                return (
                  <div className="custom-tooltip bg-white dark:bg-slate-800 p-3 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg text-sm">
                    <p className="font-semibold text-gray-800 dark:text-slate-200 mb-1">{`Segment Index: ${label}`}</p>
                    <p className="text-gray-700 dark:text-slate-300">{`Score: ${score.toFixed(2)}`}</p>
                    <p className="font-semibold" style={{ color: getSentimentColor(score) }}>
                      {`Sentiment: ${formatSentiment(score)}`}
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          {/* Reference Areas for sentiment zones */}
          <ReferenceArea y1={thresholds.positive} y2={1.05} strokeOpacity={0.3} fill="#22C55E" fillOpacity={0.1} label={{ value: "Positive", position: "insideTopRight", fill: "#166534", fontSize: 12, fontWeight: 'bold' }} />
          <ReferenceArea y1={thresholds.negative} y2={thresholds.positive} strokeOpacity={0.3} fill="#6B7280" fillOpacity={0.1} label={{ value: "Neutral", position: "insideRight", fill: "#4B5563", fontSize: 12, fontWeight: 'bold' }} />
          <ReferenceArea y1={-1.05} y2={thresholds.negative} strokeOpacity={0.3} fill="#EF4444" fillOpacity={0.1} label={{ value: "Negative", position: "insideBottomRight", fill: "#991B1B", fontSize: 12, fontWeight: 'bold' }} />

          <Line
            type="monotone"
            dataKey="score"
            stroke="#4F46E5"
            activeDot={{ r: 8, fill: '#4F46E5', stroke: 'white', strokeWidth: 2 }}
            strokeWidth={3}
            dot={{ r: 4, fill: '#4F46E5' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SentimentGraph;