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
const privateMessagesRoutes = require("./routes/privateMessages");
const reportRoutes = require("./routes/report");
const helpRoutes = require("./routes/help");
const recommendationRoutes = require("./routes/recommendation");
const chatbotRoutes = require("./routes/chatbot");
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


//=====================================================
// GLOBAL LOGIN INFORMATION FOR PUG VIEWS
//=====================================================

app.use((req, res, next) => {
    res.locals.isLoggedIn =
        Boolean(
            req.session &&
            req.session.userId
        );

    res.locals.loggedInUserId =
        req.session && req.session.userId
            ? Number(req.session.userId)
            : null;

    res.locals.loggedInUserName =
        req.session && req.session.userName
            ? req.session.userName
            : null;

    next();
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

app.get("/", async (req, res) => {
    try {
        const isLoggedIn =
            Boolean(
                req.session &&
                req.session.userId
            );

        //=====================================================
        // LOGGED-OUT USER
        //=====================================================

        if (!isLoggedIn) {
            return res.render("Home", {
                title: "GymBuddy",
                dashboard: null
            });
        }

        //=====================================================
        // LOGGED-IN USER
        //=====================================================

        const userId =
            Number(req.session.userId);

        //=====================================================
        // CURRENT STREAK
        //=====================================================

        const [streakRows] =
            await db.query(
                `SELECT
                    current_streak,
                    longest_streak
                 FROM streaks
                 WHERE user_id = ?
                 ORDER BY streak_id DESC
                 LIMIT 1`,
                [userId]
            );

        const currentStreak =
            streakRows.length > 0
                ? Number(
                    streakRows[0]
                        .current_streak || 0
                )
                : 0;

        const longestStreak =
            streakRows.length > 0
                ? Number(
                    streakRows[0]
                        .longest_streak || 0
                )
                : 0;

        //=====================================================
        // COMPLETED WORKOUTS
        //=====================================================

        const [[completedResult]] =
            await db.query(
                `SELECT COUNT(*) AS total
                 FROM workout_history
                 WHERE user_id = ?`,
                [userId]
            );

        const completedWorkouts =
            Number(
                completedResult.total || 0
            );

        //=====================================================
        // UPCOMING WORKOUTS CREATED BY USER
        //=====================================================

        const [[createdUpcomingResult]] =
            await db.query(
                `SELECT COUNT(*) AS total
                 FROM workouts
                 WHERE user_id = ?
                   AND start_time >= NOW()
                   AND LOWER(status) = 'open'`,
                [userId]
            );

        //=====================================================
        // UPCOMING WORKOUTS USER JOINED
        //=====================================================

        const [[joinedUpcomingResult]] =
            await db.query(
                `SELECT COUNT(*) AS total
                 FROM workout_participants wp

                 INNER JOIN workouts w
                    ON wp.workout_id =
                       w.workout_id

                 WHERE wp.user_id = ?
                   AND w.start_time >= NOW()
                   AND LOWER(w.status) = 'open'`,
                [userId]
            );

        const upcomingWorkouts =
            Number(
                createdUpcomingResult.total || 0
            ) +
            Number(
                joinedUpcomingResult.total || 0
            );

        //=====================================================
        // WORKOUT PARTNERS
        //=====================================================

        const [[partnerResult]] =
            await db.query(
                `SELECT COUNT(
                    DISTINCT partner_id
                 ) AS total

                 FROM (

                    SELECT
                        wp.user_id AS partner_id

                    FROM workouts w

                    INNER JOIN workout_participants wp
                        ON w.workout_id =
                           wp.workout_id

                    WHERE w.user_id = ?
                      AND wp.user_id != ?

                    UNION

                    SELECT
                        w.user_id AS partner_id

                    FROM workout_participants wp

                    INNER JOIN workouts w
                        ON wp.workout_id =
                           w.workout_id

                    WHERE wp.user_id = ?
                      AND w.user_id != ?

                 ) AS partners`,
                [
                    userId,
                    userId,
                    userId,
                    userId
                ]
            );

        const workoutPartners =
            Number(
                partnerResult.total || 0
            );

        //=====================================================
        // RENDER DASHBOARD
        //=====================================================

        res.render("Home", {
            title: "GymBuddy",

            dashboard: {
                currentStreak,
                longestStreak,
                completedWorkouts,
                upcomingWorkouts,
                workoutPartners
            }
        });

    } catch (error) {
        console.error(
            "HOME DASHBOARD ERROR:",
            error
        );

        res.status(500).send(
            error.sqlMessage ||
            error.message ||
            "Error loading dashboard."
        );
    }
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
app.use("/", privateMessagesRoutes);
app.use("/", reportRoutes);
app.use("/", helpRoutes);
app.use("/", recommendationRoutes);
app.use("/", chatbotRoutes);
// --------------------------------------------------
// EXPORT
// --------------------------------------------------

module.exports = app;