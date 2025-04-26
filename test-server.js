const express = require('express');
const { WebSocketServer } = require('ws');

const app = express();
const port = process.env.PORT || 3000; // IMPORTANT for Render!

// Basic HTTP server
app.get('/', (req, res) => {
    res.send('Hello from Express Server');
});

// Start server
const server = app.listen(port, () => {
    console.log(`HTTP Server running on port ${port}`);
});

// WebSocket server
const wss = new WebSocketServer({ noServer: true });

// Upgrade HTTP to WebSocket if url === '/ws'
server.on('upgrade', (request, socket, head) => {
    const { url } = request;
    if (url === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('✅ New WebSocket client connected');

    ws.on('message', (message) => {
        console.log('📩 Received:', message.toString());

        // Simple echo back
        ws.send(`Echo: ${message}`);
    });

    ws.on('close', () => {
        console.log('❌ WebSocket client disconnected');
    });
});
