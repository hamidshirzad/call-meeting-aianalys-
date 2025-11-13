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
}> = ({ feature, label, icon, isActive, onClick, disabled = false, isPro = false }) => (
  <li>
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        if (!disabled) onClick();
      }}
      className={`flex items-center p-3 my-1 rounded-lg transition-all duration-200 ${
        isActive
          ? 'bg-indigo-600 text-white shadow-lg'
          : disabled 
            ? 'text-slate-500 cursor-not-allowed'
            : 'text-slate-300 hover:bg-slate-700 hover:text-white'
      }`}
    >
      {React.cloneElement(icon, { className: "w-6 h-6" })}
      <span className="ml-4 font-medium">{label}</span>
      {isPro && <span className="ml-auto text-xs font-bold bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full">PRO</span>}
    </a>
  </li>
);


const Sidebar: React.FC<SidebarProps> = ({ activeFeature, setActiveFeature, userPlan, isSidebarOpen, setIsSidebarOpen }) => {
  const handleItemClick = (feature: AppFeature) => {
    setActiveFeature(feature);
    setIsSidebarOpen(false); // Close sidebar on item click for mobile
  };

  const navItems = [
    { feature: 'sales-coaching' as AppFeature, label: 'Dashboard', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25A2.25 2.25 0 0113.5 8.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg> },
    { feature: 'my-progress' as AppFeature, label: 'My Progress', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg> },
    { feature: 'team-dashboard' as AppFeature, label: 'Team Dashboard', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.5-2.962A3.75 3.75 0 0112 15v-2.25a3.75 3.75 0 013.75-3.75V8.25a3.75 3.75 0 01-7.5 0v2.25a3.75 3.75 0 013.75 3.75z" /></svg>, proOnly: true },
    { feature: 'live-mic' as AppFeature, label: 'Live Transcribe', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 016 0v8.25a3 3 0 01-3 3z" /></svg> },
    { feature: 'video-generator' as AppFeature, label: 'Video Generator', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" /></svg> },
    { feature: 'chat-assistant' as AppFeature, label: 'Chat Assistant', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.76 9.76 0 01-2.53-.388m-5.383-.951a.75.75 0 00-.227.75c.062.43.235.85.445 1.25.21.401.448.79.71 1.154l.113.152c.262.35.626.652 1.006.878m7.158-2.428a3.75 3.75 0 00-5.303-5.303m0 0a3.75 3.75 0 00-5.304 5.303" /></svg> },
  ];

  const settingsNav = [
    { feature: 'billing' as AppFeature, label: 'Billing', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 21z" /></svg> },
    { feature: 'referrals' as AppFeature, label: 'Referrals', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.542L16.5 21.75l-.398-1.208a3.375 3.375 0 00-2.456-2.456L12.75 18l1.208-.398a3.375 3.375 0 002.456-2.456L16.5 14.25l.398 1.208a3.375 3.375 0 002.456 2.456L20.25 18l-1.208.398a3.375 3.375 0 00-2.456 2.456z" /></svg> },
    { feature: 'developer-settings' as AppFeature, label: 'Developer API', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>, proOnly: true },
  ];

  const sidebarContent = (
    <>
      <div className="text-center py-4 mb-4 flex items-center justify-center gap-2">
        <h1 className="text-2xl font-bold">
            <span className="text-slate-100">fourdoorai</span>
            <span className="text-emerald-400"> call agent</span>
        </h1>
        {userPlan === 'free' && (
          <span className="text-xs font-bold bg-slate-600 text-slate-200 px-2 py-0.5 rounded-full border border-slate-500">
            FREE
          </span>
        )}
      </div>

      <nav className="flex-grow">
        <p className="px-3 text-xs font-semibold uppercase text-slate-500 mb-2">Features</p>
        <ul>
          {navItems.map((item) => (
            <NavItem
              key={item.feature}
              {...item}
              isActive={activeFeature === item.feature}
              onClick={() => handleItemClick(item.feature)}
              disabled={(item.proOnly && userPlan === 'free')}
              isPro={item.proOnly}
            />
          ))}
        </ul>
         <p className="px-3 text-xs font-semibold uppercase text-slate-500 mt-6 mb-2">Settings</p>
        <ul>
          {settingsNav.map((item) => (
            <NavItem
              key={item.feature}
              {...item}
              isActive={activeFeature === item.feature}
              onClick={() => handleItemClick(item.feature)}
              disabled={(item.proOnly && userPlan === 'free')}
              isPro={item.proOnly}
            />
          ))}
        </ul>
      </nav>
      <div className="mt-auto text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} fourdoorai call agent</p>
        <p className="mt-1">Powered by Google Gemini</p>
      </div>
    </>
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
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-black/50 z-20 lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed top-0 left-0 h-full w-64 bg-slate-800 text-white p-4 flex flex-col shadow-2xl z-30"
            >
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="absolute top-3 right-3 p-2 rounded-full text-slate-400 hover:bg-slate-700 lg:hidden"
                aria-label="Close sidebar"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
              </button>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed top-0 left-0 h-full w-64 bg-slate-800 text-white p-4 flex-col shadow-2xl">
        {sidebarContent}
      </aside>
    </>
  );
};

export default Sidebar;
