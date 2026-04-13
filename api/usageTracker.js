// This is an example middleware for tracking API usage.
// In a real application, this would interact with a database (e.g., Redis or MongoDB)
// to fetch and update usage counts atomically.

// Mock in-memory usage store
const usageDatabase = {
    //'user_id': { count: 0, lastReset: 'ISO date string' }
};

const getPlanLimits = (plan) => {
    switch (plan) {
        case 'pro':
            return { quota: 10000 };
        case 'enterprise':
            return { quota: 100000 };
        case 'free':
        default:
            return { quota: 0 };
    }
};

async function usageTracker(req, res, next) {
    const user = req.user;

    if (!user) {
        // Should never reach here if authenticateKey runs first
        return res.status(500).json({
            error: {
                code: '500',
                message: 'An internal error was encountered.',
                status: 'INTERNAL',
                requestId: req.requestId,
            },
        });
    }

    const { quota } = getPlanLimits(user.plan);

    if (quota === 0) {
        return res.status(403).json({
            error: {
                code: '403',
                message:
                    'API access is not available on your current plan. ' +
                    'Please upgrade to Pro or Enterprise.',
                status: 'PERMISSION_DENIED',
            },
        });
    }

    // Initialize user in mock DB if not present
    if (!usageDatabase[user.id]) {
        usageDatabase[user.id] = { count: 0, lastReset: new Date().toISOString() };
    }

    const userUsage = usageDatabase[user.id];

    // Simple monthly reset logic
    const resetDate = new Date(userUsage.lastReset);
    const now = new Date();
    if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
        userUsage.count = 0;
        userUsage.lastReset = now.toISOString();
    }

    if (userUsage.count >= quota) {
        return res.status(429).json({
            error: {
                code: '429',
                message: `You have exceeded your monthly API quota of ${quota} requests.`,
                status: 'RESOURCE_EXHAUSTED',
            },
            usage: {
                count: userUsage.count,
                quota,
                resetDate: userUsage.lastReset,
            },
        });
    }

    // Increment usage count
    userUsage.count++;
    console.log(`API call for user ${user.id}. Usage: ${userUsage.count}/${quota}`);

    next();
}

module.exports = { usageTracker };
