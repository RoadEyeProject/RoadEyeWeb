const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const User = require('../models/User');

const router = express.Router();

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

router.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'signup.html'));
});

router.post('/signup', async (req, res) => {
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

router.post('/login', (req, res, next) => {
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

module.exports = router;
