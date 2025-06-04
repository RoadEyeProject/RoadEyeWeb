const redisClient = require('./config/redisClient');
const { userSockets } = require('./sockets/websocket');

async function setupRedisSubscriber() {
  const subscriber = redisClient.duplicate();
  await subscriber.connect();

  await subscriber.subscribe('detected_events', (message) => {
    try {
      const data = JSON.parse(message);
      const ws = userSockets.get(data.userId);
      if (ws && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(data));
        console.log(`📤 Real-time event sent to ${data.userId}`);
      }
    } catch (err) {
      console.error('❌ Failed to process Redis Pub/Sub message:', err);
    }
  });

  console.log('✅ Subscribed to Redis "detected_events" channel');
}

module.exports = setupRedisSubscriber;
