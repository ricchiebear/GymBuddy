const express = require("express");
const multer = require("multer");
const path = require("path");
const db = require("../config/database");
const formatDate = require("../utils/formatDate");
const createNotification = require("../utils/createNotification");

const router = express.Router();

// =====================================================
// AUTHENTICATION
// =====================================================

function requireLogin(req, res, next) {
    if (!req.session?.userId) {
        return res.redirect("/login");
    }

    next();
}

function setFeedback(req, type, message) {
    req.session.feedback = {
        type,
        message
    };
}

// =====================================================
// HELPERS
// =====================================================

function getNumericId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeDate(value) {
    if (!value) {
        return null;
    }

    if (typeof value === "string") {
        const match = value.match(/^(\d{4}-\d{2}-\d{2})/);

        if (match) {
            return match[1];
        }
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toISOString().slice(0, 10);
}

function formatDateTimeLocal(value) {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const offset = date.getTimezoneOffset();

    return new Date(
        date.getTime() - offset * 60 * 1000
    )
        .toISOString()
        .slice(0, 16);
}

function validateWorkoutFields({
    title,
    workout_type,
    location,
    start_time,
    end_time
}) {
    if (
        !title?.trim() ||
        !workout_type?.trim() ||
        !location?.trim() ||
        !start_time ||
        !end_time
    ) {
        return "Please complete all required workout fields.";
    }

    const start = new Date(start_time);
    const end = new Date(end_time);

    if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime())
    ) {
        return "Please enter valid workout start and end times.";
    }

    if (end <= start) {
        return "The end time must be later than the start time.";
    }

    return null;
}

function escapeCalendarText(value) {
    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/\r?\n/g, "\\n")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,");
}

function toCalendarDateTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return (
        date
            .toISOString()
            .replace(/[-:]/g, "")
            .split(".")[0] + "Z"
    );
}

async function canAccessWorkoutChat(workoutId, userId, connection = db) {
    const [rows] = await connection.query(
        `SELECT
            w.user_id AS creator_id,
            EXISTS(
                SELECT 1
                FROM workout_participants wp
                WHERE wp.workout_id = w.workout_id
                  AND wp.user_id = ?
            ) AS is_participant
         FROM workouts w
         WHERE w.workout_id = ?
         LIMIT 1`,
        [userId, workoutId]
    );

    if (rows.length === 0) {
        return {
            exists: false,
            allowed: false,
            creatorId: null
        };
    }

    const creatorId = Number(rows[0].creator_id);
    const isParticipant = Boolean(rows[0].is_participant);

    return {
        exists: true,
        allowed: creatorId === userId || isParticipant,
        creatorId
    };
}

// =====================================================
// IMAGE UPLOAD SETUP
// =====================================================

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "src/public/uploads");
    },

    filename: (req, file, cb) => {
        const uniqueName =
            `${Date.now()}-${Math.round(Math.random() * 1e9)}` +
            path.extname(file.originalname).toLowerCase();

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

        return cb(
            new Error("Only image files are allowed.")
        );
    }
});

// =====================================================
// VIEW ALL WORKOUTS + SEARCH/FILTER
// =====================================================

router.get("/workouts", async (req, res) => {
    try {
        const type = req.query.type?.trim() || "";
        const location = req.query.location?.trim() || "";
        const status = req.query.status?.trim() || "";

        let sql = `
            SELECT
                w.*,
                u.first_name AS creator_first_name,
                u.last_name AS creator_last_name,
                (
                    SELECT COUNT(*)
                    FROM workout_participants wp
                    WHERE wp.workout_id = w.workout_id
                ) AS participants_count
            FROM workouts w
            INNER JOIN users u
                ON w.user_id = u.user_id
            WHERE 1 = 1
        `;

        const params = [];

        if (type) {
            sql += " AND w.workout_type LIKE ?";
            params.push(`%${type}%`);
        }

        if (location) {
            sql += " AND w.location LIKE ?";
            params.push(`%${location}%`);
        }

        if (status) {
            sql += " AND LOWER(w.status) = LOWER(?)";
            params.push(status);
        }

        sql += " ORDER BY w.start_time ASC";

        const [workouts] = await db.query(sql, params);

        res.render("workouts", {
            title: "Workouts",
            workouts,
            filters: {
                type,
                location,
                status
            }
        });
    } catch (error) {
        console.error("Workouts error:", error);
        res.status(500).send("Error loading workouts");
    }
});

