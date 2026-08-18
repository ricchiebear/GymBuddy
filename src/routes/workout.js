const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const db = require("../config/database");
const formatDate = require("../utils/formatDate");
const createNotification =
    require("../utils/createNotification");

const router = express.Router();

// =====================================================
// CONFIGURATION
// =====================================================

const MAX_WORKOUT_TITLE_LENGTH = 100;
const MAX_WORKOUT_TYPE_LENGTH = 50;
const MAX_WORKOUT_LOCATION_LENGTH = 100;

const MAX_SEARCH_TYPE_LENGTH = 50;
const MAX_SEARCH_LOCATION_LENGTH = 100;
const MAX_SEARCH_STATUS_LENGTH = 50;

const MAX_GROUP_MESSAGE_LENGTH = 2000;

const MAX_WORKOUT_IMAGE_SIZE =
    5 * 1024 * 1024;

// =====================================================
// FEEDBACK
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

// =====================================================
// AUTHENTICATION
// =====================================================

function requireLogin(
    req,
    res,
    next
) {
    if (!req.session?.userId) {

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
// HELPERS
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
// NORMALIZE DATE
// =====================================================

function normalizeDate(value) {
    if (!value) {
        return null;
    }

    if (
        typeof value ===
        "string"
    ) {
        const match =
            value.match(
                /^(\d{4}-\d{2}-\d{2})/
            );

        if (match) {
            return match[1];
        }
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return null;
    }

    return date
        .toISOString()
        .slice(0, 10);
}

// =====================================================
// FORMAT DATETIME FOR HTML INPUT
// =====================================================

function formatDateTimeLocal(
    value
) {
    if (!value) {
        return "";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "";
    }

    const offset =
        date.getTimezoneOffset();

    return new Date(
        date.getTime() -
        offset *
        60 *
        1000
    )
        .toISOString()
        .slice(0, 16);
}

// =====================================================
// VALIDATE WORKOUT FIELDS
// =====================================================

function validateWorkoutFields({
    title,
    workout_type,
    location,
    start_time,
    end_time
}) {

    const cleanTitle =
        title?.trim() || "";

    const cleanWorkoutType =
        workout_type?.trim() || "";

    const cleanLocation =
        location?.trim() || "";

    // =================================================
    // REQUIRED FIELDS
    // =================================================

    if (
        !cleanTitle ||
        !cleanWorkoutType ||
        !cleanLocation ||
        !start_time ||
        !end_time
    ) {
        return (
            "Please complete all required workout fields."
        );
    }

    // =================================================
    // TITLE LENGTH
    // =================================================

    if (
        cleanTitle.length >
        MAX_WORKOUT_TITLE_LENGTH
    ) {
        return (
            `Workout title must be ${MAX_WORKOUT_TITLE_LENGTH} characters or fewer.`
        );
    }

    // =================================================
    // WORKOUT TYPE LENGTH
    // =================================================

    if (
        cleanWorkoutType.length >
        MAX_WORKOUT_TYPE_LENGTH
    ) {
        return (
            `Workout type must be ${MAX_WORKOUT_TYPE_LENGTH} characters or fewer.`
        );
    }

    // =================================================
    // LOCATION LENGTH
    // =================================================

    if (
        cleanLocation.length >
        MAX_WORKOUT_LOCATION_LENGTH
    ) {
        return (
            `Workout location must be ${MAX_WORKOUT_LOCATION_LENGTH} characters or fewer.`
        );
    }

    // =================================================
    // VALID DATE/TIME
    // =================================================

    const start =
        new Date(start_time);

    const end =
        new Date(end_time);

    if (
        Number.isNaN(
            start.getTime()
        ) ||
        Number.isNaN(
            end.getTime()
        )
    ) {
        return (
            "Please enter valid workout start and end times."
        );
    }

    // =================================================
    // START TIME CANNOT BE IN THE PAST
    // =================================================

    const now =
        new Date();

    if (
        start < now
    ) {
        return (
            "Workout start time cannot be in the past."
        );
    }

    // =================================================
    // END MUST FOLLOW START
    // =================================================

    if (
        end <= start
    ) {
        return (
            "The end time must be later than the start time."
        );
    }

    return null;
}

// =====================================================
// CALENDAR TEXT ESCAPING
// =====================================================

function escapeCalendarText(value) {
    return String(
        value ?? ""
    )
        .replace(
            /\\/g,
            "\\\\"
        )
        .replace(
            /\r?\n/g,
            "\\n"
        )
        .replace(
            /;/g,
            "\\;"
        )
        .replace(
            /,/g,
            "\\,"
        );
}

// =====================================================
// CALENDAR DATETIME
// =====================================================

function toCalendarDateTime(
    value
) {
    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return null;
    }

    return (
        date
            .toISOString()
            .replace(
                /[-:]/g,
                ""
            )
            .split(".")[0] +
        "Z"
    );
}

// =====================================================
// CHECK WORKOUT CHAT ACCESS
// =====================================================

async function canAccessWorkoutChat(
    workoutId,
    userId,
    connection = db
) {
    const [rows] =
        await connection.query(
            `SELECT
                w.user_id AS creator_id,

                EXISTS(
                    SELECT 1
                    FROM workout_participants wp
                    WHERE wp.workout_id =
                          w.workout_id
                      AND wp.user_id = ?
                ) AS is_participant

             FROM workouts w

             WHERE w.workout_id = ?

             LIMIT 1`,
            [
                userId,
                workoutId
            ]
        );

    if (
        rows.length ===
        0
    ) {
        return {
            exists:
                false,

            allowed:
                false,

            creatorId:
                null
        };
    }

    const creatorId =
        Number(
            rows[0].creator_id
        );

    const isParticipant =
        Boolean(
            rows[0]
                .is_participant
        );

    return {
        exists:
            true,

        allowed:
            creatorId === userId ||
            isParticipant,

        creatorId
    };
}

// =====================================================
// IMAGE UPLOAD DIRECTORY
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
// ALLOWED WORKOUT IMAGE TYPES
// =====================================================

const allowedImageMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
];

const allowedImageExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp"
];

// =====================================================
// MULTER STORAGE
// =====================================================

const storage =
    multer.diskStorage({

        destination:
            (
                req,
                file,
                cb
            ) => {

                cb(
                    null,
                    uploadDirectory
                );
            },

        filename:
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

                const uniqueName =
                    `${Date.now()}-${Math.round(
                        Math.random() *
                        1e9
                    )}${extension}`;

                cb(
                    null,
                    uniqueName
                );
            }
    });

// =====================================================
// MULTER CONFIGURATION
// =====================================================

const upload =
    multer({
        storage,

        limits: {
            fileSize:
                MAX_WORKOUT_IMAGE_SIZE
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
                    allowedImageMimeTypes
                        .includes(
                            file.mimetype
                        );

                const allowedExtension =
                    allowedImageExtensions
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
                        "Please upload a valid JPG, PNG or WebP workout image."
                    )
                );
            }
    });

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
                "WORKOUT IMAGE DELETE ERROR:",
                error
            );
        }
    }
}

// =====================================================
// GET LOCAL FILE PATH FROM PUBLIC PATH
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
// DELETE CURRENT REQUEST UPLOAD
// =====================================================

