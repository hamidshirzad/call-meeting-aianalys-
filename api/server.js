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
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const requestId = req.requestId || uuidv4();
    console.error(`[${requestId}] Unhandled error:`, err);
    res.status(500).json({
        error: {
            code: '500',
            message: 'An internal error was encountered. Please try again later.',
            status: 'INTERNAL',
            requestId,
        },
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Sales Coaching API server running on port ${PORT}`);
});

module.exports = app;