// =====================================================
// SHOW CREATE WORKOUT FORM
// =====================================================

router.get("/workouts/create", requireLogin, (req, res) => {
    res.render("create-workout", {
        title: "Create Workout"
    });
});

// =====================================================
// CREATE WORKOUT
// =====================================================

router.post(
    "/workouts/create",
    requireLogin,
    upload.single("workout_image"),
    async (req, res) => {
        try {
            const userId = getNumericId(req.session.userId);

            const {
                title,
                workout_type,
                location,
                start_time,
                end_time
            } = req.body;

            const validationError = validateWorkoutFields({
                title,
                workout_type,
                location,
                start_time,
                end_time
            });

            if (validationError) {
                return res.status(400).send(validationError);
            }

            const workoutDate = normalizeDate(start_time);
            const workoutImage = req.file
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
                    title.trim(),
                    workout_type.trim(),
                    location.trim(),
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

            res.redirect("/my-workouts");
        } catch (error) {
            console.error("Create workout error:", error);
            res.status(500).send("Error creating workout");
        }
    }
);

// =====================================================
// MY CREATED WORKOUTS
// =====================================================

router.get("/my-workouts", requireLogin, async (req, res) => {
    try {
        const userId = getNumericId(req.session.userId);

        const [workouts] = await db.query(
            `SELECT
                w.*,
                (
                    SELECT COUNT(*)
                    FROM workout_participants wp
                    WHERE wp.workout_id = w.workout_id
                ) AS participants_count
             FROM workouts w
             WHERE w.user_id = ?
             ORDER BY w.start_time DESC`,
            [userId]
        );

        res.render("my-workouts", {
            title: "My Workouts",
            workouts
        });
    } catch (error) {
        console.error("My workouts error:", error);
        res.status(500).send("Error loading your workouts");
    }
});

// =====================================================
// MY JOINED WORKOUTS
// =====================================================

router.get("/joined-workouts", requireLogin, async (req, res) => {
    try {
        const userId = getNumericId(req.session.userId);

        const [workouts] = await db.query(
            `SELECT
                w.*,
                u.first_name AS creator_first_name,
                u.last_name AS creator_last_name
             FROM workout_participants wp
             INNER JOIN workouts w
                ON wp.workout_id = w.workout_id
             INNER JOIN users u
                ON w.user_id = u.user_id
             WHERE wp.user_id = ?
             ORDER BY w.start_time ASC`,
            [userId]
        );

        res.render("joined-workouts", {
            title: "My Joined Workouts",
            workouts
        });
    } catch (error) {
        console.error("Joined workouts error:", error);
        res.status(500).send(
            error.sqlMessage ||
            error.message ||
            "Error loading joined workouts"
        );
    }
});

// =====================================================
// SHOW EDIT WORKOUT FORM
// =====================================================

router.get("/workouts/:id/edit", requireLogin, async (req, res) => {
    try {
        const workoutId = getNumericId(req.params.id);
        const userId = getNumericId(req.session.userId);

        if (!workoutId) {
            return res.status(400).send("Invalid workout ID.");
        }

        const [rows] = await db.query(
            `SELECT *
             FROM workouts
             WHERE workout_id = ?
               AND user_id = ?
             LIMIT 1`,
            [workoutId, userId]
        );

        if (rows.length === 0) {
            return res
                .status(404)
                .send(
                    "Workout not found or you do not have permission to edit it."
                );
        }

        const workout = {
            ...rows[0],
            formatted_start_time: formatDateTimeLocal(rows[0].start_time),
            formatted_end_time: formatDateTimeLocal(rows[0].end_time)
        };

        res.render("edit-workout", {
            title: "Edit Workout",
            workout
        });
    } catch (error) {
        console.error("Edit workout error:", error);
        res.status(500).send(
            "Error loading the edit workout page"
        );
    }
});

