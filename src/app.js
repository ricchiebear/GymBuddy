// src/app.js

const express = require("express");
const path = require("path");
const session = require("express-session");

const db = require("./config/database");

const authenticationRoutes = require("./routes/authentication");
const workoutRoutes = require("./routes/workout");
const notificationRoutes = require("./routes/notification");
const streakRoutes = require("./routes/streaks");
const messagesRoutes = require("./routes/messages");
const helpRoutes = require("./routes/help");

const app = express();

// --------------------------------------------------
// SESSION
// --------------------------------------------------

app.use(
    session({
        secret: "gymbuddy-super-secret-key",
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 2 // 2 hours
        }
    })
);

app.get("/session-check", (req, res) => {
    res.json({
        userId: req.session.userId || null,
        userName: req.session.userName || null,
    });
});

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --------------------------------------------------
// VIEW ENGINE
// --------------------------------------------------

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

// --------------------------------------------------
// STATIC FILES
// --------------------------------------------------

app.use(express.static(path.join(__dirname, "public")));

// --------------------------------------------------
// HOME PAGE
// --------------------------------------------------

app.get("/", (req, res) => {
    res.render("Home", {
        title: "GymBuddy"
    });
});

// --------------------------------------------------
// DATABASE TEST
// --------------------------------------------------

app.get("/db_test", async (req, res) => {
    try {
        const [users] = await db.query("SELECT * FROM users");
        res.json(users);
    } catch (error) {
        console.error("Database test error:", error);
        res.status(500).json({
            error: "Database connection error"
        });
    }
});

// --------------------------------------------------
// ROUTES
// --------------------------------------------------

app.use("/", authenticationRoutes);
app.use("/", workoutRoutes);
app.use("/", notificationRoutes);
app.use("/", streakRoutes);
app.use("/", messagesRoutes);
app.use("/", helpRoutes);

// --------------------------------------------------
// EXPORT
// --------------------------------------------------

module.exports = app;