// Backend Node.js Gemini service — mirrors analyzeSalesCallAudio from
// services/geminiService.ts but runs server-side without browser APIs.

const { GoogleGenAI, Type } = require('@google/genai');

function getAiClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not set.');
    }
    return new GoogleGenAI({ apiKey });
}

/**
 * Transcribes and analyses a sales call audio file using Gemini 2.5 Pro.
 *
 * @param {string} audioBase64 - Base64-encoded audio data
 * @param {string} mimeType    - MIME type of the audio (e.g. "audio/webm")
 * @returns {Promise<{ diarizedTranscript, sentimentData, coachingCard, summary }>}
 */
async function analyzeSalesCallAudio(audioBase64, mimeType) {
    const ai = getAiClient();
    const model = 'gemini-2.5-pro';

    const fullAnalysisPrompt = `
Analyze the provided sales call audio and generate a comprehensive report in a single JSON object format.
The report must include the following four top-level keys: "diarizedTranscript", "sentimentData", "coachingCard", and "summary".

1. **diarizedTranscript**: Transcribe the audio, identifying and labeling two distinct speakers as 'Speaker A' (the salesperson) and 'Speaker B' (the customer). The value should be a JSON array of objects, each with "speaker" and "text" string properties.
2. **sentimentData**: Analyze the sentiment of the conversation over time. The value should be a JSON array of objects, where each object has a "segmentIndex" (integer, corresponding to the transcript segment index starting from 0) and a "score" (a number from -1.0 for very negative to 1.0 for very positive).
3. **coachingCard**: Provide coaching feedback for the salesperson. The value should be a JSON object with two keys: "strengths" (an array of 3 strings highlighting what the salesperson did well) and "opportunities" (an array of 3 strings for areas of improvement).
4. **summary**: Write a concise, one-paragraph summary of the entire call.

Ensure the final output is only the JSON object, without any surrounding text or markdown.
    `.trim();

    const response = await ai.models.generateContent({
        model,
        contents: [
            {
                parts: [
                    { text: fullAnalysisPrompt },
                    {
                        inlineData: {
                            mimeType,
                            data: audioBase64,
                        },
                    },
                ],
            },
        ],
        config: {
            responseMimeType: 'application/json',
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

    const result = JSON.parse(response.text.trim());

    return {
        diarizedTranscript: result.diarizedTranscript,
        sentimentData: result.sentimentData,
        coachingCard: result.coachingCard,
        summary: result.summary,
    };
}

module.exports = { analyzeSalesCallAudio };
