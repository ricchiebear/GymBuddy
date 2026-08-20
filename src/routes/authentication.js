const express = require("express");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const heicConvert = require("heic-convert");

const {
    rateLimit
} = require("express-rate-limit");

const db = require("../config/database");

const router = express.Router();

// =====================================================
// INPUT LIMITS
// =====================================================

const MAX_FIRST_NAME_LENGTH = 100;
const MAX_LAST_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 150;
const MAX_FITNESS_GOAL_LENGTH = 100;
const MAX_PROFILE_BIO_LENGTH = 1000;
const MAX_PASSWORD_LENGTH = 128;

const MAX_PROFILE_IMAGE_SIZE =
    10 * 1024 * 1024;

// =====================================================
// ALLOWED FITNESS GOALS
// =====================================================

const allowedFitnessGoals = new Set([
    "lose_weight",
    "build_muscle",
    "improve_endurance",
    "general_fitness"
]);

// =====================================================
// FEEDBACK + FORM DATA HELPERS
// =====================================================

function setFeedback(
    req,
    type,
    message
) {
    req.session.feedback = {
        type,
        message
    };
}

function setFormData(
    req,
    formData = {}
) {
    req.session.formData =
        formData;
}

function consumeFormData(
    req
) {
    const formData =
        req.session.formData ||
        {};

    delete req.session.formData;

    return formData;
}

// =====================================================
// AUTHENTICATION RATE LIMITERS
// =====================================================

const loginLimiter =
    rateLimit({
        windowMs:
            15 * 60 * 1000,

        limit:
            10,

        standardHeaders:
            "draft-8",

        legacyHeaders:
            false,

        handler:
            (req, res) => {

                setFeedback(
                    req,
                    "warning",
                    "Too many login attempts. Please wait about 15 minutes before trying again."
                );

                return res.redirect(
                    "/login"
                );
            }
    });

const registrationLimiter =
    rateLimit({
        windowMs:
            60 * 60 * 1000,

        limit:
            5,

        standardHeaders:
            "draft-8",

        legacyHeaders:
            false,

        handler:
            (req, res) => {

                setFeedback(
                    req,
                    "warning",
                    "Too many account creation attempts. Please wait before trying to register again."
                );

                return res.redirect(
                    "/register"
                );
            }
    });

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
// STRING INPUT VALIDATION
// =====================================================

function isStringInput(
    value
) {
    return (
        typeof value ===
        "string"
    );
}

// =====================================================
// EMAIL VALIDATION
// =====================================================

function isValidBuddyEmail(
    email
) {
    if (
        !isStringInput(
            email
        )
    ) {
        return false;
    }

    const emailRegex =
        /^[^\s@]+@buddy\.co\.uk$/i;

    return emailRegex.test(
        email
    );
}

// =====================================================
// FITNESS GOAL VALIDATION
// =====================================================

function isValidFitnessGoal(
    value
) {
    return (
        isStringInput(
            value
        ) &&
        allowedFitnessGoals.has(
            value
        )
    );
}

// =====================================================
// LOGIN PROTECTION
// =====================================================

function requireLogin(
    req,
    res,
    next
) {
    if (
        !req.session?.userId
    ) {
        setFeedback(
            req,
            "error",
            "Please log in to continue."
        );

        return res.redirect(
            "/login"
        );
    }

    next();
}

// =====================================================
// LOGGED-OUT ONLY PROTECTION
// =====================================================

function requireLoggedOut(
    req,
    res,
    next
) {
    if (
        req.session?.userId
    ) {
        return res.redirect(
            "/profile"
        );
    }

    next();
}

// =====================================================
// PROFILE PICTURE UPLOAD DIRECTORY
// =====================================================

const uploadDirectory =
    path.join(
        __dirname,
        "..",
        "public",
        "uploads"
    );

if (
    !fs.existsSync(
        uploadDirectory
    )
) {
    fs.mkdirSync(
        uploadDirectory,
        {
            recursive: true
        }
    );
}

// =====================================================
// MULTER STORAGE
// =====================================================

const storage =
    multer.memoryStorage();

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

