import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useStatsigClient } from '@statsig/react-bindings';
import { SalesCallAnalysisReport, UserDetails, AppFeature } from '../types';
import { geminiService } from '../services/geminiService';
import TranscriptionDisplay from './TranscriptionDisplay';
import SentimentGraph from './SentimentGraph';
import CoachingCard from './CoachingCard';
import CallSummary from './CallSummary';
import TipOfTheDay from './TipOfTheDay';
import GamificationStats from './GamificationStats';
import { motion, AnimatePresence } from 'framer-motion';
import Tooltip from './Tooltip';

interface SalesCoachingDashboardProps {
    analysisReport: SalesCallAnalysisReport | null;
    setAnalysisReport: (report: SalesCallAnalysisReport | null) => void;
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;
    user: UserDetails;
    setUser: (user: UserDetails) => void;
    setActiveFeature: (feature: AppFeature) => void;
}

const KpiCard: React.FC<{
    label: string;
    value: string | number;
    icon: React.ReactNode;
    color: string;
    tooltip: string;
    delay?: number;
}> = ({ label, value, icon, color, tooltip, delay = 0 }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.3 }}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-card p-5 flex items-center gap-4 hover:shadow-card-hover transition-shadow"
    >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
            {icon}
        </div>
        <div className="min-w-0">
            <Tooltip text={tooltip}>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{label}</p>
            </Tooltip>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 tabular-nums">{value}</p>
        </div>
    </motion.div>
);

