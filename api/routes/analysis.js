const express = require('express');
const multer = require('multer');
const { authenticateKey } = require('../auth/apiKey');
const geminiService = require('../services/geminiService');

const router = express.Router();

// Store uploaded files in memory so we can read them as a Buffer.
// fileSize is capped at 50 MB; multer will emit LIMIT_FILE_SIZE on overflow.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

// Wrap upload.single() so that MulterErrors (LIMIT_FILE_SIZE, unexpected field,
// etc.) are explicitly forwarded to Express's error-handler chain via next(err)
// rather than relying on multer's implicit behaviour.
function handleUpload(req, res, next) {
    upload.single('file')(req, res, (err) => {
        if (err) return next(err);
        next();
    });
}

const ALLOWED_MIME_TYPES = new Set([
    'audio/webm',
    'audio/mp3',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/mp4',
    'audio/aac',
]);

// @route   POST /api/analyze
// @desc    Upload an audio file and receive a structured sales call analysis report
// @access  Private (Bearer API key required)
router.post('/', authenticateKey, handleUpload, async (req, res) => {
    const requestId = req.requestId;
    let audioBase64, mimeType;

    // --- Input resolution: multipart/form-data takes precedence over JSON body ---
    if (req.file) {
        audioBase64 = req.file.buffer.toString('base64');
        mimeType = req.file.mimetype;
    } else if (req.body && req.body.audioBase64) {
        audioBase64 = req.body.audioBase64;
        mimeType = req.body.mimeType || 'audio/webm';
    } else {
        return res.status(422).json({
            error: {
                code: '422',
                message:
                    'Invalid input provided. Please ensure you upload a valid audio file ' +
                    '(e.g., .webm, .mp3, .wav) via multipart/form-data (field name: "file") ' +
                    'or provide "audioBase64" and "mimeType" in a JSON body.',
                status: 'INVALID_ARGUMENT',
            },
        });
    }

    // --- MIME type validation ---
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return res.status(422).json({
            error: {
                code: '422',
                message:
                    `Unsupported audio format "${mimeType}". ` +
                    'Supported formats: audio/webm, audio/mp3, audio/mpeg, audio/wav, audio/ogg, audio/mp4, audio/aac.',
                status: 'INVALID_ARGUMENT',
            },
        });
    }

    try {
        console.log(`[${requestId}] Starting analysis for user "${req.user.id}", mimeType="${mimeType}"`);

        const analysisResult = await geminiService.analyzeSalesCallAudio(audioBase64, mimeType);

        const report = {
            id: `call_analysis_${Date.now()}`,
            timestamp: new Date().toISOString(),
            summary: analysisResult.summary,
            diarizedTranscript: analysisResult.diarizedTranscript,
            sentimentData: analysisResult.sentimentData,
            coachingCard: analysisResult.coachingCard,
        };

        console.log(`[${requestId}] Analysis complete for user "${req.user.id}", reportId="${report.id}"`);

        res.json(report);
    } catch (err) {
        console.error(`[${requestId}] Analysis error for user "${req.user.id}":`, err.message);
        res.status(500).json({
            error: {
                code: '500',
                message: 'An internal error was encountered during analysis. Please try again later.',
                status: 'INTERNAL',
                requestId,
            },
        });
    }
});

module.exports = router;