const upload =
    multer({
        storage,

        limits: {
            fileSize:
                MAX_PROFILE_IMAGE_SIZE
        },

        fileFilter:
            (
                req,
                file,
                cb
            ) => {

                const extension =
                    path
                        .extname(
                            file.originalname
                        )
                        .toLowerCase();

                const allowedMime =
                    allowedMimeTypes
                        .includes(
                            file.mimetype
                        );

                const allowedExtension =
                    allowedExtensions
                        .includes(
                            extension
                        );

                if (
                    allowedMime &&
                    allowedExtension
                ) {
                    return cb(
                        null,
                        true
                    );
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

function uploadProfilePicture(
    req,
    res,
    next
) {
    upload.single(
        "profile_picture"
    )(
        req,
        res,
        (error) => {

            if (!error) {
                return next();
            }

            if (
                error instanceof
                    multer.MulterError &&
                error.code ===
                    "LIMIT_FILE_SIZE"
            ) {
                setFeedback(
                    req,
                    "error",
                    "Your profile picture must be smaller than 10MB."
                );

                return res.redirect(
                    "/profile/edit"
                );
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

            return res.redirect(
                "/profile/edit"
            );
        }
    );
}

// =====================================================
// IMAGE FILE SIGNATURE HELPERS
// =====================================================

function bufferStartsWith(
    buffer,
    bytes
) {
    if (
        !Buffer.isBuffer(
            buffer
        ) ||
        buffer.length <
            bytes.length
    ) {
        return false;
    }

    return bytes.every(
        (
            byte,
            index
        ) =>
            buffer[index] ===
            byte
    );
}

// =====================================================
// JPEG SIGNATURE
// =====================================================

function isJpegBuffer(
    buffer
) {
    return bufferStartsWith(
        buffer,
        [
            0xff,
            0xd8,
            0xff
        ]
    );
}

// =====================================================
// PNG SIGNATURE
// =====================================================

function isPngBuffer(
    buffer
) {
    return bufferStartsWith(
        buffer,
        [
            0x89,
            0x50,
            0x4e,
            0x47,
            0x0d,
            0x0a,
            0x1a,
            0x0a
        ]
    );
}

// =====================================================
// WEBP SIGNATURE
// =====================================================

function isWebpBuffer(
    buffer
) {
    if (
        !Buffer.isBuffer(
            buffer
        ) ||
        buffer.length < 12
    ) {
        return false;
    }

    const riff =
        buffer
            .subarray(
                0,
                4
            )
            .toString(
                "ascii"
            );

    const webp =
        buffer
            .subarray(
                8,
                12
            )
            .toString(
                "ascii"
            );

    return (
        riff ===
            "RIFF" &&
        webp ===
            "WEBP"
    );
}

// =====================================================
// HEIC / HEIF SIGNATURE
// =====================================================

function isHeicOrHeifBuffer(
    buffer
) {
    if (
        !Buffer.isBuffer(
            buffer
        ) ||
        buffer.length < 12
    ) {
        return false;
    }

    const fileType =
        buffer
            .subarray(
                4,
                8
            )
            .toString(
                "ascii"
            );

    if (
        fileType !==
        "ftyp"
    ) {
        return false;
    }

    const brand =
        buffer
            .subarray(
                8,
                12
            )
            .toString(
                "ascii"
            )
            .toLowerCase();

    const acceptedBrands =
        new Set([
            "heic",
            "heix",
            "hevc",
            "hevx",
            "mif1",
            "msf1"
        ]);

    return acceptedBrands.has(
        brand
    );
}

// =====================================================
// VALIDATE ACTUAL PROFILE IMAGE CONTENT
// =====================================================

function isValidProfileImageContent(
    file
) {
    if (
        !file ||
        !Buffer.isBuffer(
            file.buffer
        )
    ) {
        return false;
    }

    const extension =
        path
            .extname(
                file.originalname
            )
            .toLowerCase();

    if (
        extension === ".jpg" ||
        extension === ".jpeg"
    ) {
        return (
            file.mimetype ===
                "image/jpeg" &&
            isJpegBuffer(
                file.buffer
            )
        );
    }

    if (
        extension ===
        ".png"
    ) {
        return (
            file.mimetype ===
                "image/png" &&
            isPngBuffer(
                file.buffer
            )
        );
    }

    if (
        extension ===
        ".webp"
    ) {
        return (
            file.mimetype ===
                "image/webp" &&
            isWebpBuffer(
                file.buffer
            )
        );
    }

    if (
        extension === ".heic" ||
        extension === ".heif"
    ) {
        return (
            (
                file.mimetype ===
                    "image/heic" ||
                file.mimetype ===
                    "image/heif"
            ) &&
            isHeicOrHeifBuffer(
                file.buffer
            )
        );
    }

    return false;
}

// =====================================================
// SAVE PROFILE PICTURE
// =====================================================

async function saveProfilePicture(
    file
) {
    if (!file) {
        return null;
    }

    if (
        !isValidProfileImageContent(
            file
        )
    ) {
        throw new Error(
            "INVALID_PROFILE_IMAGE_CONTENT"
        );
    }

    const originalExtension =
        path
            .extname(
                file.originalname
            )
            .toLowerCase();

    const isHeic =
        originalExtension ===
            ".heic" ||
        originalExtension ===
            ".heif";

    const uniqueBaseName =
        `${Date.now()}-${Math.round(
            Math.random() *
            1e9
        )}`;

    // =================================================
    // HEIC / HEIF -> JPEG
    // =================================================

    if (isHeic) {

        const jpegBuffer =
            await heicConvert({
                buffer:
                    file.buffer,

                format:
                    "JPEG",

                quality:
                    0.9
            });

        const filename =
            `${uniqueBaseName}.jpg`;

        const destination =
            path.join(
                uploadDirectory,
                filename
            );

        await fs.promises
            .writeFile(
                destination,
                jpegBuffer
            );

        return {
            filename,

            filePath:
                destination,

            publicPath:
                `/uploads/${filename}`
        };
    }

    // =================================================
    // JPG / PNG / WEBP
    // =================================================

    const filename =
        `${uniqueBaseName}${originalExtension}`;

    const destination =
        path.join(
            uploadDirectory,
            filename
        );

    await fs.promises
        .writeFile(
            destination,
            file.buffer
        );

    return {
        filename,

        filePath:
            destination,

        publicPath:
            `/uploads/${filename}`
    };
}

// =====================================================
// DELETE FILE SAFELY
// =====================================================

async function deleteFileSafely(
    filePath
) {
    if (!filePath) {
        return;
    }

    try {

        await fs.promises
            .unlink(
                filePath
            );

    } catch (error) {

        if (
            error.code !==
            "ENOENT"
        ) {
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

function getUploadFilePath(
    publicPath
) {
    if (
        !publicPath ||
        typeof publicPath !==
            "string" ||
        !publicPath.startsWith(
            "/uploads/"
        )
    ) {
        return null;
    }

    const filename =
        path.basename(
            publicPath
        );

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

        const formData =
            consumeFormData(
                req
            );

        return res.render(
            "login",
            {
                title:
                    "Login",

                formData
            }
        );
    }
);

// =====================================================
// REGISTER PAGE
// =====================================================

router.get(
    "/register",
    requireLoggedOut,
    (req, res) => {

        const formData =
            consumeFormData(
                req
            );

        return res.render(
            "register",
            {
                title:
                    "Register",

                formData
            }
        );
    }
);

// =====================================================
// REGISTER USER
// =====================================================

router.post(
    "/register",
    requireLoggedOut,
    registrationLimiter,
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

            // =================================================
            // EXPECTED INPUT TYPES
            // =================================================

            if (
                !isStringInput(
                    first_name
                ) ||
                !isStringInput(
                    last_name
                ) ||
                !isStringInput(
                    email
                ) ||
                !isStringInput(
                    password
                ) ||
                !isStringInput(
                    confirm_password
                ) ||
                !isStringInput(
                    fitness_goal
                ) ||
                (
                    profile_bio !==
                        undefined &&
                    !isStringInput(
                        profile_bio
                    )
                )
            ) {

                setFeedback(
                    req,
                    "error",
                    "Invalid registration information was submitted."
                );

                return res.redirect(
                    "/register"
                );
            }

            const cleanFirstName =
                first_name.trim();

            const cleanLastName =
                last_name.trim();

            const cleanEmail =
                email
                    .trim()
                    .toLowerCase();

            const cleanFitnessGoal =
                fitness_goal.trim();

            const cleanProfileBio =
                profile_bio
                    ?.trim() ||
                "";

            const formData = {
                first_name:
                    cleanFirstName,

                last_name:
                    cleanLastName,

                email:
                    cleanEmail,

                fitness_goal:
                    cleanFitnessGoal,

                profile_bio:
                    cleanProfileBio
            };

            // =================================================
            // REQUIRED FIELDS
            // =================================================

            if (
                !cleanFirstName ||
                !cleanLastName ||
                !cleanEmail ||
                !password ||
                !confirm_password ||
                !cleanFitnessGoal
            ) {

                setFeedback(
                    req,
                    "error",
                    "Please complete all required fields."
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/register"
                );
            }

            // =================================================
            // INPUT LENGTHS
            // =================================================

            if (
                cleanFirstName.length >
                MAX_FIRST_NAME_LENGTH
            ) {

                setFeedback(
                    req,
                    "error",
                    `First name must be ${MAX_FIRST_NAME_LENGTH} characters or fewer.`
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/register"
                );
            }

            if (
                cleanLastName.length >
                MAX_LAST_NAME_LENGTH
            ) {

                setFeedback(
                    req,
                    "error",
                    `Last name must be ${MAX_LAST_NAME_LENGTH} characters or fewer.`
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/register"
                );
            }

            if (
                cleanEmail.length >
                MAX_EMAIL_LENGTH
            ) {

                setFeedback(
                    req,
                    "error",
                    `Email address must be ${MAX_EMAIL_LENGTH} characters or fewer.`
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/register"
                );
            }

            if (
                cleanFitnessGoal.length >
                MAX_FITNESS_GOAL_LENGTH
            ) {

                setFeedback(
                    req,
                    "error",
                    `Fitness goal must be ${MAX_FITNESS_GOAL_LENGTH} characters or fewer.`
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/register"
                );
            }

            if (
                cleanProfileBio.length >
                MAX_PROFILE_BIO_LENGTH
            ) {

                setFeedback(
                    req,
                    "error",
                    `Profile bio must be ${MAX_PROFILE_BIO_LENGTH} characters or fewer.`
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/register"
                );
            }

            if (
                password.length >
                    MAX_PASSWORD_LENGTH ||
                confirm_password.length >
                    MAX_PASSWORD_LENGTH
            ) {

                setFeedback(
                    req,
                    "error",
                    `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/register"
                );
            }

            // =================================================
            // EMAIL FORMAT + DOMAIN
            // =================================================

            if (
                !isValidBuddyEmail(
                    cleanEmail
                )
            ) {

                setFeedback(
                    req,
                    "error",
                    "Please enter a valid @buddy.co.uk email address."
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/register"
                );
            }

            // =================================================
            // FITNESS GOAL WHITELIST
            // =================================================

            if (
                !isValidFitnessGoal(
                    cleanFitnessGoal
                )
            ) {

                setFeedback(
                    req,
                    "error",
                    "Please select a valid fitness goal."
                );

                setFormData(
                    req,
                    {
                        ...formData,
                        fitness_goal:
                            ""
                    }
                );

                return res.redirect(
                    "/register"
                );
            }

            // =================================================
            // PASSWORD MATCH
            // =================================================

            if (
                password !==
                confirm_password
            ) {

                setFeedback(
                    req,
                    "error",
                    "Your passwords do not match. Please try again."
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/register"
                );
            }

            // =================================================
            // PASSWORD STRENGTH
            // =================================================

            const passwordRegex =
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

            if (
                !passwordRegex.test(
                    password
                )
            ) {

                setFeedback(
                    req,
                    "error",
                    "Your password must contain at least 8 characters, including an uppercase letter, lowercase letter and number."
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/register"
                );
            }

            // =================================================
            // DUPLICATE EMAIL CHECK
            // =================================================

            const [existingUsers] =
                await db.query(
                    `SELECT
                        user_id
                     FROM users
                     WHERE email = ?
                     LIMIT 1`,
                    [cleanEmail]
                );

            if (
                existingUsers.length >
                0
            ) {

                setFeedback(
                    req,
                    "error",
                    "An account already exists with this email. Try logging in instead."
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/register"
                );
            }

            // =================================================
            // HASH PASSWORD
            // =================================================

            const hashedPassword =
                await bcrypt.hash(
                    password,
                    10
                );

            // =================================================
            // CREATE USER
            // =================================================

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
                    cleanFirstName,
                    cleanLastName,
                    cleanEmail,
                    hashedPassword,
                    cleanFitnessGoal,
                    cleanProfileBio ||
                    null
                ]
            );

            setFeedback(
                req,
                "success",
                "Your GymBuddy account has been created successfully. You can now log in."
            );

            return res.redirect(
                "/login"
            );

        } catch (error) {

            console.error(
                "REGISTRATION ERROR:",
                error
            );

            if (
                error.code ===
                "ER_DUP_ENTRY"
            ) {

                setFeedback(
                    req,
                    "error",
                    "An account already exists with this email."
                );

                return res.redirect(
                    "/register"
                );
            }

            setFeedback(
                req,
                "error",
                "Something went wrong while creating your account. Please try again."
            );

            return res.redirect(
                "/register"
            );
        }
    }
);

// =====================================================
// LOGIN USER
// =====================================================

router.post(
    "/login",
    requireLoggedOut,
    loginLimiter,
    async (req, res) => {

        try {

            const {
                email,
                password
            } = req.body;

            // =================================================
            // EXPECTED INPUT TYPES
            // =================================================

            if (
                !isStringInput(
                    email
                ) ||
                !isStringInput(
                    password
                )
            ) {

                setFeedback(
                    req,
                    "error",
                    "Incorrect email or password."
                );

                return res.redirect(
                    "/login"
                );
            }

            const cleanEmail =
                email
                    .trim()
                    .toLowerCase();

            const formData = {
                email:
                    cleanEmail
            };

            // =================================================
            // REQUIRED FIELDS
            // =================================================

            if (
                !cleanEmail ||
                !password
            ) {

                setFeedback(
                    req,
                    "error",
                    "Please enter your email and password."
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/login"
                );
            }

            // =================================================
            // LENGTH CHECKS
            // =================================================

            if (
                cleanEmail.length >
                MAX_EMAIL_LENGTH ||
                password.length >
                MAX_PASSWORD_LENGTH
            ) {

                setFeedback(
                    req,
                    "error",
                    "Incorrect email or password."
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/login"
                );
            }

            // =================================================
            // EMAIL FORMAT
            // =================================================

            if (
                !isValidBuddyEmail(
                    cleanEmail
                )
            ) {

                setFeedback(
                    req,
                    "error",
                    "Incorrect email or password."
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/login"
                );
            }

            // =================================================
            // FIND USER
            // =================================================

            const [users] =
                await db.query(
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

            if (
                users.length ===
                0
            ) {

                setFeedback(
                    req,
                    "error",
                    "Incorrect email or password."
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/login"
                );
            }

            const user =
                users[0];

            // =================================================
            // PASSWORD CHECK
            // =================================================

            const validPassword =
                await bcrypt.compare(
                    password,
                    user.password
                );

            if (!validPassword) {

                setFeedback(
                    req,
                    "error",
                    "Incorrect email or password."
                );

                setFormData(
                    req,
                    formData
                );

                return res.redirect(
                    "/login"
                );
            }

            // =================================================
            // REGENERATE SESSION
            // =================================================

            req.session.regenerate(
                (
                    regenerateError
                ) => {

                    if (
                        regenerateError
                    ) {

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

                    req.session.userId =
                        user.user_id;

                    req.session.userName =
                        `${user.first_name} ${user.last_name}`;

                    setFeedback(
                        req,
                        "success",
                        `Welcome back, ${user.first_name}!`
                    );

                    req.session.save(
                        (
                            saveError
                        ) => {

                            if (
                                saveError
                            ) {

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

                            return res.redirect(
                                "/profile"
                            );
                        }
                    );
                }
            );

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

            return res.redirect(
                "/login"
            );
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

            const userId =
                getNumericId(
                    req.session.userId
                );

            if (!userId) {

                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            const [users] =
                await db.query(
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

            if (
                users.length ===
                0
            ) {

                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            const user =
                users[0];

            const [[workoutsCreated]] =
                await db.query(
                    `SELECT
                        COUNT(*) AS total
                     FROM workouts
                     WHERE user_id = ?`,
                    [userId]
                );

            const [[sessionsJoined]] =
                await db.query(
                    `SELECT
                        COUNT(*) AS total
                     FROM workout_participants
                     WHERE user_id = ?`,
                    [userId]
                );

            const [[partners]] =
                await db.query(
                    `SELECT
                        COUNT(
                            DISTINCT wp.user_id
                        ) AS total
                     FROM workout_participants wp

                     INNER JOIN workouts w
                        ON wp.workout_id =
                           w.workout_id

                     WHERE w.user_id = ?
                       AND wp.user_id != ?`,
                    [
                        userId,
                        userId
                    ]
                );

            const [streakRows] =
                await db.query(
                    `SELECT
                        current_streak
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

            return res.render(
                "profile",
                {
                    title:
                        "My Profile",

                    user,

                    workoutsCreated:
                        Number(
                            workoutsCreated.total ||
                            0
                        ),

                    workoutPartners:
                        Number(
                            partners.total ||
                            0
                        ),

                    currentStreak,

                    sessionsJoined:
                        Number(
                            sessionsJoined.total ||
                            0
                        )
                }
            );

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

            const userId =
                getNumericId(
                    req.session.userId
                );

            if (!userId) {

                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            const [users] =
                await db.query(
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

            if (
                users.length ===
                0
            ) {

                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            return res.render(
                "edit-profile",
                {
                    title:
                        "Edit Profile",

                    user:
                        users[0]
                }
            );

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

        let savedProfilePicture =
            null;

        try {

            const userId =
                getNumericId(
                    req.session.userId
                );

            if (!userId) {

                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            const {
                first_name,
                last_name,
                fitness_goal,
                profile_bio
            } = req.body;

            // =================================================
            // EXPECTED INPUT TYPES
            // =================================================

            if (
                !isStringInput(
                    first_name
                ) ||
                !isStringInput(
                    last_name
                ) ||
                !isStringInput(
                    fitness_goal
                ) ||
                (
                    profile_bio !==
                        undefined &&
                    !isStringInput(
                        profile_bio
                    )
                )
            ) {

                setFeedback(
                    req,
                    "error",
                    "Invalid profile information was submitted."
                );

                return res.redirect(
                    "/profile/edit"
                );
            }

            const cleanFirstName =
                first_name.trim();

            const cleanLastName =
                last_name.trim();

            const cleanFitnessGoal =
                fitness_goal.trim();

            const cleanProfileBio =
                profile_bio
                    ?.trim() ||
                "";

            // =================================================
            // REQUIRED FIELDS
            // =================================================

            if (
                !cleanFirstName ||
                !cleanLastName ||
                !cleanFitnessGoal
            ) {

                setFeedback(
                    req,
                    "error",
                    "First name, last name and fitness goal are required."
                );

                return res.redirect(
                    "/profile/edit"
                );
            }

            // =================================================
            // LENGTH CHECKS
            // =================================================

            if (
                cleanFirstName.length >
                MAX_FIRST_NAME_LENGTH
            ) {

                setFeedback(
                    req,
                    "error",
                    `First name must be ${MAX_FIRST_NAME_LENGTH} characters or fewer.`
                );

                return res.redirect(
                    "/profile/edit"
                );
            }

            if (
                cleanLastName.length >
                MAX_LAST_NAME_LENGTH
            ) {

                setFeedback(
                    req,
                    "error",
                    `Last name must be ${MAX_LAST_NAME_LENGTH} characters or fewer.`
                );

                return res.redirect(
                    "/profile/edit"
                );
            }

            if (
                cleanFitnessGoal.length >
                MAX_FITNESS_GOAL_LENGTH
            ) {

                setFeedback(
                    req,
                    "error",
                    `Fitness goal must be ${MAX_FITNESS_GOAL_LENGTH} characters or fewer.`
                );

                return res.redirect(
                    "/profile/edit"
                );
            }

            if (
                cleanProfileBio.length >
                MAX_PROFILE_BIO_LENGTH
            ) {

                setFeedback(
                    req,
                    "error",
                    `Profile bio must be ${MAX_PROFILE_BIO_LENGTH} characters or fewer.`
                );

                return res.redirect(
                    "/profile/edit"
                );
            }

            // =================================================
            // FITNESS GOAL WHITELIST
            // =================================================

            if (
                !isValidFitnessGoal(
                    cleanFitnessGoal
                )
            ) {

                setFeedback(
                    req,
                    "error",
                    "Please select a valid fitness goal."
                );

                return res.redirect(
                    "/profile/edit"
                );
            }

            // =================================================
            // LOAD OLD PROFILE IMAGE
            // =================================================

            const [existingUsers] =
                await db.query(
                    `SELECT
                        profile_picture
                     FROM users
                     WHERE user_id = ?
                     LIMIT 1`,
                    [userId]
                );

            if (
                existingUsers.length ===
                0
            ) {

                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            const oldProfilePicture =
                existingUsers[0]
                    .profile_picture ||
                null;

            // =================================================
            // PROCESS NEW IMAGE
            // =================================================

            if (req.file) {

                try {

                    savedProfilePicture =
                        await saveProfilePicture(
                            req.file
                        );

                } catch (
                    conversionError
                ) {

                    console.error(
                        "PROFILE IMAGE PROCESSING ERROR:",
                        conversionError
                    );

                    setFeedback(
                        req,
                        "error",
                        "We couldn't process this image. Please upload a genuine JPG, PNG, WebP, HEIC or HEIF photo."
                    );

                    return res.redirect(
                        "/profile/edit"
                    );
                }
            }

            // =================================================
            // UPDATE DATABASE
            // =================================================

            if (
                savedProfilePicture
            ) {

                await db.query(
                    `UPDATE users
                     SET first_name = ?,
                         last_name = ?,
                         fitness_goal = ?,
                         profile_bio = ?,
                         profile_picture = ?
                     WHERE user_id = ?`,
                    [
                        cleanFirstName,
                        cleanLastName,
                        cleanFitnessGoal,
                        cleanProfileBio ||
                        null,
                        savedProfilePicture
                            .publicPath,
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
                        cleanFirstName,
                        cleanLastName,
                        cleanFitnessGoal,
                        cleanProfileBio ||
                        null,
                        userId
                    ]
                );
            }

            // =================================================
            // DELETE OLD PROFILE IMAGE
            // =================================================

            if (
                savedProfilePicture &&
                oldProfilePicture &&
                oldProfilePicture !==
                    savedProfilePicture
                        .publicPath
            ) {

                const oldFilePath =
                    getUploadFilePath(
                        oldProfilePicture
                    );

                await deleteFileSafely(
                    oldFilePath
                );
            }

            // =================================================
            // UPDATE SESSION NAME
            // =================================================

            req.session.userName =
                `${cleanFirstName} ${cleanLastName}`;

            setFeedback(
                req,
                "success",
                "Your profile has been updated successfully."
            );

            return res.redirect(
                "/profile"
            );

        } catch (error) {

            console.error(
                "PROFILE UPDATE ERROR:",
                error
            );

            if (
                savedProfilePicture
            ) {

                await deleteFileSafely(
                    savedProfilePicture
                        .filePath
                );
            }

            setFeedback(
                req,
                "error",
                "Something went wrong while updating your profile. Please try again."
            );

            return res.redirect(
                "/profile/edit"
            );
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

            const profileUserId =
                getNumericId(
                    req.params.id
                );

            const currentUserId =
                getNumericId(
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

                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            const [userRows] =
                await db.query(
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

            if (
                userRows.length ===
                0
            ) {

                return res
                    .status(404)
                    .send(
                        "User not found."
                    );
            }

            const user =
                userRows[0];

            const [streakRows] =
                await db.query(
                    `SELECT
                        current_streak,
                        longest_streak,
                        last_workout_date
                     FROM streaks
                     WHERE user_id = ?
                     ORDER BY
                        streak_id DESC
                     LIMIT 1`,
                    [profileUserId]
                );

            const streak =
                streakRows.length >
                0
                    ? streakRows[0]
                    : {
                        current_streak:
                            0,

                        longest_streak:
                            0,

                        last_workout_date:
                            null
                    };

            const [[completedResult]] =
                await db.query(
                    `SELECT
                        COUNT(*) AS total
                     FROM workout_history
                     WHERE user_id = ?`,
                    [profileUserId]
                );

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

            return res.render(
                "public-profile",
                {
                    title:
                        `${user.first_name} ${user.last_name}`,

                    user,

                    currentStreak:
                        Number(
                            streak.current_streak ||
                            0
                        ),

                    longestStreak:
                        Number(
                            streak.longest_streak ||
                            0
                        ),

                    completedWorkouts:
                        Number(
                            completedResult.total ||
                            0
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

function logoutUser(
    req,
    res
) {
    req.session.destroy(
        (error) => {

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

            res.clearCookie(
                "gymbuddy.sid"
            );

            return res.redirect(
                "/login?loggedOut=true"
            );
        }
    );
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