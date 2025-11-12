import React from 'react';
import SkeletonLoader from './SkeletonLoader';

interface CallSummaryProps {
  summary: string | null;
  isLoading: boolean;
}

const CallSummary: React.FC<CallSummaryProps> = ({ summary, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mb-8">
        <SkeletonLoader className="h-6 w-1/3 mb-4" />
        <SkeletonLoader className="h-4 w-full mb-2" />
        <SkeletonLoader className="h-4 w-full mb-2" />
        <SkeletonLoader className="h-4 w-4/5" />
      </div>
    );
  }

  if (!summary) {
    return null; // Return nothing if not loading and no summary
  }

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mb-8 transition-shadow hover:shadow-xl">
      <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Sales Call Summary</h3>
      <p className="text-gray-700 dark:text-slate-300 leading-relaxed">
        {summary}
      </p>
    </div>
  );
};

export default CallSummary;