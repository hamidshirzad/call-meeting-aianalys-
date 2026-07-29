import React from 'react';
import { DiarizedSegment } from '../types';
import SkeletonLoader from './SkeletonLoader';

interface TranscriptionDisplayProps {
  transcript: DiarizedSegment[];
  isLoading: boolean;
  speakerALabel?: string; // New prop for custom Speaker A label
  speakerBLabel?: string; // New prop for custom Speaker B label
  highlightedSegmentIndex: number | null; // New prop for highlighting
}

const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({ 
  transcript, 
  isLoading,
  speakerALabel,
  speakerBLabel,
  highlightedSegmentIndex, // Destructure new prop
}) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg">
        <SkeletonLoader className="h-6 w-1/3 mb-4" />
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i}>
              <SkeletonLoader className="h-4 w-1/4 mb-2" />
              <SkeletonLoader className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (transcript.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg text-center text-gray-500 h-96 flex items-center justify-center">
        No transcript available. Upload an audio file to begin.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg max-h-96 overflow-y-auto custom-scrollbar">
      <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Diarized Transcript</h3>
      {transcript.map((segment, index) => {
        let displaySpeaker = segment.speaker;
        if (segment.speaker === 'Speaker A' && speakerALabel) {
          displaySpeaker = speakerALabel;
        } else if (segment.speaker === 'Speaker B' && speakerBLabel) {
          displaySpeaker = speakerBLabel;
        }

        // Apply highlighting class if current segment matches highlightedSegmentIndex
        const segmentClasses = `mb-2 p-2 rounded-md transition-colors duration-200 ${
          index === highlightedSegmentIndex ? 'bg-yellow-200 dark:bg-yellow-700/50' : ''
        }`;

        return (
          <div key={index} className={segmentClasses}>
            <p className="font-bold text-indigo-600 dark:text-indigo-400">{displaySpeaker}:</p>
            <p className="ml-4 text-gray-700 dark:text-slate-300">{segment.text}</p>
          </div>
        );
      })}
    </div>
  );
};

export default TranscriptionDisplay;