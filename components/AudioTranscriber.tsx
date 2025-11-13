import React, { useState, useRef, useCallback, useEffect } from 'react';
import { geminiService } from '../services/geminiService';
import { UserDetails } from '../types';
import Tooltip from './Tooltip';

interface AudioTranscriberProps {
  user: UserDetails;
}

const AudioTranscriber: React.FC<AudioTranscriberProps> = ({ user }) => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Record audio from your microphone for a simple transcription.');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript('');
    setIsLoading(false);
    setStatusMessage('Requesting microphone access...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data);
      
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];

        setStatusMessage('Recording stopped. Transcribing...');
        setIsLoading(true);
        setError(null);

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
            try {
                if (typeof reader.result !== 'string') {
                    throw new Error("Failed to read recorded audio file.");
                }
                const base64Audio = reader.result.split(',')[1];
                const resultText = await geminiService.transcribeAudio(base64Audio, audioBlob.type, user.customApiKey);
                
                setTranscript(resultText);
                setStatusMessage('Transcription complete!');
            } catch (err: any) {
                console.error("Transcription failed:", err);
                const errorMessage = `Transcription failed: ${err.message || "An unknown error occurred."}`;
                setError(errorMessage);
                setStatusMessage('Could not transcribe the recording.');
            } finally {
                setIsLoading(false);
            }
        };
        reader.onerror = () => {
            setError("Failed to read the recorded audio file.");
            setStatusMessage('Could not transcribe the recording.');
            setIsLoading(false);
        };
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setStatusMessage('Recording active. Speak now!');

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
    }
  }, [user.customApiKey]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  }, []);
  
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-lg shadow-lg">
        <h3 className="text-xl font-semibold mb-4 text-center text-gray-800 dark:text-slate-200">Audio Transcriber</h3>
        <div className="flex flex-col items-center justify-center space-y-4 mb-4">
          <Tooltip text={isRecording ? "Stop the recording" : "Start recording your microphone"}>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isLoading}
              className={`px-8 py-4 rounded-full text-white font-bold text-lg shadow-lg transition-all duration-300 ease-in-out disabled:opacity-50 ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              {isLoading ? 'Transcribing...' : (isRecording ? 'Stop Recording' : 'Start Recording')}
            </button>
          </Tooltip>
        </div>
        <p className={`text-center text-sm ${error ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
          {error || statusMessage}
        </p>

        <div className="mt-8 p-4 sm:p-6 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-700 min-h-[200px] max-h-[400px] overflow-y-auto custom-scrollbar">
          <h4 className="text-lg font-medium text-gray-800 dark:text-slate-200 mb-3">Transcript:</h4>
          {transcript ? (
            <p className="text-gray-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{transcript}</p>
          ) : (
            <p className="text-gray-500 dark:text-slate-400 italic">
              {isLoading ? 'Processing audio...' : 'Your transcript will appear here after recording.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioTranscriber;
