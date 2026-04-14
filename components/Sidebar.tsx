import React from 'react';
import { AppFeature, SubscriptionPlan } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  activeFeature: AppFeature;
  setActiveFeature: (feature: AppFeature) => void;
  userPlan: SubscriptionPlan;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
}

const NavItem: React.FC<{
  feature: AppFeature;
  label: string;
  icon: React.ReactElement<any>;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
  isPro?: boolean;
  badge?: string;
}> = ({ label, icon, isActive, onClick, disabled = false, isPro = false, badge }) => (
  <li>
    <button
      onClick={() => { if (!disabled) onClick(); }}
      disabled={disabled}
      className={`
        group w-full flex items-center gap-3 px-3 py-2.5 my-0.5 rounded-xl
        text-sm font-medium transition-all duration-200 relative
        ${isActive
          ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-900/40'
          : disabled
            ? 'text-slate-600 cursor-not-allowed opacity-50'
            : 'text-slate-400 hover:bg-white/8 hover:text-slate-100'
        }
      `}
    >
      {/* Active indicator bar */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r-full" />
      )}
      <span className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 ${!isActive && !disabled ? 'group-hover:scale-110' : ''}`}>
        {React.cloneElement(icon, { className: 'w-5 h-5' })}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span className="text-xs font-bold bg-violet-500/30 text-violet-300 px-1.5 py-0.5 rounded-md">
          {badge}
        </span>
      )}
      {isPro && !badge && (
        <span className="text-xs font-bold bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded-md border border-amber-400/20">
          PRO
        </span>
      )}
    </button>
  </li>
);

const PlanBadge: React.FC<{ plan: SubscriptionPlan }> = ({ plan }) => {
  const cfg = {
    free:       { label: 'Free Plan',       bg: 'bg-slate-600/50',   text: 'text-slate-300' },
    pro:        { label: 'Pro Plan',         bg: 'bg-violet-600/40',  text: 'text-violet-200' },
    enterprise: { label: 'Enterprise',       bg: 'bg-amber-500/30',   text: 'text-amber-200' },
  }[plan];
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ activeFeature, setActiveFeature, userPlan, isSidebarOpen, setIsSidebarOpen }) => {
  const handleItemClick = (feature: AppFeature) => {
    setActiveFeature(feature);
    setIsSidebarOpen(false);
  };

  const isProOrEnterprise = userPlan === 'pro' || userPlan === 'enterprise';

  const navItems = [
    {
      feature: 'sales-coaching' as AppFeature, label: 'Dashboard',
      icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h7.5" /></svg>,
    },
    {
      feature: 'my-progress' as AppFeature, label: 'My Progress',
      icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>,
    },
    {
      feature: 'team-dashboard' as AppFeature, label: 'Team Dashboard',
      icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94-3.197l.383-.238a4.5 4.5 0 000-7.58l-.383-.238m-7.5 0l-.383.238a4.5 4.5 0 000 7.58l.383.238M12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" /></svg>,
      proOnly: true,
    },
    {
      feature: 'live-mic' as AppFeature, label: 'Live Transcribe',
      icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 016 0v8.25a3 3 0 01-3 3z" /></svg>,
    },
    {
      feature: 'audio-transcriber' as AppFeature, label: 'Audio Transcriber',
      icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
    },
    {
      feature: 'video-generator' as AppFeature, label: 'Video Generator',
      icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" /></svg>,
    },
    {
      feature: 'chat-assistant' as AppFeature, label: 'Chat Assistant',
      icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>,
    },
  ];

  const settingsNav = [
    {
      feature: 'billing' as AppFeature, label: 'Billing & Plans',
      icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h6m-6 2.25h6M2.25 19.5h19.5a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0021.75 4.5H2.25a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 002.25 19.5z" /></svg>,
    },
    {
      feature: 'referrals' as AppFeature, label: 'Referrals',
      icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>,
    },
    {
      feature: 'developer-settings' as AppFeature, label: 'Developer API',
      icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>,
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full sidebar-bg">
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 px-5 h-20 border-b border-white/5 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold text-white">fourdoorai</div>
          <div className="text-xs font-medium text-emerald-400 -mt-0.5">call agent</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 overflow-y-auto space-y-6">
        <div>
          <p className="px-3 mb-2 text-xs font-semibold tracking-widest text-slate-500 uppercase">Features</p>
          <ul className="space-y-0.5">
            {navItems.map(item => (
              <NavItem
                key={item.feature}
                feature={item.feature}
                label={item.label}
                icon={item.icon}
                isActive={activeFeature === item.feature}
                onClick={() => handleItemClick(item.feature)}
                disabled={item.proOnly && !isProOrEnterprise}
                isPro={item.proOnly}
              />
            ))}
          </ul>
        </div>

        <div>
          <p className="px-3 mb-2 text-xs font-semibold tracking-widest text-slate-500 uppercase">Account</p>
          <ul className="space-y-0.5">
            {settingsNav.map(item => (
              <NavItem
                key={item.feature}
                feature={item.feature}
                label={item.label}
                icon={item.icon}
                isActive={activeFeature === item.feature}
                onClick={() => handleItemClick(item.feature)}
              />
            ))}
          </ul>
        </div>
      </nav>

      {/* Bottom upgrade card */}
      {!isProOrEnterprise && (
        <div className="px-3 pb-4 flex-shrink-0">
          <div className="rounded-xl bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-violet-500/20 p-4">
            <div className="flex items-center gap-2 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              <span className="text-sm font-bold text-white">Upgrade to Pro</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">Unlock unlimited analyses and advanced features.</p>
            <button
              onClick={() => handleItemClick('billing')}
              className="w-full text-sm font-semibold py-2 px-3 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-900/30"
            >
              View Plans
            </button>
          </div>
        </div>
      )}

      {/* User plan indicator at very bottom */}
      <div className="px-4 py-3 border-t border-white/5 flex-shrink-0 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold shadow">
          U
        </div>
        <PlanBadge plan={userPlan} />
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden"
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed top-0 left-0 h-full w-64 z-30 lg:hidden"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:z-10">
        {sidebarContent}
      </div>
    </>
  );
};

export default Sidebar;
