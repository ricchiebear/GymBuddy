// src/app.js

const express = require("express");
const path = require("path");
const session = require("express-session");
const helmet = require("helmet");

const db = require("./config/database");

const authenticationRoutes =
    require("./routes/authentication");

const workoutRoutes =
    require("./routes/workout");

const notificationRoutes =
    require("./routes/notification");

const streakRoutes =
    require("./routes/streaks");

const messagesRoutes =
    require("./routes/messages");

const privateMessagesRoutes =
    require("./routes/privateMessages");

const reportRoutes =
    require("./routes/report");

const helpRoutes =
    require("./routes/help");

const recommendationRoutes =
    require("./routes/recommendation");

const chatbotRoutes =
    require("./routes/chatbot");

const app = express();

// =====================================================
// APPLICATION CONFIGURATION
// =====================================================

const isProduction =
    process.env.NODE_ENV === "production";

const sessionSecret =
    process.env.SESSION_SECRET;

if (!sessionSecret) {
    throw new Error(
        "SESSION_SECRET is missing. Add it to your environment variables before starting GymBuddy."
    );
}

// =====================================================
// EXPRESS SECURITY CONFIGURATION
// =====================================================

// -----------------------------------------------------
// REMOVE EXPRESS FRAMEWORK FINGERPRINT
// -----------------------------------------------------

app.disable(
    "x-powered-by"
);

// -----------------------------------------------------
// TRUST PRODUCTION REVERSE PROXY
// -----------------------------------------------------

if (isProduction) {
    app.set(
        "trust proxy",
        1
    );
}

// =====================================================
// SECURITY HEADERS
// =====================================================
//
// Helmet provides a collection of HTTP security headers.
//
// CSP remains disabled during this development/security
// pass so the current frontend is not accidentally broken.
// It can be tightened during production configuration.
// =====================================================

app.use(
    helmet({
        contentSecurityPolicy:
            false,

        crossOriginEmbedderPolicy:
            false
    })
);

// =====================================================
// SESSION
// =====================================================

app.use(
    session({
        name:
            "gymbuddy.sid",

        secret:
            sessionSecret,

        resave:
            false,

        saveUninitialized:
            false,

        cookie: {
            httpOnly:
                true,

            sameSite:
                "lax",

            secure:
                isProduction,

            maxAge:
                1000 *
                60 *
                60 *
                2
        }
    })
);

// =====================================================
// ID VALIDATION
// =====================================================

function getNumericId(value) {
    const id =
        Number(value);

    return (
        Number.isInteger(id) &&
        id > 0
    )
        ? id
        : null;
}

// =====================================================
// GLOBAL LOGIN INFORMATION FOR PUG VIEWS
// =====================================================

app.use(
    (req, res, next) => {

        const loggedInUserId =
            getNumericId(
                req.session?.userId
            );

        res.locals.isLoggedIn =
            Boolean(
                loggedInUserId
            );

        res.locals.loggedInUserId =
            loggedInUserId;

        res.locals.loggedInUserName =
            loggedInUserId &&
            req.session?.userName
                ? req.session.userName
                : null;

        next();
    }
);

// =====================================================
// GLOBAL FEEDBACK MESSAGE FOR PUG VIEWS
// =====================================================

app.use(
    (req, res, next) => {

        res.locals.feedback =
            req.session?.feedback ||
            null;

        if (
            req.session &&
            req.session.feedback
        ) {
            delete req.session.feedback;
        }

        next();
    }
);

// =====================================================
// REQUEST BODY MIDDLEWARE
// =====================================================
//
// Normal JSON and form requests are limited to 100 KB.
//
// Image uploads are handled separately by Multer in the
// relevant route files.
// =====================================================

app.use(
    express.urlencoded({
        extended:
            true,

        limit:
            "100kb"
    })
);

app.use(
    express.json({
        limit:
            "100kb"
    })
);

// =====================================================
// VIEW ENGINE
// =====================================================

app.set(
    "views",
    path.join(
        __dirname,
        "views"
    )
);

app.set(
    "view engine",
    "pug"
);

// =====================================================
// STATIC FILES
// =====================================================

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        ),
        {
            dotfiles:
                "ignore",

            fallthrough:
                true
        }
    )
);

// =====================================================
// HOME PAGE
// =====================================================

