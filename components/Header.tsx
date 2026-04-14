import React, { useState } from 'react';
import { AppNotification, UserDetails, SubscriptionPlan } from '../types';
import NotificationCenter from './NotificationCenter';
import { AnimatePresence } from 'framer-motion';

interface HeaderProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  notifications: AppNotification[];
  setNotifications: (notifications: AppNotification[]) => void;
  user: UserDetails;
  toggleSidebar: () => void;
}

const PlanPill: React.FC<{ plan: SubscriptionPlan }> = ({ plan }) => {
  const cfg = {
    free:       { label: 'Free',       className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
    pro:        { label: 'Pro',         className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300' },
    enterprise: { label: 'Enterprise', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' },
  }[plan];
  return (
    <span className={`hidden sm:inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full ${cfg.className}`}>
      {cfg.label}
    </span>
  );
};

const Header: React.FC<HeaderProps> = ({ isDarkMode, toggleDarkMode, notifications, setNotifications, user, toggleSidebar }) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  const initial = user.name.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-10 glass border-b border-slate-200/60 dark:border-slate-700/60">
      <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between lg:justify-end gap-4">

        {/* Mobile: hamburger + brand */}
        <div className="flex items-center gap-3 lg:hidden">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            aria-label="Open sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
          </button>
          <span className="text-sm font-bold">
            <span className="text-slate-800 dark:text-slate-100">fourdoorai</span>
            <span className="text-emerald-500"> call agent</span>
          </span>
        </div>

        {/* Right-side controls */}
        <div className="flex items-center gap-1 sm:gap-2">

          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors"
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDarkMode ? 'Light mode' : 'Dark mode'}
          >
            {isDarkMode ? (
              /* Sun */
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              /* Moon */
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={() => setIsNotificationsOpen(v => !v)}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors relative"
              aria-label="Notifications"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-800 animate-bounce-in">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <AnimatePresence>
              {isNotificationsOpen && (
                <NotificationCenter
                  notifications={notifications}
                  setNotifications={setNotifications}
                  onClose={() => setIsNotificationsOpen(false)}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

          {/* User avatar + plan */}
          <div className="flex items-center gap-2.5">
            <PlanPill plan={(user.customApiKey ? 'pro' : user.plan) as SubscriptionPlan} />
            <div
              className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-sm font-bold shadow-md cursor-default select-none"
              title={user.name}
            >
              {initial}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
