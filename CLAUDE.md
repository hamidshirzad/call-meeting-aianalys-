# Sales Coaching Intelligence Platform - Development Guide

## Project Overview

**Sales Coaching Intelligence Platform** is a web-based application for analyzing sales calls through AI-powered insights. It provides diarization, sentiment analysis, transcription, and coaching feedback to help sales teams improve their performance.

### Key Features
- **Sales Call Analysis**: Upload or record audio and get AI-powered analysis
- **Live Transcription**: Real-time transcription with diarization (speaker identification)
- **Sentiment Analysis**: Visual sentiment graphs for call segments
- **Coaching Insights**: AI-generated strengths and opportunities
- **Chat Assistant**: Interactive AI-powered coaching conversations
- **Team Dashboard**: Track team performance and analytics
- **Gamification**: Streak tracking, badges, and progress metrics
- **Billing & API Keys**: SaaS model with free and pro tiers

---

## Architecture & Structure

### Monorepo Layout
```
call-meeting-aianalys-/
├── Frontend (React + Vite)
│   ├── components/          # React components (~25 feature components)
│   ├── hooks/              # Custom React hooks
│   ├── services/           # API integration and external services
│   ├── App.tsx             # Main app component
│   ├── index.tsx           # Entry point
│   ├── types.ts            # TypeScript interfaces
│   ├── flags.ts            # Feature flag configuration
│   └── vite.config.ts      # Vite build configuration
│
├── Backend API (Node.js/Express)
│   ├── api/
│   │   ├── routes/         # Express route handlers
│   │   ├── services/       # Business logic
│   │   ├── auth/           # Authentication logic
│   │   ├── db/             # Database utilities
│   │   ├── server.js       # Express server setup
│   │   ├── usageTracker.js # API quota tracking
│   │   └── package.json    # Backend dependencies
│
└── Configuration
    ├── .github/workflows/  # CI/CD pipelines (Datadog Synthetics)
    ├── tsconfig.json      # TypeScript configuration
    ├── package.json       # Frontend dependencies
    └── README.md          # API documentation
```

---

## Technology Stack

### Frontend
- **Framework**: React 19 with TypeScript 5.8
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS (inferred from class-based styling)
- **Animation**: Framer Motion 11
- **Charts**: Recharts 3
- **AI Integration**: Google Generative AI SDK (@google/genai)
- **Analytics**: Vercel Analytics, Statsig (feature flags), Session Replay
- **State Management**: React hooks + localStorage

### Backend
- **Runtime**: Node.js
- **Framework**: Express 4
- **AI Service**: Google Generative AI (@google/genai)
- **File Upload**: Multer
- **ID Generation**: UUID
- **Configuration**: dotenv

### Development
- **Language**: TypeScript
- **Package Manager**: npm
- **Monitoring**: Datadog Synthetics
- **Type Checking**: TypeScript compiler (no external linter config found)

---

## Core Types & Data Structures

All core types are defined in `types.ts`:

### Analysis Report
```typescript
interface SalesCallAnalysisReport {
  id: string;
  timestamp: string;
  diarizedTranscript: DiarizedSegment[];
  sentimentData: SentimentData[];
  coachingCard: CoachingCardData;
  summary: string;
}
```

### User & Subscription
```typescript
type SubscriptionPlan = 'free' | 'pro' | 'enterprise';

interface UserDetails {
  id: string;
  email: string;
  plan: SubscriptionPlan;
  apiKeys: ApiKey[];
  usage: ApiUsageStats;
  customApiKey?: string; // Bring-your-own Gemini key for pro access
}
```

### Features
App supports feature flags via `AppFeature` type:
- `'sales-coaching'` (main dashboard)
- `'live-mic'` (real-time transcription)
- `'video-generator'`
- `'chat-assistant'`
- `'my-progress'`
- `'developer-settings'`
- `'billing'`
- `'referrals'`
- `'team-dashboard'`
- `'audio-transcriber'`

---

## Development Workflows

### Running Locally

#### Frontend
```bash
npm install           # Install dependencies
npm run dev          # Start Vite dev server (port 3000)
npm run build        # Build for production
npm run preview      # Preview production build
```

#### Backend API
```bash
cd api
npm install
npm run dev          # Start with nodemon (requires local setup)
npm start            # Start Express server
```

### Environment Variables
Required for Gemini API:
- `GEMINI_API_KEY`: Google Generative AI API key (exposed in vite.config.ts)
- Backend expects same key for API integration

### Feature Flags
Configured via Statsig SDK. Check `flags.ts` for implementation. Feature flags control:
- UI feature availability
- A/B testing
- Analytics tracking

---

## Component Architecture

### Key Components

#### Page Components (Feature Pages)
- `SalesCoachingDashboard.tsx`: Main analysis dashboard
- `LiveMicTranscriber.tsx`: Real-time transcription interface
- `AudioTranscriber.tsx`: File-based audio transcription
- `ChatAssistant.tsx`: Interactive coaching chat
- `TeamDashboard.tsx`: Team performance view
- `MyProgress.tsx`: User progress tracking
- `BillingPage.tsx`: Subscription management
- `DeveloperSettings.tsx`: API key management

