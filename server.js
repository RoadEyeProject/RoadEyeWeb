require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const redis = require('redis');
const mongoose = require('mongoose');
const User = require('./models/User');

const app = express();
const port = 3000;
const imagesDir = path.join(__dirname, 'images');
const client = redis.createClient ({
    url : process.env.UPSTASH_REDIS_URL
  });
client.on("error", function(err) {
    throw err;
});
client.connect()

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)

app.use(express.static(path.join(__dirname, 'public'), {
    index: false,
    extensions: ['html', 'htm'],
    setHeaders: (res, filePath) => {
        if (path.basename(filePath) === 'camera.html') {
            res.status(403).end('Access denied');
        }
    }
}));
app.use(express.urlencoded({ extended: false }));
app.use(session({ secret: 'yourSecretKey', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err);
    }
});

passport.use(new LocalStrategy(async (username, password, done) => {
    try {
        const user = await User.findOne({ username });
        if (!user) return done(null, false, { message: 'Incorrect username.' });

        const isMatch = await bcrypt.compare(password, user.password);
        return done(null, isMatch ? user : false);
    } catch (err) {
        return done(err);
    }
}));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    const username = profile.emails[0].value;
    try {
        let user = await User.findOne({ username });
        if (!user) {
            user = await User.create({ username, password: 'google-oauth' });
        }
        done(null, user);
    } catch (err) {
        done(err);
    }
}));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.post('/login', passport.authenticate('local', {
    successRedirect: '/camera.html',
    failureRedirect: '/'
}));

app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));

app.post('/signup', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        await User.create({ username, password: hash });
        res.redirect('/');
    } catch (err) {
        res.redirect('/signup');
    }
});

app.get('/camera.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'protected', 'camera.html'));
});

app.get('/auth/google', passport.authenticate('google', { scope: ['email', 'profile'] }));

app.get('/auth/google/callback', passport.authenticate('google', {
    successRedirect: '/camera.html',
    failureRedirect: '/'
}));

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    const { url } = request;
    if (url === '/ws') {  // Only upgrade WebSocket requests made to /ws
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});


wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');

    ws.on('message', async (data) => {
        const message = JSON.parse(data);
        if (message.image) {
            const base64Data = message.image.replace(/^data:image\/(png|jpeg);base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            const filename = `image_${message.timestamp}.jpg`;

            //fs.writeFileSync(path.join(imagesDir, filename), buffer); 
            //until we have seperate dev environmets, we will not save images localy to save space
            //we a re using free services we cannot clutter it

            console.log(`Saved image as ${filename}`);
        }
        await client.rPush('image_queue', JSON.stringify(message));
    });

    ws.on('close', () => console.log('WebSocket client disconnected'));
});

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/');
}
