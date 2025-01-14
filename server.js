const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Directory to save images
const imagesDir = path.join(__dirname, 'images');

// Create the images directory if it doesn't exist
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
}

// Serve the client HTML page
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket server
const server = app.listen(port, () => {
    console.log(`HTTP server is running at http://localhost:${port}`);
});
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');

    ws.on('message', async (data) => {
        try {
            // Decode Base64 string if the data is a Base64 image
            const base64Data = data.toString().replace(/^data:image\/jpeg;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');

            // Save the image to the images directory
            const timestamp = Date.now();
            const filename = `image_${timestamp}.jpg`;
            const filepath = path.join(imagesDir, filename);
            fs.writeFileSync(filepath, buffer);

            console.log(`Saved image as ${filename}`);
        } catch (error) {
            console.error('Error saving image:', error);
        }
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});
