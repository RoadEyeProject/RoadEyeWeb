// website/sockets/websocket.js
const { parse } = require('url');
const querystring = require('querystring');
const jwt = require('jsonwebtoken');
const redisClient = require('../config/redisClient');
const { normalizeEventType } = require('../utils/eventNormalizer');

const userSockets = new Map();  // userId -> ws (camera)
const vizSockets  = new Set();  // viewers of viz feed
const VIZ_EMAIL = 'eliran123345@gmail.com';

function setupWebSocket(wss, req, socket, head) {
  const { pathname, query } = parse(req.url);
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

  // Upgrade and attach pathname + user
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws._pathname = pathname || '/';
    ws._user = user;
    wss.emit('authenticated-connection', ws, user);
  });
}

function registerConnectionHandler(wss) {
  wss.on('authenticated-connection', (ws, user) => {
    // Route by path
    if (ws._pathname === '/viz') {
      // Only allow the single email to watch
      if (user.email !== VIZ_EMAIL) {
        ws.close(4003, 'Forbidden');
        return;
      }
      vizSockets.add(ws);
      console.log('✅ Viz viewer connected:', user.email);

      ws.on('close', () => {
        vizSockets.delete(ws);
        console.log('Viz viewer disconnected');
      });
      return;
    }

    // Default path: camera socket (existing behavior)
    console.log('✅ WebSocket client connected (camera):', user.firstName);
    userSockets.set(user.id, ws);

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        const eventType = normalizeEventType(message.eventType);
        const enrichedMessage = { ...message, userId: user.id, eventType };
        await redisClient.rPush('image_queue', JSON.stringify(enrichedMessage));
        console.log(`📨 Pushed message from ${user.firstName}`);
      } catch (err) {
        console.error('❌ Failed to process message:', err);
        ws.close(4001, 'Invalid message');
      }
    });

    ws.on('close', () => {
      userSockets.delete(user.id);
      console.log('WebSocket client disconnected (camera)');
    });
  });
}

module.exports = {
  setupWebSocket,
  registerConnectionHandler,
  userSockets,
  vizSockets
};
