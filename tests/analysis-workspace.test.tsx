import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedAnalysisReport } from '../types';

const mocks = vi.hoisted(() => ({
  analyzeAudio: vi.fn(),
  deleteReport: vi.fn(),
  describeAnalysisError: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : 'The call could not be analyzed.'),
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
    async (
      _user: User,
      _file: File,
      onProgress: (value: number) => void,
      onPhase: (phase: string) => void,
    ) => {
      onPhase('preparing');
      onPhase('uploading');
      onProgress(100);
      onPhase('analyzing');
      return { report, usage: { ...usage, completed: 1, remaining: 4 } };
    },
  );
  mocks.deleteReport.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
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
    expect(mocks.analyzeAudio).toHaveBeenCalledWith(
      user,
      file,
      expect.any(Function),
      expect.any(Function),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete discovery.mp3' }));
    await waitFor(() => expect(mocks.deleteReport).toHaveBeenCalledWith(user, report.id));
    expect(screen.queryByText('A productive discovery call.')).not.toBeInTheDocument();
  });

  it('tells the user the upload is being authorized before bytes move', async () => {
    // The mint round-trip happens before any upload starts. Showing 0% there
    // reads as a stuck upload, so the preparing state has to be distinct.
    let releasePreparing!: () => void;
    mocks.analyzeAudio.mockImplementation(
      async (
        _user: User,
        _file: File,
        _onProgress: (value: number) => void,
        onPhase: (phase: string) => void,
      ) => {
        onPhase('preparing');
        await new Promise<void>((resolve) => {
          releasePreparing = resolve;
        });
        return { report, usage: { ...usage, completed: 1, remaining: 4 } };
      },
    );

    render(<AnalysisWorkspace user={user} />);
    await screen.findByText('5 remaining');

    fireEvent.change(screen.getByLabelText('Choose an audio file'), {
      target: { files: [new File(['audio'], 'discovery.mp3', { type: 'audio/mpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze call' }));

    expect(await screen.findByRole('button', { name: 'Preparing secure upload…' }))
      .toBeInTheDocument();
    expect(screen.getByText('Authorizing this upload…')).toBeInTheDocument();

    releasePreparing();
    await waitFor(() => expect(screen.queryByText('Authorizing this upload…')).toBeNull());
  });

  it('disables analysis when the authoritative monthly limit is reached', async () => {
    mocks.fetchReports.mockResolvedValue({ reports: [], usage: { ...usage, remaining: 0, completed: 5 } });
    render(<AnalysisWorkspace user={user} />);
    expect(await screen.findByRole('button', { name: 'Monthly limit reached' })).toBeDisabled();
  });

  it('requires consent and turns an in-person microphone recording into an analyzable file', async () => {
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const recorderStart = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    class MockMediaRecorder {
      static isTypeSupported(type: string) {
        return type === 'audio/mp4';
      }

      state: RecordingState = 'inactive';
      mimeType: string;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;

      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        this.mimeType = options?.mimeType === 'audio/mp4'
          ? 'audio/mp4;codecs=mp4a.40.2'
          : options?.mimeType ?? 'audio/mp4;codecs=mp4a.40.2';
      }

      start(timeslice?: number) {
        recorderStart(timeslice);
        this.state = 'recording';
      }

      pause() {
        this.state = 'paused';
      }

      resume() {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['recorded audio'], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);

    render(<AnalysisWorkspace user={user} />);
    await screen.findByText('5 remaining');
    fireEvent.click(screen.getByRole('button', { name: 'Record meeting' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    expect(await screen.findByText('Confirm that everyone has agreed before recording.'))
      .toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('I confirm everyone has agreed to be recorded and analyzed.'));
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    expect(await screen.findByRole('button', { name: 'Stop recording' })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    expect(recorderStart).toHaveBeenCalledWith(undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect(await screen.findByText(/Ready: meeting-.*\.m4a/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze call' })).toBeEnabled();
    expect(stopTrack).toHaveBeenCalled();
  });
});
