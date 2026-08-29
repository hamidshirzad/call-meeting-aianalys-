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

export default function AnalysisWorkspace({ user }: AnalysisWorkspaceProps) {
  const [reports, setReports] = useState<SavedAnalysisReport[]>([]);
  const [usage, setUsage] = useState<AnalysisUsageSummary | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<AnalysisPhase>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inputReference = useRef<HTMLInputElement>(null);

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
        Upload a call up to 50 MB and 60 minutes. Audio is analyzed server-side, then removed.
      </p>

      {usage ? (
        <div className="usage-row" aria-label="Monthly analysis usage">
          <strong>{usage.remaining} remaining</strong>
          <span>{usage.completed} of {usage.limit} completed this month · {usage.plan} plan</span>
        </div>
      ) : null}

      <div className="analysis-controls">
        <label className="file-picker">
          <span>{selectedFile?.name ?? 'Choose an audio file'}</span>
          <input
            ref={inputReference}
            type="file"
            accept="audio/*,.mp3,.m4a,.mp4,.wav,.aac,.aiff,.ogg,.flac,.webm"
            disabled={busy || limitReached}
            onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
          />
        </label>
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
