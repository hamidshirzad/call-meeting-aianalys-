import { GoogleGenAI, GenerateContentResponse, Type, Modality, LiveServerMessage, Chat } from "@google/genai";
import { SalesCallAnalysisReport, DiarizedSegment, SentimentData, CoachingCardData, ChatMessage } from '../types';

// Utility functions for audio encoding/decoding, necessary for Live API
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data: Float32Array): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// Helper to get the Gemini AI client, prioritizing the user's key
const getAiClient = (userApiKey?: string) => {
    const apiKey = userApiKey || process.env.API_KEY;
    if (!apiKey) {
        throw new Error("API key is not configured. Please add your key in Settings -> Developer API.");
    }
    return new GoogleGenAI({ apiKey });
};


export const geminiService = {
  // Transcribes and analyzes an uploaded sales call audio in a single, robust call
  async analyzeSalesCallAudio(audioBase64: string, mimeType: string, userApiKey?: string): Promise<Omit<SalesCallAnalysisReport, 'id' | 'timestamp'>> {
    const ai = getAiClient(userApiKey);
    const model = 'gemini-2.5-pro';

    const fullAnalysisPrompt = `
      Analyze the provided sales call audio and generate a comprehensive report in a single JSON object format.
      The report must include the following four top-level keys: "diarizedTranscript", "sentimentData", "coachingCard", and "summary".

      1.  **diarizedTranscript**: Transcribe the audio, identifying and labeling two distinct speakers as 'Speaker A' (the salesperson) and 'Speaker B' (the customer). The value should be a JSON array of objects, each with "speaker" and "text" string properties.
      2.  **sentimentData**: Analyze the sentiment of the conversation over time. The value should be a JSON array of objects, where each object has a "segmentIndex" (integer, corresponding to the transcript segment index starting from 0) and a "score" (a number from -1.0 for very negative to 1.0 for very positive).
      3.  **coachingCard**: Provide coaching feedback for the salesperson. The value should be a JSON object with two keys: "strengths" (an array of 3 strings highlighting what the salesperson did well) and "opportunities" (an array of 3 strings for areas of improvement).
      4.  **summary**: Write a concise, one-paragraph summary of the entire call.

      Ensure the final output is only the JSON object, without any surrounding text or markdown.
    `;

    const analysisResponse: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: [
        {
          parts: [
            { text: fullAnalysisPrompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: audioBase64,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            diarizedTranscript: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  speaker: { type: Type.STRING },
                  text: { type: Type.STRING },
                },
                required: ['speaker', 'text'],
              },
            },
            sentimentData: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  segmentIndex: { type: Type.INTEGER },
                  score: { type: Type.NUMBER },
                },
                required: ['segmentIndex', 'score'],
              },
            },
            coachingCard: {
              type: Type.OBJECT,
              properties: {
                strengths: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                opportunities: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['strengths', 'opportunities'],
            },
            summary: { type: Type.STRING },
          },
          required: ['diarizedTranscript', 'sentimentData', 'coachingCard', 'summary'],
        },
      },
    });

    const analysisResult = JSON.parse(analysisResponse.text.trim());

    return {
      diarizedTranscript: analysisResult.diarizedTranscript,
      sentimentData: analysisResult.sentimentData,
      coachingCard: analysisResult.coachingCard,
      summary: analysisResult.summary,
    };
  },

  // Establishes a live audio transcription session
  async startLiveTranscription(
    stream: MediaStream,
    onTranscriptionUpdate: (text: string) => void,
    onTurnComplete: (fullInput: string, fullOutput: string) => void,
    onError: (error: ErrorEvent) => void,
    onClose: (event: CloseEvent) => void,
    onVolumeUpdate: (volume: number) => void,
    userApiKey?: string,
  ): Promise<{ session: any; stopTranscriptionSession: () => void }> {
    const ai = getAiClient(userApiKey);
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';

    let currentInputTranscription = '';
    let currentOutputTranscription = '';

    const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    let scriptProcessor: ScriptProcessorNode | null = null;

    const sessionPromise = ai.live.connect({
      model: model,
      callbacks: {
        onopen: () => {
          const source = inputAudioContext.createMediaStreamSource(stream);
          scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            let sumSquares = 0;
            for (let i = 0; i < inputData.length; i++) {
              sumSquares += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sumSquares / inputData.length);
            const normalizedVolume = Math.min(100, Math.round(rms * 500));
            onVolumeUpdate(normalizedVolume);

            sessionPromise.then((session) => {
              session.sendRealtimeInput({ media: pcmBlob });
            });
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(inputAudioContext.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.serverContent?.inputTranscription) {
            const text = message.serverContent.inputTranscription.text;
            currentInputTranscription += text;
            onTranscriptionUpdate(currentInputTranscription);
          }
          if (message.serverContent?.outputTranscription) {
            const text = message.serverContent.outputTranscription.text;
            currentOutputTranscription += text;
          }
          if (message.serverContent?.turnComplete) {
            onTurnComplete(currentInputTranscription, currentOutputTranscription);
            currentInputTranscription = '';
            currentOutputTranscription = '';
          }
        },
        onerror: (e: ErrorEvent) => {
          onError(e);
          scriptProcessor?.disconnect();
          if (inputAudioContext.state !== 'closed') inputAudioContext.close();
          onVolumeUpdate(0);
        },
        onclose: (e: CloseEvent) => {
          onClose(e);
          scriptProcessor?.disconnect();
          if (inputAudioContext.state !== 'closed') inputAudioContext.close();
          onVolumeUpdate(0);
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
      },
    });

    const stopTranscriptionSession = () => {
      scriptProcessor?.disconnect();
      if (inputAudioContext.state !== 'closed') {
        inputAudioContext.close();
      }
      sessionPromise.then(session => session.close());
      onVolumeUpdate(0);
    };

    return { session: await sessionPromise, stopTranscriptionSession };
  },

  // Transcribes an audio file using a standard model
  async transcribeAudio(audioBase64: string, mimeType: string, userApiKey?: string): Promise<string> {
    const ai = getAiClient(userApiKey);
    const model = 'gemini-2.5-flash';

    const transcriptionPrompt = `Transcribe the provided audio accurately.`;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: [
        {
          parts: [
            { text: transcriptionPrompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: audioBase64,
              },
            },
          ],
        },
      ],
    });

    return response.text.trim();
  },

  // Generate a video using the Veo model
  async generateVeoVideo(
    prompt: string,
    imageBase64: string,
    imageMimeType: string,
    aspectRatio: '16:9' | '9:16',
    setStatusMessage: (message: string) => void,
  ): Promise<string> {
    if (typeof window === 'undefined' || !(window as any).aistudio) {
        throw new Error("Video generation is only supported in a compatible environment.");
    }

    const hasKey = await (window as any).aistudio.hasSelectedApiKey();
    if (!hasKey) {
        setStatusMessage('Please select your API key before generating video.');
        await (window as any).aistudio.openSelectKey();
        // User must click the generate button again after selecting a key.
        // Throw a user-friendly error to be displayed in the UI.
        throw new Error("API key selected. Please click 'Generate Video' again to proceed.");
    }

    // Per Veo guidelines, create a new client with the key from the aistudio dialog (process.env.API_KEY).
    // This ignores the customApiKey from user settings for this specific feature.
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        throw new Error("API key is not configured. Please select your key and try again.");
    }
    const ai = new GoogleGenAI({ apiKey });

    try {
        setStatusMessage('Sending video generation request...');
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            image: {
                imageBytes: imageBase64,
                mimeType: imageMimeType,
            },
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: aspectRatio,
            },
        });

        setStatusMessage('Video generation in progress. This may take a few minutes...');
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            operation = await ai.operations.getVideosOperation({ operation: operation });
            if (operation.metadata?.state) {
                setStatusMessage(`Video generation state: ${operation.metadata.state}...`);
            }
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) {
            throw new Error("No video download link found in the operation response.");
        }

        setStatusMessage('Video generated! Fetching video data...');
        const response = await fetch(`${downloadLink}&key=${apiKey}`);
        if (!response.ok) {
            const errorText = await response.text();
            if (errorText.includes("Requested entity was not found.")) {
                setStatusMessage('API key might be invalid or expired. Please re-select your API key.');
                await (window as any).aistudio.openSelectKey();
                throw new Error("API key re-selected. Please click 'Generate Video' again to retry.");
            }
            throw new Error(`Failed to fetch video: ${response.statusText} - ${errorText}`);
        }

        const videoBlob = await response.blob();
        return URL.createObjectURL(videoBlob);
    } catch (error: any) {
        console.error("Error during video generation:", error);
        if (error instanceof Error && error.message.includes("Requested entity was not found.")) {
            setStatusMessage('API key might be invalid or expired. Please re-select your API key.');
            await (window as any).aistudio.openSelectKey();
            throw new Error("API key re-selected. Please click 'Generate Video' again to retry.");
        }
        throw error;
    }
  },

  // Method for the AI Chat Assistant
  async getChatResponse(
    history: ChatMessage[],
    newMessage: string,
    context: SalesCallAnalysisReport | null,
    userApiKey?: string,
  ): Promise<string> {
    const ai = getAiClient(userApiKey);
    const model = 'gemini-2.5-pro';

    let systemInstruction = "You are a helpful AI assistant specialized in sales coaching. You can answer questions about sales techniques, analyze call data, and provide coaching advice.";
    
    if (context) {
        const fullTranscriptText = context.diarizedTranscript.map(s => `${s.speaker}: ${s.text}`).join('\n');
        systemInstruction += `\n\nCONTEXT: The user has uploaded a sales call. Here is the data for that call:\n- SUMMARY: ${context.summary}\n- STRENGTHS: ${context.coachingCard.strengths.join(', ')}\n- OPPORTUNITIES: ${context.coachingCard.opportunities.join(', ')}\n- FULL TRANSCRIPT:\n${fullTranscriptText}`;
    }

    const chat: Chat = ai.chats.create({
      model: model,
      history: history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      })),
      config: {
        systemInstruction: systemInstruction,
      },
    });

    const response: GenerateContentResponse = await chat.sendMessage({ message: newMessage });
    return response.text;
  },
  
  // New method for getting a daily coaching tip
  async getCoachingTip(userApiKey?: string): Promise<string> {
    const ai = getAiClient(userApiKey);
    const model = 'gemini-2.5-flash';
    const prompt = "Generate a single, concise, and actionable sales coaching tip of the day. It should be one or two sentences long.";

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: model,
        contents: [{ parts: [{ text: prompt }] }],
    });
    
    return response.text.trim();
  },
};