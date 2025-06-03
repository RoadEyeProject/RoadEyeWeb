// routes/reports.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// GET /api/reports
router.get('/', async (req, res) => {
    try {
        const token = req.cookies.token;
        if (!token) return res.status(401).json({ error: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json(user.reportCounts || {
            "Police Car": 0,
            "Road Construction": 0,
            "Accident": 0
        });
    } catch (err) {
        console.error('Error fetching report data:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
