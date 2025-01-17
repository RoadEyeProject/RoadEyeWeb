const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const redis = require('redis');

const app = express();
const port = 3000;
const imagesDir = path.join(__dirname, 'images');
const client = redis.createClient();
client.connect();

// Function to send messages to a Redis queue
async function sendMessage(queueName, message) {
    await client.rPush(queueName, JSON.stringify(message));
    console.log(`Message sent to queue: ${queueName}`);
}

// Create the images directory if it doesn't exist
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
}

// WebSocket server
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});

app.use(express.static(path.join(__dirname, 'public')));

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            console.log('Received a message');


                // Save the image (if present) to the images directory
                if (message.image) {
                    const base64Data = message.image.replace(/^data:image\/jpeg;base64,/, '');
                    const buffer = Buffer.from(base64Data, 'base64');
                    const timestamp = message.timestamp;
                    const filename = `image_${timestamp}.jpg`;
                    const filepath = path.join(imagesDir, filename);
                    fs.writeFileSync(filepath, buffer);
                    console.log(`Saved image as ${filename}`);
                }

                // Send the message to the Redis queue
                await sendMessage('event_queue', message);
            } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});
