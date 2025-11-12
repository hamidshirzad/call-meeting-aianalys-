import React from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { GamificationState } from '../types';

const GamificationStats: React.FC = () => {
    // Fix: Add missing properties `referrals` and `apiCredits` to match the GamificationState type.
    const [gamification] = useLocalStorage<GamificationState>('gamification', { streak: 1, analysesThisWeek: 0, badges: [], referrals: 0, apiCredits: 0 });
    
    const weeklyGoal = 5;
    const progress = Math.min(100, (gamification.analysesThisWeek / weeklyGoal) * 100);
    const circumference = 2 * Math.PI * 45; // 2 * pi * r
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg transition-shadow hover:shadow-xl lg:col-span-2">
            <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Weekly Progress</h3>
            <div className="flex items-center justify-around text-center">
                <div>
                    <p className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">{gamification.streak}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Day Streak</p>
                </div>
                 <div className="relative">
                    <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" strokeWidth="10" className="stroke-slate-200 dark:stroke-slate-700" fill="transparent" />
                        <circle
                            cx="50" cy="50" r="45" strokeWidth="10"
                            className="stroke-current text-indigo-500"
                            fill="transparent"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">{gamification.analysesThisWeek}/{weeklyGoal}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Calls This Week</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GamificationStats;