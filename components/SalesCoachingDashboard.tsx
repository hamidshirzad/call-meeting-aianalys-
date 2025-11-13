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
import { motion } from 'framer-motion';
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

const SalesCoachingDashboard: React.FC<SalesCoachingDashboardProps> = ({ analysisReport, setAnalysisReport, isLoading, setIsLoading, user, setUser, setActiveFeature }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speakerALabel, setSpeakerALabel] = useState<string>('Salesperson');
  const [speakerBLabel, setSpeakerBLabel] = useState<string>('Customer');
  const [highlightedSegmentIndex, setHighlightedSegmentIndex] = useState<number | null>(null);
  const [segmentStartTimes, setSegmentStartTimes] = useState<number[]>([]);
  const [sentimentThresholds, setSentimentThresholds] = useState({
    negative: -0.3,
    positive: 0.3,
  });

  const [emailBannerDismissed, setEmailBannerDismissed] = useState(() => sessionStorage.getItem('emailBannerDismissed') === 'true');
  const [emailInput, setEmailInput] = useState('');
  const showEmailBanner = user.email === 'user@example.com' && !emailBannerDismissed;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { client } = useStatsigClient();
  
  const isFreeTier = user.plan === 'free' && !user.customApiKey; // Free tier only applies if no custom key
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
              .map(part => part.charAt(0).toUpperCase() + part.slice(1))
              .join(' ');
          setUser({ ...user, email: emailInput, name: name });
          handleDismissBanner();
      }
  };

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedFile(file);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(file));
      setAnalysisReport(null); // Clear previous report
      setError(null);
      setHighlightedSegmentIndex(null);
      setSegmentStartTimes([]);
    }
  };

  const calculateSegmentStartTimes = useCallback(() => {
    if (!audioRef.current || !analysisReport || analysisReport.diarizedTranscript.length === 0) {
      setSegmentStartTimes([]);
      return;
    }
    const totalAudioDuration = audioRef.current.duration;
    if (isNaN(totalAudioDuration) || totalAudioDuration === 0) return;

    const transcript = analysisReport.diarizedTranscript;
    const wordCounts = transcript.map(segment => segment.text.split(/\s+/).filter(Boolean).length);
    const totalWords = wordCounts.reduce((sum, count) => sum + count, 0);
    if (totalWords === 0) return;
    
    let currentTime = 0;
    const times = transcript.map((_, i) => {
        const time = currentTime;
        currentTime += (wordCounts[i] / totalWords) * totalAudioDuration;
        return time;
    });
    setSegmentStartTimes(times);
  }, [analysisReport]);

  const handleAudioTimeUpdate = useCallback(() => {
    if (!audioRef.current || segmentStartTimes.length === 0) return;
    const currentTime = audioRef.current.currentTime;
    const currentSegment = segmentStartTimes.findIndex((time, i) => 
        currentTime >= time && (i === segmentStartTimes.length - 1 || currentTime < segmentStartTimes[i + 1])
    );
    setHighlightedSegmentIndex(currentSegment > -1 ? currentSegment : null);
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
                if (typeof reader.result === 'string') {
                    resolve(reader.result.split(',')[1]);
                } else {
                    reject(new Error("Failed to read audio file."));
                }
            };
            reader.onerror = (error) => reject(error);
        });

        const reportData = await geminiService.analyzeSalesCallAudio(base64Audio, selectedFile.type, user.customApiKey);
        const fullReport: SalesCallAnalysisReport = {
            ...reportData,
            id: `call_${new Date().getTime()}`,
            timestamp: new Date().toISOString(),
        };
        setAnalysisReport(fullReport);

    } catch (err: any) {
        console.error("Analysis failed:", err);
        let message = "Internal error encountered."; // Default message
        
        if (err && typeof err.message === 'string') {
            try {
                // Attempt to parse a JSON error message from the API
                const errorPayload = JSON.parse(err.message);
                if (errorPayload?.error?.message) {
                    // Use the specific message from the API if available
                    message = errorPayload.error.message;
                }
            } catch (parseError) {
                // The error message was not a JSON string. We will fall back to the default.
            }
        }
        
        setError(`Analysis failed: ${message}`);
        setAnalysisReport(null);
    } finally {
        setIsLoading(false);
    }
  }, [selectedFile, setIsLoading, setAnalysisReport, limitReached, user.customApiKey, client]);

  useEffect(() => {
    if (audioRef.current && analysisReport && audioRef.current.readyState >= 2) {
      calculateSegmentStartTimes();
    }
  }, [analysisReport, calculateSegmentStartTimes]);
  
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        if (!isLoading && selectedFile) {
            analyzeCall();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [analyzeCall, isLoading, selectedFile]);

  const kpis = React.useMemo(() => {
    if (!analysisReport) return null;
    const avgSentiment = analysisReport.sentimentData.length > 0 ? analysisReport.sentimentData.reduce((acc, d) => acc + d.score, 0) / analysisReport.sentimentData.length : 0;
    return [
        { label: 'Avg. Sentiment', value: avgSentiment.toFixed(2), change: null },
        { label: 'Strengths Identified', value: analysisReport.coachingCard.strengths.length, change: null },
        { label: 'Opportunities Found', value: analysisReport.coachingCard.opportunities.length, change: null },
    ];
  }, [analysisReport]);
  
  const getKpiTooltip = (label: string): string => {
    switch (label) {
      case 'Avg. Sentiment':
        return "The average sentiment score across all segments of the call, from -1 (Negative) to 1 (Positive).";
      case 'Strengths Identified':
        return "The total number of positive sales techniques and actions identified by the AI.";
      case 'Opportunities Found':
        return "The total number of areas for improvement and missed opportunities identified by the AI.";
      default:
        return "";
    }
  };
  
  const analyzeButtonTooltipText = () => {
    if (limitReached) return "You have reached your weekly analysis limit on the free plan.";
    if (isLoading) return "Analysis is in progress...";
    if (!selectedFile) return "Please select an audio file first.";
    return "Start the AI analysis of the selected call. Shortcut: Ctrl/Cmd + S";
  };
  
  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numValue = parseFloat(value);
    
    if (name === 'negative') {
        // Ensure negative is always less than positive
        if (numValue < sentimentThresholds.positive) {
            setSentimentThresholds(prev => ({ ...prev, negative: numValue }));
        }
    } else if (name === 'positive') {
        // Ensure positive is always greater than negative
        if (numValue > sentimentThresholds.negative) {
            setSentimentThresholds(prev => ({ ...prev, positive: numValue }));
        }
    }
  };


  return (
    <div>
      <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-8">
          Welcome, {user.name}!
      </h2>
      {showEmailBanner && (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 p-4 rounded-lg shadow-md mb-8 flex flex-col sm:flex-row items-center justify-between gap-4"
        >
            <div className="flex-grow">
                <h4 className="font-bold text-indigo-800 dark:text-indigo-200">Personalize Your Experience</h4>
                <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-1">Enter your email for a personalized greeting and to unlock all features.</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0">
                <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEmail()}
                    placeholder="your.email@example.com"
                    className="w-full sm:w-64 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button onClick={handleSaveEmail} className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 transition-colors">
                    Save
                </button>
                <button onClick={handleDismissBanner} className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
        </motion.div>
      )}
       {isFreeTier && (
            <div className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white p-6 rounded-lg shadow-lg mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h3 className="font-bold text-xl">Unlock Full Access with Your Own API Key</h3>
                    <p className="text-teal-100 mt-1">Bypass weekly limits and get all Pro features by using your personal Google Gemini API key.</p>
                </div>
                <button 
                    onClick={() => setActiveFeature('developer-settings')}
                    className="bg-white text-emerald-700 font-bold py-2 px-5 rounded-lg shadow-md hover:bg-emerald-50 transition-transform transform hover:scale-105 flex-shrink-0"
                >
                    Add Your Key
                </button>
            </div>
        )}
       {isFreeTier && analysesThisWeek >= 4 && (
            <div className="bg-yellow-100 dark:bg-yellow-900/50 border-l-4 border-yellow-500 text-yellow-800 dark:text-yellow-200 p-4 mb-6 rounded-r-lg shadow-md">
                <p className="font-bold">Usage Limit Warning</p>
                <p>You have used {analysesThisWeek} of your {weeklyAnalysisLimit} weekly analyses. <button onClick={() => setActiveFeature('billing')} className="font-bold underline hover:text-yellow-600 dark:hover:text-yellow-100">Upgrade to Pro</button> for unlimited analyses.</p>
            </div>
        )}
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <TipOfTheDay user={user} />
            <GamificationStats />
        </div>
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mb-8 transition-shadow hover:shadow-xl">
        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Start a New Analysis</h3>
        <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="w-full md:flex-1">
                <input type="file" accept="audio/*" onChange={handleFileChange} ref={fileInputRef} className="hidden" />
                <Tooltip text="Click to select an audio file (e.g., MP3, WAV, M4A) from your device for analysis.">
                    <div 
                        onClick={() => fileInputRef.current?.click()} 
                        className="flex items-center justify-between w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm text-sm bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all cursor-pointer"
                    >
                        <span className="text-slate-500 dark:text-slate-400 truncate">
                            {selectedFile ? selectedFile.name : 'recording-2025-11-13T13_30_20.209Z.webm'}
                        </span>
                        <span className="ml-4 px-3 py-1 bg-slate-200 dark:bg-slate-600 rounded-md text-sm font-semibold text-slate-700 dark:text-slate-200 flex-shrink-0">
                            Select File
                        </span>
                    </div>
                </Tooltip>
            </div>
            <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto">
                <Tooltip text={analyzeButtonTooltipText()}>
                    <div className="flex-1 md:flex-none">
                        <button onClick={analyzeCall} disabled={!selectedFile || isLoading || limitReached} className="w-full px-6 py-3 bg-indigo-600 text-white font-medium rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                            {isLoading ? 'Analyzing...' : (limitReached ? 'Limit Reached' : 'Analyze Call')}
                        </button>
                    </div>
                </Tooltip>
                
                <span className="flex-shrink-0 mx-2 text-sm font-medium text-slate-400 dark:text-slate-500">OR</span>
                
                <Tooltip text="Start a live call using your microphone for real-time transcription and analysis.">
                    <div className="flex-1 md:flex-none">
                        <button 
                            onClick={() => setActiveFeature('live-mic')}
                            className="w-full px-6 py-3 bg-emerald-600 text-white font-medium rounded-md shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                            Start Live Call
                        </button>
                    </div>
                </Tooltip>
            </div>
        </div>
        {audioUrl && (
          <div className="mt-6"><h4 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">Listen to Call:</h4><audio controls src={audioUrl} className="w-full rounded-md shadow-sm" ref={audioRef} onTimeUpdate={handleAudioTimeUpdate} onEnded={() => setHighlightedSegmentIndex(null)} onLoadedMetadata={calculateSegmentStartTimes}></audio></div>
        )}
        {error && <p className="mt-4 text-red-500 text-center">{error}</p>}
      </div>

      { (isLoading || (analysisReport && kpis)) &&
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {isLoading ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg"><div className="h-6 w-1/2 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-2"></div><div className="h-10 w-1/4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div></div>
            )) : kpis?.map(kpi => (
                <motion.div key={kpi.label} initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}} className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg transition-shadow hover:shadow-xl">
                    <Tooltip text={getKpiTooltip(kpi.label)}>
                        <h4 className="text-slate-500 dark:text-slate-400 text-sm font-medium">{kpi.label}</h4>
                    </Tooltip>
                    <p className="text-3xl md:text-4xl font-bold text-slate-800 dark:text-slate-100 mt-1">{kpi.value}</p>
                </motion.div>
            ))}
        </div>
      }

      <CallSummary summary={analysisReport?.summary || null} isLoading={isLoading} />
      
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mb-8 transition-shadow hover:shadow-xl">
        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Customize Sentiment View</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div>
                <label htmlFor="negativeThreshold" className="flex justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
                    <span>Negative Threshold</span>
                    <span className="font-bold text-red-500">{sentimentThresholds.negative.toFixed(2)}</span>
                </label>
                <input
                    id="negativeThreshold"
                    name="negative"
                    type="range"
                    min="-1"
                    max="0"
                    step="0.05"
                    value={sentimentThresholds.negative}
                    onChange={handleThresholdChange}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 slider-thumb-red"
                />
            </div>
            <div>
                <label htmlFor="positiveThreshold" className="flex justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
                    <span>Positive Threshold</span>
                    <span className="font-bold text-emerald-500">{sentimentThresholds.positive.toFixed(2)}</span>
                </label>
                <input
                    id="positiveThreshold"
                    name="positive"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={sentimentThresholds.positive}
                    onChange={handleThresholdChange}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 slider-thumb-green"
                />
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <TranscriptionDisplay transcript={analysisReport?.diarizedTranscript || []} isLoading={isLoading} speakerALabel={speakerALabel} speakerBLabel={speakerBLabel} highlightedSegmentIndex={highlightedSegmentIndex} />
        <SentimentGraph sentimentData={analysisReport?.sentimentData || []} isLoading={isLoading} thresholds={sentimentThresholds} />
      </div>
      <CoachingCard coachingCard={analysisReport?.coachingCard || null} isLoading={isLoading} />
    </div>
  );
};

export default SalesCoachingDashboard;