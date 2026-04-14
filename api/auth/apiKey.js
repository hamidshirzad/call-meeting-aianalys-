// const db = require('../db'); // Assume a database module
const { usageTracker } = require('../usageTracker');

// This is an example middleware for authenticating API keys.
// In a real application, you would look up the key in a secure database.

// Mock User Database
const usersByApiKey = {
    'sk_live_pro_user_key_12345': { id: 'user_pro_123', plan: 'pro' },
    'sk_live_enterprise_user_key_67890': { id: 'user_enterprise_456', plan: 'enterprise' },
    'sk_live_free_user_key_00000': { id: 'user_free_789', plan: 'free' },
};

async function authenticateKey(req, res, next) {
    const authHeader = req.header('Authorization');

    if (!authHeader) {
        return res.status(401).json({
            error: {
                code: '401',
                message: 'Authorization header is missing. Please provide a Bearer token.',
                status: 'UNAUTHENTICATED',
            },
        });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
        return res.status(401).json({
            error: {
                code: '401',
                message: 'Malformed Authorization header. Expected format: "Bearer <api_key>".',
                status: 'UNAUTHENTICATED',
            },
        });
    }

    const token = parts[1];

    try {
        // In a real implementation, verify the key against a secure database
        const user = usersByApiKey[token];

        if (!user) {
            return res.status(403).json({
                error: {
                    code: '403',
                    message: 'The provided API key is invalid or has expired.',
                    status: 'PERMISSION_DENIED',
                },
            });
        }

        req.user = user; // Attach user info to the request object

        // Pass to the usage tracker middleware after successful authentication
        usageTracker(req, res, next);
    } catch (err) {
        console.error('API key authentication error:', err);
        res.status(500).json({
            error: {
                code: '500',
                message: 'An internal error was encountered during authentication.',
                status: 'INTERNAL',
                requestId: req.requestId,
            },
        });
    }
}

module.exports = { authenticateKey };
