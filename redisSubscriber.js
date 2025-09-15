// website/redisSubscriber.js
const redisClient = require('./config/redisClient');
const { userSockets, vizSockets } = require('./sockets/websocket');

async function setupRedisSubscriber() {
  const subscriber = redisClient.duplicate();
  await subscriber.connect();

  // Existing: real-time events -> specific user socket
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

  // NEW: viz frames -> broadcast to all viz viewers
  await subscriber.subscribe('viz_frames', (message) => {
    // message is a JSON string: { type:'viz_frame', image:'data:image/jpeg;base64,...', ts:... }
    for (const ws of vizSockets) {
      try {
        if (ws.readyState === ws.OPEN) ws.send(message);
      } catch (err) {
        console.error('❌ Failed to send viz frame:', err);
      }
    }
  });
  console.log('✅ Subscribed to Redis "viz_frames" channel');

  return subscriber;
}

module.exports = setupRedisSubscriber;
