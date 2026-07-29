import React from 'react';
import { CoachingCardData } from '../types';
import SkeletonLoader from './SkeletonLoader';

interface CoachingCardProps {
  coachingCard: CoachingCardData | null;
  isLoading: boolean;
}

const CoachingCard: React.FC<CoachingCardProps> = ({ coachingCard, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg">
        <SkeletonLoader className="h-6 w-1/3 mb-6" />
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <SkeletonLoader className="h-5 w-1/2 mb-4" />
            <SkeletonLoader className="h-4 w-full mb-2" />
            <SkeletonLoader className="h-4 w-5/6 mb-2" />
            <SkeletonLoader className="h-4 w-full" />
          </div>
          <div>
            <SkeletonLoader className="h-5 w-1/2 mb-4" />
            <SkeletonLoader className="h-4 w-full mb-2" />
            <SkeletonLoader className="h-4 w-5/6 mb-2" />
            <SkeletonLoader className="h-4 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!coachingCard || (coachingCard.strengths.length === 0 && coachingCard.opportunities.length === 0)) {
    return (
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg text-center text-gray-500 h-80 flex items-center justify-center">
        No coaching insights generated yet.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg">
      <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">AI Coaching Card</h3>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h4 className="text-lg font-medium mb-3 text-emerald-600 dark:text-emerald-400 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Things Done Well
          </h4>
          <ul className="list-disc pl-5 space-y-2 text-gray-700 dark:text-slate-300">
            {coachingCard.strengths.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-lg font-medium mb-3 text-red-600 dark:text-red-400 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Missed Opportunities
          </h4>
          <ul className="list-disc pl-5 space-y-2 text-gray-700 dark:text-slate-300">
            {coachingCard.opportunities.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CoachingCard;