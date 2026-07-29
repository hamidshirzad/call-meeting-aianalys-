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
        return res.status(401).json({ msg: 'Authorization header is missing' });
    }

    const token = authHeader.split(' ')[1]; // Expecting "Bearer [key]"

    if (!token) {
        return res.status(401).json({ msg: 'Token is missing from Authorization header' });
    }

    try {
        // In a real implementation, you'd verify the key against a user database
        const user = usersByApiKey[token];
        
        if (!user) {
             return res.status(403).json({ msg: 'Invalid API Key' });
        }

        req.user = user; // Attach user info to the request object
        
        // Pass to the usage tracker middleware after successful authentication
        usageTracker(req, res, next);
        
    } catch (err) {
        console.error('API key authentication error:', err);
        res.status(500).send('Server Error');
    }
}

module.exports = { authenticateKey };
