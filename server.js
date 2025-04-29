require('dotenv').config();
const jwt = require('jsonwebtoken');
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
const cookieParser = require('cookie-parser');
const app = express();
app.use(cookieParser());
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;
const imagesDir = path.join(__dirname, 'images');

const client = redis.createClient({
    url: process.env.UPSTASH_REDIS_URL
});

async function startServer() {
    try {
        await client.connect();
        console.log('Connected to Redis');

        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        app.use(express.static(path.join(__dirname, 'public'), {
            index: false,
            extensions: ['html', 'htm'],
            setHeaders: (res, filePath) => {}
        }));
        app.use(express.urlencoded({ extended: false }));
        app.use(session({ secret: 'yourSecretKey', resave: false, saveUninitialized: true }));
        app.use(passport.initialize());
        app.use(passport.session());
        app.use('/protected', express.static(path.join(__dirname, 'protected')));

        passport.serializeUser((user, done) => done(null, user.id));
        passport.deserializeUser(async (id, done) => {
            try {
                const user = await User.findById(id);
                done(null, user);
            } catch (err) {
                done(err);
            }
        });

        passport.use(new LocalStrategy(
            { usernameField: 'email' }, // Tell Passport to expect 'email' instead of 'username'
            async (email, password, done) => {
              try {
                const user = await User.findOne({ email }); // Search by email
                if (!user) return done(null, false, { message: 'Incorrect email.' });
          
                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) return done(null, false, { message: 'Incorrect password.' });
          
                return done(null, user); // Authentication successful
              } catch (err) {
                return done(err);
              }
            }
          ));
          

        // passport.use(new GoogleStrategy({
        //     clientID: process.env.GOOGLE_CLIENT_ID,
        //     clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        //     callbackURL: process.env.GOOGLE_CALLBACK_URL
        // }, async (accessToken, refreshToken, profile, done) => {
        //     const username = profile.emails[0].value;
        //     try {
        //         let user = await User.findOne({ username });
        //         if (!user) {
        //             user = await User.create({ username, password: 'google-oauth' });
        //         }
        //         done(null, user);
        //     } catch (err) {
        //         done(err);
        //     }
        // }));

        app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

        app.post('/login', async (req, res, next) => {
            passport.authenticate('local', async (err, user, info) => {
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
                    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
                });

                res.redirect('/camera.html');
            })(req, res, next);
        });
        

        app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
        

        function isPasswordStrong(password) {
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
            return passwordRegex.test(password);
        }
        app.post('/signup', async (req, res) => {
            const { firstName, lastName, email, password } = req.body;
        
            if (!isPasswordStrong(password)) {
                console.log('Password too weak');
                return res.redirect('/signup');
            }
        
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
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        });

        wss.on('connection', (ws) => {
            console.log('New WebSocket client connected');
        
            ws.on('message', async (data) => {
                const message = JSON.parse(data);
        
                try {
                    const decoded = jwt.verify(message.token, process.env.JWT_SECRET); 
        
                    const newMessage = {
                        eventType: message.eventType,
                        timestamp: message.timestamp,
                        location: message.location,
                        image: message.image,
                        userId: decoded.id,
                        email: decoded.email,
                        firstName: decoded.firstName,
                        lastName: decoded.lastName
                    };
        
                    await client.rPush('image_queue', JSON.stringify(newMessage));
        
                    console.log(`Saved message from user: ${decoded.email}`);
                } catch (err) {
                    console.error('Invalid JWT token:', err);
                    ws.close(4001, 'Unauthorized');
                }
            });
        
            ws.on('close', () => console.log('WebSocket client disconnected'));
        });        
    } catch (err) {
        console.error('Startup error:', err);
        process.exit(1);
    }
}

function isTokenAuthenticated(req, res, next) {
    const token = req.cookies.token;
    if (!token) {
        return res.redirect('/');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Save user info if you want
        next();
    } catch (err) {
        console.error('Invalid token:', err);
        res.redirect('/');
    }
}

startServer();