#### Display Components
- `CoachingCard.tsx`: Displays strengths & opportunities
- `SentimentGraph.tsx`: Charts sentiment data
- `TranscriptionDisplay.tsx`: Shows diarized transcript
- `CallSummary.tsx`: Call analysis summary
- `GamificationStats.tsx`: Streak and badge display

#### Layout Components
- `Header.tsx`: Top navigation bar
- `Sidebar.tsx`: Feature navigation sidebar
- `NotificationCenter.tsx`: In-app notifications
- `Tooltip.tsx`: Generic tooltip component
- `SkeletonLoader.tsx`: Loading state component

#### Utility Components
- `TipOfTheDay.tsx`: Daily tips/recommendations
- `Referrals.tsx`: Referral tracking UI
- `VideoGenerator.tsx`: Video generation interface

### Component Patterns

1. **Feature Detection**: Many components check `effectivePlan` or user permissions
2. **State Management**: Use `useLocalStorage` custom hook for persistence
3. **Loading States**: SkeletonLoader component for async operations
4. **Dark Mode**: Root element gets `dark` class; components use Tailwind dark: variants
5. **Mobile Responsive**: Sidebar uses `isSidebarOpen` state with body scroll lock

---

## Services & Utilities

### `services/geminiService.ts`
Handles all Google Generative AI integrations:
- Audio transcription with diarization
- Sentiment analysis
- Coaching card generation (strengths/opportunities)
- Chat message generation
- Live audio streaming (Live API support)

**Key Functions:**
- `analyzeCall()`: Main analysis pipeline
- `transcribeAudio()`: Speech-to-text
- `generateChat()`: Chat responses
- Audio encoding/decoding utilities for Live API

### `services/stripeService.ts`
Payment and subscription management (stub implementation):
- Checkout session creation
- Subscription status tracking
- Invoice management

### `hooks/useLocalStorage.ts`
Custom hook for localStorage persistence:
```typescript
const [value, setValue] = useLocalStorage<T>(key, initialValue)
```
- Syncs state to localStorage automatically
- Handles SSR (returns initialValue if window undefined)
- Includes error handling

### `api/usageTracker.js`
Backend quota management:
- Tracks API calls per user
- Enforces rate limits based on plan
- Calculates reset dates

---

## API Design

### Backend Endpoints

#### POST /api/analyze
Analyzes audio file using Gemini API.

**Request**:
- Multipart form with audio file OR JSON with base64 audio
- Authorization header with API key

**Response** (200 OK):
```json
{
  "id": "call_analysis_123",
  "timestamp": "2025-11-13T14:00:00Z",
  "summary": "...",
  "diarizedTranscript": [...],
  "sentimentData": [...],
  "coachingCard": {...}
}
```

**Errors**:
- `422 Unprocessable Entity`: Invalid/unsupported file format
- `401/403 Unauthorized`: Invalid API key
- `500 Internal Server Error`: Unexpected error (includes requestId)

### Integration with Frontend
- `geminiService.ts` handles Gemini SDK calls on client
- Backend API mirrors this for production use
- Currently client-side analysis; backend API is scaffolding

---

## Important Conventions

### Code Style

1. **TypeScript Strict Mode**: Project uses `isolatedModules: true`
2. **Import Paths**: Use `@/*` alias for relative imports from root
3. **Component Exports**: Named exports where possible
4. **Hooks**: Custom hooks use `use` prefix
5. **Services**: Functional service modules with named exports

### State Management

- **Local State**: `useState` for component-level state
- **Persisted State**: `useLocalStorage` hook (loaded in `App.tsx`)
- **Global State**: App.tsx manages analysis reports, user details, notifications
- **Feature Control**: `effectivePlan` computed from user.customApiKey (allows free plan to use pro features)

### Error Handling

- `geminiService.ts` includes try-catch blocks with user-friendly messages
- Backend validates file format and size
- Notifications system shows errors to users
- Console warnings for localStorage errors (graceful degradation)

### Naming Conventions

- **Components**: PascalCase (e.g., `SalesCoachingDashboard`)
- **Functions**: camelCase (e.g., `useLocalStorage`, `analyzeCall`)
- **Constants**: UPPER_SNAKE_CASE (if needed)
- **Types**: PascalCase with meaningful names (e.g., `SalesCallAnalysisReport`)

---

## Common Development Tasks

### Adding a New Feature

1. **Define Types**: Add interfaces to `types.ts`
2. **Create Component**: Add to `components/` directory
3. **Add to Navigation**: Update Sidebar and feature selection logic in `App.tsx`
4. **Implement Logic**: Use `geminiService` for AI features
5. **Test Locally**: Run `npm run dev` and test all flows
6. **Store User Data**: Use `useLocalStorage` for persistence

### Integrating New AI Capability

1. Update `geminiService.ts` with new function
2. Call service from component
3. Handle loading/error states with SkeletonLoader
4. Display results in appropriate component
5. Update type definitions if needed

