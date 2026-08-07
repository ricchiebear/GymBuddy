const express = require("express");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const db = require("../config/database");

const router = express.Router();

// =====================================================
// LOGIN PROTECTION
// ===================================================== 

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.redirect("/login");
    }

    next();
}

// =====================================================
// PROFILE PICTURE UPLOAD
// =====================================================

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "src/public/uploads");
    },

    filename: (req, file, cb) => {
        const uniqueName =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1e9) +
            path.extname(file.originalname);

        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            return cb(null, true);
        }

        cb(new Error("Only image files are allowed."));
    }
});

// =====================================================
// LOGIN PAGE
// =====================================================

router.get("/login", (req, res) => {
    if (req.session.userId) {
        return res.redirect("/profile");
    }

    res.render("Login", {
        title: "Login"
    });
});

// =====================================================
// REGISTER PAGE
// =====================================================

router.get("/register", (req, res) => {
    if (req.session.userId) {
        return res.redirect("/profile");
    }

    res.render("Register", {
        title: "Register"
    });
});

// =====================================================
// REGISTER USER
// =====================================================

router.post("/register", async (req, res) => {
    try {
        const {
            first_name,
            last_name,
            email,
            password,
            confirm_password,
            fitness_goal,
            profile_bio
        } = req.body;

        if (
            !first_name ||
            !last_name ||
            !email ||
            !password ||
            !confirm_password ||
            !fitness_goal
        ) {
            return res.status(400).send(
                "Please complete all required fields."
            );
        }

        const cleanEmail = email.trim().toLowerCase();

        if (!cleanEmail.endsWith("@buddy.co.uk")) {
            return res.status(400).send(
                "Email must end with @buddy.co.uk."
            );
        }

        if (password !== confirm_password) {
            return res.status(400).send(
                "Passwords do not match."
            );
        }

        const passwordRegex =
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

        if (!passwordRegex.test(password)) {
            return res.status(400).send(
                "Password must contain at least 8 characters, including an uppercase letter, a lowercase letter and a number."
            );
        }

        const [existingUsers] = await db.query(
            `SELECT user_id
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [cleanEmail]
        );

        if (existingUsers.length > 0) {
            return res.status(409).send(
                "This email is already registered. Please log in instead."
            );
        }

        const hashedPassword = await bcrypt.hash(
            password,
            10
        );

        await db.query(
            `INSERT INTO users
             (
                first_name,
                last_name,
                email,
                password,
                fitness_goal,
                profile_bio
             )
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                first_name.trim(),
                last_name.trim(),
                cleanEmail,
                hashedPassword,
                fitness_goal,
                profile_bio?.trim() || null
            ]
        );

        res.redirect("/login");
    } catch (error) {
        console.error("Registration error:", error);

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).send(
                "This email is already registered. Please log in instead."
            );
        }

        res.status(500).send(
            "An error occurred during registration."
        );
    }
});

