import React from 'react';
import { CoachingCardData } from '../types';
import { motion } from 'framer-motion';

interface CoachingCardProps {
  coachingCard: CoachingCardData | null;
  isLoading: boolean;
}

const SkeletonItem = () => (
  <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/40">
    <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-600 flex-shrink-0 shimmer" />
    <div className="flex-1 space-y-1.5 pt-0.5">
      <div className="h-3.5 w-full bg-slate-200 dark:bg-slate-600 rounded shimmer" />
      <div className="h-3 w-4/5 bg-slate-200 dark:bg-slate-600 rounded shimmer" />
    </div>
  </div>
);

const CoachingCard: React.FC<CoachingCardProps> = ({ coachingCard, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card p-6">
        <div className="h-5 w-40 bg-slate-200 dark:bg-slate-700 rounded shimmer mb-5" />
        <div className="grid md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded shimmer mb-4" />
            {[...Array(3)].map((_, i) => <SkeletonItem key={i} />)}
          </div>
          <div className="space-y-3">
            <div className="h-4 w-36 bg-slate-200 dark:bg-slate-700 rounded shimmer mb-4" />
            {[...Array(3)].map((_, i) => <SkeletonItem key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (!coachingCard || (coachingCard.strengths.length === 0 && coachingCard.opportunities.length === 0)) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.746 3.746 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
          </svg>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">No coaching insights yet. Analyze a call to get started.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="bg-white dark:bg-slate-800 rounded-xl shadow-card p-6"
    >
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">AI Coaching Card</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Strengths */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full border border-emerald-200/60 dark:border-emerald-700/40">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Things Done Well
            </span>
          </div>
          <ul className="space-y-2">
            {coachingCard.strengths.map((item, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.07, duration: 0.25 }}
                className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50/60 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30 group"
              >
                <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                  {index + 1}
                </span>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">{item}</p>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* Opportunities */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-full border border-amber-200/60 dark:border-amber-700/40">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              Opportunities
            </span>
          </div>
          <ul className="space-y-2">
            {coachingCard.opportunities.map((item, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.07, duration: 0.25 }}
                className="flex items-start gap-3 p-3 rounded-lg bg-amber-50/60 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 group"
              >
                <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                  {index + 1}
                </span>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">{item}</p>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
};

export default CoachingCard;