app.get(
    "/",
    async (req, res) => {

        try {

            const userId =
                getNumericId(
                    req.session?.userId
                );

            // =================================================
            // LOGGED-OUT USER
            // =================================================

            if (!userId) {

                return res.render(
                    "Home",
                    {
                        title:
                            "GymBuddy",

                        dashboard:
                            null
                    }
                );
            }

            // =================================================
            // CONFIRM SESSION USER STILL EXISTS
            // =================================================

            const [userRows] =
                await db.query(
                    `SELECT
                        user_id
                     FROM users
                     WHERE user_id = ?
                     LIMIT 1`,
                    [userId]
                );

            if (
                userRows.length ===
                0
            ) {

                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            // =================================================
            // CURRENT STREAK
            // =================================================

            const [streakRows] =
                await db.query(
                    `SELECT
                        current_streak,
                        longest_streak
                     FROM streaks
                     WHERE user_id = ?
                     ORDER BY
                        streak_id DESC
                     LIMIT 1`,
                    [userId]
                );

            const currentStreak =
                streakRows.length >
                0
                    ? Number(
                        streakRows[0]
                            .current_streak ||
                        0
                    )
                    : 0;

            const longestStreak =
                streakRows.length >
                0
                    ? Number(
                        streakRows[0]
                            .longest_streak ||
                        0
                    )
                    : 0;

            // =================================================
            // COMPLETED WORKOUTS
            // =================================================

            const [[completedResult]] =
                await db.query(
                    `SELECT
                        COUNT(*) AS total
                     FROM workout_history
                     WHERE user_id = ?`,
                    [userId]
                );

            const completedWorkouts =
                Number(
                    completedResult.total ||
                    0
                );

            // =================================================
            // UPCOMING WORKOUTS CREATED BY USER
            // =================================================

            const [[createdUpcomingResult]] =
                await db.query(
                    `SELECT
                        COUNT(*) AS total
                     FROM workouts
                     WHERE user_id = ?
                       AND start_time >= NOW()
                       AND LOWER(status) =
                           'open'`,
                    [userId]
                );

            // =================================================
            // UPCOMING WORKOUTS USER JOINED
            // =================================================

            const [[joinedUpcomingResult]] =
                await db.query(
                    `SELECT
                        COUNT(*) AS total
                     FROM workout_participants wp

                     INNER JOIN workouts w
                        ON wp.workout_id =
                           w.workout_id

                     WHERE wp.user_id = ?
                       AND w.start_time >= NOW()
                       AND LOWER(w.status) =
                           'open'`,
                    [userId]
                );

            const upcomingWorkouts =
                Number(
                    createdUpcomingResult
                        .total ||
                    0
                ) +
                Number(
                    joinedUpcomingResult
                        .total ||
                    0
                );

            // =================================================
            // WORKOUT PARTNERS
            // =================================================

            const [[partnerResult]] =
                await db.query(
                    `SELECT
                        COUNT(
                            DISTINCT partner_id
                        ) AS total

                     FROM (

                        SELECT
                            wp.user_id
                                AS partner_id

                        FROM workouts w

                        INNER JOIN workout_participants wp
                            ON w.workout_id =
                               wp.workout_id

                        WHERE w.user_id = ?
                          AND wp.user_id != ?

                        UNION

                        SELECT
                            w.user_id
                                AS partner_id

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
                    partnerResult.total ||
                    0
                );

            // =================================================
            // RENDER DASHBOARD
            // =================================================

            return res.render(
                "Home",
                {
                    title:
                        "GymBuddy",

                    dashboard: {
                        currentStreak,
                        longestStreak,
                        completedWorkouts,
                        upcomingWorkouts,
                        workoutPartners
                    }
                }
            );

        } catch (error) {

            console.error(
                "HOME DASHBOARD ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading dashboard."
                );
        }
    }
);

// =====================================================
// ROUTES
// =====================================================

app.use(
    "/",
    authenticationRoutes
);

app.use(
    "/",
    workoutRoutes
);

app.use(
    "/",
    notificationRoutes
);

app.use(
    "/",
    streakRoutes
);

app.use(
    "/",
    messagesRoutes
);

app.use(
    "/",
    privateMessagesRoutes
);

app.use(
    "/",
    reportRoutes
);

app.use(
    "/",
    helpRoutes
);

app.use(
    "/",
    recommendationRoutes
);

app.use(
    "/",
    chatbotRoutes
);

// =====================================================
// 404 HANDLER
// =====================================================

app.use(
    (req, res) => {

        return res
            .status(404)
            .send(
                "Page not found."
            );
    }
);

// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        // =================================================
        // REQUEST BODY TOO LARGE
        // =================================================

        if (
            error.type ===
                "entity.too.large" ||
            error.status ===
                413
        ) {

            console.warn(
                "REQUEST BODY TOO LARGE:",
                {
                    method:
                        req.method,

                    path:
                        req.originalUrl
                }
            );

            return res
                .status(413)
                .send(
                    "Your request is too large. Please reduce the amount of data and try again."
                );
        }

        // =================================================
        // PRODUCTION LOGGING
        // =================================================
        //
        // Production logs avoid printing the entire raw
        // error object, which can contain unnecessary
        // internal details.
        // =================================================

        if (isProduction) {

            console.error(
                "GYMBUDDY APPLICATION ERROR:",
                {
                    message:
                        error.message ||
                        "Unknown application error",

                    method:
                        req.method,

                    path:
                        req.originalUrl,

                    status:
                        error.status ||
                        500
                }
            );

        } else {

            // =================================================
            // DEVELOPMENT LOGGING
            // =================================================
            //
            // Full error information is useful while building
            // and debugging GymBuddy locally.
            // =================================================

            console.error(
                "GYMBUDDY APPLICATION ERROR:",
                error
            );
        }

        // =================================================
        // RESPONSE ALREADY STARTED
        // =================================================

        if (
            res.headersSent
        ) {
            return next(
                error
            );
        }

        // =================================================
        // SAFE STATUS CODE
        // =================================================

        const statusCode =
            Number.isInteger(
                error.status
            ) &&
            error.status >= 400 &&
            error.status < 600
                ? error.status
                : 500;

        // =================================================
        // SAFE USER RESPONSE
        // =================================================

        return res
            .status(
                statusCode
            )
            .send(
                "Something went wrong while processing your request."
            );
    }
);

// =====================================================
// EXPORT
// =====================================================

module.exports = app;