async function deleteRequestUpload(
    file
) {
    if (
        !file ||
        !file.path
    ) {
        return;
    }

    await deleteFileSafely(
        file.path
    );
}

// =====================================================
// WORKOUT IMAGE UPLOAD MIDDLEWARE
// =====================================================

function uploadWorkoutImage(
    req,
    res,
    next
) {
    upload.single(
        "workout_image"
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
                    "Workout images must be smaller than 5MB."
                );

                return res.redirect(
                    req.path.includes(
                        "/edit"
                    )
                        ? req.originalUrl
                        : "/workouts/create"
                );
            }

            console.error(
                "WORKOUT IMAGE UPLOAD ERROR:",
                error
            );

            setFeedback(
                req,
                "error",
                error.message ||
                "We couldn't upload that workout image."
            );

            return res.redirect(
                req.path.includes(
                    "/edit"
                )
                    ? req.originalUrl
                    : "/workouts/create"
            );
        }
    );
}

// =====================================================
// VIEW ALL WORKOUTS + SEARCH/FILTER
// =====================================================

router.get(
    "/workouts",
    async (req, res) => {

        try {

            let type =
                req.query.type
                    ?.trim() ||
                "";

            let location =
                req.query.location
                    ?.trim() ||
                "";

            let status =
                req.query.status
                    ?.trim() ||
                "";

            if (
                type.length >
                MAX_SEARCH_TYPE_LENGTH
            ) {
                type =
                    type.slice(
                        0,
                        MAX_SEARCH_TYPE_LENGTH
                    );
            }

            if (
                location.length >
                MAX_SEARCH_LOCATION_LENGTH
            ) {
                location =
                    location.slice(
                        0,
                        MAX_SEARCH_LOCATION_LENGTH
                    );
            }

            if (
                status.length >
                MAX_SEARCH_STATUS_LENGTH
            ) {
                status =
                    status.slice(
                        0,
                        MAX_SEARCH_STATUS_LENGTH
                    );
            }

            let sql = `
                SELECT
                    w.*,

                    u.first_name
                        AS creator_first_name,

                    u.last_name
                        AS creator_last_name,

                    (
                        SELECT COUNT(*)
                        FROM workout_participants wp
                        WHERE wp.workout_id =
                              w.workout_id
                    ) AS participants_count

                FROM workouts w

                INNER JOIN users u
                    ON w.user_id =
                       u.user_id

                WHERE 1 = 1
            `;

            const params = [];

            if (type) {
                sql +=
                    " AND w.workout_type LIKE ?";

                params.push(
                    `%${type}%`
                );
            }

            if (location) {
                sql +=
                    " AND w.location LIKE ?";

                params.push(
                    `%${location}%`
                );
            }

            if (status) {
                sql +=
                    " AND LOWER(w.status) = LOWER(?)";

                params.push(
                    status
                );
            }

            sql +=
                " ORDER BY w.start_time ASC";

            const [workouts] =
                await db.query(
                    sql,
                    params
                );

            return res.render(
                "workouts",
                {
                    title:
                        "Workouts",

                    workouts,

                    filters: {
                        type,
                        location,
                        status
                    }
                }
            );

        } catch (error) {

            console.error(
                "WORKOUTS PAGE ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading workouts."
                );
        }
    }
);

// =====================================================
// SHOW CREATE WORKOUT FORM
// =====================================================

router.get(
    "/workouts/create",
    requireLogin,
    (req, res) => {

        return res.render(
            "create-workout",
            {
                title:
                    "Create Workout"
            }
        );
    }
);

// =====================================================
// CREATE WORKOUT
// =====================================================

