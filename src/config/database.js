const mysql = require("mysql2/promise");

// =====================================================
// DATABASE ENVIRONMENT VARIABLES
// =====================================================

const {
    DB_HOST,
    DB_PORT,
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

for (
    const [name, value]
    of Object.entries(
        requiredDatabaseVariables
    )
) {
    if (!value) {
        throw new Error(
            `${name} is missing. Add it to your environment variables before starting GymBuddy.`
        );
    }
}

// =====================================================
// DATABASE PORT
// =====================================================

const databasePort =
    Number(
        DB_PORT ||
        3306
    );

if (
    !Number.isInteger(
        databasePort
    ) ||
    databasePort <= 0 ||
    databasePort > 65535
) {
    throw new Error(
        "DB_PORT must be a valid database port number."
    );
}

// =====================================================
// MYSQL CONNECTION POOL
// =====================================================

const db = mysql.createPool({
    host:
        DB_HOST,

    port:
        databasePort,

    user:
        DB_USER,

    password:
        DB_PASSWORD,

    database:
        DB_NAME,

    waitForConnections:
        true,

    connectionLimit:
        10,

    queueLimit:
        0,

    enableKeepAlive:
        true,

    keepAliveInitialDelay:
        0
});

// =====================================================
// EXPORT DATABASE POOL
// =====================================================

module.exports = db;