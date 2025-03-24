const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const redis = require('redis');

const app = express();
const port = 3000;
const imagesDir = path.join(__dirname, 'images');
const client = redis.createClient();
client.connect();

app.use(express.static(path.join(__dirname, 'public'), {
    index: false, // prevent automatic serving of index.html
    extensions: ['html', 'htm'],
    setHeaders: (res, filePath) => {
        if (path.basename(filePath) === 'camera.html') {
            res.status(403).end('Access denied'); // prevent direct static access
        }
    }
}));
app.use(express.urlencoded({ extended: false }));
app.use(session({ secret: 'yourSecretKey', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

const db = new sqlite3.Database('./users.db');

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => done(err, user));
});

passport.use(new LocalStrategy((username, password, done) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) return done(err);
        if (!user) return done(null, false, { message: 'Incorrect username.' });

        bcrypt.compare(password, user.password, (err, res) => {
            if (res) return done(null, user);
            return done(null, false, { message: 'Incorrect password.' });
        });
    });
}));

passport.use(new GoogleStrategy({
    clientID: 'YOUR_GOOGLE_CLIENT_ID',
    clientSecret: 'YOUR_GOOGLE_CLIENT_SECRET',
    callbackURL: 'http://localhost:3000/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
    const username = profile.emails[0].value;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) return done(err);
        if (!user) {
            db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, 'google-oauth'], (err) => {
                if (err) return done(err);
                return done(null, { id: this.lastID, username });
            });
        } else {
            return done(null, user);
        }
    });
}));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.post('/login', passport.authenticate('local', {
    successRedirect: '/camera.html',
    failureRedirect: '/'
}));

app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));

app.post('/signup', (req, res) => {
    const { username, password } = req.body;
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.redirect('/signup');
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], (err) => {
            if (err) return res.redirect('/signup');
            res.redirect('/');
        });
    });
});

app.get('/camera.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'protected', 'camera.html'));
});

// Google OAuth routes (keep for future use)
app.get('/auth/google', passport.authenticate('google', { scope: ['email', 'profile'] }));

app.get('/auth/google/callback', passport.authenticate('google', {
    successRedirect: '/camera.html',
    failureRedirect: '/'
}));

// WebSocket and Redis logic (unchanged)
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');

    ws.on('message', async (data) => {
        const message = JSON.parse(data);
        if (message.image) {
            const base64Data = message.image.replace(/^data:image\/jpeg;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            const filename = `image_${message.timestamp}.jpg`;
            fs.writeFileSync(path.join(imagesDir, filename), buffer);
            console.log(`Saved image as ${filename}`);
        }
        await client.rPush('image_queue', JSON.stringify(message));
    });

    ws.on('close', () => console.log('WebSocket client disconnected'));
});

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/');
}