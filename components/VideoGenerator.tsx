import React, { useState, useRef, useCallback, useEffect } from 'react';
import { geminiService } from '../services/geminiService';
import { UserDetails } from '../types';

interface VideoGeneratorProps {
  user: UserDetails;
}

const VideoGenerator: React.FC<VideoGeneratorProps> = ({ user }) => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Upload an image and enter a prompt to generate a video.');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      if (generatedVideoUrl) URL.revokeObjectURL(generatedVideoUrl);
    };
  }, [imagePreviewUrl, generatedVideoUrl]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedImage(file);
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(URL.createObjectURL(file));
      setGeneratedVideoUrl(null);
      setError(null);
      setStatusMessage('Image selected. Enter a prompt and generate your video!');
    }
  };

  const generateVideo = useCallback(async () => {
    if (!selectedImage || !prompt.trim()) {
      setError("Please upload an image and provide a prompt.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedVideoUrl(null);
    setStatusMessage('Starting video generation...');

    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedImage);
      reader.onloadend = async () => {
        if (typeof reader.result === 'string') {
          const base64Image = reader.result.split(',')[1];
          const imageMimeType = selectedImage.type;
          const videoBlobUrl = await geminiService.generateVeoVideo(
            prompt,
            base64Image,
            imageMimeType,
            aspectRatio,
            setStatusMessage
          );
          setGeneratedVideoUrl(videoBlobUrl);
          setStatusMessage('Video generated successfully!');
        } else {
          throw new Error("Failed to read image file as base64.");
        }
      };
      reader.onerror = () => {
        throw new Error("Failed to read image file.");
      };
    } catch (err: any) {
      console.error("Error generating video:", err);
      // For user-friendly messages like re-selecting the key, we show it in the status, not as a red error.
      if (err.message.includes("Please click 'Generate Video' again")) {
          setError(null);
          setStatusMessage(err.message);
      } else {
          setError(err.message || "An unexpected error occurred during video generation.");
          setStatusMessage('Video generation failed.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedImage, prompt, aspectRatio]);

  return (
    <div>
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mb-8">
        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Generate Video from Image + Prompt</h3>

        <div className="mb-6">
          <label className="block text-slate-700 dark:text-slate-300 text-sm font-bold mb-2">
            Upload Starting Image
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            ref={fileInputRef}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600"
          >
            {selectedImage ? 'Change Image' : 'Select Image'}
          </button>
        </div>

        <div className="mb-6">
          <label htmlFor="prompt" className="block text-slate-700 dark:text-slate-300 text-sm font-bold mb-2">
            Video Description Prompt
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="shadow-sm appearance-none border border-slate-300 dark:border-slate-600 rounded w-full py-2 px-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="A futuristic car driving through a neon city at night..."
            disabled={isLoading}
          ></textarea>
        </div>
        
        <div className="mb-6">
          <label className="block text-slate-700 dark:text-slate-300 text-sm font-bold mb-2">
            Aspect Ratio
          </label>
          <div className="flex rounded-lg bg-slate-200 dark:bg-slate-700 p-1">
            <button
              onClick={() => setAspectRatio('16:9')}
              disabled={isLoading}
              className={`w-1/2 py-2 text-sm font-semibold rounded-md transition-colors ${
                aspectRatio === '16:9'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300/50 dark:hover:bg-slate-600/50'
              }`}
            >
              16:9 Landscape
            </button>
            <button
              onClick={() => setAspectRatio('9:16')}
              disabled={isLoading}
              className={`w-1/2 py-2 text-sm font-semibold rounded-md transition-colors ${
                aspectRatio === '9:16'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300/50 dark:hover:bg-slate-600/50'
              }`}
            >
              9:16 Portrait
            </button>
          </div>
        </div>

        <button
          onClick={generateVideo}
          disabled={!selectedImage || !prompt.trim() || isLoading}
          className="w-full px-6 py-3 bg-emerald-600 text-white font-medium rounded-md shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Generating Video...' : 'Generate Video'}
        </button>

        <p className={`mt-4 text-center ${error ? 'text-red-500' : 'text-slate-600 dark:text-slate-400'}`}>
          {error || statusMessage}
        </p>
      </div>

      {generatedVideoUrl && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mt-8">
          <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Your Generated Video</h3>
          <video
            controls
            src={generatedVideoUrl}
            className="w-full max-w-2xl mx-auto rounded-lg shadow-lg"
            autoPlay
            loop
            muted
          >
            Your browser does not support the video tag.
          </video>
        </div>
      )}
    </div>
  );
};

export default VideoGenerator;