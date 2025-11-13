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
          ? 'bg-violet-600 text-white shadow-lg'
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
    { feature: 'sales-coaching' as AppFeature, label: 'Dashboard', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h7.5" /></svg> },
    { feature: 'my-progress' as AppFeature, label: 'My Progress', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg> },
    { feature: 'team-dashboard' as AppFeature, label: 'Team Dashboard', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.5-2.962A3.75 3.75 0 0112 15v-2.25a3.75 3.75 0 013.75-3.75V8.25a3.75 3.75 0 01-7.5 0v2.25a3.75 3.75 0 013.75 3.75z" /></svg>, proOnly: true },
    { feature: 'live-mic' as AppFeature, label: 'Live Transcribe', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 016 0v8.25a3 3 0 01-3 3z" /></svg> },
    { feature: 'video-generator' as AppFeature, label: 'Video Generator', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" /></svg> },
    { feature: 'chat-assistant' as AppFeature, label: 'Chat Assistant', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.76 9.76 0 01-2.53-.388m-5.383-.951a.75.75 0 00-.227.75c.062.43.235.85.445 1.25.21.401.448.79.71 1.154l.113.152c.262.35.626.652 1.006.878m7.158-2.428a3.75 3.75 0 00-5.303-5.303m0 0a3.75 3.75 0 00-5.304 5.303" /></svg> },
  ];

  const settingsNav = [
    { feature: 'billing' as AppFeature, label: 'Billing', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h6m-6 2.25h6M2.25 19.5h19.5a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0021.75 4.5H2.25a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 002.25 19.5z" /></svg> },
    { feature: 'referrals' as AppFeature, label: 'Referrals', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.562L16.25 22.5l-.648-1.938a3.375 3.375 0 00-2.672-2.672L11.25 18l1.938-.648a3.375 3.375 0 002.672-2.672L16.25 13.5l.648 1.938a3.375 3.375 0 002.672 2.672L21.75 18l-1.938.648a3.375 3.375 0 00-2.672 2.672z" /></svg> },
    { feature: 'developer-settings' as AppFeature, label: 'Developer API', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg> },
  ];

  const sidebarContent = (
    <>
      <div className="flex items-center justify-center h-20 shadow-md">
        <h1 className="text-2xl font-bold">
          <span className="text-slate-100">fourdoorai</span>
          <span className="text-emerald-400"> call agent</span>
        </h1>
      </div>
      <nav className="flex-1 px-4 py-6">
        <h2 className="px-3 mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">Features</h2>
        <ul>
          {navItems.map(item => (
            <NavItem 
              key={item.feature}
              feature={item.feature}
              label={item.label}
              icon={item.icon}
              isActive={activeFeature === item.feature}
              onClick={() => handleItemClick(item.feature)}
              disabled={item.proOnly && userPlan !== 'enterprise' && userPlan !== 'pro'}
              isPro={item.proOnly}
            />
          ))}
        </ul>
        <h2 className="px-3 mt-8 mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">Account</h2>
        <ul>
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
      </nav>
      <div className="p-4 border-t border-slate-700">
        <div className="bg-slate-700 rounded-lg p-4 text-center">
            <h4 className="font-bold text-white">Upgrade to Pro</h4>
            <p className="text-sm text-slate-300 mt-1 mb-3">Unlock advanced features and get unlimited access.</p>
            <button onClick={() => handleItemClick('billing')} className="w-full bg-violet-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-violet-700 transition">
                Upgrade Plan
            </button>
        </div>
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
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/50 z-20 lg:hidden"
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed top-0 left-0 h-full w-64 bg-slate-800 flex flex-col z-30"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:z-10 bg-slate-800 text-white">
        {sidebarContent}
      </div>
    </>
  );
};

export default Sidebar;