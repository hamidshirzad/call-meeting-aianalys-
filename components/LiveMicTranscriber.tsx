import React, { useState, useRef, useCallback, useEffect } from 'react';
import { geminiService } from '../services/geminiService';
import { motion } from 'framer-motion';

interface LiveMicTranscriberProps {
  // No specific props needed for now
}

const LiveMicTranscriber: React.FC<LiveMicTranscriberProps> = () => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Ready to record. Automatically detects and transcribes various languages.');
  const [micVolume, setMicVolume] = useState<number>(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);

  const liveSessionRef = useRef<any>(null);
  const stopHandlerRef = useRef<(() => void) | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const handleTranscriptionUpdate = useCallback((text: string) => {
    setLiveTranscript(text);
  }, []);

  const handleTurnComplete = useCallback((fullInput: string, fullOutput: string) => {
    // This is a design choice to show the "finalized" user speech turn.
    // An alternative would be to replace the live transcript with this.
  }, []);

  const handleError = useCallback((event: ErrorEvent) => {
    console.error("Live transcription error:", event.error || event.message);
    setError(`Recording Error: ${event.error?.message || event.message || "Unknown error."}`);
    setStatusMessage('Error during recording.');
    if (stopHandlerRef.current) {
      stopHandlerRef.current();
      stopHandlerRef.current = null;
    }
    setIsRecording(false);
    setMicVolume(0);
  }, []);

  const handleClose = useCallback((event: CloseEvent) => {
    console.log("Live transcription session closed:", event);
    // This is often triggered by the stop handler, so we don't need to call stop again.
    // We just ensure the UI reflects the stopped state.
    setStatusMessage('Recording stopped.');
    setIsRecording(false);
    liveSessionRef.current = null;
    setMicVolume(0);
  }, []);

  const handleVolumeUpdate = useCallback((volume: number) => {
    setMicVolume(volume);
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setLiveTranscript('');
    setStatusMessage('Requesting microphone access...');
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioUrl(null);
    setMicVolume(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Setup MediaRecorder
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(audioUrl);
        audioChunksRef.current = [];
      };
      
      mediaRecorderRef.current.start();
      
      const { session, stopTranscriptionSession } = await geminiService.startLiveTranscription(
        stream,
        handleTranscriptionUpdate,
        handleTurnComplete,
        handleError,
        handleClose,
        handleVolumeUpdate
      );
      liveSessionRef.current = session;
      
      stopHandlerRef.current = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
        stopTranscriptionSession();
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      setIsRecording(true);
      setStatusMessage('Recording active. Speak now! Your audio is also being recorded.');
    } catch (err: any) {
      console.error("Failed to start recording:", err);
      let userFriendlyMessage = "Could not start microphone recording. Please ensure microphone access is granted.";
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') userFriendlyMessage = "Microphone access denied. Please allow microphone permissions for this site in your browser settings.";
        else if (err.name === 'NotFoundError') userFriendlyMessage = "No microphone found. Please ensure a microphone is connected.";
        else if (err.name === 'NotReadableError') userFriendlyMessage = "Microphone is busy or not accessible. Please close other apps using the microphone.";
        else if (err.name === 'SecurityError') userFriendlyMessage = "Microphone access blocked by browser security policy (e.g., not on HTTPS).";
      }
      setError(userFriendlyMessage);
      setStatusMessage('Failed to start recording.');
      setMicVolume(0);
    }
  }, [recordedAudioUrl, handleTranscriptionUpdate, handleTurnComplete, handleError, handleClose, handleVolumeUpdate]);

  const stopRecording = useCallback(() => {
    if (stopHandlerRef.current) {
      stopHandlerRef.current();
      stopHandlerRef.current = null;
    }
    setIsRecording(false);
    setStatusMessage('Recording stopped. Processing audio file...');
    setMicVolume(0);
  }, []);

  useEffect(() => {
    return () => {
      if (stopHandlerRef.current) {
        stopHandlerRef.current();
      }
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
      }
    };
  }, [recordedAudioUrl]);

  const getVolumeBarColor = () => {
    if (micVolume === 0 && isRecording) return 'bg-gray-400';
    if (micVolume < 20) return 'bg-red-500';
    if (micVolume < 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mb-8">
        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Real-time Audio Transcription & Recording</h3>
        <div className="flex flex-col items-center justify-center space-y-4 mb-4">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`px-8 py-4 rounded-full text-white font-bold text-lg shadow-lg transition-all duration-300 ease-in-out
              ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}
              disabled:opacity-50 disabled:cursor-not-allowed`}
            disabled={error !== null && !isRecording}
          >
            {isRecording ? (
              <div className="flex items-center">
                <svg className="animate-pulse h-6 w-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                Stop Recording
              </div>
            ) : (
              <div className="flex items-center">
                <svg className="h-6 w-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 8.947V6.053c0-1.298-.99-2.355-2.28-2.618C6.353 3.167 5 4.34 5 5.947v3c0 .828.672 1.5 1.5 1.5H8.5c.828 0 1.5-.672 1.5-1.5z" />
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM15 9.5a5 5 0 00-10 0v1a5 5 0 0010 0v-1z" clipRule="evenodd" />
                </svg>
                Start Recording
              </div>
            )}
          </button>
          {isRecording && (
            <div className="w-full max-w-xs h-4 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden" aria-label="Microphone input volume">
              <div
                className={`h-full ${getVolumeBarColor()} transition-all duration-100 ease-linear`}
                style={{ width: `${micVolume}%` }}
              ></div>
            </div>
          )}
        </div>
        <p className={`text-center text-sm ${error ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
          {error || statusMessage}
        </p>

        <div className="mt-8 p-6 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-700 min-h-[200px] max-h-[400px] overflow-y-auto custom-scrollbar">
          <h4 className="text-lg font-medium text-gray-800 dark:text-slate-200 mb-3">Live Transcript:</h4>
          {liveTranscript ? (
            <p className="text-gray-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{liveTranscript}</p>
          ) : (
            <p className="text-gray-500 dark:text-slate-400 italic">Transcription will appear here as you speak...</p>
          )}
        </div>

        {recordedAudioUrl && !isRecording && (
          <div className="mt-6 p-4 bg-emerald-50 dark:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-700 rounded-lg text-center">
            <h4 className="text-lg font-medium text-emerald-800 dark:text-emerald-300 mb-3">Recording Complete</h4>
            <p className="text-slate-600 dark:text-slate-400 mb-4">Your audio has been saved and is ready for download.</p>
            <a
              href={recordedAudioUrl}
              download={`recording-${new Date().toISOString().replace(/:/g, '-')}.webm`}
              className="inline-flex items-center px-6 py-2 bg-emerald-600 text-white font-medium rounded-md shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Recording
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveMicTranscriber;