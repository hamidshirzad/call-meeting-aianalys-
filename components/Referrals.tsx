import React, { useState } from 'react';
import { UserDetails, GamificationState } from '../types';

interface ReferralsProps {
    user: UserDetails;
    gamification: GamificationState;
    setGamification: React.Dispatch<React.SetStateAction<GamificationState>>;
}

const Referrals: React.FC<ReferralsProps> = ({ user, gamification, setGamification }) => {
    const [copied, setCopied] = useState(false);
    const referralLink = `https://fourdoorai-call-agent.com/signup?ref=${user.id}`;
    
    const copyToClipboard = () => {
        navigator.clipboard.writeText(referralLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // This would normally be handled by the backend, but we'll simulate it here
    const simulateReferral = () => {
        setGamification(prev => ({
            ...prev,
            referrals: prev.referrals + 1,
            apiCredits: prev.apiCredits + 1000, // Give 1000 credits per referral
        }));
    };

    return (
        <div>
            <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-lg shadow-lg max-w-3xl mx-auto">
                <h2 className="text-3xl font-bold text-center mb-2 text-slate-800 dark:text-slate-200">Refer a Friend, Get Rewarded</h2>
                <p className="text-slate-500 dark:text-slate-400 text-center mb-8">
                    Share your unique link with friends. For every friend that signs up, you'll both receive <span className="font-bold text-indigo-500">1,000 bonus API credits!</span>
                </p>

                <div className="mb-8">
                    <label htmlFor="referral-link" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Your unique referral link</label>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
                        <input
                            id="referral-link"
                            type="text"
                            readOnly
                            value={referralLink}
                            className="flex-grow bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg py-2 px-4 font-mono text-sm w-full"
                        />
                        <button
                            onClick={copyToClipboard}
                            className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-md shadow-sm text-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all sm:w-28"
                        >
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-center">
                    <div className="bg-slate-100 dark:bg-slate-700/50 p-6 rounded-lg">
                        <p className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">{gamification.referrals}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Successful Referrals</p>
                    </div>
                     <div className="bg-slate-100 dark:bg-slate-700/50 p-6 rounded-lg">
                        <p className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">{gamification.apiCredits.toLocaleString()}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Bonus API Credits Earned</p>
                    </div>
                </div>

                <div className="text-center mt-8">
                    <button onClick={simulateReferral} className="text-sm text-slate-400 hover:text-slate-600">(Simulate a successful referral)</button>
                </div>
            </div>
        </div>
    );
};

export default Referrals;