router.post(
    "/workouts/create",
    requireLogin,
    uploadWorkoutImage,
    async (req, res) => {

        try {

            const userId =
                getNumericId(
                    req.session.userId
                );

            if (!userId) {

                await deleteRequestUpload(
                    req.file
                );

                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            const {
                title,
                workout_type,
                location,
                start_time,
                end_time
            } = req.body;

            const validationError =
                validateWorkoutFields({
                    title,
                    workout_type,
                    location,
                    start_time,
                    end_time
                });

            if (
                validationError
            ) {

                await deleteRequestUpload(
                    req.file
                );

                setFeedback(
                    req,
                    "warning",
                    validationError
                );

                return res.redirect(
                    "/workouts/create"
                );
            }

            const cleanTitle =
                title.trim();

            const cleanWorkoutType =
                workout_type.trim();

            const cleanLocation =
                location.trim();

            const workoutDate =
                normalizeDate(
                    start_time
                );

            const workoutImage =
                req.file
                    ? `/uploads/${req.file.filename}`
                    : null;

            await db.query(
                `INSERT INTO workouts
                 (
                    user_id,
                    title,
                    workout_type,
                    location,
                    start_time,
                    end_time,
                    workout_date,
                    workout_image,
                    status
                 )
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    cleanTitle,
                    cleanWorkoutType,
                    cleanLocation,
                    start_time,
                    end_time,
                    workoutDate,
                    workoutImage,
                    "open"
                ]
            );

            setFeedback(
                req,
                "success",
                "Workout created successfully."
            );

            return res.redirect(
                "/my-workouts"
            );

        } catch (error) {

            await deleteRequestUpload(
                req.file
            );

            console.error(
                "CREATE WORKOUT ERROR:",
                error
            );

            setFeedback(
                req,
                "error",
                "Something went wrong while creating your workout."
            );

            return res.redirect(
                "/workouts/create"
            );
        }
    }
);

// =====================================================
// MY CREATED WORKOUTS
// =====================================================

router.get(
    "/my-workouts",
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

            const [workouts] =
                await db.query(
                    `SELECT
                        w.*,

                        (
                            SELECT COUNT(*)
                            FROM workout_participants wp
                            WHERE wp.workout_id =
                                  w.workout_id
                        ) AS participants_count

                     FROM workouts w

                     WHERE w.user_id = ?

                     ORDER BY
                        w.start_time DESC`,
                    [userId]
                );

            return res.render(
                "my-workouts",
                {
                    title:
                        "My Workouts",

                    workouts
                }
            );

        } catch (error) {

            console.error(
                "MY WORKOUTS ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading your workouts."
                );
        }
    }
);

// =====================================================
// MY JOINED WORKOUTS
// =====================================================

router.get(
    "/joined-workouts",
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

            const [workouts] =
                await db.query(
                    `SELECT
                        w.*,

                        u.first_name
                            AS creator_first_name,

                        u.last_name
                            AS creator_last_name

                     FROM workout_participants wp

                     INNER JOIN workouts w
                        ON wp.workout_id =
                           w.workout_id

                     INNER JOIN users u
                        ON w.user_id =
                           u.user_id

                     WHERE wp.user_id = ?

                     ORDER BY
                        w.start_time ASC`,
                    [userId]
                );

            return res.render(
                "joined-workouts",
                {
                    title:
                        "My Joined Workouts",

                    workouts
                }
            );

        } catch (error) {

            console.error(
                "JOINED WORKOUTS ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading joined workouts."
                );
        }
    }
);

// =====================================================
// SHOW EDIT WORKOUT FORM
// =====================================================

router.get(
    "/workouts/:id/edit",
    requireLogin,
    async (req, res) => {

        try {

            const workoutId =
                getNumericId(
                    req.params.id
                );

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

            if (!workoutId) {

                setFeedback(
                    req,
                    "warning",
                    "That workout could not be found."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            const [rows] =
                await db.query(
                    `SELECT *
                     FROM workouts
                     WHERE workout_id = ?
                       AND user_id = ?
                     LIMIT 1`,
                    [
                        workoutId,
                        userId
                    ]
                );

            if (
                rows.length ===
                0
            ) {

                setFeedback(
                    req,
                    "warning",
                    "That workout could not be found or you do not have permission to edit it."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            const existingWorkout =
                rows[0];

            const currentStatus =
                String(
                    existingWorkout.status ||
                    ""
                ).toLowerCase();

            // =================================================
            // CANNOT EDIT CANCELLED WORKOUT
            // =================================================

            if (
                currentStatus ===
                "cancelled"
            ) {

                setFeedback(
                    req,
                    "warning",
                    "A cancelled workout cannot be edited."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            // =================================================
            // CANNOT EDIT COMPLETED WORKOUT
            // =================================================

            if (
                currentStatus ===
                "completed"
            ) {

                setFeedback(
                    req,
                    "warning",
                    "A completed workout cannot be edited."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            // =================================================
            // CANNOT EDIT AFTER START
            // =================================================

            const workoutStartTime =
                new Date(
                    existingWorkout.start_time
                );

            if (
                Number.isNaN(
                    workoutStartTime
                        .getTime()
                )
            ) {

                setFeedback(
                    req,
                    "error",
                    "This workout has an invalid start time."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            if (
                new Date() >=
                workoutStartTime
            ) {

                setFeedback(
                    req,
                    "warning",
                    "A workout cannot be edited after it has started."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            const workout = {
                ...existingWorkout,

                formatted_start_time:
                    formatDateTimeLocal(
                        existingWorkout
                            .start_time
                    ),

                formatted_end_time:
                    formatDateTimeLocal(
                        existingWorkout
                            .end_time
                    )
            };

            return res.render(
                "edit-workout",
                {
                    title:
                        "Edit Workout",

                    workout
                }
            );

        } catch (error) {

            console.error(
                "EDIT WORKOUT PAGE ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading the edit workout page."
                );
        }
    }
);

// =====================================================
// UPDATE WORKOUT
// =====================================================

router.post(
    "/workouts/:id/edit",
    requireLogin,
    uploadWorkoutImage,
    async (req, res) => {

        try {

            const workoutId =
                getNumericId(
                    req.params.id
                );

            const userId =
                getNumericId(
                    req.session.userId
                );

            if (!userId) {

                await deleteRequestUpload(
                    req.file
                );

                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            if (!workoutId) {

                await deleteRequestUpload(
                    req.file
                );

                setFeedback(
                    req,
                    "warning",
                    "That workout could not be found."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            // =================================================
            // LOAD CURRENT WORKOUT FIRST
            // =================================================

            const [existingRows] =
                await db.query(
                    `SELECT
                        workout_id,
                        workout_image,
                        status,
                        start_time

                     FROM workouts

                     WHERE workout_id = ?
                       AND user_id = ?

                     LIMIT 1`,
                    [
                        workoutId,
                        userId
                    ]
                );

            if (
                existingRows.length ===
                0
            ) {

                await deleteRequestUpload(
                    req.file
                );

                setFeedback(
                    req,
                    "warning",
                    "That workout could not be found or you do not have permission to edit it."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            const existingWorkout =
                existingRows[0];

            const currentStatus =
                String(
                    existingWorkout.status ||
                    ""
                ).toLowerCase();

            // =================================================
            // CANNOT UPDATE CANCELLED WORKOUT
            // =================================================

            if (
                currentStatus ===
                "cancelled"
            ) {

                await deleteRequestUpload(
                    req.file
                );

                setFeedback(
                    req,
                    "warning",
                    "A cancelled workout cannot be edited."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            // =================================================
            // CANNOT UPDATE COMPLETED WORKOUT
            // =================================================

            if (
                currentStatus ===
                "completed"
            ) {

                await deleteRequestUpload(
                    req.file
                );

                setFeedback(
                    req,
                    "warning",
                    "A completed workout cannot be edited."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            // =================================================
            // CANNOT UPDATE AFTER START
            // =================================================

            const currentStartTime =
                new Date(
                    existingWorkout
                        .start_time
                );

            if (
                Number.isNaN(
                    currentStartTime
                        .getTime()
                )
            ) {

                await deleteRequestUpload(
                    req.file
                );

                setFeedback(
                    req,
                    "error",
                    "This workout has an invalid start time."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            if (
                new Date() >=
                currentStartTime
            ) {

                await deleteRequestUpload(
                    req.file
                );

                setFeedback(
                    req,
                    "warning",
                    "A workout cannot be edited after it has started."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            const {
                title,
                workout_type,
                location,
                start_time,
                end_time
            } = req.body;

            // =================================================
            // VALIDATE NEW DATA
            // =================================================

            const validationError =
                validateWorkoutFields({
                    title,
                    workout_type,
                    location,
                    start_time,
                    end_time
                });

            if (
                validationError
            ) {

                await deleteRequestUpload(
                    req.file
                );

                setFeedback(
                    req,
                    "warning",
                    validationError
                );

                return res.redirect(
                    `/workouts/${workoutId}/edit`
                );
            }

            const oldWorkoutImage =
                existingWorkout
                    .workout_image ||
                null;

            const workoutDate =
                normalizeDate(
                    start_time
                );

            const params = [
                title.trim(),
                workout_type.trim(),
                location.trim(),
                start_time,
                end_time,
                workoutDate
            ];

            let sql = `
                UPDATE workouts
                SET title = ?,
                    workout_type = ?,
                    location = ?,
                    start_time = ?,
                    end_time = ?,
                    workout_date = ?
            `;

            if (req.file) {

                sql +=
                    ", workout_image = ?";

                params.push(
                    `/uploads/${req.file.filename}`
                );
            }

            sql += `
                WHERE workout_id = ?
                  AND user_id = ?
            `;

            params.push(
                workoutId,
                userId
            );

            await db.query(
                sql,
                params
            );

            // =================================================
            // DELETE OLD IMAGE AFTER SUCCESS
            // =================================================

            if (
                req.file &&
                oldWorkoutImage
            ) {

                const oldFilePath =
                    getUploadFilePath(
                        oldWorkoutImage
                    );

                await deleteFileSafely(
                    oldFilePath
                );
            }

            setFeedback(
                req,
                "success",
                "Workout updated successfully."
            );

            return res.redirect(
                "/my-workouts"
            );

        } catch (error) {

            await deleteRequestUpload(
                req.file
            );

            console.error(
                "UPDATE WORKOUT ERROR:",
                error
            );

            setFeedback(
                req,
                "error",
                "Something went wrong while updating the workout."
            );

            const workoutId =
                getNumericId(
                    req.params.id
                );

            return res.redirect(
                workoutId
                    ? `/workouts/${workoutId}/edit`
                    : "/my-workouts"
            );
        }
    }
);

// =====================================================
// CANCEL WORKOUT + NOTIFY PARTICIPANTS
// =====================================================

router.post(
    "/workouts/:id/cancel",
    requireLogin,
    async (req, res) => {

        let connection;

        try {

            const workoutId =
                getNumericId(
                    req.params.id
                );

            const ownerId =
                getNumericId(
                    req.session.userId
                );

            if (
                !workoutId ||
                !ownerId
            ) {
                return res
                    .status(400)
                    .send(
                        "Workout ID or logged-in user is missing."
                    );
            }

            connection =
                await db.getConnection();

            await connection
                .beginTransaction();

            const [workoutRows] =
                await connection.query(
                    `SELECT
                        w.workout_id,
                        w.user_id AS owner_id,
                        w.title,
                        w.status,
                        w.end_time,

                        u.first_name
                            AS owner_first_name,

                        u.last_name
                            AS owner_last_name

                     FROM workouts w

                     INNER JOIN users u
                        ON w.user_id =
                           u.user_id

                     WHERE w.workout_id = ?

                     FOR UPDATE`,
                    [workoutId]
                );

            if (
                workoutRows.length ===
                0
            ) {

                await connection
                    .rollback();

                return res
                    .status(404)
                    .send(
                        "Workout not found."
                    );
            }

            const workout =
                workoutRows[0];

            // =================================================
            // OWNER CHECK
            // =================================================

            if (
                Number(
                    workout.owner_id
                ) !== ownerId
            ) {

                await connection
                    .rollback();

                return res
                    .status(403)
                    .send(
                        "You cannot cancel another user's workout."
                    );
            }

            const currentStatus =
                String(
                    workout.status ||
                    ""
                ).toLowerCase();

            // =================================================
            // ALREADY CANCELLED
            // =================================================

            if (
                currentStatus ===
                "cancelled"
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "This workout has already been cancelled."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            // =================================================
            // COMPLETED
            // =================================================

            if (
                currentStatus ===
                "completed"
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "A completed workout cannot be cancelled."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            // =================================================
            // CANNOT CANCEL AFTER END TIME
            // =================================================

            const workoutEndTime =
                new Date(
                    workout.end_time
                );

            if (
                Number.isNaN(
                    workoutEndTime
                        .getTime()
                )
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "error",
                    "This workout has an invalid end time."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            if (
                new Date() >=
                workoutEndTime
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "This workout has already ended and can no longer be cancelled."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            // =================================================
            // GET PARTICIPANTS
            // =================================================

            const [participants] =
                await connection.query(
                    `SELECT
                        user_id
                     FROM workout_participants
                     WHERE workout_id = ?`,
                    [workoutId]
                );

            // =================================================
            // CANCEL WORKOUT
            // =================================================

            await connection.query(
                `UPDATE workouts
                 SET status = 'cancelled'
                 WHERE workout_id = ?
                   AND user_id = ?`,
                [
                    workoutId,
                    ownerId
                ]
            );

            // =================================================
            // REJECT PENDING JOIN REQUESTS
            // =================================================

            await connection.query(
                `UPDATE join_requests
                 SET status = 'rejected'
                 WHERE workout_id = ?
                   AND LOWER(status) =
                       'pending'`,
                [workoutId]
            );

            const ownerName =
                `${workout.owner_first_name} ${workout.owner_last_name}`
                    .trim();

            // =================================================
            // NOTIFY PARTICIPANTS
            // =================================================

            for (
                const participant
                of participants
            ) {

                const participantId =
                    Number(
                        participant.user_id
                    );

                if (
                    participantId !==
                    ownerId
                ) {

                    await createNotification(
                        participantId,
                        `${ownerName} cancelled the workout "${workout.title}".`,
                        `/workouts/${workoutId}`,
                        connection
                    );
                }
            }

            await connection
                .commit();

            setFeedback(
                req,
                "success",
                "Workout cancelled. Participants have been notified."
            );

            return res.redirect(
                "/my-workouts"
            );

        } catch (error) {

            if (connection) {
                try {
                    await connection
                        .rollback();
                } catch (
                    rollbackError
                ) {
                    console.error(
                        "CANCEL WORKOUT ROLLBACK ERROR:",
                        rollbackError
                    );
                }
            }

            console.error(
                "CANCEL WORKOUT ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error cancelling workout."
                );

        } finally {

            if (connection) {
                connection.release();
            }
        }
    }
);

// =====================================================
// COMPLETE WORKOUT + UPDATE HISTORY/STREAKS
// =====================================================

router.post(
    "/workouts/:id/complete",
    requireLogin,
    async (req, res) => {

        let connection;

        try {

            const workoutId =
                getNumericId(
                    req.params.id
                );

            const ownerId =
                getNumericId(
                    req.session.userId
                );

            if (
                !workoutId ||
                !ownerId
            ) {
                return res
                    .status(400)
                    .send(
                        "Workout ID or logged-in user is missing."
                    );
            }

            connection =
                await db.getConnection();

            await connection
                .beginTransaction();

            const [workoutRows] =
                await connection.query(
                    `SELECT
                        w.workout_id,
                        w.user_id AS owner_id,
                        w.title,
                        w.status,
                        w.workout_date,
                        w.end_time,

                        u.first_name
                            AS owner_first_name,

                        u.last_name
                            AS owner_last_name

                     FROM workouts w

                     INNER JOIN users u
                        ON w.user_id =
                           u.user_id

                     WHERE w.workout_id = ?

                     FOR UPDATE`,
                    [workoutId]
                );

            if (
                workoutRows.length ===
                0
            ) {

                await connection
                    .rollback();

                return res
                    .status(404)
                    .send(
                        "Workout not found."
                    );
            }

            const workout =
                workoutRows[0];

            if (
                Number(
                    workout.owner_id
                ) !== ownerId
            ) {

                await connection
                    .rollback();

                return res
                    .status(403)
                    .send(
                        "You cannot complete another user's workout."
                    );
            }

            const currentStatus =
                String(
                    workout.status ||
                    ""
                ).toLowerCase();

            if (
                currentStatus ===
                "completed"
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "This workout has already been completed."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            if (
                currentStatus ===
                "cancelled"
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "A cancelled workout cannot be completed."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            // =================================================
            // END TIME CHECK
            // =================================================

            const workoutEndTime =
                new Date(
                    workout.end_time
                );

            if (
                Number.isNaN(
                    workoutEndTime
                        .getTime()
                )
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "error",
                    "The workout end time is invalid."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            if (
                new Date() <
                workoutEndTime
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "You can only mark this workout as completed after its scheduled end time."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            // =================================================
            // PARTICIPANTS
            // =================================================

            const [participantRows] =
                await connection.query(
                    `SELECT
                        user_id
                     FROM workout_participants
                     WHERE workout_id = ?`,
                    [workoutId]
                );

            const uniqueUserIds = [
                ...new Set([
                    ownerId,

                    ...participantRows.map(
                        (
                            participant
                        ) =>
                            Number(
                                participant
                                    .user_id
                            )
                    )
                ])
            ];

            // =================================================
            // COMPLETE WORKOUT
            // =================================================

            await connection.query(
                `UPDATE workouts
                 SET status = 'completed'
                 WHERE workout_id = ?
                   AND user_id = ?`,
                [
                    workoutId,
                    ownerId
                ]
            );

            const completionDate =
                normalizeDate(
                    workout.workout_date
                ) ||
                normalizeDate(
                    new Date()
                );

            // =================================================
            // HISTORY + STREAKS
            // =================================================

            for (
                const userId
                of uniqueUserIds
            ) {

                await connection.query(
                    `INSERT IGNORE
                     INTO workout_history
                     (
                        user_id,
                        workout_id,
                        workout_date
                     )
                     VALUES (?, ?, ?)`,
                    [
                        userId,
                        workoutId,
                        completionDate
                    ]
                );

                const [streakRows] =
                    await connection.query(
                        `SELECT
                            streak_id,
                            current_streak,
                            longest_streak,
                            last_workout_date

                         FROM streaks

                         WHERE user_id = ?

                         FOR UPDATE`,
                        [userId]
                    );

                if (
                    streakRows.length ===
                    0
                ) {

                    await connection.query(
                        `INSERT INTO streaks
                         (
                            user_id,
                            current_streak,
                            longest_streak,
                            last_workout_date
                         )
                         VALUES (?, 1, 1, ?)`,
                        [
                            userId,
                            completionDate
                        ]
                    );

                    continue;
                }

                const streak =
                    streakRows[0];

                let currentStreak =
                    Number(
                        streak.current_streak ||
                        0
                    );

                let longestStreak =
                    Number(
                        streak.longest_streak ||
                        0
                    );

                const lastWorkoutDate =
                    normalizeDate(
                        streak.last_workout_date
                    );

                if (!lastWorkoutDate) {

                    currentStreak =
                        1;

                } else {

                    const completedDateMs =
                        new Date(
                            `${completionDate}T00:00:00Z`
                        ).getTime();

                    const lastDateMs =
                        new Date(
                            `${lastWorkoutDate}T00:00:00Z`
                        ).getTime();

                    const differenceInDays =
                        Math.round(
                            (
                                completedDateMs -
                                lastDateMs
                            ) /
                            (
                                1000 *
                                60 *
                                60 *
                                24
                            )
                        );

                    if (
                        differenceInDays ===
                        1
                    ) {

                        currentStreak +=
                            1;

                    } else if (
                        differenceInDays >
                        1
                    ) {

                        currentStreak =
                            1;

                    } else if (
                        differenceInDays ===
                        0
                    ) {

                        currentStreak =
                            currentStreak ||
                            1;

                    } else {

                        continue;
                    }
                }

                longestStreak =
                    Math.max(
                        longestStreak,
                        currentStreak
                    );

                await connection.query(
                    `UPDATE streaks
                     SET current_streak = ?,
                         longest_streak = ?,
                         last_workout_date = ?
                     WHERE user_id = ?`,
                    [
                        currentStreak,
                        longestStreak,
                        completionDate,
                        userId
                    ]
                );
            }

            // =================================================
            // NOTIFY PARTICIPANTS
            // =================================================

            const ownerName =
                `${workout.owner_first_name} ${workout.owner_last_name}`
                    .trim();

            for (
                const participant
                of participantRows
            ) {

                const participantId =
                    Number(
                        participant.user_id
                    );

                if (
                    participantId !==
                    ownerId
                ) {

                    await createNotification(
                        participantId,
                        `${ownerName} marked the workout "${workout.title}" as completed.`,
                        `/workouts/${workoutId}`,
                        connection
                    );
                }
            }

            await connection
                .commit();

            setFeedback(
                req,
                "success",
                "Workout completed. Workout history and streaks have been updated."
            );

            return res.redirect(
                "/my-workouts"
            );

        } catch (error) {

            if (connection) {
                try {
                    await connection
                        .rollback();
                } catch (
                    rollbackError
                ) {
                    console.error(
                        "COMPLETE WORKOUT ROLLBACK ERROR:",
                        rollbackError
                    );
                }
            }

            console.error(
                "COMPLETE WORKOUT ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error completing workout."
                );

        } finally {

            if (connection) {
                connection.release();
            }
        }
    }
);

// =====================================================
// DELETE WORKOUT
// =====================================================

router.post(
    "/workouts/:id/delete",
    requireLogin,
    async (req, res) => {

        try {

            const workoutId =
                getNumericId(
                    req.params.id
                );

            const userId =
                getNumericId(
                    req.session.userId
                );

            if (
                !workoutId ||
                !userId
            ) {

                setFeedback(
                    req,
                    "warning",
                    "That workout could not be found."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            // =================================================
            // LOAD WORKOUT
            // =================================================

            const [workoutRows] =
                await db.query(
                    `SELECT
                        workout_image,
                        status

                     FROM workouts

                     WHERE workout_id = ?
                       AND user_id = ?

                     LIMIT 1`,
                    [
                        workoutId,
                        userId
                    ]
                );

            if (
                workoutRows.length ===
                0
            ) {

                setFeedback(
                    req,
                    "warning",
                    "That workout could not be found or you do not have permission to delete it."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            const workout =
                workoutRows[0];

            const currentStatus =
                String(
                    workout.status ||
                    ""
                ).toLowerCase();

            // =================================================
            // PROTECT COMPLETED HISTORY
            // =================================================

            if (
                currentStatus ===
                "completed"
            ) {

                setFeedback(
                    req,
                    "warning",
                    "Completed workouts cannot be deleted because they are part of your workout history."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            const workoutImage =
                workout.workout_image ||
                null;

            // =================================================
            // DELETE DATABASE RECORD
            // =================================================

            const [result] =
                await db.query(
                    `DELETE FROM workouts
                     WHERE workout_id = ?
                       AND user_id = ?`,
                    [
                        workoutId,
                        userId
                    ]
                );

            if (
                result.affectedRows ===
                0
            ) {

                setFeedback(
                    req,
                    "warning",
                    "That workout could not be deleted."
                );

                return res.redirect(
                    "/my-workouts"
                );
            }

            // =================================================
            // DELETE WORKOUT IMAGE
            // =================================================

            if (workoutImage) {

                const workoutFilePath =
                    getUploadFilePath(
                        workoutImage
                    );

                await deleteFileSafely(
                    workoutFilePath
                );
            }

            setFeedback(
                req,
                "success",
                "Workout deleted successfully."
            );

            return res.redirect(
                "/my-workouts"
            );

        } catch (error) {

            console.error(
                "DELETE WORKOUT ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Unable to delete workout."
                );
        }
    }
);

// =====================================================
// VIEW WORKOUT DETAILS
// =====================================================

router.get(
    "/workouts/:id",
    async (req, res) => {

        try {

            const workoutId =
                getNumericId(
                    req.params.id
                );

            if (!workoutId) {

                return res
                    .status(400)
                    .send(
                        "Invalid workout ID."
                    );
            }

            const [rows] =
                await db.query(
                    `SELECT
                        w.*,

                        u.first_name
                            AS creator_first_name,

                        u.last_name
                            AS creator_last_name,

                        (
                            SELECT COUNT(*)
                            FROM workout_participants wp
                            WHERE wp.workout_id =
                                  w.workout_id
                        ) AS participants_count

                     FROM workouts w

                     INNER JOIN users u
                        ON w.user_id =
                           u.user_id

                     WHERE w.workout_id = ?

                     LIMIT 1`,
                    [workoutId]
                );

            if (
                rows.length ===
                0
            ) {

                return res
                    .status(404)
                    .send(
                        "Workout not found."
                    );
            }

            return res.render(
                "workout-details",
                {
                    title:
                        "Workout Details",

                    workout:
                        rows[0],

                    loggedInUserId:
                        req.session
                            ?.userId ||
                        null
                }
            );

        } catch (error) {

            console.error(
                "WORKOUT DETAILS ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading workout details."
                );
        }
    }
);

// =====================================================
// REQUEST TO JOIN WORKOUT
// =====================================================

router.post(
    "/workouts/:id/join",
    requireLogin,
    async (req, res) => {

        let connection;

        try {

            const workoutId =
                getNumericId(
                    req.params.id
                );

            const userId =
                getNumericId(
                    req.session.userId
                );

            if (
                !workoutId ||
                !userId
            ) {
                return res
                    .status(400)
                    .send(
                        "Workout ID or logged-in user is missing."
                    );
            }

            connection =
                await db.getConnection();

            await connection
                .beginTransaction();

            // =================================================
            // LOAD + LOCK WORKOUT
            // =================================================

            const [workoutRows] =
                await connection.query(
                    `SELECT
                        workout_id,
                        user_id,
                        title,
                        status,
                        start_time

                     FROM workouts

                     WHERE workout_id = ?

                     FOR UPDATE`,
                    [workoutId]
                );

            if (
                workoutRows.length ===
                0
            ) {

                await connection
                    .rollback();

                return res
                    .status(404)
                    .send(
                        "Workout not found."
                    );
            }

            const workout =
                workoutRows[0];

            const hostId =
                Number(
                    workout.user_id
                );

            // =================================================
            // OWN WORKOUT
            // =================================================

            if (
                hostId ===
                userId
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "You cannot request to join your own workout."
                );

                return res.redirect(
                    `/workouts/${workoutId}`
                );
            }

            // =================================================
            // STATUS CHECK
            // =================================================

            if (
                String(
                    workout.status ||
                    ""
                ).toLowerCase() !==
                "open"
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "This workout is not open for join requests."
                );

                return res.redirect(
                    `/workouts/${workoutId}`
                );
            }

            // =================================================
            // WORKOUT MUST NOT HAVE STARTED
            // =================================================

            const workoutStartTime =
                new Date(
                    workout.start_time
                );

            if (
                Number.isNaN(
                    workoutStartTime
                        .getTime()
                )
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "error",
                    "This workout has an invalid start time."
                );

                return res.redirect(
                    `/workouts/${workoutId}`
                );
            }

            if (
                new Date() >=
                workoutStartTime
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "This workout has already started and is no longer accepting join requests."
                );

                return res.redirect(
                    `/workouts/${workoutId}`
                );
            }

            // =================================================
            // ALREADY PARTICIPANT
            // =================================================

            const [participantRows] =
                await connection.query(
                    `SELECT
                        participant_id

                     FROM workout_participants

                     WHERE workout_id = ?
                       AND user_id = ?

                     LIMIT 1`,
                    [
                        workoutId,
                        userId
                    ]
                );

            if (
                participantRows.length >
                0
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "info",
                    "You have already joined this workout."
                );

                return res.redirect(
                    `/workouts/${workoutId}`
                );
            }

            // =================================================
            // EXISTING JOIN REQUEST
            // =================================================

            const [requestRows] =
                await connection.query(
                    `SELECT
                        request_id,
                        status

                     FROM join_requests

                     WHERE workout_id = ?
                       AND user_id = ?

                     LIMIT 1

                     FOR UPDATE`,
                    [
                        workoutId,
                        userId
                    ]
                );

            if (
                requestRows.length >
                0
            ) {

                const existingRequest =
                    requestRows[0];

                const requestStatus =
                    String(
                        existingRequest.status ||
                        ""
                    ).toLowerCase();

                if (
                    requestStatus ===
                    "pending"
                ) {

                    await connection
                        .rollback();

                    setFeedback(
                        req,
                        "warning",
                        "You already have a pending request for this workout."
                    );

                    return res.redirect(
                        `/workouts/${workoutId}`
                    );
                }

                if (
                    requestStatus ===
                    "accepted"
                ) {

                    await connection
                        .rollback();

                    setFeedback(
                        req,
                        "info",
                        "Your request for this workout has already been accepted."
                    );

                    return res.redirect(
                        `/workouts/${workoutId}`
                    );
                }

                // =================================================
                // REOPEN PREVIOUS REJECTED REQUEST
                // =================================================

                await connection.query(
                    `UPDATE join_requests
                     SET status = 'pending',
                         created_at =
                             CURRENT_TIMESTAMP
                     WHERE request_id = ?`,
                    [
                        existingRequest
                            .request_id
                    ]
                );

            } else {

                await connection.query(
                    `INSERT INTO join_requests
                     (
                        workout_id,
                        user_id,
                        status
                     )
                     VALUES (?, ?, 'pending')`,
                    [
                        workoutId,
                        userId
                    ]
                );
            }

            // =================================================
            // REQUESTER NAME
            // =================================================

            const [requesterRows] =
                await connection.query(
                    `SELECT
                        first_name,
                        last_name

                     FROM users

                     WHERE user_id = ?

                     LIMIT 1`,
                    [userId]
                );

            const requesterName =
                requesterRows.length
                    ? `${requesterRows[0].first_name} ${requesterRows[0].last_name}`
                        .trim()
                    : "Someone";

            // =================================================
            // NOTIFY HOST
            // =================================================

            await createNotification(
                hostId,
                `${requesterName} requested to join your workout "${workout.title}".`,
                "/workout-requests",
                connection
            );

            await connection
                .commit();

            setFeedback(
                req,
                "success",
                "Join request sent successfully."
            );

            return res.redirect(
                `/workouts/${workoutId}`
            );

        } catch (error) {

            if (connection) {
                try {
                    await connection
                        .rollback();
                } catch (
                    rollbackError
                ) {
                    console.error(
                        "JOIN REQUEST ROLLBACK ERROR:",
                        rollbackError
                    );
                }
            }

            console.error(
                "JOIN REQUEST ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error sending join request."
                );

        } finally {

            if (connection) {
                connection.release();
            }
        }
    }
);

// =====================================================
// VIEW RECEIVED JOIN REQUESTS
// =====================================================

router.get(
    "/workout-requests",
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

            // =================================================
            // ONLY SHOW ACTIVE PENDING REQUESTS
            // =================================================

            const [requests] =
                await db.query(
                    `SELECT
                        jr.request_id,
                        jr.status,
                        jr.created_at,

                        w.workout_id,
                        w.title,

                        u.user_id
                            AS requester_id,

                        u.first_name,
                        u.last_name,
                        u.profile_picture

                     FROM join_requests jr

                     INNER JOIN workouts w
                        ON jr.workout_id =
                           w.workout_id

                     INNER JOIN users u
                        ON jr.user_id =
                           u.user_id

                     WHERE w.user_id = ?
                       AND LOWER(jr.status) =
                           'pending'

                       AND LOWER(w.status) =
                           'open'

                       AND w.start_time >
                           NOW()

                     ORDER BY
                        jr.created_at DESC`,
                    [userId]
                );

            return res.render(
                "workout-requests",
                {
                    title:
                        "Workout Requests",

                    requests
                }
            );

        } catch (error) {

            console.error(
                "WORKOUT REQUESTS ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading workout requests."
                );
        }
    }
);

// =====================================================
// ACCEPT WORKOUT JOIN REQUEST
// =====================================================

router.post(
    "/workout-requests/:id/accept",
    requireLogin,
    async (req, res) => {

        let connection;

        try {

            const requestId =
                getNumericId(
                    req.params.id
                );

            const hostId =
                getNumericId(
                    req.session.userId
                );

            if (
                !requestId ||
                !hostId
            ) {
                return res
                    .status(400)
                    .send(
                        "Request ID or logged-in user is missing."
                    );
            }

            connection =
                await db.getConnection();

            await connection
                .beginTransaction();

            // =================================================
            // LOAD + LOCK REQUEST
            // =================================================

            const [requestRows] =
                await connection.query(
                    `SELECT
                        jr.request_id,

                        jr.user_id
                            AS requester_id,

                        jr.workout_id,

                        jr.status,

                        w.user_id
                            AS host_id,

                        w.title
                            AS workout_title,

                        w.status
                            AS workout_status,

                        w.start_time
                            AS workout_start_time,

                        u.first_name
                            AS host_first_name,

                        u.last_name
                            AS host_last_name

                     FROM join_requests jr

                     INNER JOIN workouts w
                        ON jr.workout_id =
                           w.workout_id

                     INNER JOIN users u
                        ON w.user_id =
                           u.user_id

                     WHERE jr.request_id = ?

                     FOR UPDATE`,
                    [requestId]
                );

            if (
                requestRows.length ===
                0
            ) {

                await connection
                    .rollback();

                return res
                    .status(404)
                    .send(
                        "Join request not found."
                    );
            }

            const request =
                requestRows[0];

            // =================================================
            // HOST OWNERSHIP
            // =================================================

            if (
                Number(
                    request.host_id
                ) !== hostId
            ) {

                await connection
                    .rollback();

                return res
                    .status(403)
                    .send(
                        "You cannot manage this join request."
                    );
            }

            // =================================================
            // WORKOUT STATUS
            // =================================================

            if (
                String(
                    request.workout_status ||
                    ""
                ).toLowerCase() !==
                "open"
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "This workout is no longer open for new participants."
                );

                return res.redirect(
                    "/workout-requests"
                );
            }

            // =================================================
            // WORKOUT MUST NOT HAVE STARTED
            // =================================================

            const workoutStartTime =
                new Date(
                    request
                        .workout_start_time
                );

            if (
                Number.isNaN(
                    workoutStartTime
                        .getTime()
                )
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "error",
                    "This workout has an invalid start time."
                );

                return res.redirect(
                    "/workout-requests"
                );
            }

            if (
                new Date() >=
                workoutStartTime
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "This workout has already started. New join requests can no longer be accepted."
                );

                return res.redirect(
                    "/workout-requests"
                );
            }

            // =================================================
            // REQUEST STATUS
            // =================================================

            if (
                String(
                    request.status ||
                    ""
                ).toLowerCase() !==
                "pending"
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "This join request has already been processed."
                );

                return res.redirect(
                    "/workout-requests"
                );
            }

            // =================================================
            // CHECK IF ALREADY PARTICIPANT
            // =================================================

            const [participantRows] =
                await connection.query(
                    `SELECT
                        participant_id

                     FROM workout_participants

                     WHERE workout_id = ?
                       AND user_id = ?

                     LIMIT 1

                     FOR UPDATE`,
                    [
                        request.workout_id,
                        request.requester_id
                    ]
                );

            // =================================================
            // ALREADY PARTICIPANT EDGE CASE
            // =================================================
            //
            // If the participant record somehow exists already,
            // clean up the pending request without creating
            // another participant or duplicate notification.
            // =================================================

            if (
                participantRows.length >
                0
            ) {

                await connection.query(
                    `UPDATE join_requests
                     SET status = 'accepted'
                     WHERE request_id = ?`,
                    [requestId]
                );

                await connection
                    .commit();

                setFeedback(
                    req,
                    "info",
                    "This user is already part of the workout. Their join request has been marked as processed."
                );

                return res.redirect(
                    "/workout-requests"
                );
            }

            // =================================================
            // ACCEPT REQUEST
            // =================================================

            await connection.query(
                `UPDATE join_requests
                 SET status = 'accepted'
                 WHERE request_id = ?`,
                [requestId]
            );

            // =================================================
            // ADD PARTICIPANT
            // =================================================

            await connection.query(
                `INSERT INTO workout_participants
                 (
                    workout_id,
                    user_id
                 )
                 VALUES (?, ?)`,
                [
                    request.workout_id,
                    request.requester_id
                ]
            );

            const hostName =
                `${request.host_first_name} ${request.host_last_name}`
                    .trim();

            // =================================================
            // NOTIFY REQUESTER
            // =================================================

            await createNotification(
                request.requester_id,
                `${hostName} accepted your request to join "${request.workout_title}".`,
                `/workouts/${request.workout_id}`,
                connection
            );

            await connection
                .commit();

            setFeedback(
                req,
                "success",
                "Join request accepted. The user has been added to the workout."
            );

            return res.redirect(
                "/workout-requests"
            );

        } catch (error) {

            if (connection) {
                try {
                    await connection
                        .rollback();
                } catch (
                    rollbackError
                ) {
                    console.error(
                        "ACCEPT REQUEST ROLLBACK ERROR:",
                        rollbackError
                    );
                }
            }

            console.error(
                "ACCEPT REQUEST ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error accepting workout request."
                );

        } finally {

            if (connection) {
                connection.release();
            }
        }
    }
);

// =====================================================
// REJECT WORKOUT JOIN REQUEST
// =====================================================

router.post(
    "/workout-requests/:id/reject",
    requireLogin,
    async (req, res) => {

        let connection;

        try {

            const requestId =
                getNumericId(
                    req.params.id
                );

            const hostId =
                getNumericId(
                    req.session.userId
                );

            if (
                !requestId ||
                !hostId
            ) {
                return res
                    .status(400)
                    .send(
                        "Request ID or logged-in user is missing."
                    );
            }

            connection =
                await db.getConnection();

            await connection
                .beginTransaction();

            const [requestRows] =
                await connection.query(
                    `SELECT
                        jr.request_id,

                        jr.user_id
                            AS requester_id,

                        jr.workout_id,

                        jr.status,

                        w.user_id
                            AS host_id,

                        w.title
                            AS workout_title,

                        u.first_name
                            AS host_first_name,

                        u.last_name
                            AS host_last_name

                     FROM join_requests jr

                     INNER JOIN workouts w
                        ON jr.workout_id =
                           w.workout_id

                     INNER JOIN users u
                        ON w.user_id =
                           u.user_id

                     WHERE jr.request_id = ?

                     FOR UPDATE`,
                    [requestId]
                );

            if (
                requestRows.length ===
                0
            ) {

                await connection
                    .rollback();

                return res
                    .status(404)
                    .send(
                        "Join request not found."
                    );
            }

            const request =
                requestRows[0];

            if (
                Number(
                    request.host_id
                ) !== hostId
            ) {

                await connection
                    .rollback();

                return res
                    .status(403)
                    .send(
                        "You cannot manage this join request."
                    );
            }

            if (
                String(
                    request.status ||
                    ""
                ).toLowerCase() !==
                "pending"
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "This join request has already been processed."
                );

                return res.redirect(
                    "/workout-requests"
                );
            }

            await connection.query(
                `UPDATE join_requests
                 SET status = 'rejected'
                 WHERE request_id = ?`,
                [requestId]
            );

            const hostName =
                `${request.host_first_name} ${request.host_last_name}`
                    .trim();

            await createNotification(
                request.requester_id,
                `${hostName} rejected your request to join "${request.workout_title}".`,
                `/workouts/${request.workout_id}`,
                connection
            );

            await connection
                .commit();

            setFeedback(
                req,
                "success",
                "Join request rejected."
            );

            return res.redirect(
                "/workout-requests"
            );

        } catch (error) {

            if (connection) {
                try {
                    await connection
                        .rollback();
                } catch (
                    rollbackError
                ) {
                    console.error(
                        "REJECT REQUEST ROLLBACK ERROR:",
                        rollbackError
                    );
                }
            }

            console.error(
                "REJECT REQUEST ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error rejecting workout request."
                );

        } finally {

            if (connection) {
                connection.release();
            }
        }
    }
);

// =====================================================
// VIEW WORKOUT GROUP CHAT
// =====================================================

router.get(
    "/workouts/:id/chat",
    requireLogin,
    async (req, res) => {

        try {

            const workoutId =
                getNumericId(
                    req.params.id
                );

            const userId =
                getNumericId(
                    req.session.userId
                );

            if (
                !workoutId ||
                !userId
            ) {
                return res
                    .status(400)
                    .send(
                        "Workout ID or logged-in user is missing."
                    );
            }

            const [workoutRows] =
                await db.query(
                    `SELECT
                        workout_id,

                        user_id
                            AS creator_id,

                        title,
                        status

                     FROM workouts

                     WHERE workout_id = ?

                     LIMIT 1`,
                    [workoutId]
                );

            if (
                workoutRows.length ===
                0
            ) {

                return res
                    .status(404)
                    .send(
                        "Workout not found."
                    );
            }

            const workout =
                workoutRows[0];

            const access =
                await canAccessWorkoutChat(
                    workoutId,
                    userId
                );

            if (!access.allowed) {

                return res
                    .status(403)
                    .send(
                        "You are not allowed to access this workout chat."
                    );
            }

            const [messageRows] =
                await db.query(
                    `SELECT
                        gm.group_message_id,
                        gm.sender_id,
                        gm.message,
                        gm.created_at,

                        u.first_name,
                        u.last_name,
                        u.profile_picture

                     FROM workout_group_messages gm

                     INNER JOIN users u
                        ON gm.sender_id =
                           u.user_id

                     WHERE gm.workout_id = ?

                     ORDER BY
                        gm.created_at ASC`,
                    [workoutId]
                );

            const messages =
                messageRows.map(
                    (message) => ({
                        ...message,

                        displayTime:
                            formatDate(
                                message.created_at
                            )
                    })
                );

            return res.render(
                "workout-chat",
                {
                    title:
                        `${workout.title} Group Chat`,

                    workout,

                    messages,

                    currentUserId:
                        userId
                }
            );

        } catch (error) {

            console.error(
                "WORKOUT CHAT PAGE ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading workout group chat."
                );
        }
    }
);

// =====================================================
// SEND WORKOUT GROUP CHAT MESSAGE
// =====================================================

router.post(
    "/workouts/:id/chat",
    requireLogin,
    async (req, res) => {

        try {

            const workoutId =
                getNumericId(
                    req.params.id
                );

            const userId =
                getNumericId(
                    req.session.userId
                );

            const message =
                req.body.message
                    ?.trim();

            if (
                !workoutId ||
                !userId
            ) {
                return res
                    .status(400)
                    .send(
                        "Workout ID or logged-in user is missing."
                    );
            }

            // =================================================
            // MESSAGE VALIDATION
            // =================================================

            if (!message) {

                setFeedback(
                    req,
                    "warning",
                    "Please enter a message."
                );

                return res.redirect(
                    `/workouts/${workoutId}/chat`
                );
            }

            if (
                message.length >
                MAX_GROUP_MESSAGE_LENGTH
            ) {

                setFeedback(
                    req,
                    "warning",
                    `Messages cannot be longer than ${MAX_GROUP_MESSAGE_LENGTH} characters.`
                );

                return res.redirect(
                    `/workouts/${workoutId}/chat`
                );
            }

            // =================================================
            // CHAT PERMISSION
            // =================================================

            const access =
                await canAccessWorkoutChat(
                    workoutId,
                    userId
                );

            if (!access.exists) {

                return res
                    .status(404)
                    .send(
                        "Workout not found."
                    );
            }

            if (!access.allowed) {

                return res
                    .status(403)
                    .send(
                        "You are not allowed to send messages in this workout chat."
                    );
            }

            // =================================================
            // SAVE MESSAGE
            // =================================================

            await db.query(
                `INSERT INTO workout_group_messages
                 (
                    workout_id,
                    sender_id,
                    message
                 )
                 VALUES (?, ?, ?)`,
                [
                    workoutId,
                    userId,
                    message
                ]
            );

            return res.redirect(
                `/workouts/${workoutId}/chat`
            );

        } catch (error) {

            console.error(
                "SEND WORKOUT CHAT MESSAGE ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error sending workout chat message."
                );
        }
    }
);

// =====================================================
// CALENDAR DOWNLOAD
// =====================================================

router.get(
    "/workouts/:id/calendar",
    async (req, res) => {

        try {

            const workoutId =
                getNumericId(
                    req.params.id
                );

            if (!workoutId) {

                return res
                    .status(400)
                    .send(
                        "Invalid workout ID."
                    );
            }

            const [rows] =
                await db.query(
                    `SELECT
                        workout_id,
                        title,
                        location,
                        start_time,
                        end_time

                     FROM workouts

                     WHERE workout_id = ?

                     LIMIT 1`,
                    [workoutId]
                );

            if (
                rows.length ===
                0
            ) {

                return res
                    .status(404)
                    .send(
                        "Workout not found."
                    );
            }

            const workout =
                rows[0];

            const start =
                toCalendarDateTime(
                    workout.start_time
                );

            const end =
                toCalendarDateTime(
                    workout.end_time
                );

            if (
                !start ||
                !end
            ) {

                return res
                    .status(400)
                    .send(
                        "Workout has invalid calendar dates."
                    );
            }

            const calendarContent = [
                "BEGIN:VCALENDAR",
                "VERSION:2.0",
                "PRODID:-//GymBuddy//Workout Calendar//EN",
                "CALSCALE:GREGORIAN",
                "BEGIN:VEVENT",
                `UID:${workout.workout_id}@gymbuddy`,
                `DTSTAMP:${toCalendarDateTime(new Date())}`,
                `SUMMARY:${escapeCalendarText(workout.title)}`,
                "DESCRIPTION:GymBuddy workout session",
                `LOCATION:${escapeCalendarText(workout.location)}`,
                `DTSTART:${start}`,
                `DTEND:${end}`,
                "END:VEVENT",
                "END:VCALENDAR"
            ].join(
                "\r\n"
            );

            res.setHeader(
                "Content-Type",
                "text/calendar; charset=utf-8"
            );

            res.setHeader(
                "Content-Disposition",
                `attachment; filename="workout-${workoutId}.ics"`
            );

            return res.send(
                calendarContent
            );

        } catch (error) {

            console.error(
                "CALENDAR ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error creating calendar file."
                );
        }
    }
);

module.exports = router;