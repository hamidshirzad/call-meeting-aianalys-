import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CallSummaryProps {
  summary: string | null;
  isLoading: boolean;
}

const CallSummary: React.FC<CallSummaryProps> = ({ summary, isLoading }) => {
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card p-6 mb-6">
        <div className="h-5 w-36 bg-slate-200 dark:bg-slate-700 rounded shimmer mb-4" />
        <div className="space-y-2">
          <div className="h-4 w-full bg-slate-100 dark:bg-slate-700/60 rounded shimmer" />
          <div className="h-4 w-full bg-slate-100 dark:bg-slate-700/60 rounded shimmer" />
          <div className="h-4 w-3/4 bg-slate-100 dark:bg-slate-700/60 rounded shimmer" />
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const isLong = summary.length > 280;
  const displayText = isLong && !expanded ? summary.slice(0, 280).trimEnd() + '…' : summary;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white dark:bg-slate-800 rounded-xl shadow-card mb-6 overflow-hidden"
    >
      {/* Accent bar */}
      <div className="h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500" />

      <div className="p-6">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Call Summary</h3>
        </div>

        {/* Quote-style body */}
        <div className="pl-4 border-l-2 border-indigo-200 dark:border-indigo-700">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={expanded ? 'expanded' : 'collapsed'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed"
            >
              {displayText}
            </motion.p>
          </AnimatePresence>

          {isLong && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors flex items-center gap-1"
            >
              {expanded ? (
                <>Show less <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg></>
              ) : (
                <>Read more <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg></>
              )}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default CallSummary;
