// db.js - connects the website to the MySQL database.
// Other files use it like this:  const db = require('./db');

const mysql = require('mysql2/promise');

// A "pool" keeps a few connections open and reuses them (faster than connecting every time).
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

module.exports = db;
