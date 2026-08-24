export interface DiarizedSegment {
  speaker: string;
  text: string;
}

export interface SentimentData {
  segmentIndex: number;
  score: number;
}

export interface CoachingCardData {
  strengths: string[];
  opportunities: string[];
}

export interface SalesCallAnalysisReport {
  id: string;
  timestamp: string;
  diarizedTranscript: DiarizedSegment[];
  sentimentData: SentimentData[];
  coachingCard: CoachingCardData;
  summary: string;
}

export interface SavedAnalysisReport extends SalesCallAnalysisReport {
  fileName: string;
  durationSeconds: number | null;
}

export interface AnalysisUsageSummary {
  period: string;
  plan: 'free' | 'pro';
  completed: number;
  reserved: number;
  limit: number;
  remaining: number;
}
