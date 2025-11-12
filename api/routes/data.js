const express = require('express');
const router = express.Router();
const { index } = require('../db/upstash');
const { authenticateKey } = require('../auth/apiKey');

// @route   GET api/data/:id
// @desc    Fetch a vector by ID from Upstash
// @access  Private
router.get('/:id', authenticateKey, async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({ msg: 'Vector ID is required.' });
    }

    try {
        const result = await index.fetch([id], { includeData: true });

        if (!result || result.length === 0 || !result[0]) {
            return res.status(404).json({ msg: `Vector with ID '${id}' not found.` });
        }

        res.json({ result: result[0] });
    } catch (err) {
        console.error(`Error fetching vector from Upstash: ${err.message}`);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
