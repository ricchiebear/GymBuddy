const mysql = require("mysql2/promise");

// =====================================================
// DATABASE ENVIRONMENT VARIABLES
// =====================================================

const {
    DB_HOST,
    DB_USER,
    DB_PASSWORD,
    DB_NAME
} = process.env;

// =====================================================
// VALIDATE DATABASE CONFIGURATION
// =====================================================

const requiredDatabaseVariables = {
    DB_HOST,
    DB_USER,
    DB_PASSWORD,
    DB_NAME
};

for (const [name, value] of Object.entries(
    requiredDatabaseVariables
)) {
    if (!value) {
        throw new Error(
            `${name} is missing. Add it to your environment variables before starting GymBuddy.`
        );
    }
}

// =====================================================
// MYSQL CONNECTION POOL
// =====================================================

const db = mysql.createPool({
    host: DB_HOST,

    user: DB_USER,

    password: DB_PASSWORD,

    database: DB_NAME,

    waitForConnections: true,

    connectionLimit: 10,

    queueLimit: 0
});

// =====================================================
// EXPORT DATABASE POOL
// =====================================================

module.exports = db;