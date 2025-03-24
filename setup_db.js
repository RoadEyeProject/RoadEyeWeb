// setup_db.js
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const db = new sqlite3.Database('./users.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);

  // Sample user: username 'admin', password 'admin123'
  bcrypt.hash('admin123', 10, (err, hash) => {
    db.run('INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)', ['admin', hash]);
  });
});

db.close();
