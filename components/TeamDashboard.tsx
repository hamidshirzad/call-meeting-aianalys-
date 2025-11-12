import React from 'react';
import { UserDetails } from '../types';

interface TeamDashboardProps {
  user: UserDetails;
  setActiveFeature: (feature: 'billing') => void;
}

const TeamDashboard: React.FC<TeamDashboardProps> = ({ user, setActiveFeature }) => {
  if (user.plan !== 'enterprise') {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-lg max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold mb-4 text-slate-800 dark:text-slate-200">Unlock Your Team's Potential</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">
            The Team Dashboard is an Enterprise feature that provides aggregated analytics, performance tracking, and sentiment benchmarking for your entire sales team.
          </p>
          <button
            onClick={() => setActiveFeature('billing')}
            className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
          >
            Upgrade to Enterprise
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <h2 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-200">Team Dashboard</h2>
      
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg">
        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Team-wide Analytics</h3>
        <p className="text-slate-500 dark:text-slate-400">
          This is where you would see charts and KPIs for your entire team's performance, such as:
        </p>
        <ul className="list-disc pl-5 mt-4 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Overall team sentiment trend</li>
          <li>Leaderboard for top performers</li>
          <li>Commonly missed opportunities across the team</li>
          <li>Benchmarking against industry standards</li>
        </ul>
        <div className="mt-8 text-center text-slate-400 italic">
            (Full feature set coming soon for Enterprise customers)
        </div>
      </div>
    </div>
  );
};

export default TeamDashboard;