// =====================================================
// LOGIN USER + CREATE SESSION
// =====================================================

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).send(
                "Please enter your email and password."
            );
        }

        const cleanEmail = email.trim().toLowerCase();

        const [users] = await db.query(
            `SELECT *
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [cleanEmail]
        );

        if (users.length === 0) {
            return res.status(401).send(
                "Incorrect email or password."
            );
        }

        const user = users[0];

        const validPassword = await bcrypt.compare(
            password,
            user.password
        );

        if (!validPassword) {
            return res.status(401).send(
                "Incorrect email or password."
            );
        }

        req.session.userId = user.user_id;
        req.session.userName =
            `${user.first_name} ${user.last_name}`;

        req.session.save((error) => {
            if (error) {
                console.error(
                    "Session save error:",
                    error
                );

                return res.status(500).send(
                    "Unable to start your login session."
                );
            }

            res.redirect("/profile");
        });
    } catch (error) {
        console.error("Login error:", error);

        res.status(500).send(
            "An error occurred during login."
        );
    }
});

// =====================================================
// PROFILE DASHBOARD
// =====================================================

router.get(
    "/profile",
    requireLogin,
    async (req, res) => {
        try {
            const userId = req.session.userId;

            const [users] = await db.query(
                `SELECT
                    user_id,
                    first_name,
                    last_name,
                    email,
                    fitness_goal,
                    profile_bio,
                    profile_picture,
                    created_at
                 FROM users
                 WHERE user_id = ?
                 LIMIT 1`,
                [userId]
            );

            if (users.length === 0) {
                req.session.destroy(() => {});
                return res.redirect("/login");
            }

            const user = users[0];

            const [[workoutsCreated]] =
                await db.query(
                    `SELECT COUNT(*) AS total
                     FROM workouts
                     WHERE user_id = ?`,
                    [userId]
                );

            const [[sessionsJoined]] =
                await db.query(
                    `SELECT COUNT(*) AS total
                     FROM workout_participants
                     WHERE user_id = ?`,
                    [userId]
                );

            const [[partners]] = await db.query(
                `SELECT COUNT(
                    DISTINCT wp.user_id
                 ) AS total
                 FROM workout_participants wp
                 INNER JOIN workouts w
                    ON wp.workout_id = w.workout_id
                 WHERE w.user_id = ?
                 AND wp.user_id != ?`,
                [userId, userId]
            );

            const [streakRows] = await db.query(
                `SELECT current_streak
                 FROM streaks
                 WHERE user_id = ?
                 ORDER BY streak_id DESC
                 LIMIT 1`,
                [userId]
            );

            const currentStreak =
                streakRows.length > 0
                    ? streakRows[0].current_streak
                    : 0;

            res.render("Profile", {
                title: "My Profile",
                user,
                workoutsCreated:
                    workoutsCreated.total,
                workoutPartners:
                    partners.total,
                currentStreak,
                sessionsJoined:
                    sessionsJoined.total
            });
        } catch (error) {
            console.error(
                "Profile dashboard error:",
                error
            );

            res.status(500).send(
                "Error loading profile dashboard."
            );
        }
    }
);

//=====================================================
// EDIT PROFILE PAGE
//===================================================== 

router.get(
    "/profile/edit",
    requireLogin,
    async (req, res) => {
        try {
            const userId = req.session.userId;

            const [users] = await db.query(
                `SELECT
                    user_id,
                    first_name,
                    last_name,
                    email,
                    fitness_goal,
                    profile_bio,
                    profile_picture
                 FROM users
                 WHERE user_id = ?
                 LIMIT 1`,
                [userId]
            );

            if (users.length === 0) {
                return res.status(404).send(
                    "User not found."
                );
            }

            res.render("edit-profile", {
                title: "Edit Profile",
                user: users[0]
            });
        } catch (error) {
            console.error(
                "Edit profile page error:",
                error
            );

            res.status(500).send(
                "Error loading edit profile page."
            );
        }
    }
);

// =====================================================
// UPDATE PROFILE
// =====================================================

router.post(
    "/profile/edit",
    requireLogin,
    upload.single("profile_picture"),
    async (req, res) => {
        try {
            const userId = req.session.userId;

            const {
                first_name,
                last_name,
                fitness_goal,
                profile_bio
            } = req.body;

            if (
                !first_name ||
                !last_name ||
                !fitness_goal
            ) {
                return res.status(400).send(
                    "First name, last name and fitness goal are required."
                );
            }

            if (req.file) {
                const profilePicture =
                    `/uploads/${req.file.filename}`;

                await db.query(
                    `UPDATE users
                     SET first_name = ?,
                         last_name = ?,
                         fitness_goal = ?,
                         profile_bio = ?,
                         profile_picture = ?
                     WHERE user_id = ?`,
                    [
                        first_name.trim(),
                        last_name.trim(),
                        fitness_goal,
                        profile_bio?.trim() || null,
                        profilePicture,
                        userId
                    ]
                );
            } else {
                await db.query(
                    `UPDATE users
                     SET first_name = ?,
                         last_name = ?,
                         fitness_goal = ?,
                         profile_bio = ?
                     WHERE user_id = ?`,
                    [
                        first_name.trim(),
                        last_name.trim(),
                        fitness_goal,
                        profile_bio?.trim() || null,
                        userId
                    ]
                );
            }

            req.session.userName =
                `${first_name.trim()} ${last_name.trim()}`;

            res.redirect("/profile");
        } catch (error) {
            console.error(
                "Profile update error:",
                error
            );

            res.status(500).send(
                "Error updating profile."
            );
        }
    }
);

// =====================================================
// PUBLIC USER PROFILE
// =====================================================

router.get(
    "/users/:id",
    requireLogin,
    async (req, res) => {
        try {
            const profileUserId =
                Number(req.params.id);

            const currentUserId =
                Number(req.session.userId);

            if (!profileUserId) {
                return res.status(400).send(
                    "User ID is missing."
                );
            }

            // Load public user information
            const [userRows] = await db.query(
                `SELECT
                    user_id,
                    first_name,
                    last_name,
                    fitness_goal,
                    profile_bio,
                    profile_picture,
                    created_at
                 FROM users
                 WHERE user_id = ?
                 LIMIT 1`,
                [profileUserId]
            );

            if (userRows.length === 0) {
                return res.status(404).send(
                    "User not found."
                );
            }

            const user = userRows[0];

            // Load streak information
            const [streakRows] = await db.query(
                `SELECT
                    current_streak,
                    longest_streak,
                    last_workout_date
                 FROM streaks
                 WHERE user_id = ?
                 ORDER BY streak_id DESC
                 LIMIT 1`,
                [profileUserId]
            );

            const streak =
                streakRows.length > 0
                    ? streakRows[0]
                    : {
                        current_streak: 0,
                        longest_streak: 0,
                        last_workout_date: null
                    };

            // Count completed workouts
            const [[completedResult]] =
                await db.query(
                    `SELECT COUNT(*) AS total
                     FROM workout_history
                     WHERE user_id = ?`,
                    [profileUserId]
                );

            // Load recent completed workouts
            const [recentWorkouts] =
                await db.query(
                    `SELECT
                        wh.workout_id,
                        wh.workout_date,
                        w.title,
                        w.workout_type,
                        w.location
                     FROM workout_history wh
                     INNER JOIN workouts w
                        ON wh.workout_id =
                           w.workout_id
                     WHERE wh.user_id = ?
                     ORDER BY
                        wh.workout_date DESC,
                        wh.created_at DESC
                     LIMIT 5`,
                    [profileUserId]
                );

            res.render("public-profile", {
                title:
                    `${user.first_name} ${user.last_name}`,
                user,
                currentStreak:
                    Number(
                        streak.current_streak || 0
                    ),
                longestStreak:
                    Number(
                        streak.longest_streak || 0
                    ),
                completedWorkouts:
                    Number(
                        completedResult.total || 0
                    ),
                recentWorkouts,
                currentUserId,
                isOwnProfile:
                    currentUserId === profileUserId
            });
        } catch (error) {
            console.error(
                "PUBLIC PROFILE ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error loading public profile."
            );
        }
    }
);

// =====================================================
// LOGOUT
// =====================================================

router.get("/logout", requireLogin, (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("Logout error:", error);

            return res.status(500).send(
                "Unable to log out."
            );
        }

        res.clearCookie("connect.sid");
        res.redirect("/login");
    });
});

module.exports = router;