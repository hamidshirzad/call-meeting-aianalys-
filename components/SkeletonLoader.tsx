import React from 'react';

interface SkeletonLoaderProps {
  className?: string;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ className }) => {
  return (
    <div className={`bg-slate-200 dark:bg-slate-700 rounded-md animate-pulse ${className}`}></div>
  );
};

export default SkeletonLoader;