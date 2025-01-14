const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const port = 3000;

// HTTP server
app.get('/', (req, res) => {
    res.send('Server is running...');
});

// Create an HTTP server and attach Express
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');

    ws.on('message', (data) => {
        console.log('Received data:', data.slice(0, 50)); // Log first 50 chars
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});

// Start the server
server.listen(port, () => {
    console.log(`HTTP server and WebSocket server are running on http://localhost:${port}`);
});
