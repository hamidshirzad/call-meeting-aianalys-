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
  // The guideline's `createBlob` example for `sendRealtimeInput` expects `Uint8Array` in `encode`.
  // `new Uint8Array(int16.buffer)` correctly converts Int16Array's underlying ArrayBuffer to Uint8Array.
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}


export const geminiService = {
  // Transcribes and analyzes an uploaded sales call audio
  async analyzeSalesCallAudio(audioBase64: string): Promise<Omit<SalesCallAnalysisReport, 'id' | 'timestamp'>> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const modelFlash = 'gemini-2.5-flash';
    const modelPro = 'gemini-2.5-pro';

    // Step 1: Transcribe and diarize the audio using gemini-2.5-flash
    const transcriptionPrompt = `
      Transcribe the following sales call audio. Identify and label two distinct speakers as 'Speaker A' and 'Speaker B'. Format the output as a JSON array of objects, where each object has 'speaker' (string) and 'text' (string) properties. Ensure the transcription is accurate and covers the entire audio content.

      Example format:
      [
        { "speaker": "Speaker A", "text": "Hello, thank you for calling." },
        { "speaker": "Speaker B", "text": "Hi, I'm interested in your new product." }
      ]
    `;

    const transcriptionResponse: GenerateContentResponse = await ai.models.generateContent({
      model: modelFlash,
      contents: [
        {
          parts: [
            { text: transcriptionPrompt },
            {
              inlineData: {
                mimeType: 'audio/mpeg',
                data: audioBase64,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              speaker: { type: Type.STRING },
              text: { type: Type.STRING },
            },
            propertyOrdering: ["speaker", "text"],
          },
        },
      },
    });

    const diarizedTranscript: DiarizedSegment[] = JSON.parse(transcriptionResponse.text.trim());

    const fullTranscriptText = diarizedTranscript.map(s => `${s.speaker}: ${s.text}`).join('\n');

    // Step 2: Analyze the transcript for sentiment and coaching using gemini-2.5-pro
    const analysisPrompt = `
      Given the following sales call transcript, perform two tasks:
      1. Sentiment Analysis: Break down the transcript into logical segments. For each segment, provide a sentiment score from -1 (very negative) to 1 (very positive).
      2. Coaching Card: Identify 3 specific things the salesperson (Speaker A) did well and 3 specific missed opportunities.

      Format the entire output as a single JSON object.

      Transcript:
      ${fullTranscriptText}
    `;

    const analysisResponse: GenerateContentResponse = await ai.models.generateContent({
      model: modelPro,
      contents: [{ parts: [{ text: analysisPrompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sentimentData: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  segmentIndex: { type: Type.INTEGER },
                  score: { type: Type.NUMBER },
                },
                propertyOrdering: ["segmentIndex", "score"],
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
              propertyOrdering: ["strengths", "opportunities"],
            },
          },
          propertyOrdering: ["sentimentData", "coachingCard"],
        },
      },
    });

    const analysisResult = JSON.parse(analysisResponse.text.trim());

    // Step 3: Generate a brief, one-paragraph summary using gemini-2.5-flash
    const summaryPrompt = `Generate a brief, one-paragraph summary of the sales call, highlighting the main topics discussed and the overall outcome based on the following transcript:\n\n${fullTranscriptText}`;

    const summaryResponse: GenerateContentResponse = await ai.models.generateContent({
      model: modelFlash,
      contents: [{ parts: [{ text: summaryPrompt }] }],
    });
    const summary = summaryResponse.text.trim();

    return {
      diarizedTranscript,
      sentimentData: analysisResult.sentimentData,
      coachingCard: analysisResult.coachingCard,
      summary,
    };
  },

  // Establishes a live audio transcription session
  async startLiveTranscription(
    stream: MediaStream,
    onTranscriptionUpdate: (text: string) => void,
    onTurnComplete: (fullInput: string, fullOutput: string) => void,
    onError: (error: ErrorEvent) => void,
    onClose: (event: CloseEvent) => void,
    onVolumeUpdate: (volume: number) => void
  ): Promise<{ session: any; stopTranscriptionSession: () => void }> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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

  // Generate a video using the Veo model
  async generateVeoVideo(
    prompt: string,
    imageBase64: string,
    imageMimeType: string,
    aspectRatio: '16:9' | '9:16',
    setStatusMessage: (message: string) => void,
  ): Promise<string> {
    if (typeof window !== 'undefined' && (window as any).aistudio) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) {
        setStatusMessage('Please select your API key before generating video.');
        await (window as any).aistudio.openSelectKey();
        setStatusMessage('API key selected. Retrying video generation...');
      }
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
      const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
      if (!response.ok) {
        const errorText = await response.text();
        if (errorText.includes("Requested entity was not found.") && typeof window !== 'undefined' && (window as any).aistudio) {
          setStatusMessage('API key might be invalid or expired. Please re-select your API key.');
          await (window as any).aistudio.openSelectKey();
        }
        throw new Error(`Failed to fetch video: ${response.statusText} - ${errorText}`);
      }

      const videoBlob = await response.blob();
      return URL.createObjectURL(videoBlob);
    } catch (error: any) {
      console.error("Error during video generation:", error);
      if (error instanceof Error && error.message.includes("Requested entity was not found.") && typeof window !== 'undefined' && (window as any).aistudio) {
        setStatusMessage('API key might be invalid or expired. Please re-select your API key.');
        await (window as any).aistudio.openSelectKey();
      }
      throw error;
    }
  },

  // Method for the AI Chat Assistant
  async getChatResponse(
    history: ChatMessage[],
    newMessage: string,
    context: SalesCallAnalysisReport | null
  ): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
  async getCoachingTip(): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-2.5-flash';
    const prompt = "Generate a single, concise, and actionable sales coaching tip of the day. It should be one or two sentences long.";

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: model,
        contents: [{ parts: [{ text: prompt }] }],
    });
    
    return response.text.trim();
  },
};