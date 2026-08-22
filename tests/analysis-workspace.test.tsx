import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedAnalysisReport } from '../types';

const mocks = vi.hoisted(() => ({
  analyzeAudio: vi.fn(),
  deleteReport: vi.fn(),
  fetchReports: vi.fn(),
  validateClientAudioFile: vi.fn(),
}));

vi.mock('../lib/analysis-api', () => mocks);

import AnalysisWorkspace from '../components/AnalysisWorkspace';

const user = { uid: 'verified-uid', email: 'owner@example.com' } as User;
const usage = {
  period: '2026-08', plan: 'free' as const, completed: 0, reserved: 0, limit: 5, remaining: 5,
};
const report: SavedAnalysisReport = {
  id: '7f6e6f6b-38d5-4a24-9541-90aa8d91ff21',
  timestamp: '2026-08-23T00:00:00.000Z',
  fileName: 'discovery.mp3',
  durationSeconds: 120,
  diarizedTranscript: [{ speaker: 'Agent', text: 'Hello' }],
  sentimentData: [{ segmentIndex: 0, score: 0.5 }],
  coachingCard: { strengths: ['Clear opening'], opportunities: ['Ask discovery questions'] },
  summary: 'A productive discovery call.',
};

beforeEach(() => {
  mocks.fetchReports.mockResolvedValue({ reports: [], usage });
  mocks.validateClientAudioFile.mockReturnValue('audio/mpeg');
  mocks.analyzeAudio.mockImplementation(
    async (_user: User, _file: File, onProgress: (value: number) => void) => {
      onProgress(100);
      return { report, usage: { ...usage, completed: 1, remaining: 4 } };
    },
  );
  mocks.deleteReport.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('analysis workspace', () => {
  it('loads usage, analyzes an audio file, renders the report, and deletes it', async () => {
    render(<AnalysisWorkspace user={user} />);
    expect(await screen.findByText('5 remaining')).toBeInTheDocument();

    const file = new File(['audio'], 'discovery.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('Choose an audio file'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze call' }));

    expect(await screen.findByText('A productive discovery call.')).toBeInTheDocument();
    expect(screen.getByText('4 remaining')).toBeInTheDocument();
    expect(mocks.analyzeAudio).toHaveBeenCalledWith(user, file, expect.any(Function));

    fireEvent.click(screen.getByRole('button', { name: 'Delete discovery.mp3' }));
    await waitFor(() => expect(mocks.deleteReport).toHaveBeenCalledWith(user, report.id));
    expect(screen.queryByText('A productive discovery call.')).not.toBeInTheDocument();
  });

  it('disables analysis when the authoritative monthly limit is reached', async () => {
    mocks.fetchReports.mockResolvedValue({ reports: [], usage: { ...usage, remaining: 0, completed: 5 } });
    render(<AnalysisWorkspace user={user} />);
    expect(await screen.findByRole('button', { name: 'Monthly limit reached' })).toBeDisabled();
  });
});
