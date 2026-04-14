require('dotenv').config();
const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Parse JSON bodies up to 50MB (for base64-encoded audio payloads)
app.use(express.json({ limit: '50mb' }));

// Request logging middleware — attaches a unique ID and logs every incoming request
app.use((req, res, next) => {
    req.requestId = uuidv4();
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${req.requestId}] ${req.method} ${req.path}`);
    next();
});

// Routes
app.use('/api/analyze', require('./routes/analysis'));
app.use('/api/analyze-call', require('./routes/analysis')); // backward-compat alias
app.use('/api/data', require('./routes/data'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/insights', require('./routes/insights'));

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: {
            code: '404',
            message: `Cannot ${req.method} ${req.path}`,
            status: 'NOT_FOUND',
        },
    });
});

// Global error handler
//
// Handles errors from body-parser (entity.too.large → 413), multer
// (LIMIT_FILE_SIZE → 413, other MulterError → 422), explicit client errors
// passed via next(err) with a 4xx status, and unexpected server errors (500).
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const requestId = req.requestId || uuidv4();

    let status;
    let errorStatus; // API-level status string per spec
    let message;

    // ── body-parser: JSON payload exceeds limit ──────────────────────────────
    if (err.type === 'entity.too.large') {
        status      = 413;
        errorStatus = 'PAYLOAD_TOO_LARGE';
        message     = 'Request payload is too large. Audio sent as base64 must be 50 MB or smaller.';

    // ── multer: uploaded file exceeds fileSize limit ─────────────────────────
    } else if (err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE') {
        status      = 413;
        errorStatus = 'PAYLOAD_TOO_LARGE';
        message     = 'Uploaded file exceeds the 50 MB size limit.';

    // ── multer: any other upload constraint (unexpected field, too many files) ─
    } else if (err.name === 'MulterError') {
        status      = 422;
        errorStatus = 'INVALID_ARGUMENT';
        message     = `File upload error: ${err.message}`;

    // ── explicit client errors forwarded via next(err) with a 4xx status ─────
    } else if ((err.statusCode || err.status || 0) >= 400 &&
               (err.statusCode || err.status) < 500) {
        status      = err.statusCode || err.status;
        errorStatus = 'CLIENT_ERROR';
        message     = err.message || 'Bad request.';

    // ── everything else is an unexpected server error ─────────────────────────
    } else {
        status      = 500;
        errorStatus = 'INTERNAL';
        message     = 'An internal error was encountered. Please try again later.';
    }

    const code = String(status);
    console.error(`[${requestId}] [${status}] ${err.name || 'Error'}: ${err.message}`);

    // Only include requestId in the response for server-side errors (5xx)
    // so that callers can quote it when raising a support ticket.
    const body = { error: { code, message, status: errorStatus } };
    if (status >= 500) body.error.requestId = requestId;

    res.status(status).json(body);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Sales Coaching API server running on port ${PORT}`);
});

module.exports = app;