// =====================================================
// UPDATE WORKOUT
// =====================================================

router.post(
    "/workouts/:id/edit",
    requireLogin,
    upload.single("workout_image"),
    async (req, res) => {
        try {
            const workoutId = getNumericId(req.params.id);
            const userId = getNumericId(req.session.userId);

            if (!workoutId) {
                return res.status(400).send("Invalid workout ID.");
            }

            const {
                title,
                workout_type,
                location,
                start_time,
                end_time
            } = req.body;

            const validationError = validateWorkoutFields({
                title,
                workout_type,
                location,
                start_time,
                end_time
            });

            if (validationError) {
                return res.status(400).send(validationError);
            }

            const workoutDate = normalizeDate(start_time);

            const [existingRows] = await db.query(
                `SELECT workout_id
                 FROM workouts
                 WHERE workout_id = ?
                   AND user_id = ?
                 LIMIT 1`,
                [workoutId, userId]
            );

            if (existingRows.length === 0) {
                return res
                    .status(404)
                    .send(
                        "Workout not found or you do not have permission to edit it."
                    );
            }

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
                sql += ", workout_image = ?";
                params.push(`/uploads/${req.file.filename}`);
            }

            sql += `
                WHERE workout_id = ?
                  AND user_id = ?
            `;

            params.push(workoutId, userId);

            await db.query(sql, params);

            setFeedback(
                req,
                "success",
                "Workout updated successfully."
            );

            res.redirect("/my-workouts");
        } catch (error) {
            console.error("Update workout error:", error);
            res.status(500).send("Unable to update workout");
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
            const workoutId = getNumericId(req.params.id);
            const ownerId = getNumericId(req.session.userId);

            if (!workoutId || !ownerId) {
                return res
                    .status(400)
                    .send("Workout ID or logged-in user is missing.");
            }

            connection = await db.getConnection();
            await connection.beginTransaction();

            const [workoutRows] = await connection.query(
                `SELECT
                    w.workout_id,
                    w.user_id AS owner_id,
                    w.title,
                    w.status,
                    u.first_name AS owner_first_name,
                    u.last_name AS owner_last_name
                 FROM workouts w
                 INNER JOIN users u
                    ON w.user_id = u.user_id
                 WHERE w.workout_id = ?
                 FOR UPDATE`,
                [workoutId]
            );

            if (workoutRows.length === 0) {
                await connection.rollback();
                return res.status(404).send("Workout not found.");
            }

            const workout = workoutRows[0];

            if (Number(workout.owner_id) !== ownerId) {
                await connection.rollback();
                return res
                    .status(403)
                    .send("You cannot cancel another user's workout.");
            }

            const currentStatus = String(workout.status || "").toLowerCase();

            if (currentStatus === "cancelled") {
                await connection.rollback();

                setFeedback(
                    req,
                    "warning",
                    "This workout has already been cancelled."
                );

                return res.redirect("/my-workouts");
            }

            if (currentStatus === "completed") {
                await connection.rollback();

                setFeedback(
                    req,
                    "warning",
                    "A completed workout cannot be cancelled."
                );

                return res.redirect("/my-workouts");
            }

            const [participants] = await connection.query(
                `SELECT user_id
                 FROM workout_participants
                 WHERE workout_id = ?`,
                [workoutId]
            );

            await connection.query(
                `UPDATE workouts
                 SET status = 'cancelled'
                 WHERE workout_id = ?
                   AND user_id = ?`,
                [workoutId, ownerId]
            );

            await connection.query(
                `UPDATE join_requests
                 SET status = 'rejected'
                 WHERE workout_id = ?
                   AND LOWER(status) = 'pending'`,
                [workoutId]
            );

            const ownerName =
                `${workout.owner_first_name} ${workout.owner_last_name}`.trim();

            for (const participant of participants) {
                const participantId = Number(participant.user_id);

                if (participantId !== ownerId) {
                    await createNotification(
                        participantId,
                        `${ownerName} cancelled the workout "${workout.title}".`,
                        `/workouts/${workoutId}`,
                        connection
                    );
                }
            }

            await connection.commit();

            setFeedback(
                req,
                "success",
                "Workout cancelled. Participants have been notified."
            );

            res.redirect("/my-workouts");
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }

            console.error("CANCEL WORKOUT ERROR:", error);

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
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
            const workoutId = getNumericId(req.params.id);
            const ownerId = getNumericId(req.session.userId);

            if (!workoutId || !ownerId) {
                return res
                    .status(400)
                    .send("Workout ID or logged-in user is missing.");
            }

            connection = await db.getConnection();
            await connection.beginTransaction();

            const [workoutRows] = await connection.query(
                `SELECT
                    w.workout_id,
                    w.user_id AS owner_id,
                    w.title,
                    w.status,
                    w.workout_date,
                    w.end_time,
                    u.first_name AS owner_first_name,
                    u.last_name AS owner_last_name
                 FROM workouts w
                 INNER JOIN users u
                    ON w.user_id = u.user_id
                 WHERE w.workout_id = ?
                 FOR UPDATE`,
                [workoutId]
            );

            if (workoutRows.length === 0) {
                await connection.rollback();
                return res.status(404).send("Workout not found.");
            }

            const workout = workoutRows[0];

            if (Number(workout.owner_id) !== ownerId) {
                await connection.rollback();
                return res
                    .status(403)
                    .send("You cannot complete another user's workout.");
            }

            const currentStatus = String(workout.status || "").toLowerCase();

            if (currentStatus === "completed") {
                await connection.rollback();

                setFeedback(
                    req,
                    "warning",
                    "This workout has already been completed."
                );

                return res.redirect("/my-workouts");
            }

            if (currentStatus === "cancelled") {
                await connection.rollback();

                setFeedback(
                    req,
                    "warning",
                    "A cancelled workout cannot be completed."
                );

                return res.redirect("/my-workouts");
            }

            const workoutEndTime = new Date(workout.end_time);

            if (Number.isNaN(workoutEndTime.getTime())) {
                await connection.rollback();

                setFeedback(
                    req,
                    "error",
                    "The workout end time is invalid."
                );

                return res.redirect("/my-workouts");
            }

            if (new Date() < workoutEndTime) {
                await connection.rollback();

                setFeedback(
                    req,
                    "warning",
                    "You can only mark this workout as completed after its scheduled end time."
                );

                return res.redirect("/my-workouts");
            }

            const [participantRows] = await connection.query(
                `SELECT user_id
                 FROM workout_participants
                 WHERE workout_id = ?`,
                [workoutId]
            );

            const uniqueUserIds = [
                ...new Set([
                    ownerId,
                    ...participantRows.map((participant) =>
                        Number(participant.user_id)
                    )
                ])
            ];

            await connection.query(
                `UPDATE workouts
                 SET status = 'completed'
                 WHERE workout_id = ?
                   AND user_id = ?`,
                [workoutId, ownerId]
            );

            const completionDate =
                normalizeDate(workout.workout_date) ||
                normalizeDate(new Date());

            for (const userId of uniqueUserIds) {
                await connection.query(
                    `INSERT IGNORE INTO workout_history
                     (
                        user_id,
                        workout_id,
                        workout_date
                     )
                     VALUES (?, ?, ?)`,
                    [userId, workoutId, completionDate]
                );

                const [streakRows] = await connection.query(
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

                if (streakRows.length === 0) {
                    await connection.query(
                        `INSERT INTO streaks
                         (
                            user_id,
                            current_streak,
                            longest_streak,
                            last_workout_date
                         )
                         VALUES (?, 1, 1, ?)`,
                        [userId, completionDate]
                    );

                    continue;
                }

                const streak = streakRows[0];
                let currentStreak = Number(streak.current_streak || 0);
                let longestStreak = Number(streak.longest_streak || 0);

                const lastWorkoutDate = normalizeDate(
                    streak.last_workout_date
                );

                if (!lastWorkoutDate) {
                    currentStreak = 1;
                } else {
                    const completedDateMs =
                        new Date(`${completionDate}T00:00:00Z`).getTime();

                    const lastDateMs =
                        new Date(`${lastWorkoutDate}T00:00:00Z`).getTime();

                    const differenceInDays = Math.round(
                        (completedDateMs - lastDateMs) /
                        (1000 * 60 * 60 * 24)
                    );

                    if (differenceInDays === 1) {
                        currentStreak += 1;
                    } else if (differenceInDays > 1) {
                        currentStreak = 1;
                    } else if (differenceInDays === 0) {
                        currentStreak = currentStreak || 1;
                    } else {
                        // Older workouts should not move the user's streak backwards.
                        continue;
                    }
                }

                longestStreak = Math.max(
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

            const ownerName =
                `${workout.owner_first_name} ${workout.owner_last_name}`.trim();

            for (const participant of participantRows) {
                const participantId = Number(participant.user_id);

                if (participantId !== ownerId) {
                    await createNotification(
                        participantId,
                        `${ownerName} marked the workout "${workout.title}" as completed.`,
                        `/workouts/${workoutId}`,
                        connection
                    );
                }
            }

            await connection.commit();

            setFeedback(
                req,
                "success",
                "Workout completed. Workout history and streaks have been updated."
            );

            res.redirect("/my-workouts");
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }

            console.error("COMPLETE WORKOUT ERROR:", error);

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
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
            const workoutId = getNumericId(req.params.id);
            const userId = getNumericId(req.session.userId);

            if (!workoutId) {
                return res.status(400).send("Invalid workout ID.");
            }

            const [result] = await db.query(
                `DELETE FROM workouts
                 WHERE workout_id = ?
                   AND user_id = ?`,
                [workoutId, userId]
            );

            if (result.affectedRows === 0) {
                return res
                    .status(404)
                    .send(
                        "Workout not found or you do not have permission to delete it."
                    );
            }

            setFeedback(
                req,
                "success",
                "Workout deleted successfully."
            );

            res.redirect("/my-workouts");
        } catch (error) {
            console.error("Delete workout error:", error);

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Unable to delete workout"
            );
        }
    }
);

