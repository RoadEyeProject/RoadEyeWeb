const { parse } = require('url');
const querystring = require('querystring');
const jwt = require('jsonwebtoken');
const redisClient = require('../config/redisClient');
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
  } catch (err) {
    console.error('JWT verification failed:', err);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // Complete WebSocket upgrade and emit a custom authenticated event
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('authenticated-connection', ws, user);
  });
}

// Attach this once in your server.js
function registerConnectionHandler(wss) {
  wss.on('authenticated-connection', (ws, user) => {
    console.log('✅ WebSocket client connected:', user.firstName);
    userSockets.set(user.id, ws);

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        const eventType = normalizeEventType(message.eventType);
        const enrichedMessage = { ...message, userId: user.id };
        await redisClient.rPush('image_queue', JSON.stringify(enrichedMessage));
        console.log(`📨 Pushed message from ${user.firstName}`);
      } catch (err) {
        console.error('❌ Failed to process message:', err);
        ws.close(4001, 'Invalid message');
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      userSockets.delete(user.id);
    });
  });
}

module.exports = {
  setupWebSocket,
  registerConnectionHandler,
  userSockets
};
