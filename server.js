require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');

const redisClient = require('./config/redisClient');
require('./config/passport'); // sets up passport strategies

const authRoutes = require('./routes/auth');
const protectedRoutes = require('./routes/protected');
const setupWebSocket = require('./sockets/websocket');
const reportRoutes = require('./routes/reports');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(passport.initialize());
app.use(express.static(path.join(__dirname, 'public'), { index: false, extensions: ['html', 'htm'] }));
app.use('/protected', express.static(path.join(__dirname, 'protected')));

// Routes
app.use('/', authRoutes);
app.use('/', protectedRoutes);
// Api routes
app.use('/api/reports', reportRoutes);
// WebSocket upgrade
server.on('upgrade', (req, socket, head) => {
  setupWebSocket(wss, req, socket, head);
});

// Start services
async function startServer() {
  try {
    await redisClient.connect();
    console.log('✅ Connected to Redis');

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    server.listen(PORT, () => console.log(`🚀 Server running at http://0.0.0.0:${PORT}`));
  } catch (err) {
    console.error('❌ Startup error:', err);
    process.exit(1);
  }
}

startServer();
