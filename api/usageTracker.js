// This is an example middleware for tracking API usage.
// In a real application, this would interact with a database (e.g., Redis or MongoDB)
// to fetch and update usage counts atomically.

// Mock database to store usage
const usageDatabase = {
    //'user_id': { count: 0, lastReset: 'date' }
};

// Mock function to get plan limits
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
        // This should not happen if authenticateKey runs first
        return res.status(500).json({ msg: 'User not found on request' });
    }

    const { quota } = getPlanLimits(user.plan);

    if (quota === 0) {
        return res.status(403).json({ msg: 'API access is not available on your current plan. Please upgrade to Pro or Enterprise.' });
    }

    // Initialize user in our mock DB if not present
    if (!usageDatabase[user.id]) {
        usageDatabase[user.id] = { count: 0, lastReset: new Date().toISOString() };
    }
    
    const userUsage = usageDatabase[user.id];

    // Simple monthly reset logic (for demonstration)
    const resetDate = new Date(userUsage.lastReset);
    const currentDate = new Date();
    if (currentDate.getMonth() !== resetDate.getMonth() || currentDate.getFullYear() !== resetDate.getFullYear()) {
        userUsage.count = 0;
        userUsage.lastReset = currentDate.toISOString();
    }

    if (userUsage.count >= quota) {
        return res.status(429).json({ 
            msg: `You have exceeded your monthly API quota of ${quota} requests.`,
            usage: {
                count: userUsage.count,
                quota: quota,
                resetDate: userUsage.lastReset
            }
        });
    }

    // Increment usage count
    userUsage.count++;
    console.log(`API call for user ${user.id}. Usage: ${userUsage.count}/${quota}`);

    next();
}

module.exports = { usageTracker };
