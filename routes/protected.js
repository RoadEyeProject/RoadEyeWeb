const express = require('express');
const path = require('path');
const router = express.Router();
const { isTokenAuthenticated } = require('../middleware/auth');


router.get('/camera.html', isTokenAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'protected', 'camera.html'));
});


router.get('/stats.html', isTokenAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'protected', 'stats.html'));
});

module.exports = router;
