import React, { useState, useRef, useCallback, useEffect } from 'react';
import { SalesCallAnalysisReport, UserDetails } from '../types';
import { geminiService } from '../services/geminiService';
import TranscriptionDisplay from './TranscriptionDisplay';
import SentimentGraph from './SentimentGraph';
import CoachingCard from './CoachingCard';
import CallSummary from './CallSummary';
import TipOfTheDay from './TipOfTheDay';
import GamificationStats from './GamificationStats';
import { motion } from 'framer-motion';

interface SalesCoachingDashboardProps {
    analysisReport: SalesCallAnalysisReport | null;
    setAnalysisReport: (report: SalesCallAnalysisReport | null) => void;
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;
    user: UserDetails;
    setActiveFeature: (feature: 'billing') => void;
}

const SalesCoachingDashboard: React.FC<SalesCoachingDashboardProps> = ({ analysisReport, setAnalysisReport, isLoading, setIsLoading, user, setActiveFeature }) => {
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const isFreeTier = user.plan === 'free';
  const weeklyAnalysisLimit = 5;
  const analysesThisWeek = parseInt(localStorage.getItem('analysesThisWeekCount') || '0', 10);
  const limitReached = isFreeTier && analysesThisWeek >= weeklyAnalysisLimit;

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

    setIsLoading(true);
    setError(null);
    setAnalysisReport(null);
    setHighlightedSegmentIndex(null);
    setSegmentStartTimes([]);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      reader.onloadend = async () => {
        if (typeof reader.result === 'string') {
          const base64Audio = reader.result.split(',')[1];
          const reportData = await geminiService.analyzeSalesCallAudio(base64Audio);
          const fullReport: SalesCallAnalysisReport = {
              ...reportData,
              id: `call_${new Date().getTime()}`,
              timestamp: new Date().toISOString(),
          };
          setAnalysisReport(fullReport);
          // This would be done in App.tsx now to update global state
          // localStorage.setItem('analysesThisWeekCount', (analysesThisWeek + 1).toString());
        } else throw new Error("Failed to read audio file.");
      };
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      setAnalysisReport(null);
    } finally {
      setIsLoading(false);
    }
  }, [selectedFile, setIsLoading, setAnalysisReport, limitReached]);

  useEffect(() => {
    if (audioRef.current && analysisReport && audioRef.current.readyState >= 2) {
      calculateSegmentStartTimes();
    }
  }, [analysisReport, calculateSegmentStartTimes]);
  
  const kpis = React.useMemo(() => {
    if (!analysisReport) return null;
    const avgSentiment = analysisReport.sentimentData.length > 0 ? analysisReport.sentimentData.reduce((acc, d) => acc + d.score, 0) / analysisReport.sentimentData.length : 0;
    return [
        { label: 'Avg. Sentiment', value: avgSentiment.toFixed(2), change: null },
        { label: 'Strengths Identified', value: analysisReport.coachingCard.strengths.length, change: null },
        { label: 'Opportunities Found', value: analysisReport.coachingCard.opportunities.length, change: null },
    ];
  }, [analysisReport]);

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
       {isFreeTier && analysesThisWeek >= 4 && (
            <div className="bg-yellow-100 dark:bg-yellow-900/50 border-l-4 border-yellow-500 text-yellow-800 dark:text-yellow-200 p-4 mb-6 rounded-r-lg shadow-md">
                <p className="font-bold">Usage Limit Warning</p>
                <p>You have used {analysesThisWeek} of your {weeklyAnalysisLimit} weekly analyses. <button onClick={() => setActiveFeature('billing')} className="font-bold underline hover:text-yellow-600 dark:hover:text-yellow-100">Upgrade to Pro</button> for unlimited analyses.</p>
            </div>
        )}
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <TipOfTheDay />
            <GamificationStats />
        </div>
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mb-8 transition-shadow hover:shadow-xl">
        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Upload Sales Call</h3>
        <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
          <input type="file" accept="audio/*" onChange={handleFileChange} ref={fileInputRef} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="w-full sm:w-auto px-6 py-3 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all">
            Select Audio File
          </button>
          {selectedFile && <span className="text-slate-600 dark:text-slate-400 truncate max-w-xs">{selectedFile.name}</span>}
          <button onClick={analyzeCall} disabled={!selectedFile || isLoading || limitReached} className="w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white font-medium rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            {isLoading ? 'Analyzing...' : (limitReached ? 'Weekly Limit Reached' : 'Analyze Call')}
          </button>
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
                    <h4 className="text-slate-500 dark:text-slate-400 text-sm font-medium">{kpi.label}</h4>
                    <p className="text-4xl font-bold text-slate-800 dark:text-slate-100 mt-1">{kpi.value}</p>
                </motion.div>
            ))}
        </div>
      }

      <CallSummary summary={analysisReport?.summary || null} isLoading={isLoading} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <TranscriptionDisplay transcript={analysisReport?.diarizedTranscript || []} isLoading={isLoading} speakerALabel={speakerALabel} speakerBLabel={speakerBLabel} highlightedSegmentIndex={highlightedSegmentIndex} />
        <SentimentGraph sentimentData={analysisReport?.sentimentData || []} isLoading={isLoading} thresholds={sentimentThresholds} />
      </div>
      <CoachingCard coachingCard={analysisReport?.coachingCard || null} isLoading={isLoading} />
    </div>
  );
};

export default SalesCoachingDashboard;
