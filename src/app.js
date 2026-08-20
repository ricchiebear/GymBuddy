// src/app.js

const express = require("express");
const path = require("path");
const session = require("express-session");
const helmet = require("helmet");

const MySQLStore =
    require("express-mysql-session")(
        session
    );

const db =
    require("./config/database");

// =====================================================
// ROUTES
// =====================================================

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

const app =
    express();

// =====================================================
// APPLICATION CONFIGURATION
// =====================================================

const isProduction =
    process.env.NODE_ENV ===
    "production";

const sessionSecret =
    process.env.SESSION_SECRET;

// =====================================================
// COOKIE SECURITY CONFIGURATION
// =====================================================
//
// Local production testing:
//
// COOKIE_SECURE=false
//
// Real HTTPS production:
//
// COOKIE_SECURE=true
//
// If COOKIE_SECURE is not supplied, GymBuddy falls
// back to NODE_ENV behaviour.
// =====================================================

const cookieSecureValue =
    process.env.COOKIE_SECURE;

if (
    cookieSecureValue !== undefined &&
    cookieSecureValue !== "true" &&
    cookieSecureValue !== "false"
) {
    throw new Error(
        "COOKIE_SECURE must be either true or false."
    );
}

const secureCookies =
    cookieSecureValue !== undefined
        ? cookieSecureValue === "true"
        : isProduction;

if (!sessionSecret) {

    throw new Error(
        "SESSION_SECRET is missing. Add it to your environment variables before starting GymBuddy."
    );
}

// =====================================================
// DATABASE ENVIRONMENT VARIABLES FOR SESSION STORE
// =====================================================

const {
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASSWORD,
    DB_NAME
} = process.env;

// =====================================================
// VALIDATE SESSION DATABASE CONFIGURATION
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
//
// Real production deployments normally place GymBuddy
// behind an HTTPS reverse proxy.
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

app.use(
    helmet({

        contentSecurityPolicy: {

            useDefaults:
                false,

            directives: {

                // =============================================
                // DEFAULT RESOURCE POLICY
                // =============================================

                defaultSrc: [
                    "'self'"
                ],

                // =============================================
                // JAVASCRIPT
                // =============================================

                scriptSrc: [
                    "'self'"
                ],

                // Existing GymBuddy Pug files still contain
                // several inline onsubmit confirmation handlers.
                //
                // This remains temporarily enabled until those
                // handlers are moved into external JS files.

                scriptSrcAttr: [
                    "'unsafe-inline'"
                ],

                // =============================================
                // CSS
                // =============================================

                styleSrc: [
                    "'self'"
                ],

                // =============================================
                // IMAGES
                // =============================================

                imgSrc: [
                    "'self'",
                    "data:",
                    "blob:"
                ],

                // =============================================
                // FONTS
                // =============================================

                fontSrc: [
                    "'self'"
                ],

                // =============================================
                // NETWORK REQUESTS
                // =============================================

                connectSrc: [
                    "'self'"
                ],

                // =============================================
                // EMBEDDED FRAMES
                // =============================================

                frameSrc: [
                    "'self'",
                    "https://www.google.com"
                ],

                // =============================================
                // PREVENT PLUGIN CONTENT
                // =============================================

                objectSrc: [
                    "'none'"
                ],

                // =============================================
                // BASE URL
                // =============================================

                baseUri: [
                    "'self'"
                ],

                // =============================================
                // FORM SUBMISSIONS
                // =============================================

                formAction: [
                    "'self'"
                ],

                // =============================================
                // PREVENT CLICKJACKING
                // =============================================

                frameAncestors: [
                    "'none'"
                ],

                // =============================================
                // MANIFESTS
                // =============================================

                manifestSrc: [
                    "'self'"
                ],

                // =============================================
                // MEDIA
                // =============================================

                mediaSrc: [
                    "'self'"
                ],

                // =============================================
                // WORKERS
                // =============================================

                workerSrc: [
                    "'self'",
                    "blob:"
                ]
            }
        },

        // -------------------------------------------------
        // GOOGLE MAPS IFRAME COMPATIBILITY
        // -------------------------------------------------

        crossOriginEmbedderPolicy:
            false,

        // -------------------------------------------------
        // HSTS
        //
        // Enable only when GymBuddy is genuinely being
        // served securely over HTTPS.
        // -------------------------------------------------

        strictTransportSecurity:
            secureCookies
                ? {
                    maxAge:
                        15552000,

                    includeSubDomains:
                        true
                }
                : false,

        // -------------------------------------------------
        // REFERRER POLICY
        // -------------------------------------------------

        referrerPolicy: {
            policy:
                "strict-origin-when-cross-origin"
        }
    })
);

// =====================================================
// MYSQL SESSION STORE
// =====================================================

const sessionStoreOptions = {

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

    // -------------------------------------------------
    // SESSION EXPIRY — 2 HOURS
    // -------------------------------------------------

    expiration:
        1000 *
        60 *
        60 *
        2,

    // -------------------------------------------------
    // CLEAN EXPIRED SESSIONS
    // -------------------------------------------------

    clearExpired:
        true,

    checkExpirationInterval:
        1000 *
        60 *
        15,

    // -------------------------------------------------
    // CREATE SESSION TABLE AUTOMATICALLY
    // -------------------------------------------------

    createDatabaseTable:
        true,

    schema: {

        tableName:
            "user_sessions",

        columnNames: {

            session_id:
                "session_id",

            expires:
                "expires",

            data:
                "data"
        }
    }
};

const sessionStore =
    new MySQLStore(
        sessionStoreOptions
    );

// =====================================================
// SESSION CONFIGURATION
// =====================================================

app.use(
    session({

        // -------------------------------------------------
        // COOKIE NAME
        // -------------------------------------------------

        name:
            "gymbuddy.sid",

        // -------------------------------------------------
        // MYSQL SESSION STORE
        // -------------------------------------------------

        store:
            sessionStore,

        // -------------------------------------------------
        // SESSION SECRET
        // -------------------------------------------------

        secret:
            sessionSecret,

        // -------------------------------------------------
        // SESSION STORAGE OPTIONS
        // -------------------------------------------------

        resave:
            false,

        saveUninitialized:
            false,

        // -------------------------------------------------
        // SECURE COOKIE / PROXY BEHAVIOUR
        // -------------------------------------------------

        proxy:
            secureCookies,

        cookie: {

            httpOnly:
                true,

            sameSite:
                "lax",

            secure:
                secureCookies,

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

function getNumericId(
    value
) {

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
    (
        req,
        res,
        next
    ) => {

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
    (
        req,
        res,
        next
    ) => {

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
                true,

            maxAge:
                isProduction
                    ? "1d"
                    : 0
        }
    )
);

// =====================================================
// HOME PAGE
// =====================================================

app.get(
    "/",
    async (
        req,
        res
    ) => {

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
                    createdUpcomingResult.total ||
                    0
                ) +
                Number(
                    joinedUpcomingResult.total ||
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
// APPLICATION ROUTES
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
    (
        req,
        res
    ) => {

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

module.exports =
    app;