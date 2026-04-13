import React, { useRef, useEffect } from 'react';
import { DiarizedSegment } from '../types';
import { motion } from 'framer-motion';

interface TranscriptionDisplayProps {
  transcript: DiarizedSegment[];
  isLoading: boolean;
  speakerALabel?: string;
  speakerBLabel?: string;
  highlightedSegmentIndex: number | null;
}

const SPEAKER_THEMES = {
  A: {
    bubble: 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40',
    label:  'text-indigo-600 dark:text-indigo-400',
    avatar: 'bg-gradient-to-br from-indigo-500 to-violet-500',
    align:  'items-start',
    bubbleRounded: 'rounded-tl-sm rounded-tr-2xl rounded-br-2xl rounded-bl-2xl',
  },
  B: {
    bubble: 'bg-slate-100 dark:bg-slate-700/50 border border-slate-200/60 dark:border-slate-600/40',
    label:  'text-slate-500 dark:text-slate-400',
    avatar: 'bg-gradient-to-br from-teal-400 to-cyan-500',
    align:  'items-end',
    bubbleRounded: 'rounded-tl-2xl rounded-tr-sm rounded-br-2xl rounded-bl-2xl',
  },
};

const SkeletonBubble = ({ side }: { side: 'left' | 'right' }) => (
  <div className={`flex gap-2.5 ${side === 'right' ? 'flex-row-reverse' : ''}`}>
    <div className="w-7 h-7 rounded-full flex-shrink-0 shimmer" />
    <div className="max-w-[75%] space-y-1.5">
      <div className="h-3 w-16 rounded shimmer" />
      <div className={`h-12 w-48 rounded-2xl shimmer ${side === 'right' ? 'rounded-tr-sm' : 'rounded-tl-sm'}`} />
    </div>
  </div>
);

const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({
  transcript,
  isLoading,
  speakerALabel = 'Salesperson',
  speakerBLabel = 'Customer',
  highlightedSegmentIndex,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to highlighted segment during playback
  useEffect(() => {
    if (highlightedSegmentIndex !== null && scrollRef.current) {
      const el = scrollRef.current.querySelector(`[data-index="${highlightedSegmentIndex}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [highlightedSegmentIndex]);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card p-5">
        <div className="h-5 w-40 bg-slate-200 dark:bg-slate-700 rounded shimmer mb-5" />
        <div className="space-y-5">
          <SkeletonBubble side="left" />
          <SkeletonBubble side="right" />
          <SkeletonBubble side="left" />
          <SkeletonBubble side="right" />
          <SkeletonBubble side="left" />
        </div>
      </div>
    );
  }

  if (transcript.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card p-10 text-center flex flex-col items-center justify-center h-96">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
          </svg>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">No transcript yet. Upload an audio file to begin.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card flex flex-col" style={{ maxHeight: '520px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-700/60 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Diarized Transcript</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            {speakerALabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal-500" />
            {speakerBLabel}
          </span>
        </div>
      </div>

      {/* Scrollable transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {transcript.map((segment, index) => {
          const isA = segment.speaker === 'Speaker A';
          const theme = isA ? SPEAKER_THEMES.A : SPEAKER_THEMES.B;
          const label = isA ? speakerALabel : speakerBLabel;
          const isHighlighted = index === highlightedSegmentIndex;

          return (
            <motion.div
              key={index}
              data-index={index}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.03, 0.4), duration: 0.2 }}
              className={`flex gap-2.5 ${theme.align} ${isA ? '' : 'flex-row-reverse'}`}
            >
              {/* Speaker avatar */}
              <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold shadow-sm ${theme.avatar}`}>
                {label.charAt(0).toUpperCase()}
              </div>

              {/* Bubble */}
              <div className="max-w-[78%]">
                <p className={`text-[11px] font-semibold mb-1 ${theme.label} ${isA ? 'text-left' : 'text-right'}`}>
                  {label}
                </p>
                <div
                  className={`
                    px-3.5 py-2.5 text-sm leading-relaxed transition-all duration-200
                    ${theme.bubble} ${theme.bubbleRounded}
                    ${isHighlighted
                      ? 'ring-2 ring-yellow-400 dark:ring-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700/40 scale-[1.01]'
                      : ''}
                  `}
                >
                  <p className="text-slate-700 dark:text-slate-200">{segment.text}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default TranscriptionDisplay;
