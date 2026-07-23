const mysql = require('mysql2/promise');

// Create a connection pool to the MySQL database
const db = mysql.createPool({
  host: 'db',
  user: "root",
  password: "password",
  database: 'gymbuddy',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = db;