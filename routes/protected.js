// website/routes/protected.js
const express = require('express');
const path = require('path');
const router = express.Router();
const { isTokenAuthenticated } = require('../middleware/auth');

const VIZ_EMAIL = 'eliran123345@gmail.com';

router.get('/camera.html', isTokenAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'protected', 'camera.html'));
});

router.get('/stats.html', isTokenAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'protected', 'stats.html'));
});

// NEW: viz.html (only one email allowed)
router.get('/viz.html', isTokenAuthenticated, (req, res) => {
  if (req.user?.email !== VIZ_EMAIL) return res.status(403).send('Forbidden');
  res.sendFile(path.join(__dirname, '..', 'protected', 'viz.html'));
});

module.exports = router;
