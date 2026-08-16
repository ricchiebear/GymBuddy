const express = require("express");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const heicConvert = require("heic-convert");
const db = require("../config/database");

const router = express.Router();

// =====================================================
// FEEDBACK + FORM DATA HELPERS
// =====================================================

function setFeedback(req, type, message) {
    req.session.feedback = {
        type,
        message
    };
}

function setFormData(req, formData = {}) {
    req.session.formData = formData;
}

function consumeFormData(req) {
    const formData = req.session.formData || {};
    delete req.session.formData;
    return formData;
}

// =====================================================
// ID VALIDATION
// =====================================================

function getNumericId(value) {
    const id = Number(value);

    return Number.isInteger(id) && id > 0
        ? id
        : null;
}

// =====================================================
// LOGIN PROTECTION
// =====================================================

function requireLogin(req, res, next) {
    if (!req.session?.userId) {
        setFeedback(
            req,
            "error",
            "Please log in to continue."
        );

        return res.redirect("/login");
    }

    next();
}

// =====================================================
// LOGGED-OUT ONLY PROTECTION
// =====================================================

function requireLoggedOut(req, res, next) {
    if (req.session?.userId) {
        return res.redirect("/profile");
    }

    next();
}

// =====================================================
// PROFILE PICTURE UPLOAD DIRECTORY
// =====================================================

const uploadDirectory = path.join(
    __dirname,
    "..",
    "public",
    "uploads"
);

if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, {
        recursive: true
    });
}

// =====================================================
// MULTER STORAGE
// =====================================================

const storage = multer.memoryStorage();

// =====================================================
// ACCEPTED PROFILE PICTURE TYPES
// =====================================================

const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif"
];

const allowedExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".heic",
    ".heif"
];

// =====================================================
// MULTER CONFIGURATION
// =====================================================

