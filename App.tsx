import React, { useState, useEffect, useCallback } from 'react';
import { AppFeature, SalesCallAnalysisReport, ChatMessage, AppNotification, GamificationState, UserDetails, SubscriptionPlan } from './types';
import SalesCoachingDashboard from './components/SalesCoachingDashboard';
import LiveMicTranscriber from './components/LiveMicTranscriber';
import VideoGenerator from './components/VideoGenerator';
import ChatAssistant from './components/ChatAssistant';
import MyProgress from './components/MyProgress';
import DeveloperSettings from './components/DeveloperSettings';
import BillingPage from './components/BillingPage';
import Referrals from './components/Referrals';
import TeamDashboard from './components/TeamDashboard';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocalStorage } from './hooks/useLocalStorage';

const App: React.FC = () => {
  const [activeFeature, setActiveFeature] = useLocalStorage<AppFeature>('app-feature', 'my-progress');
  const [isDarkMode, setIsDarkMode] = useLocalStorage('dark-mode', false);
  const [analysisReport, setAnalysisReport] = useLocalStorage<SalesCallAnalysisReport | null>('analysis-report', null);
  const [historicalAnalyses, setHistoricalAnalyses] = useLocalStorage<SalesCallAnalysisReport[]>('historical-analyses', []);
  const [chatMessages, setChatMessages] = useLocalStorage<ChatMessage[]>('chat-history', []);
  const [notifications, setNotifications] = useLocalStorage<AppNotification[]>('notifications', []);
  
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const initialUserDetails: UserDetails = {
    id: 'user_12345',
    name: 'Valued User',
    email: 'user@example.com',
    plan: 'free',
    subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    customApiKey: '',
    apiKeys: [{
        key: 'sk_live_free_user_key_00000',
        label: 'Default Key',
        createdAt: new Date().toISOString(),
        usage: 0,
        isActive: true
    }],
    usage: {
        callsThisMonth: 0,
        quota: 0,
        resetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
    }
  };

  const [user, setUser] = useLocalStorage<UserDetails>('user-details', initialUserDetails);
  
  const [analysesThisWeek, setAnalysesThisWeek] = useLocalStorage<number>('analysesThisWeekCount', 0);
  const [lastAnalysisDate, setLastAnalysisDate] = useLocalStorage<string>('lastAnalysisDate', '');
  
  const [gamification, setGamification] = useLocalStorage<GamificationState>('gamification', { 
    streak: 1, 
    analysesThisWeek: 0, 
    badges: [],
    referrals: 0,
    apiCredits: 0
  });

  // Grant Pro access if user provides their own key
  const effectivePlan = user.customApiKey ? 'pro' : user.plan;

  useEffect(() => {
    const today = new Date();
    const lastDate = lastAnalysisDate ? new Date(lastAnalysisDate) : new Date(0);
    const msSinceLast = today.getTime() - lastDate.getTime();
    const daysSinceLast = msSinceLast / (1000 * 3600 * 24);
    if (today.getDay() < lastDate.getDay() || daysSinceLast >= 7) {
        setAnalysesThisWeek(0);
    }
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [isSidebarOpen]);


  const handleSetAnalysisReport = useCallback((report: SalesCallAnalysisReport | null) => {
    setAnalysisReport(report);
    if (report) {
      const newHistorical = [report, ...historicalAnalyses.slice(0, 19)];
      setHistoricalAnalyses(newHistorical);

      setGamification(prev => ({ ...prev, streak: prev.streak + 1 }));
      
      if(user.plan === 'free' && !user.customApiKey) {
        const newCount = analysesThisWeek + 1;
        setAnalysesThisWeek(newCount);
        localStorage.setItem('analysesThisWeekCount', newCount.toString());
        setLastAnalysisDate(new Date().toISOString());
      }

      const newNotif = (message: string, type: 'success' | 'info' = 'success') => ({
          id: `notif_${Date.now()}`, message, timestamp: new Date().toISOString(), read: false, type
      });
      let newNotifications = [newNotif(`Analysis complete for call ${report.id.slice(-6)}.`)];

      if (newHistorical.length === 10 && !gamification.badges.includes('Analyst_10')) {
        setGamification(prev => ({ ...prev, badges: [...prev.badges, 'Analyst_10'], apiCredits: prev.apiCredits + 500 }));
        newNotifications.push(newNotif('Achievement Unlocked: Call Analyst! You earned 500 bonus API credits.', 'info'));
      }
      setNotifications(prev => [...newNotifications, ...prev]);

      const proactiveMessage: ChatMessage = {
          role: 'model',
          text: `I've finished analyzing your latest call. A key opportunity I found was: "${report.coachingCard.opportunities[0]}". Would you like me to elaborate on that?`
      };
      setChatMessages(prev => [...prev, proactiveMessage]);
    }
  }, [analysisReport, historicalAnalyses, setHistoricalAnalyses, setGamification, setNotifications, setChatMessages, user.plan, user.customApiKey, analysesThisWeek, setAnalysesThisWeek, setLastAnalysisDate, gamification.badges]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const renderFeatureComponent = (feature: AppFeature) => {
    switch (feature) {
      case 'sales-coaching':
        return <SalesCoachingDashboard 
                    analysisReport={analysisReport}
                    setAnalysisReport={handleSetAnalysisReport}
                    isLoading={isLoadingAnalysis}
                    setIsLoading={setIsLoadingAnalysis}
                    user={user}
                    setUser={setUser}
                    setActiveFeature={setActiveFeature as any}
                />;
      case 'live-mic':
        return <LiveMicTranscriber 
                    user={user}
                    setAnalysisReport={handleSetAnalysisReport}
                    setIsLoading={setIsLoadingAnalysis}
                    setActiveFeature={setActiveFeature as any}
                />;
      case 'video-generator':
        return <VideoGenerator user={user} />;
      case 'chat-assistant':
        return <ChatAssistant 
                    analysisContext={analysisReport} 
                    messages={chatMessages}
                    setMessages={setChatMessages}
                    user={user}
                    setActiveFeature={setActiveFeature as any}
                />;
      case 'my-progress':
        return <MyProgress historicalData={historicalAnalyses} />;
      case 'developer-settings':
        return <DeveloperSettings user={user} setUser={setUser} />;
      case 'billing':
        return <BillingPage user={user} setUser={setUser} />;
      case 'referrals':
        return <Referrals user={user} setGamification={setGamification} gamification={gamification} />;
      case 'team-dashboard':
        return <TeamDashboard user={user} setActiveFeature={setActiveFeature as any} />;
      default:
        return <SalesCoachingDashboard 
                    analysisReport={analysisReport}
                    setAnalysisReport={handleSetAnalysisReport}
                    isLoading={isLoadingAnalysis}
                    setIsLoading={setIsLoadingAnalysis}
                    user={user}
                    setUser={setUser}
                    setActiveFeature={setActiveFeature as any}
                />;
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-900">
      <Sidebar activeFeature={activeFeature} setActiveFeature={setActiveFeature} userPlan={effectivePlan} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
        <Header 
          isDarkMode={isDarkMode} 
          toggleDarkMode={toggleDarkMode} 
          notifications={notifications}
          setNotifications={setNotifications}
          user={user}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        />
        <main className="flex-grow overflow-y-auto custom-scrollbar p-4 sm:p-6 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeFeature}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="max-w-7xl mx-auto"
            >
              {renderFeatureComponent(activeFeature)}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default App;