### Adding Subscription Limits

1. Update `UserDetails` and `PlanDetails` in `types.ts`
2. Check `user.plan` in component (or `effectivePlan` for custom key override)
3. Use `user.usage` to track quota consumption
4. Display upgrade prompts when limits reached

### Debugging Analysis Results

1. Check `geminiService.ts` for analysis function logic
2. Verify Gemini API key is set correctly
3. Check browser console for API errors
4. Inspect localStorage under DevTools → Application → Local Storage
5. Look for error notifications in NotificationCenter

---

## Performance & Best Practices

### Optimization Patterns
- **Lazy Load Components**: Use React.lazy() for feature pages
- **Memoization**: Consider useMemo/useCallback for expensive computations
- **Animations**: Framer Motion with reduced motion support
- **Audio Processing**: Use Web Audio API for client-side processing

### Accessibility
- Semantic HTML in components
- Tooltip component for additional context
- Keyboard navigation in forms
- ARIA labels where needed

### Security
- API keys stored in environment variables (not in code)
- Custom API key isolated to localStorage
- Backend validates requests with API key auth
- File upload validation (format, size) on backend

---

## Git & Version Control

### Branch Naming
- Feature branches: `claude/<feature-name>-<id>`
- Bugfix branches: May vary

### Commit Messages
- Clear, descriptive messages
- Include feature name and impact
- Reference issues/PRs when applicable

### Recent Changes
Latest commits show:
- Datadog Synthetics CI/CD integration
- Vercel Web Analytics implementation
- Backend API development with Gemini
- UI/UX improvements and modern design system
- Statsig feature flagging integration

---

## Testing & Quality

### Current Setup
- TypeScript for type safety
- No formal test framework configured
- Manual testing via dev server recommended
- Datadog Synthetics for monitoring

### Testing Approach
1. **Manual Testing**: Use dev server to test flows
2. **Type Checking**: `tsc --noEmit` (via IDE)
3. **Component Testing**: Test in browser with various plans/states
4. **API Testing**: Test backend endpoints with cURL or Postman

---

## Deployment

### Build Process
```bash
npm run build  # Creates dist/ directory
```

### Frontend Hosting
- Configured for Vercel (analytics integrated)
- Vite build produces optimized bundle

### Backend Hosting
- Node.js Express server
- Can be deployed to any Node-compatible platform
- Requires GEMINI_API_KEY environment variable

### Monitoring
- Vercel Analytics for frontend
- Datadog Synthetics for API/functionality monitoring
- Statsig for feature flag analytics

---

## Common Pitfalls & Solutions

### Audio Not Analyzing?
- Check GEMINI_API_KEY is set
- Verify audio format is supported (webm, mp3, wav)
- Check file size isn't excessive
- Look at console errors and geminiService logs

### State Not Persisting?
- Verify useLocalStorage is used (not useState)
- Check localStorage isn't disabled in browser
- Verify JSON serialization is possible (no circular refs)

### Feature Not Visible?
- Check feature flag in Statsig
- Verify user plan allows the feature (or has custom API key)
- Check activeFeature state in App.tsx
- Verify feature component is exported and imported

### API Calls Slow?
- Audio file too large → compress before upload
- Gemini rate limiting → implement retry logic
- Network issues → check browser DevTools Network tab

---

## Resources

- **Google Generative AI Docs**: https://ai.google.dev/
- **React Documentation**: https://react.dev/
- **Vite Documentation**: https://vitejs.dev/
- **Express Documentation**: https://expressjs.com/
- **TypeScript Documentation**: https://www.typescriptlang.org/

---

## AI Assistant Guidelines

### When Making Changes

1. **Always test locally first**: Run `npm run dev` before creating PRs
2. **Preserve existing patterns**: Follow component and service patterns
3. **Update types first**: If adding features, define types in `types.ts` first
4. **Use existing services**: Leverage `geminiService.ts` for AI features
5. **Check for duplicates**: Don't recreate functionality that exists elsewhere
6. **Keep localStorage in sync**: If adding state, use `useLocalStorage` hook
7. **Test dark mode**: Verify components work in both light and dark themes

### Code Quality Standards

- **No console logs in production**: Use error boundaries and notifications instead
- **Type everything**: Avoid `any` types
- **Graceful degradation**: Handle missing features/data gracefully
- **Error messages**: User-friendly, actionable error messages
- **Comments**: Only for non-obvious logic; naming should be self-documenting

### Common Tasks

#### Fix: Audio analysis not working
→ Check `geminiService.ts` analyzeCall function, verify API key, check audio format

#### Add: New sentiment visualization
→ Create component in `components/`, use Recharts, update `SalesCoachingDashboard` to display it

#### Feature: New chat mode
→ Add to `AppFeature` type, create component, integrate with `ChatAssistant`, update feature flag

#### Bug: State not saving
→ Ensure using `useLocalStorage`, check localStorage quota, verify object is serializable

---

**Last Updated**: May 2026
**Active Development Branch**: `claude/add-claude-documentation-*`
