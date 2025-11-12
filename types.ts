// Represents a segment of the call for diarization
export interface DiarizedSegment {
  speaker: string;
  text: string;
}

// Represents a sentiment score at a specific time (or segment index)
export interface SentimentData {
  segmentIndex: number; // Or time in seconds
  score: number; // e.g., -1 for negative, 0 for neutral, 1 for positive
}

// Represents the AI-generated coaching insights
export interface CoachingCardData {
  strengths: string[];
  opportunities: string[];
}

// Full analysis report structure
export interface SalesCallAnalysisReport {
  id: string; // Unique ID for the analysis
  timestamp: string; // ISO string of when it was analyzed
  diarizedTranscript: DiarizedSegment[];
  sentimentData: SentimentData[];
  coachingCard: CoachingCardData;
  summary: string;
}

export type AppFeature = 'sales-coaching' | 'live-mic' | 'video-generator' | 'chat-assistant' | 'my-progress' | 'developer-settings' | 'billing' | 'referrals' | 'team-dashboard';

// Type for chat messages
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

// Type for in-app notifications
export interface AppNotification {
  id: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: 'info' | 'success' | 'warning';
}

// Type for gamification stats
export interface GamificationState {
  streak: number;
  analysesThisWeek: number;
  badges: string[];
  referrals: number;
  apiCredits: number;
}

// --- NEW Monetization & SaaS Types ---

export type SubscriptionPlan = 'free' | 'pro' | 'enterprise';

export interface PlanDetails {
    name: string;
    price: string;
    features: string[];
    analysisLimit: number | 'unlimited';
    apiQuota: number;
}

export interface ApiKey {
    key: string;
    label: string;
    createdAt: string;
    usage: number;
    isActive: boolean;
}

export interface ApiUsageStats {
    callsThisMonth: number;
    quota: number;
    resetDate: string;
}

export interface UserDetails {
    id: string;
    name: string;
    email: string;
    plan: SubscriptionPlan;
    subscriptionEndDate: string;
    apiKeys: ApiKey[];
    usage: ApiUsageStats;
}
