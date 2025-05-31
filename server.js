require('dotenv').config();
const { parse } = require('url');
const querystring = require('querystring');
const jwt = require('jsonwebtoken');
const express = require('express');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const path = require('path');
const cookieParser = require('cookie-parser');
const { WebSocketServer } = require('ws');
const redis = require('redis');
const mongoose = require('mongoose');
const User = require('./models/User');

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;

const client = redis.createClient({
    url: process.env.REDIS_URL
});

// Middleware
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(passport.initialize());
app.use(express.static(path.join(__dirname, 'public'), {
    index: false,
    extensions: ['html', 'htm']
}));
app.use('/protected', express.static(path.join(__dirname, 'protected')));

// Passport Local Strategy only
passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
        const user = await User.findOne({ email });
        if (!user) return done(null, false, { message: 'Incorrect email.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return done(null, false, { message: 'Incorrect password.' });

        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.post('/login', (req, res, next) => {
    passport.authenticate('local', async (err, user) => {
        if (err) return next(err);
        if (!user) return res.redirect('/');

        const token = jwt.sign({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName
        }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.cookie('access_token', token, {
            httpOnly: false,
            secure: true,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.redirect('/camera.html');
    })(req, res, next);
});

app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));

app.post('/signup', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;

    try {
        const hash = await bcrypt.hash(password, 10);
        await User.create({ firstName, lastName, email, password: hash });
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.redirect('/signup');
    }
});

app.get('/camera.html', isTokenAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'protected', 'camera.html'));
});

function isTokenAuthenticated(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.redirect('/');

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        console.error('Invalid token:', err);
        res.redirect('/');
    }
}

// WebSocket & server setup
async function startServer() {
    try {
        await client.connect();
        console.log('✅ Connected to Redis');

        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const server = app.listen(port, '0.0.0.0', () => {
            console.log(`🚀 Server running at http://0.0.0.0:${port}`);
        });

        const wss = new WebSocketServer({ noServer: true });

        server.on('upgrade', (req, socket, head) => {
            const { query } = parse(req.url);
            const { token } = querystring.parse(query);

            if (!token) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }

            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                req.user = decoded;
            } catch (err) {
                console.error('JWT verification failed:', err);
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }

            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit('connection', ws, req);
            });
        });

        wss.on('connection', (ws, req) => {
            console.log('WebSocket client connected');
            const user = req.user;

            ws.on('message', async (data) => {
                const message = JSON.parse(data);
                const enrichedMessage = {
                    ...message,
                    userId: user.id
                };
                await client.rPush('image_queue', JSON.stringify(enrichedMessage));
            });

            ws.on('close', () => console.log('WebSocket client disconnected'));
        });

    } catch (err) {
        console.error('❌ Startup error:', err);
        process.exit(1);
    }
}

startServer();
