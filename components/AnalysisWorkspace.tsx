import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  analyzeAudio,
  deleteReport,
  describeAnalysisError,
  fetchReports,
  validateClientAudioFile,
} from '../lib/analysis-api';
import type { AnalysisUsageSummary, SavedAnalysisReport } from '../types';

interface AnalysisWorkspaceProps {
  user: User;
}

type AnalysisPhase = 'idle' | 'preparing' | 'uploading' | 'analyzing';
type AudioSource = 'upload' | 'record';
type RecordingState = 'idle' | 'recording' | 'paused';

const MAX_RECORDING_SECONDS = 60 * 60;

function preferredRecordingType(): string {
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function recordingName(mimeType: string): string {
  const extension = mimeType.includes('mp4') ? 'm4a' : 'webm';
  return `meeting-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
}

function formatRecordingTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function AnalysisWorkspace({ user }: AnalysisWorkspaceProps) {
  const [reports, setReports] = useState<SavedAnalysisReport[]>([]);
  const [usage, setUsage] = useState<AnalysisUsageSummary | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<AnalysisPhase>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioSource, setAudioSource] = useState<AudioSource>('upload');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const inputReference = useRef<HTMLInputElement>(null);
  const recorderReference = useRef<MediaRecorder | null>(null);
  const streamReference = useRef<MediaStream | null>(null);
  const recordingChunksReference = useRef<Blob[]>([]);

  const loadHistory = useCallback(async () => {
    setError(null);
    try {
      const result = await fetchReports(user);
      setReports(Array.isArray(result.reports) ? result.reports : []);
      setUsage(result.usage);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Report history could not load.');
    } finally {
      setLoadingHistory(false);
    }
  }, [user]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const stopRecording = useCallback(() => {
    const recorder = recorderReference.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  useEffect(() => {
    if (recordingState !== 'recording') return;
    const timer = window.setInterval(() => {
      setRecordingSeconds((current) => {
        if (current + 1 >= MAX_RECORDING_SECONDS) {
          window.clearInterval(timer);
          stopRecording();
          return MAX_RECORDING_SECONDS;
        }
        return current + 1;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [recordingState, stopRecording]);

  useEffect(() => () => {
    const recorder = recorderReference.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    streamReference.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const selectFile = (file: File | null) => {
    setError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    try {
      validateClientAudioFile(file);
      setSelectedFile(file);
    } catch (validationError) {
      setSelectedFile(null);
      setError(validationError instanceof Error ? validationError.message : 'Choose an audio file.');
      if (inputReference.current) inputReference.current.value = '';
    }
  };

  const submit = async () => {
    if (!selectedFile || phase !== 'idle') return;
    setError(null);
    setUploadProgress(0);
    setPhase('preparing');
    try {
      const result = await analyzeAudio(
        user,
        selectedFile,
        (percentage) => setUploadProgress(percentage),
        (nextPhase) => setPhase(nextPhase),
      );
      setReports((current) => [result.report, ...current.filter(({ id }) => id !== result.report.id)]);
      setUsage(result.usage);
      setSelectedFile(null);
      if (inputReference.current) inputReference.current.value = '';
    } catch (requestError) {
      setError(describeAnalysisError(requestError));
    } finally {
      setPhase('idle');
    }
  };

  const startRecording = async () => {
    setError(null);
    if (!consentConfirmed) {
      setError('Confirm that everyone has agreed before recording.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio. Use the upload option instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mimeType = preferredRecordingType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 })
        : new MediaRecorder(stream, { audioBitsPerSecond: 64_000 });
      streamReference.current = stream;
      recorderReference.current = recorder;
      recordingChunksReference.current = [];
      setSelectedFile(null);
      setRecordingSeconds(0);
      recorder.ondataavailable = ({ data }) => {
        if (data.size > 0) recordingChunksReference.current.push(data);
      };
      recorder.onerror = () => {
        setError('Recording stopped unexpectedly. Please try again or upload an audio file.');
      };
      recorder.onstop = () => {
        const outputType = recorder.mimeType || mimeType || 'audio/webm';
        const chunks = recordingChunksReference.current;
        stream.getTracks().forEach((track) => track.stop());
        streamReference.current = null;
        recorderReference.current = null;
        setRecordingState('idle');
        if (chunks.length === 0) {
          setError('No audio was recorded. Check microphone access and try again.');
          return;
        }
        selectFile(new File(chunks, recordingName(outputType), { type: outputType }));
      };
      // Safari's MP4 recorder can emit fragmented MP4 when a timeslice is
      // supplied. Concatenating those fragments produces a Blob that Safari
      // can upload, but downstream audio decoders may reject. Let the recorder
      // finalize one complete MP4/M4A container when Stop is pressed.
      recorder.start();
      setRecordingState('recording');
    } catch (recordingError) {
      streamReference.current?.getTracks().forEach((track) => track.stop());
      streamReference.current = null;
      setRecordingState('idle');
      const permissionDenied = recordingError instanceof DOMException
        && (recordingError.name === 'NotAllowedError' || recordingError.name === 'SecurityError');
      setError(permissionDenied
        ? 'Microphone access was denied. Allow microphone access or upload an audio file.'
        : 'The microphone could not start. Please try again or upload an audio file.');
    }
  };

  const toggleRecordingPause = () => {
    const recorder = recorderReference.current;
    if (!recorder) return;
    if (recorder.state === 'recording') {
      recorder.pause();
      setRecordingState('paused');
    } else if (recorder.state === 'paused') {
      recorder.resume();
      setRecordingState('recording');
    }
  };

  const remove = async (reportId: string) => {
    setDeletingId(reportId);
    setError(null);
    try {
      await deleteReport(user, reportId);
      setReports((current) => current.filter(({ id }) => id !== reportId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The report could not be deleted.');
    } finally {
      setDeletingId(null);
    }
  };

  const latest = reports[0] ?? null;
  const busy = phase !== 'idle';
  const limitReached = usage?.remaining === 0;

  return (
    <article className="dashboard-card analysis-workspace">
      <p className="eyebrow">Analysis</p>
      <h2>Analyze a sales call</h2>
      <p className="muted">
        Upload a call or record an in-person meeting up to 50 MB and 60 minutes. Audio is analyzed
        server-side, then removed.
      </p>

      {usage ? (
        <div className="usage-row" aria-label="Monthly analysis usage">
          <strong>{usage.remaining} remaining</strong>
          <span>{usage.completed} of {usage.limit} completed this month · {usage.plan} plan</span>
        </div>
      ) : null}

      <div className="analysis-controls">
        <div className="analysis-mode-tabs" role="group" aria-label="Audio source">
          <button
            type="button"
            className={audioSource === 'upload' ? 'active' : ''}
            aria-pressed={audioSource === 'upload'}
            disabled={busy || recordingState !== 'idle'}
            onClick={() => setAudioSource('upload')}
          >Upload audio</button>
          <button
            type="button"
            className={audioSource === 'record' ? 'active' : ''}
            aria-pressed={audioSource === 'record'}
            disabled={busy || recordingState !== 'idle'}
            onClick={() => setAudioSource('record')}
          >Record meeting</button>
        </div>

        {audioSource === 'upload' ? (
          <label className="file-picker">
            <span>{selectedFile?.name ?? 'Choose an audio file'}</span>
            <input
              ref={inputReference}
              aria-label="Choose an audio file"
              type="file"
              accept="audio/*,.mp3,.m4a,.mp4,.wav,.aac,.aiff,.ogg,.flac,.webm"
              disabled={busy || limitReached}
              onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
            />
          </label>
        ) : (
          <div className="recording-panel">
            <label className="consent-check">
              <input
                type="checkbox"
                checked={consentConfirmed}
                disabled={recordingState !== 'idle'}
                onChange={(event) => setConsentConfirmed(event.target.checked)}
              />
              <span>I confirm everyone has agreed to be recorded and analyzed.</span>
            </label>
            <div className="recording-status" role="status" aria-live="polite">
              <span className={recordingState === 'recording' ? 'record-dot active' : 'record-dot'} />
              <strong>{recordingState === 'idle' ? 'Ready to record' : formatRecordingTime(recordingSeconds)}</strong>
              {recordingState === 'paused' ? <span>Paused</span> : null}
            </div>
            <div className="recording-actions">
              {recordingState === 'idle' ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy || limitReached}
                  onClick={() => void startRecording()}
                >Start recording</button>
              ) : (
                <>
                  <button className="secondary-button" type="button" onClick={toggleRecordingPause}>
                    {recordingState === 'paused' ? 'Resume' : 'Pause'}
                  </button>
                  <button className="secondary-button danger-button" type="button" onClick={stopRecording}>
                    Stop recording
                  </button>
                </>
              )}
            </div>
            <p className="recording-help muted">
              Keep this page open. This records nearby sound; it cannot capture both sides of a normal phone call.
            </p>
            {selectedFile ? <p className="recorded-file">Ready: {selectedFile.name}</p> : null}
          </div>
        )}
        <button
          className="primary-button"
          type="button"
          disabled={!selectedFile || busy || limitReached}
          onClick={() => void submit()}
        >
          {phase === 'preparing'
            ? 'Preparing secure upload…'
            : phase === 'uploading'
            ? `Uploading ${uploadProgress}%…`
            : phase === 'analyzing'
              ? 'Analyzing securely…'
              : limitReached
                ? 'Monthly limit reached'
                : 'Analyze call'}
        </button>
      </div>

      {busy ? (
        <div className="analysis-progress" role="status" aria-live="polite">
          <progress
            max="100"
            {...(phase === 'preparing'
              ? {}
              : { value: phase === 'analyzing' ? 100 : uploadProgress })}
          />
          <span>
            {phase === 'preparing'
              ? 'Authorizing this upload…'
              : phase === 'analyzing'
                ? 'Creating transcript and coaching report…'
                : 'Uploading securely to the analysis provider…'}
          </span>
        </div>
      ) : null}
      {error ? <div className="error-notice analysis-error" role="alert">{error}</div> : null}

      {latest ? (
        <section className="latest-report" aria-labelledby="latest-report-title">
          <div className="report-heading">
            <div>
              <p className="eyebrow">Latest report</p>
              <h3 id="latest-report-title">{latest.fileName}</h3>
            </div>
            <time dateTime={latest.timestamp}>{new Date(latest.timestamp).toLocaleDateString()}</time>
          </div>
          <p>{latest.summary}</p>
          <div className="coaching-grid">
            <div>
              <h4>Strengths</h4>
              <ul>{latest.coachingCard.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div>
              <h4>Opportunities</h4>
              <ul>{latest.coachingCard.opportunities.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>
          <details>
            <summary>View transcript ({latest.diarizedTranscript.length} segments)</summary>
            <div className="transcript-list">
              {latest.diarizedTranscript.map((segment, index) => (
                <p key={`${index}-${segment.speaker}`}>
                  <strong>{segment.speaker}:</strong> {segment.text}
                </p>
              ))}
            </div>
          </details>
        </section>
      ) : null}

      <section className="report-history" aria-labelledby="report-history-title">
        <div className="report-heading">
          <h3 id="report-history-title">Report history</h3>
          <button className="text-button" type="button" disabled={loadingHistory} onClick={() => void loadHistory()}>
            {loadingHistory ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        {!loadingHistory && reports.length === 0 ? (
          <p className="muted">Your completed reports will appear here.</p>
        ) : (
          <ul className="history-list">
            {reports.map((report) => (
              <li key={report.id}>
                <div>
                  <strong>{report.fileName}</strong>
                  <span>{new Date(report.timestamp).toLocaleString()}</span>
                </div>
                <button
                  className="text-button danger-button"
                  type="button"
                  disabled={deletingId !== null}
                  aria-label={`Delete ${report.fileName}`}
                  onClick={() => void remove(report.id)}
                >
                  {deletingId === report.id ? 'Deleting…' : 'Delete'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
