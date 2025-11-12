import React, { useState, useEffect } from 'react';
import { geminiService } from '../services/geminiService';
import SkeletonLoader from './SkeletonLoader';
import { UserDetails } from '../types';

interface TipOfTheDayProps {
    user: UserDetails;
}

const TipOfTheDay: React.FC<TipOfTheDayProps> = ({ user }) => {
    const [tip, setTip] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchTip = async () => {
            try {
                const cachedTip = localStorage.getItem('tip-of-the-day');
                const lastFetch = localStorage.getItem('tip-last-fetch');
                const today = new Date().toDateString();

                if (cachedTip && lastFetch === today) {
                    setTip(cachedTip);
                } else {
                    const newTip = await geminiService.getCoachingTip(user.customApiKey);
                    setTip(newTip);
                    localStorage.setItem('tip-of-the-day', newTip);
                    localStorage.setItem('tip-last-fetch', today);
                }
            } catch (error) {
                console.error("Failed to fetch tip of the day:", error);
                setTip("Focus on listening more than you speak. Understanding the customer's needs is the key to any successful sale.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchTip();
    }, [user.customApiKey]);

    return (
        <div className="bg-gradient-to-br from-indigo-500 to-emerald-500 text-white p-6 rounded-lg shadow-lg transition-shadow hover:shadow-xl">
            <h3 className="text-xl font-semibold mb-2 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Tip of the Day
            </h3>
            {isLoading ? (
                <div className="space-y-2 mt-2">
                    <SkeletonLoader className="h-4 w-full bg-white/30" />
                    <SkeletonLoader className="h-4 w-3/4 bg-white/30" />
                </div>
            ) : (
                <p className="text-indigo-100 italic">"{tip}"</p>
            )}
        </div>
    );
};

export default TipOfTheDay;