const SalesCoachingDashboard: React.FC<SalesCoachingDashboardProps> = ({ analysisReport, setAnalysisReport, isLoading, setIsLoading, user, setUser, setActiveFeature }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [speakerALabel] = useState<string>('Salesperson');
  const [speakerBLabel] = useState<string>('Customer');
  const [highlightedSegmentIndex, setHighlightedSegmentIndex] = useState<number | null>(null);
  const [segmentStartTimes, setSegmentStartTimes] = useState<number[]>([]);
  const [sentimentThresholds, setSentimentThresholds] = useState({ negative: -0.3, positive: 0.3 });

  const [emailBannerDismissed, setEmailBannerDismissed] = useState(() => sessionStorage.getItem('emailBannerDismissed') === 'true');
  const [emailInput, setEmailInput] = useState('');
  const showEmailBanner = user.email === 'user@example.com' && !emailBannerDismissed;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { client } = useStatsigClient();

  const isFreeTier = user.plan === 'free' && !user.customApiKey;
  const weeklyAnalysisLimit = 5;
  const analysesThisWeek = parseInt(localStorage.getItem('analysesThisWeekCount') || '0', 10);
  const limitReached = isFreeTier && analysesThisWeek >= weeklyAnalysisLimit;

  const handleDismissBanner = () => {
    sessionStorage.setItem('emailBannerDismissed', 'true');
    setEmailBannerDismissed(true);
  };

  const handleSaveEmail = () => {
    if (emailInput.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) {
      const name = emailInput.split('@')[0]
        .replace(/[\._-]/g, ' ')
        .split(' ')
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
      setUser({ ...user, email: emailInput, name });
      handleDismissBanner();
    }
  };

  useEffect(() => {
    return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); };
  }, [audioUrl]);

  const processFile = (file: File) => {
    setSelectedFile(file);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(file));
    setAnalysisReport(null);
    setError(null);
    setHighlightedSegmentIndex(null);
    setSegmentStartTimes([]);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.[0]) processFile(event.target.files[0]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      processFile(file);
    } else if (file) {
      setError('Please drop an audio file (e.g. .mp3, .wav, .webm).');
    }
  };

  const calculateSegmentStartTimes = useCallback(() => {
    if (!audioRef.current || !analysisReport || analysisReport.diarizedTranscript.length === 0) {
      setSegmentStartTimes([]);
      return;
    }
    const dur = audioRef.current.duration;
    if (isNaN(dur) || dur === 0) return;
    const wc = analysisReport.diarizedTranscript.map(s => s.text.split(/\s+/).filter(Boolean).length);
    const total = wc.reduce((a, c) => a + c, 0);
    if (total === 0) return;
    let t = 0;
    setSegmentStartTimes(wc.map(c => { const s = t; t += (c / total) * dur; return s; }));
  }, [analysisReport]);

  const handleAudioTimeUpdate = useCallback(() => {
    if (!audioRef.current || segmentStartTimes.length === 0) return;
    const ct = audioRef.current.currentTime;
    const idx = segmentStartTimes.findIndex((t, i) =>
      ct >= t && (i === segmentStartTimes.length - 1 || ct < segmentStartTimes[i + 1])
    );
    setHighlightedSegmentIndex(idx > -1 ? idx : null);
  }, [segmentStartTimes]);

  const analyzeCall = useCallback(async () => {
    if (!selectedFile || limitReached) return;
    client.logEvent('analyze_call_clicked', 1, { fileName: selectedFile.name, fileType: selectedFile.type });
    setIsLoading(true);
    setError(null);
    setAnalysisReport(null);
    setHighlightedSegmentIndex(null);
    setSegmentStartTimes([]);
    try {
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(selectedFile);
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result.split(',')[1]);
          else reject(new Error('Failed to read audio file.'));
        };
        reader.onerror = (e) => reject(e);
      });
      const reportData = await geminiService.analyzeSalesCallAudio(base64Audio, selectedFile.type, user.customApiKey);
      setAnalysisReport({ ...reportData, id: `call_${Date.now()}`, timestamp: new Date().toISOString() });
    } catch (err: any) {
      console.error('Analysis failed:', err);
      let msg = 'An internal error occurred. Please try again.';
      if (err?.message) {
        try { msg = JSON.parse(err.message)?.error?.message || err.message; }
        catch { msg = err.message; }
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [selectedFile, setIsLoading, setAnalysisReport, limitReached, user.customApiKey, client]);

  useEffect(() => {
    if (audioRef.current && analysisReport && audioRef.current.readyState >= 2) calculateSegmentStartTimes();
  }, [analysisReport, calculateSegmentStartTimes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!isLoading && selectedFile) analyzeCall();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [analyzeCall, isLoading, selectedFile]);

  const kpis = React.useMemo(() => {
    if (!analysisReport) return null;
    const avg = analysisReport.sentimentData.length > 0
      ? analysisReport.sentimentData.reduce((a, d) => a + d.score, 0) / analysisReport.sentimentData.length
      : 0;
    const avgLabel = avg <= sentimentThresholds.negative ? 'Negative' : avg >= sentimentThresholds.positive ? 'Positive' : 'Neutral';
    return [
      { label: 'Avg. Sentiment', value: avg.toFixed(2), sub: avgLabel, tooltip: 'Average sentiment score across all call segments (-1 = negative, +1 = positive).', color: avg >= sentimentThresholds.positive ? 'bg-emerald-100 dark:bg-emerald-900/40' : avg <= sentimentThresholds.negative ? 'bg-red-100 dark:bg-red-900/40' : 'bg-slate-100 dark:bg-slate-700/60', iconColor: avg >= sentimentThresholds.positive ? 'text-emerald-600 dark:text-emerald-400' : avg <= sentimentThresholds.negative ? 'text-red-600 dark:text-red-400' : 'text-slate-500', icon: (<svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" /></svg>) },
      { label: 'Strengths Found', value: analysisReport.coachingCard.strengths.length, sub: 'positive behaviours', tooltip: 'Number of positive sales techniques identified by the AI coach.', color: 'bg-violet-100 dark:bg-violet-900/40', iconColor: 'text-violet-600 dark:text-violet-400', icon: (<svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>) },
      { label: 'Opportunities', value: analysisReport.coachingCard.opportunities.length, sub: 'areas to improve', tooltip: 'Number of improvement areas and missed opportunities identified by the AI coach.', color: 'bg-amber-100 dark:bg-amber-900/40', iconColor: 'text-amber-600 dark:text-amber-400', icon: (<svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>) },
    ];
  }, [analysisReport, sentimentThresholds]);

  const analyzeButtonText = isLoading ? 'Analyzing…' : limitReached ? 'Limit Reached' : 'Analyze Call';
  const canAnalyze = !!selectedFile && !isLoading && !limitReached;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Welcome back, <span className="gradient-text">{user.name.split(' ')[0]}</span>!
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Upload a call recording to get AI-powered coaching insights.</p>
      </div>

      {/* Email personalisation banner */}
      <AnimatePresence>
        {showEmailBanner && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700/50 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3"
          >
            <div>
              <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">Personalize your experience</p>
              <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">Add your email to unlock a personalized greeting and stay updated.</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="email"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveEmail()}
                placeholder="you@example.com"
                className="flex-1 sm:w-56 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button onClick={handleSaveEmail} className="px-3 py-1.5 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">Save</button>
              <button onClick={handleDismissBanner} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-800/50 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Free tier CTA */}
      {isFreeTier && (
        <div className="bg-gradient-to-r from-teal-500 to-emerald-600 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-glow-emerald">
          <div>
            <h3 className="font-bold text-white">Unlock unlimited analyses</h3>
            <p className="text-sm text-teal-100 mt-0.5">Add your own Google Gemini API key to bypass weekly limits and access all Pro features.</p>
          </div>
          <button onClick={() => setActiveFeature('developer-settings')} className="flex-shrink-0 bg-white text-emerald-700 font-bold py-2 px-5 rounded-lg shadow hover:bg-emerald-50 transition-all hover:scale-105 text-sm">
            Add API Key
          </button>
        </div>
      )}

      {/* Usage warning */}
      {isFreeTier && analysesThisWeek >= 4 && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 px-4 py-3.5 rounded-xl">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div className="text-sm">
            <span className="font-semibold text-amber-800 dark:text-amber-300">Usage warning: </span>
            <span className="text-amber-700 dark:text-amber-400">{analysesThisWeek}/{weeklyAnalysisLimit} analyses used this week. </span>
            <button onClick={() => setActiveFeature('billing')} className="font-semibold underline text-amber-800 dark:text-amber-300 hover:opacity-75 transition-opacity">Upgrade to Pro</button>
          </div>
        </div>
      )}

      {/* Tip + Gamification */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <TipOfTheDay user={user} />
        <GamificationStats />
      </div>

      {/* ─── Upload Card ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card p-5">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          New Analysis
        </h2>

        {/* Drop zone */}
        <input type="file" accept="audio/*" onChange={handleFileChange} ref={fileInputRef} className="hidden" />
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200 p-6 text-center
            ${isDragOver
              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 drop-zone-active'
              : selectedFile
                ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10 dark:border-emerald-700/60'
                : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10'
            }
          `}
        >
          {selectedFile ? (
            <div className="flex items-center justify-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate max-w-xs">{selectedFile.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · click to change</p>
              </div>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className={`w-6 h-6 ${isDragOver ? 'text-indigo-500' : 'text-slate-400'} transition-colors`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {isDragOver ? 'Drop your audio file here' : 'Drag & drop an audio file, or click to browse'}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">MP3, WAV, M4A, WebM — up to 50 MB</p>
            </>
          )}
        </div>

        {/* Audio player */}
        <AnimatePresence>
          {audioUrl && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden"
            >
              <audio
                controls
                src={audioUrl}
                className="w-full rounded-lg h-10"
                ref={audioRef}
                onTimeUpdate={handleAudioTimeUpdate}
                onEnded={() => setHighlightedSegmentIndex(null)}
                onLoadedMetadata={calculateSegmentStartTimes}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mt-4">
          <Tooltip text={
            limitReached ? "Weekly analysis limit reached. Upgrade to Pro for unlimited analyses."
            : isLoading ? "Analysis in progress…"
            : !selectedFile ? "Select or drop an audio file first."
            : "Analyze this call with AI  ·  Shortcut: Ctrl/Cmd+S"
          }>
            <button
              onClick={analyzeCall}
              disabled={!canAnalyze}
              className={`
                flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold
                transition-all duration-200 shadow-sm
                ${canAnalyze
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-glow-indigo focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                }
              `}
            >
              {isLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  {analyzeButtonText}
                </>
              )}
            </button>
          </Tooltip>

          <span className="text-xs font-medium text-slate-400">or</span>

          <Tooltip text="Start a live call using your microphone for real-time transcription and analysis.">
            <button
              onClick={() => setActiveFeature('live-mic')}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-glow-emerald transition-all duration-200 shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
              Start Live Call
            </button>
          </Tooltip>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 px-4 py-3 rounded-xl"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── KPI Cards ─────────────────────────────────────────── */}
      <AnimatePresence>
        {(isLoading || (analysisReport && kpis)) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-white dark:bg-slate-800 rounded-xl shadow-card p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl shimmer flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-24 rounded shimmer" />
                      <div className="h-7 w-16 rounded shimmer" />
                    </div>
                  </div>
                ))
              : kpis?.map((kpi, i) => (
                  <KpiCard
                    key={kpi.label}
                    label={kpi.label}
                    value={kpi.value}
                    icon={<span className={kpi.iconColor}>{kpi.icon}</span>}
                    color={kpi.color}
                    tooltip={kpi.tooltip}
                    delay={i * 0.08}
                  />
                ))
            }
          </div>
        )}
      </AnimatePresence>

      {/* ─── Summary ──────────────────────────────────────────── */}
      <CallSummary summary={analysisReport?.summary || null} isLoading={isLoading} />

      {/* ─── Sentiment Customizer ─────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Sentiment Thresholds</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          <div>
            <label htmlFor="negativeThreshold" className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              <span>Negative boundary</span>
              <span className="font-bold text-red-500">{sentimentThresholds.negative.toFixed(2)}</span>
            </label>
            <input id="negativeThreshold" name="negative" type="range" min="-1" max="0" step="0.05"
              value={sentimentThresholds.negative}
              onChange={e => {
                const v = parseFloat(e.target.value);
                if (v < sentimentThresholds.positive) setSentimentThresholds(p => ({ ...p, negative: v }));
              }}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-red-500 bg-slate-200 dark:bg-slate-700 slider-thumb-red"
            />
          </div>
          <div>
            <label htmlFor="positiveThreshold" className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              <span>Positive boundary</span>
              <span className="font-bold text-emerald-500">{sentimentThresholds.positive.toFixed(2)}</span>
            </label>
            <input id="positiveThreshold" name="positive" type="range" min="0" max="1" step="0.05"
              value={sentimentThresholds.positive}
              onChange={e => {
                const v = parseFloat(e.target.value);
                if (v > sentimentThresholds.negative) setSentimentThresholds(p => ({ ...p, positive: v }));
              }}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-emerald-500 bg-slate-200 dark:bg-slate-700 slider-thumb-green"
            />
          </div>
        </div>
      </div>

      {/* ─── Transcript + Sentiment ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TranscriptionDisplay
          transcript={analysisReport?.diarizedTranscript || []}
          isLoading={isLoading}
          speakerALabel={speakerALabel}
          speakerBLabel={speakerBLabel}
          highlightedSegmentIndex={highlightedSegmentIndex}
        />
        <SentimentGraph
          sentimentData={analysisReport?.sentimentData || []}
          isLoading={isLoading}
          thresholds={sentimentThresholds}
        />
      </div>

      {/* ─── Coaching Card ───────────────────────────────────── */}
      <CoachingCard coachingCard={analysisReport?.coachingCard || null} isLoading={isLoading} />
    </div>
  );
};

export default SalesCoachingDashboard;
