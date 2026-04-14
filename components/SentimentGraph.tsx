import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, ReferenceLine, Area, AreaChart,
} from 'recharts';
import { SentimentData } from '../types';
import { motion } from 'framer-motion';

interface SentimentGraphProps {
  sentimentData: SentimentData[];
  isLoading: boolean;
  thresholds: { negative: number; positive: number };
}

const CustomTooltip = ({
  active, payload, label, thresholds
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
  thresholds: { negative: number; positive: number };
}) => {
  if (!active || !payload?.length) return null;
  const score: number = payload[0].value;

  let sentiment = 'Neutral';
  let color = '#64748b';
  let bg = 'bg-slate-100 dark:bg-slate-700';
  if (score <= thresholds.negative) { sentiment = 'Negative'; color = '#ef4444'; bg = 'bg-red-50 dark:bg-red-900/30'; }
  else if (score >= thresholds.positive) { sentiment = 'Positive'; color = '#22c55e'; bg = 'bg-emerald-50 dark:bg-emerald-900/30'; }

  return (
    <div className={`px-3.5 py-2.5 rounded-xl shadow-lg border border-slate-200 dark:border-slate-600 ${bg} backdrop-blur-sm text-xs`}>
      <p className="font-semibold text-slate-600 dark:text-slate-300 mb-1">Segment {label}</p>
      <p className="text-slate-700 dark:text-slate-200">Score: <strong>{score.toFixed(2)}</strong></p>
      <p className="font-bold mt-0.5" style={{ color }}>{sentiment}</p>
    </div>
  );
};

const SentimentGraph: React.FC<SentimentGraphProps> = ({ sentimentData, isLoading, thresholds }) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card p-6">
        <div className="h-5 w-44 bg-slate-200 dark:bg-slate-700 rounded shimmer mb-5" />
        <div className="h-64 w-full bg-slate-100 dark:bg-slate-700/50 rounded-lg shimmer" />
      </div>
    );
  }

  if (sentimentData.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card p-10 text-center flex flex-col items-center justify-center h-96">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
          </svg>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">No sentiment data available.</p>
      </div>
    );
  }

  // Compute overall average for the mini summary
  const avg = sentimentData.reduce((sum, d) => sum + d.score, 0) / sentimentData.length;
  const avgLabel = avg <= thresholds.negative ? 'Negative' : avg >= thresholds.positive ? 'Positive' : 'Neutral';
  const avgColor = avg <= thresholds.negative ? 'text-red-500' : avg >= thresholds.positive ? 'text-emerald-500' : 'text-slate-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="bg-white dark:bg-slate-800 rounded-xl shadow-card p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Sentiment Timeline</h3>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Overall</p>
          <p className={`text-sm font-bold ${avgColor}`}>{avg.toFixed(2)} · {avgLabel}</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={272}>
        <AreaChart
          data={sentimentData}
          margin={{ top: 10, right: 8, left: -18, bottom: 16 }}
        >
          <defs>
            <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="negGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="posGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0.04} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />

          <XAxis
            dataKey="segmentIndex"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(148,163,184,0.2)' }}
            tickLine={false}
            label={{ value: 'Segment', position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 11 }}
          />
          <YAxis
            domain={[-1, 1]}
            ticks={[-1, -0.5, 0, 0.5, 1]}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip content={<CustomTooltip thresholds={thresholds} />} />

          {/* Zone backgrounds */}
          <ReferenceArea y1={thresholds.positive} y2={1}     fill="url(#posGradient)" strokeOpacity={0} />
          <ReferenceArea y1={thresholds.negative} y2={thresholds.positive} fill="rgba(148,163,184,0.05)" strokeOpacity={0} />
          <ReferenceArea y1={-1}                  y2={thresholds.negative} fill="url(#negGradient)" strokeOpacity={0} />

          {/* Zone boundary lines */}
          <ReferenceLine y={thresholds.positive} stroke="#22c55e" strokeDasharray="4 3" strokeOpacity={0.5} strokeWidth={1} label={{ value: 'Positive', position: 'right', fill: '#22c55e', fontSize: 10, fontWeight: 600 }} />
          <ReferenceLine y={thresholds.negative} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.5} strokeWidth={1} label={{ value: 'Negative', position: 'right', fill: '#ef4444', fontSize: 10, fontWeight: 600 }} />
          <ReferenceLine y={0}                   stroke="rgba(148,163,184,0.3)" strokeDasharray="2 4" strokeWidth={1} />

          {/* Gradient area fill */}
          <Area
            type="monotone"
            dataKey="score"
            stroke="#6366f1"
            strokeWidth={2.5}
            fill="url(#sentimentGradient)"
            dot={{ r: 3.5, fill: '#6366f1', stroke: 'white', strokeWidth: 1.5 }}
            activeDot={{ r: 6, fill: '#6366f1', stroke: 'white', strokeWidth: 2, filter: 'drop-shadow(0 0 6px rgba(99,102,241,0.6))' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

export default SentimentGraph;
