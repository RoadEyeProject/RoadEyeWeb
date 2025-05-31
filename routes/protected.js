const express = require('express');
const path = require('path');
const { isTokenAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.get('/camera.html', isTokenAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'protected', 'camera.html'));
});

module.exports = router;