const upload = multer({
    storage,

    limits: {
        fileSize: 10 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {
        const extension = path
            .extname(file.originalname)
            .toLowerCase();

        const allowedMime = allowedMimeTypes.includes(
            file.mimetype
        );

        const allowedExtension = allowedExtensions.includes(
            extension
        );

        if (allowedMime && allowedExtension) {
            return cb(null, true);
        }

        return cb(
            new Error(
                "Please upload a valid JPG, PNG, WebP, HEIC or HEIF image."
            )
        );
    }
});

// =====================================================
// PROFILE PICTURE UPLOAD MIDDLEWARE
// =====================================================

function uploadProfilePicture(req, res, next) {
    upload.single("profile_picture")(
        req,
        res,
        (error) => {
            if (!error) {
                return next();
            }

            if (
                error instanceof multer.MulterError &&
                error.code === "LIMIT_FILE_SIZE"
            ) {
                setFeedback(
                    req,
                    "error",
                    "Your profile picture must be smaller than 10MB."
                );

                return res.redirect("/profile/edit");
            }

            console.error(
                "PROFILE PICTURE UPLOAD ERROR:",
                error
            );

            setFeedback(
                req,
                "error",
                error.message ||
                "We couldn't upload that profile picture."
            );

            return res.redirect("/profile/edit");
        }
    );
}

// =====================================================
// SAVE PROFILE PICTURE
// =====================================================

async function saveProfilePicture(file) {
    if (!file) {
        return null;
    }

    const originalExtension = path
        .extname(file.originalname)
        .toLowerCase();

    const isHeic =
        originalExtension === ".heic" ||
        originalExtension === ".heif" ||
        file.mimetype === "image/heic" ||
        file.mimetype === "image/heif";

    const uniqueBaseName =
        `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    if (isHeic) {
        const jpegBuffer = await heicConvert({
            buffer: file.buffer,
            format: "JPEG",
            quality: 0.9
        });

        const filename = `${uniqueBaseName}.jpg`;
        const destination = path.join(
            uploadDirectory,
            filename
        );

        await fs.promises.writeFile(
            destination,
            jpegBuffer
        );

        return {
            filename,
            filePath: destination,
            publicPath: `/uploads/${filename}`
        };
    }

    const safeExtension = allowedExtensions.includes(
        originalExtension
    )
        ? originalExtension
        : ".jpg";

    const filename = `${uniqueBaseName}${safeExtension}`;
    const destination = path.join(
        uploadDirectory,
        filename
    );

    await fs.promises.writeFile(
        destination,
        file.buffer
    );

    return {
        filename,
        filePath: destination,
        publicPath: `/uploads/${filename}`
    };
}

// =====================================================
// DELETE FILE SAFELY
// =====================================================

async function deleteFileSafely(filePath) {
    if (!filePath) {
        return;
    }

    try {
        await fs.promises.unlink(filePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error(
                "Unable to remove file:",
                error
            );
        }
    }
}

// =====================================================
// GET LOCAL UPLOAD PATH FROM PUBLIC PATH
// =====================================================

function getUploadFilePath(publicPath) {
    if (
        !publicPath ||
        typeof publicPath !== "string" ||
        !publicPath.startsWith("/uploads/")
    ) {
        return null;
    }

    const filename = path.basename(publicPath);

    return path.join(
        uploadDirectory,
        filename
    );
}

// =====================================================
// LOGIN PAGE
// =====================================================

router.get(
    "/login",
    requireLoggedOut,
    (req, res) => {
        const formData = consumeFormData(req);

        return res.render("Login", {
            title: "Login",
            formData
        });
    }
);

// =====================================================
// REGISTER PAGE
// =====================================================

router.get(
    "/register",
    requireLoggedOut,
    (req, res) => {
        const formData = consumeFormData(req);

        return res.render("Register", {
            title: "Register",
            formData
        });
    }
);

// =====================================================
// REGISTER USER
// =====================================================

router.post(
    "/register",
    requireLoggedOut,
    async (req, res) => {
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

            const formData = {
                first_name: first_name?.trim() || "",
                last_name: last_name?.trim() || "",
                email: email?.trim() || "",
                fitness_goal: fitness_goal || "",
                profile_bio: profile_bio?.trim() || ""
            };

            if (
                !first_name?.trim() ||
                !last_name?.trim() ||
                !email?.trim() ||
                !password ||
                !confirm_password ||
                !fitness_goal
            ) {
                setFeedback(
                    req,
                    "error",
                    "Please complete all required fields."
                );

                setFormData(req, formData);

                return res.redirect("/register");
            }

            const cleanEmail = email
                .trim()
                .toLowerCase();

            if (!cleanEmail.endsWith("@buddy.co.uk")) {
                setFeedback(
                    req,
                    "error",
                    "Your email must end with @buddy.co.uk."
                );

                setFormData(req, formData);

                return res.redirect("/register");
            }

            if (password !== confirm_password) {
                setFeedback(
                    req,
                    "error",
                    "Your passwords do not match. Please try again."
                );

                setFormData(req, formData);

                return res.redirect("/register");
            }

            const passwordRegex =
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

            if (!passwordRegex.test(password)) {
                setFeedback(
                    req,
                    "error",
                    "Your password must contain at least 8 characters, including an uppercase letter, lowercase letter and number."
                );

                setFormData(req, formData);

                return res.redirect("/register");
            }

            const [existingUsers] = await db.query(
                `SELECT user_id
                 FROM users
                 WHERE email = ?
                 LIMIT 1`,
                [cleanEmail]
            );

            if (existingUsers.length > 0) {
                setFeedback(
                    req,
                    "error",
                    "An account already exists with this email. Try logging in instead."
                );

                setFormData(req, formData);

                return res.redirect("/register");
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

            setFeedback(
                req,
                "success",
                "Your GymBuddy account has been created successfully. You can now log in."
            );

            return res.redirect("/login");
        } catch (error) {
            console.error(
                "REGISTRATION ERROR:",
                error
            );

            if (error.code === "ER_DUP_ENTRY") {
                setFeedback(
                    req,
                    "error",
                    "An account already exists with this email."
                );

                return res.redirect("/register");
            }

            setFeedback(
                req,
                "error",
                "Something went wrong while creating your account. Please try again."
            );

            return res.redirect("/register");
        }
    }
);

// =====================================================
// LOGIN USER
// =====================================================

router.post(
    "/login",
    requireLoggedOut,
    async (req, res) => {
        try {
            const {
                email,
                password
            } = req.body;

            const formData = {
                email: email?.trim() || ""
            };

            if (
                !email?.trim() ||
                !password
            ) {
                setFeedback(
                    req,
                    "error",
                    "Please enter your email and password."
                );

                setFormData(req, formData);

                return res.redirect("/login");
            }

            const cleanEmail = email
                .trim()
                .toLowerCase();

            const [users] = await db.query(
                `SELECT
                    user_id,
                    first_name,
                    last_name,
                    password
                 FROM users
                 WHERE email = ?
                 LIMIT 1`,
                [cleanEmail]
            );

            if (users.length === 0) {
                setFeedback(
                    req,
                    "error",
                    "Incorrect email or password."
                );

                setFormData(req, formData);

                return res.redirect("/login");
            }

            const user = users[0];

            const validPassword = await bcrypt.compare(
                password,
                user.password
            );

            if (!validPassword) {
                setFeedback(
                    req,
                    "error",
                    "Incorrect email or password."
                );

                setFormData(req, formData);

                return res.redirect("/login");
            }

            req.session.regenerate((regenerateError) => {
                if (regenerateError) {
                    console.error(
                        "SESSION REGENERATION ERROR:",
                        regenerateError
                    );

                    return res
                        .status(500)
                        .send(
                            "Unable to start your login session."
                        );
                }

                req.session.userId = user.user_id;
                req.session.userName =
                    `${user.first_name} ${user.last_name}`;

                setFeedback(
                    req,
                    "success",
                    `Welcome back, ${user.first_name}!`
                );

                req.session.save((saveError) => {
                    if (saveError) {
                        console.error(
                            "SESSION SAVE ERROR:",
                            saveError
                        );

                        return res
                            .status(500)
                            .send(
                                "Unable to start your login session."
                            );
                    }

                    return res.redirect("/profile");
                });
            });
        } catch (error) {
            console.error(
                "LOGIN ERROR:",
                error
            );

            setFeedback(
                req,
                "error",
                "Something went wrong while logging you in. Please try again."
            );

            return res.redirect("/login");
        }
    }
);

// =====================================================
// PROFILE DASHBOARD
// =====================================================

router.get(
    "/profile",
    requireLogin,
    async (req, res) => {
        try {
            const userId = getNumericId(
                req.session.userId
            );

            if (!userId) {
                req.session.destroy(() => {});
                return res.redirect("/login");
            }

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

            const [[workoutsCreated]] = await db.query(
                `SELECT COUNT(*) AS total
                 FROM workouts
                 WHERE user_id = ?`,
                [userId]
            );

            const [[sessionsJoined]] = await db.query(
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
                [
                    userId,
                    userId
                ]
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
                    ? Number(
                        streakRows[0].current_streak || 0
                    )
                    : 0;

            return res.render("Profile", {
                title: "My Profile",
                user,
                workoutsCreated: Number(
                    workoutsCreated.total || 0
                ),
                workoutPartners: Number(
                    partners.total || 0
                ),
                currentStreak,
                sessionsJoined: Number(
                    sessionsJoined.total || 0
                )
            });
        } catch (error) {
            console.error(
                "PROFILE DASHBOARD ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading profile dashboard."
                );
        }
    }
);

// =====================================================
// EDIT PROFILE PAGE
// =====================================================

router.get(
    "/profile/edit",
    requireLogin,
    async (req, res) => {
        try {
            const userId = getNumericId(
                req.session.userId
            );

            if (!userId) {
                req.session.destroy(() => {});
                return res.redirect("/login");
            }

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
                req.session.destroy(() => {});
                return res.redirect("/login");
            }

            return res.render("edit-profile", {
                title: "Edit Profile",
                user: users[0]
            });
        } catch (error) {
            console.error(
                "EDIT PROFILE PAGE ERROR:",
                error
            );

            return res
                .status(500)
                .send(
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
    uploadProfilePicture,
    async (req, res) => {
        let savedProfilePicture = null;

        try {
            const userId = getNumericId(
                req.session.userId
            );

            if (!userId) {
                req.session.destroy(() => {});
                return res.redirect("/login");
            }

            const {
                first_name,
                last_name,
                fitness_goal,
                profile_bio
            } = req.body;

            if (
                !first_name?.trim() ||
                !last_name?.trim() ||
                !fitness_goal
            ) {
                setFeedback(
                    req,
                    "error",
                    "First name, last name and fitness goal are required."
                );

                return res.redirect("/profile/edit");
            }

            const [existingUsers] = await db.query(
                `SELECT profile_picture
                 FROM users
                 WHERE user_id = ?
                 LIMIT 1`,
                [userId]
            );

            if (existingUsers.length === 0) {
                req.session.destroy(() => {});
                return res.redirect("/login");
            }

            const oldProfilePicture =
                existingUsers[0].profile_picture || null;

            if (req.file) {
                try {
                    savedProfilePicture =
                        await saveProfilePicture(
                            req.file
                        );
                } catch (conversionError) {
                    console.error(
                        "PROFILE IMAGE CONVERSION ERROR:",
                        conversionError
                    );

                    setFeedback(
                        req,
                        "error",
                        "We couldn't process this image. Please try another photo."
                    );

                    return res.redirect("/profile/edit");
                }
            }

            if (savedProfilePicture) {
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
                        savedProfilePicture.publicPath,
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

            if (
                savedProfilePicture &&
                oldProfilePicture &&
                oldProfilePicture !==
                    savedProfilePicture.publicPath
            ) {
                const oldFilePath = getUploadFilePath(
                    oldProfilePicture
                );

                await deleteFileSafely(
                    oldFilePath
                );
            }

            req.session.userName =
                `${first_name.trim()} ${last_name.trim()}`;

            setFeedback(
                req,
                "success",
                "Your profile has been updated successfully."
            );

            return res.redirect("/profile");
        } catch (error) {
            console.error(
                "PROFILE UPDATE ERROR:",
                error
            );

            if (savedProfilePicture) {
                await deleteFileSafely(
                    savedProfilePicture.filePath
                );
            }

            setFeedback(
                req,
                "error",
                "Something went wrong while updating your profile. Please try again."
            );

            return res.redirect("/profile/edit");
        }
    }
);

// =====================================================
// COMMUNITY USER PROFILE
// =====================================================

router.get(
    "/users/:id",
    requireLogin,
    async (req, res) => {
        try {
            const profileUserId = getNumericId(
                req.params.id
            );

            const currentUserId = getNumericId(
                req.session.userId
            );

            if (!profileUserId) {
                return res
                    .status(400)
                    .send(
                        "Invalid user ID."
                    );
            }

            if (!currentUserId) {
                req.session.destroy(() => {});
                return res.redirect("/login");
            }

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
                return res
                    .status(404)
                    .send(
                        "User not found."
                    );
            }

            const user = userRows[0];

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

            const [[completedResult]] = await db.query(
                `SELECT COUNT(*) AS total
                 FROM workout_history
                 WHERE user_id = ?`,
                [profileUserId]
            );

            const [recentWorkouts] = await db.query(
                `SELECT
                    wh.workout_id,
                    wh.workout_date,
                    w.title,
                    w.workout_type,
                    w.location
                 FROM workout_history wh
                 INNER JOIN workouts w
                    ON wh.workout_id = w.workout_id
                 WHERE wh.user_id = ?
                 ORDER BY
                    wh.workout_date DESC,
                    wh.created_at DESC
                 LIMIT 5`,
                [profileUserId]
            );

            return res.render(
                "public-profile",
                {
                    title:
                        `${user.first_name} ${user.last_name}`,

                    user,

                    currentStreak: Number(
                        streak.current_streak || 0
                    ),

                    longestStreak: Number(
                        streak.longest_streak || 0
                    ),

                    completedWorkouts: Number(
                        completedResult.total || 0
                    ),

                    recentWorkouts,

                    currentUserId,

                    isOwnProfile:
                        currentUserId ===
                        profileUserId
                }
            );
        } catch (error) {
            console.error(
                "PUBLIC PROFILE ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading public profile."
                );
        }
    }
);

// =====================================================
// LOGOUT HANDLER
// =====================================================

function logoutUser(req, res) {
    req.session.destroy((error) => {
        if (error) {
            console.error(
                "LOGOUT ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Unable to log out."
                );
        }

        res.clearCookie("connect.sid");

        return res.redirect(
            "/login?loggedOut=true"
        );
    });
}

// =====================================================
// LOGOUT
// =====================================================
router.post(
    "/logout",
    requireLogin,
    logoutUser
);


module.exports = router;