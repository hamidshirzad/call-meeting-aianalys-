import React, { useState, useRef, useCallback, useEffect } from 'react';
import { geminiService } from '../services/geminiService';
import { UserDetails } from '../types';

interface LiveMicTranscriberProps {
  user: UserDetails;
}

const LiveMicTranscriber: React.FC<LiveMicTranscriberProps> = ({ user }) => {
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

  const handleTurnComplete = useCallback((fullInput: string, fullOutput: string) => {}, []);

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

      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data);
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedAudioUrl(URL.createObjectURL(audioBlob));
        audioChunksRef.current = [];
      };
      mediaRecorderRef.current.start();
      
      const { session, stopTranscriptionSession } = await geminiService.startLiveTranscription(
        stream,
        handleTranscriptionUpdate,
        handleTurnComplete,
        handleError,
        handleClose,
        handleVolumeUpdate,
        user.customApiKey
      );
      liveSessionRef.current = session;
      
      stopHandlerRef.current = () => {
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
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
        if (err.name === 'NotAllowedError') userFriendlyMessage = "Microphone access denied. Please allow microphone permissions in your browser settings.";
        else if (err.name === 'NotFoundError') userFriendlyMessage = "No microphone found. Please connect a microphone.";
        else if (err.name === 'NotReadableError') userFriendlyMessage = "Microphone is busy. Please close other apps using it.";
      }
      setError(userFriendlyMessage);
      setStatusMessage('Failed to start recording.');
      setMicVolume(0);
    }
  }, [recordedAudioUrl, handleTranscriptionUpdate, handleTurnComplete, handleError, handleClose, handleVolumeUpdate, user.customApiKey]);

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
      if (stopHandlerRef.current) stopHandlerRef.current();
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    };
  }, [recordedAudioUrl]);

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mb-8">
        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Real-time Audio Transcription & Recording</h3>
        <div className="flex flex-col items-center justify-center space-y-4 mb-4">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`px-8 py-4 rounded-full text-white font-bold text-lg shadow-lg transition-all duration-300 ease-in-out ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
        </div>
        <p className={`text-center text-sm ${error ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
          {error || statusMessage}
        </p>

        <div className="mt-8 p-6 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-700 min-h-[200px] max-h-[400px] overflow-y-auto custom-scrollbar">
          <h4 className="text-lg font-medium text-gray-800 dark:text-slate-200 mb-3">Live Transcript:</h4>
          {liveTranscript ? (
            <p className="text-gray-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{liveTranscript}</p>
          ) : (
            <p className="text-gray-500 dark:text-slate-400 italic">Transcription will appear here...</p>
          )}
        </div>

        {recordedAudioUrl && !isRecording && (
          <div className="mt-6 p-4 bg-emerald-50 dark:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-700 rounded-lg text-center">
            <h4 className="text-lg font-medium text-emerald-800 dark:text-emerald-300 mb-3">Recording Complete</h4>
            <a
              href={recordedAudioUrl}
              download={`recording-${new Date().toISOString()}.webm`}
              className="inline-flex items-center px-6 py-2 bg-emerald-600 text-white font-medium rounded-md shadow-sm hover:bg-emerald-700"
            >
              Download Recording
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveMicTranscriber;
