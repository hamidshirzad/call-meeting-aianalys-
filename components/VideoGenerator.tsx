import React, { useState, useRef, useCallback, useEffect } from 'react';
import { geminiService } from '../services/geminiService';

interface VideoGeneratorProps {
  // No specific props needed for now
}

const examplePrompts = [
  "A futuristic city skyline at sunset with flying cars and neon lights.",
  "An adventurous cat exploring an ancient, overgrown ruin.",
  "A serene nature scene with a waterfall and lush greenery, birds flying.",
  "A high-speed chase through a desert canyon, seen from a drone perspective.",
];

const VideoGenerator: React.FC<VideoGeneratorProps> = () => {
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
    // Cleanup object URL on component unmount or when image/video changes
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      if (generatedVideoUrl) URL.revokeObjectURL(generatedVideoUrl);
    };
  }, [imagePreviewUrl, generatedVideoUrl]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedImage(file);
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); // Clean up previous preview
      setImagePreviewUrl(URL.createObjectURL(file));
      setGeneratedVideoUrl(null); // Reset video output
      setError(null);
      setStatusMessage('Image selected. Enter a prompt and generate your video!');
    }
  };

  const handleSelectExamplePrompt = useCallback((example: string) => {
    setPrompt(example);
  }, []);

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
          const base64Image = reader.result.split(',')[1]; // Extract base64 part
          const imageMimeType = selectedImage.type; // Get mimeType from the selected file object
          const videoBlobUrl = await geminiService.generateVeoVideo(
            prompt,
            base64Image,
            imageMimeType, // Pass the image's mimeType
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
      setError(err.message || "An unexpected error occurred during video generation.");
      setStatusMessage('Video generation failed.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedImage, prompt, aspectRatio]);

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mb-8">
        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Generate Video from Image + Prompt</h3>

        {/* Image Upload */}
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
            className="px-5 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
          >
            {selectedImage ? 'Change Image' : 'Select Image'}
          </button>
          {selectedImage && (
            <span className="ml-3 text-slate-600 dark:text-slate-400 truncate max-w-xs">{selectedImage.name}</span>
          )}
          {imagePreviewUrl && (
            <div className="mt-4 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden w-48 h-auto shadow-md">
              <img src={imagePreviewUrl} alt="Image Preview" className="w-full h-auto object-cover" />
            </div>
          )}
        </div>

        {/* Prompt Input */}
        <div className="mb-6">
          <label htmlFor="prompt" className="block text-slate-700 dark:text-slate-300 text-sm font-bold mb-2">
            Video Description Prompt
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="shadow-sm appearance-none border border-slate-300 dark:border-slate-600 rounded w-full py-2 px-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            placeholder="A futuristic car driving through a neon city at night..."
            disabled={isLoading}
          ></textarea>
        </div>

        {/* Aspect Ratio Selection */}
        <div className="mb-6">
          <label className="block text-slate-700 dark:text-slate-300 text-sm font-bold mb-2">
            Aspect Ratio
          </label>
          <div className="flex space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio text-indigo-600 bg-slate-200 dark:bg-slate-600"
                name="aspectRatio"
                value="16:9"
                checked={aspectRatio === '16:9'}
                onChange={() => setAspectRatio('16:9')}
                disabled={isLoading}
              />
              <span className="ml-2 text-slate-700 dark:text-slate-300">16:9 (Landscape)</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio text-indigo-600 bg-slate-200 dark:bg-slate-600"
                name="aspectRatio"
                value="9:16"
                checked={aspectRatio === '9:16'}
                onChange={() => setAspectRatio('9:16')}
                disabled={isLoading}
              />
              <span className="ml-2 text-slate-700 dark:text-slate-300">9:16 (Portrait)</span>
            </label>
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={generateVideo}
          disabled={!selectedImage || !prompt.trim() || isLoading}
          className="w-full px-6 py-3 bg-emerald-600 text-white font-medium rounded-md shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isLoading ? 'Generating Video...' : 'Generate Video'}
        </button>

        <p className={`mt-4 text-center ${error ? 'text-red-500' : 'text-slate-600 dark:text-slate-400'}`}>
          {error || statusMessage}
        </p>
      </div>

      {/* Generated Video Display */}
      {generatedVideoUrl && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mt-8">
          <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Your Generated Video</h3>
          <div className="flex justify-center">
            <video
              controls
              src={generatedVideoUrl}
              className="w-full max-w-2xl rounded-lg shadow-lg"
              autoPlay
              loop
              muted
            >
              Your browser does not support the video tag.
            </video>
          </div>
          <p className="mt-4 text-slate-600 dark:text-slate-400 text-center text-sm">Right-click or long-press the video to save.</p>
        </div>
      )}
    </div>
  );
};

export default VideoGenerator;