// =====================================================
// VIEW WORKOUT DETAILS
// =====================================================

router.get("/workouts/:id", async (req, res) => {
    try {
        const workoutId = getNumericId(req.params.id);

        if (!workoutId) {
            return res.status(400).send("Invalid workout ID.");
        }

        const [rows] = await db.query(
            `SELECT
                w.*,
                u.first_name AS creator_first_name,
                u.last_name AS creator_last_name,
                (
                    SELECT COUNT(*)
                    FROM workout_participants wp
                    WHERE wp.workout_id = w.workout_id
                ) AS participants_count
             FROM workouts w
             INNER JOIN users u
                ON w.user_id = u.user_id
             WHERE w.workout_id = ?
             LIMIT 1`,
            [workoutId]
        );

        if (rows.length === 0) {
            return res.status(404).send("Workout not found");
        }

        res.render("workout-details", {
            title: "Workout Details",
            workout: rows[0],
            loggedInUserId: req.session?.userId || null
        });
    } catch (error) {
        console.error("Workout details error:", error);
        res.status(500).send("Error loading workout details");
    }
});

// =====================================================
// REQUEST TO JOIN WORKOUT
// =====================================================

router.post(
    "/workouts/:id/join",
    requireLogin,
    async (req, res) => {
        let connection;

        try {
            const workoutId = getNumericId(req.params.id);
            const userId = getNumericId(req.session.userId);

            if (!workoutId || !userId) {
                return res
                    .status(400)
                    .send("Workout ID or logged-in user is missing.");
            }

            connection = await db.getConnection();
            await connection.beginTransaction();

            const [workoutRows] = await connection.query(
                `SELECT
                    workout_id,
                    user_id,
                    title,
                    status
                 FROM workouts
                 WHERE workout_id = ?
                 FOR UPDATE`,
                [workoutId]
            );

            if (workoutRows.length === 0) {
                await connection.rollback();
                return res.status(404).send("Workout not found.");
            }

            const workout = workoutRows[0];
            const hostId = Number(workout.user_id);

            if (hostId === userId) {
                await connection.rollback();

                setFeedback(
                    req,
                    "warning",
                    "You cannot request to join your own workout."
                );

                return res.redirect(`/workouts/${workoutId}`);
            }

            if (String(workout.status).toLowerCase() !== "open") {
                await connection.rollback();

                setFeedback(
                    req,
                    "warning",
                    "This workout is not open for join requests."
                );

                return res.redirect(`/workouts/${workoutId}`);
            }

            const [participantRows] = await connection.query(
                `SELECT participant_id
                 FROM workout_participants
                 WHERE workout_id = ?
                   AND user_id = ?
                 LIMIT 1`,
                [workoutId, userId]
            );

            if (participantRows.length > 0) {
                await connection.rollback();

                setFeedback(
                    req,
                    "info",
                    "You have already joined this workout."
                );

                return res.redirect(`/workouts/${workoutId}`);
            }

            const [requestRows] = await connection.query(
                `SELECT
                    request_id,
                    status
                 FROM join_requests
                 WHERE workout_id = ?
                   AND user_id = ?
                 LIMIT 1
                 FOR UPDATE`,
                [workoutId, userId]
            );

            if (requestRows.length > 0) {
                const existingRequest = requestRows[0];
                const requestStatus =
                    String(existingRequest.status || "").toLowerCase();

                if (requestStatus === "pending") {
                    await connection.rollback();

                    setFeedback(
                        req,
                        "warning",
                        "You already have a pending request for this workout."
                    );

                    return res.redirect(`/workouts/${workoutId}`);
                }

                if (requestStatus === "accepted") {
                    await connection.rollback();

                    setFeedback(
                        req,
                        "info",
                        "Your request for this workout has already been accepted."
                    );

                    return res.redirect(`/workouts/${workoutId}`);
                }

                await connection.query(
                    `UPDATE join_requests
                     SET status = 'pending',
                         created_at = CURRENT_TIMESTAMP
                     WHERE request_id = ?`,
                    [existingRequest.request_id]
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
                    [workoutId, userId]
                );
            }

            const [requesterRows] = await connection.query(
                `SELECT first_name, last_name
                 FROM users
                 WHERE user_id = ?
                 LIMIT 1`,
                [userId]
            );

            const requesterName = requesterRows.length
                ? `${requesterRows[0].first_name} ${requesterRows[0].last_name}`.trim()
                : "Someone";

            await createNotification(
                hostId,
                `${requesterName} requested to join your workout "${workout.title}".`,
                "/workout-requests",
                connection
            );

            await connection.commit();

            setFeedback(
                req,
                "success",
                "Join request sent successfully."
            );

            res.redirect(`/workouts/${workoutId}`);
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }

            console.error("JOIN REQUEST ERROR:", error);

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
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
            const userId = getNumericId(req.session.userId);

            const [requests] = await db.query(
                `SELECT
                    jr.request_id,
                    jr.status,
                    jr.created_at,
                    w.workout_id,
                    w.title,
                    u.user_id AS requester_id,
                    u.first_name,
                    u.last_name,
                    u.profile_picture
                 FROM join_requests jr
                 INNER JOIN workouts w
                    ON jr.workout_id = w.workout_id
                 INNER JOIN users u
                    ON jr.user_id = u.user_id
                 WHERE w.user_id = ?
                   AND LOWER(jr.status) = 'pending'
                 ORDER BY jr.created_at DESC`,
                [userId]
            );

            res.render("workout-requests", {
                title: "Workout Requests",
                requests
            });
        } catch (error) {
            console.error("WORKOUT REQUESTS ERROR:", error);

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error loading workout requests"
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
            const requestId = getNumericId(req.params.id);
            const hostId = getNumericId(req.session.userId);

            if (!requestId || !hostId) {
                return res
                    .status(400)
                    .send("Request ID or logged-in user is missing.");
            }

            connection = await db.getConnection();
            await connection.beginTransaction();

            const [requestRows] = await connection.query(
                `SELECT
                    jr.request_id,
                    jr.user_id AS requester_id,
                    jr.workout_id,
                    jr.status,
                    w.user_id AS host_id,
                    w.title AS workout_title,
                    w.status AS workout_status,
                    u.first_name AS host_first_name,
                    u.last_name AS host_last_name
                 FROM join_requests jr
                 INNER JOIN workouts w
                    ON jr.workout_id = w.workout_id
                 INNER JOIN users u
                    ON w.user_id = u.user_id
                 WHERE jr.request_id = ?
                 FOR UPDATE`,
                [requestId]
            );

            if (requestRows.length === 0) {
                await connection.rollback();
                return res.status(404).send("Join request not found.");
            }

            const request = requestRows[0];

            if (Number(request.host_id) !== hostId) {
                await connection.rollback();
                return res
                    .status(403)
                    .send("You cannot manage this join request.");
            }

            if (
                String(request.workout_status || "").toLowerCase() !== "open"
            ) {
                await connection.rollback();
                return res
                    .status(400)
                    .send(
                        "This workout is no longer open for new participants."
                    );
            }

            if (String(request.status).toLowerCase() !== "pending") {
                await connection.rollback();
                return res
                    .status(400)
                    .send(
                        "This join request has already been processed."
                    );
            }

            await connection.query(
                `UPDATE join_requests
                 SET status = 'accepted'
                 WHERE request_id = ?`,
                [requestId]
            );

            const [participantRows] = await connection.query(
                `SELECT participant_id
                 FROM workout_participants
                 WHERE workout_id = ?
                   AND user_id = ?
                 LIMIT 1`,
                [
                    request.workout_id,
                    request.requester_id
                ]
            );

            if (participantRows.length === 0) {
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
            }

            const hostName =
                `${request.host_first_name} ${request.host_last_name}`.trim();

            await createNotification(
                request.requester_id,
                `${hostName} accepted your request to join "${request.workout_title}".`,
                `/workouts/${request.workout_id}`,
                connection
            );

            await connection.commit();

            setFeedback(
                req,
                "success",
                "Join request accepted. The user has been added to the workout."
            );

            res.redirect("/workout-requests");
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }

            console.error("ACCEPT REQUEST ERROR:", error);

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
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
            const requestId = getNumericId(req.params.id);
            const hostId = getNumericId(req.session.userId);

            if (!requestId || !hostId) {
                return res
                    .status(400)
                    .send("Request ID or logged-in user is missing.");
            }

            connection = await db.getConnection();
            await connection.beginTransaction();

            const [requestRows] = await connection.query(
                `SELECT
                    jr.request_id,
                    jr.user_id AS requester_id,
                    jr.workout_id,
                    jr.status,
                    w.user_id AS host_id,
                    w.title AS workout_title,
                    u.first_name AS host_first_name,
                    u.last_name AS host_last_name
                 FROM join_requests jr
                 INNER JOIN workouts w
                    ON jr.workout_id = w.workout_id
                 INNER JOIN users u
                    ON w.user_id = u.user_id
                 WHERE jr.request_id = ?
                 FOR UPDATE`,
                [requestId]
            );

            if (requestRows.length === 0) {
                await connection.rollback();
                return res.status(404).send("Join request not found.");
            }

            const request = requestRows[0];

            if (Number(request.host_id) !== hostId) {
                await connection.rollback();
                return res
                    .status(403)
                    .send("You cannot manage this join request.");
            }

            if (String(request.status).toLowerCase() !== "pending") {
                await connection.rollback();
                return res
                    .status(400)
                    .send(
                        "This join request has already been processed."
                    );
            }

            await connection.query(
                `UPDATE join_requests
                 SET status = 'rejected'
                 WHERE request_id = ?`,
                [requestId]
            );

            const hostName =
                `${request.host_first_name} ${request.host_last_name}`.trim();

            await createNotification(
                request.requester_id,
                `${hostName} rejected your request to join "${request.workout_title}".`,
                `/workouts/${request.workout_id}`,
                connection
            );

            await connection.commit();

            setFeedback(
                req,
                "success",
                "Join request rejected."
            );

            res.redirect("/workout-requests");
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }

            console.error("REJECT REQUEST ERROR:", error);

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
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
            const workoutId = getNumericId(req.params.id);
            const userId = getNumericId(req.session.userId);

            if (!workoutId || !userId) {
                return res
                    .status(400)
                    .send("Workout ID or logged-in user is missing.");
            }

            const [workoutRows] = await db.query(
                `SELECT
                    workout_id,
                    user_id AS creator_id,
                    title,
                    status
                 FROM workouts
                 WHERE workout_id = ?
                 LIMIT 1`,
                [workoutId]
            );

            if (workoutRows.length === 0) {
                return res.status(404).send("Workout not found.");
            }

            const workout = workoutRows[0];
            const access = await canAccessWorkoutChat(
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

            const [messageRows] = await db.query(
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
                    ON gm.sender_id = u.user_id
                 WHERE gm.workout_id = ?
                 ORDER BY gm.created_at ASC`,
                [workoutId]
            );

            const messages = messageRows.map((message) => ({
                ...message,
                displayTime: formatDate(message.created_at)
            }));

            res.render("workout-chat", {
                title: `${workout.title} Group Chat`,
                workout,
                messages,
                currentUserId: userId
            });
        } catch (error) {
            console.error("WORKOUT CHAT PAGE ERROR:", error);

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
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
            const workoutId = getNumericId(req.params.id);
            const userId = getNumericId(req.session.userId);
            const message = req.body.message?.trim();

            if (!workoutId || !userId) {
                return res
                    .status(400)
                    .send("Workout ID or logged-in user is missing.");
            }

            if (!message) {
                return res.status(400).send("Please enter a message.");
            }

            if (message.length > 2000) {
                return res
                    .status(400)
                    .send("Messages cannot be longer than 2000 characters.");
            }

            const access = await canAccessWorkoutChat(
                workoutId,
                userId
            );

            if (!access.exists) {
                return res.status(404).send("Workout not found.");
            }

            if (!access.allowed) {
                return res
                    .status(403)
                    .send(
                        "You are not allowed to send messages in this workout chat."
                    );
            }

            await db.query(
                `INSERT INTO workout_group_messages
                 (
                    workout_id,
                    sender_id,
                    message
                 )
                 VALUES (?, ?, ?)`,
                [workoutId, userId, message]
            );

            res.redirect(`/workouts/${workoutId}/chat`);
        } catch (error) {
            console.error("SEND WORKOUT CHAT MESSAGE ERROR:", error);

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error sending workout chat message."
            );
        }
    }
);

// =====================================================
// CALENDAR DOWNLOAD
// =====================================================

router.get("/workouts/:id/calendar", async (req, res) => {
    try {
        const workoutId = getNumericId(req.params.id);

        if (!workoutId) {
            return res.status(400).send("Invalid workout ID.");
        }

        const [rows] = await db.query(
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

        if (rows.length === 0) {
            return res.status(404).send("Workout not found");
        }

        const workout = rows[0];

        const start = toCalendarDateTime(workout.start_time);
        const end = toCalendarDateTime(workout.end_time);

        if (!start || !end) {
            return res
                .status(400)
                .send("Workout has invalid calendar dates.");
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
        ].join("\r\n");

        res.setHeader(
            "Content-Type",
            "text/calendar; charset=utf-8"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="workout-${workoutId}.ics"`
        );

        res.send(calendarContent);
    } catch (error) {
        console.error("Calendar error:", error);
        res.status(500).send("Error creating calendar file");
    }
});

module.exports = router;