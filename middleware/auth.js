const jwt = require('jsonwebtoken');

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

module.exports = { isTokenAuthenticated };
