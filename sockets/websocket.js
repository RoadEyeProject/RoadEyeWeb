const { parse } = require('url');
const querystring = require('querystring');
const jwt = require('jsonwebtoken');
const redisClient = require('../config/redisClient');
const User = require('../models/User');
const { normalizeEventType } = require('../utils/eventNormalizer');
const userSockets = new Map(); // userId -> ws

function setupWebSocket(wss, req, socket, head) {
  const { query } = parse(req.url);
  const { token } = querystring.parse(query);

  if (!token) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
    req.user = user;
  } catch (err) {
    console.error('JWT verification failed:', err);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });

  wss.on('connection', (ws, req) => {
    const user = req.user;
    console.log('✅ WebSocket client connected:', user.firstName);

    ws.on('message', async (data) => {
      const message = JSON.parse(data);
      try {
        const eventType = normalizeEventType(message.eventType);
        if (!eventType) {
          console.warn("Unknown event type:", message.eventType);
          return;
        }
        const enrichedMessage = { ...message, userId: user.id };
        await redisClient.rPush('image_queue', JSON.stringify(enrichedMessage));
        console.log(`📨 Pushed message from ${user.firstName}`);
      } catch (err) {
        console.error('❌ Failed to process message:', err);
        ws.close(4001, 'Invalid message');
      }
    });

    userSockets.set(user.id, ws);
    
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      userSockets.delete(user.id); // cleanup on disconnect
    });
  });
}

module.exports = { setupWebSocket, userSockets };
