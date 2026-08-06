const express = require("express");
const multer = require("multer");
const path = require("path");
const db = require("../config/database");
const formatDate = require("../utils/formatDate");
const createNotification = require("../utils/createNotification");

const router = express.Router();

//=====================================================
// LOGIN PROTECTION
//===================================================== 

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.redirect("/login");
    }

    next();
}

//=====================================================
// IMAGE UPLOAD SETUP
//=====================================================

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

//=====================================================
// VIEW ALL WORKOUTS + SEARCH/FILTER
//=====================================================

router.get("/workouts", async (req, res) => {
    try {
        const { type, location, status } = req.query;

        let sql = `
            SELECT
                w.*,
                u.first_name AS creator_first_name,
                u.last_name AS creator_last_name,
                COUNT(wp.participant_id) AS participants_count
            FROM workouts w
            INNER JOIN users u
                ON w.user_id = u.user_id
            LEFT JOIN workout_participants wp
                ON w.workout_id = wp.workout_id
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

        sql += `
            GROUP BY
                w.workout_id,
                u.first_name,
                u.last_name
            ORDER BY w.start_time ASC
        `;

        const [workouts] = await db.query(sql, params);

        res.render("workouts", {
            title: "Workouts",
            workouts,
            filters: {
                type: type || "",
                location: location || "",
                status: status || ""
            }
        });
    } catch (error) {
        console.error("Workouts error:", error);
        res.status(500).send("Error loading workouts");
    }
});

//=====================================================
// SHOW CREATE WORKOUT FORM
//=====================================================

router.get("/workouts/create", requireLogin, (req, res) => {
    res.render("create-workout", {
        title: "Create Workout"
    });
});

//=====================================================
// CREATE WORKOUT
//===================================================== 

router.post(
    "/workouts/create",
    requireLogin,
    upload.single("workout_image"),
    async (req, res) => {
        try {
            const userId = req.session.userId;

            const {
                title,
                workout_type,
                location,
                start_time,
                end_time
            } = req.body;

            if (
                !title ||
                !workout_type ||
                !location ||
                !start_time ||
                !end_time
            ) {
                return res.status(400).send(
                    "Please complete all required workout fields."
                );
            }

            if (new Date(end_time) <= new Date(start_time)) {
                return res.status(400).send(
                    "The end time must be later than the start time."
                );
            }

            const workoutDate = start_time.split("T")[0];

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
                    title,
                    workout_type,
                    location,
                    start_time,
                    end_time,
                    workoutDate,
                    workoutImage,
                    "open"
                ]
            );

            res.redirect("/my-workouts");
        } catch (error) {
            console.error("Create workout error:", error);
            res.status(500).send("Error creating workout");
        }
    }
);

//=====================================================
// MY CREATED WORKOUTS
//===================================================== 

router.get("/my-workouts", requireLogin, async (req, res) => {
    try {
        const userId = req.session.userId;

        const [workouts] = await db.query(
            `SELECT
                w.*,
                COUNT(wp.participant_id) AS participants_count
             FROM workouts w
             LEFT JOIN workout_participants wp
                ON w.workout_id = wp.workout_id
             WHERE w.user_id = ?
             GROUP BY w.workout_id
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

//=====================================================
// MY JOINED WORKOUTS
//===================================================== 

router.get("/joined-workouts", requireLogin, async (req, res) => {
    try {
        const userId = req.session.userId;

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
            title: "Joined Workouts",
            workouts
        });
    } catch (error) {
        console.error("Joined workouts error:", error);
        res.status(500).send("Error loading joined workouts");
    }
});

//=====================================================
// SHOW EDIT WORKOUT FORM
//===================================================== 

router.get(
    "/workouts/:id/edit",
    requireLogin,
    async (req, res) => {
        try {
            const workoutId = req.params.id;
            const userId = req.session.userId;

            const [rows] = await db.query(
                `SELECT *
                 FROM workouts
                 WHERE workout_id = ?
                 AND user_id = ?`,
                [workoutId, userId]
            );

            if (rows.length === 0) {
                return res.status(404).send(
                    "Workout not found or you do not have permission to edit it."
                );
            }

            const workout = rows[0];

            function formatDateTimeLocal(value) {
                if (!value) {
                    return "";
                }

                const date = new Date(value);
                const offset = date.getTimezoneOffset();
                const localDate = new Date(
                    date.getTime() - offset * 60 * 1000
                );

                return localDate.toISOString().slice(0, 16);
            }

            workout.formatted_start_time =
                formatDateTimeLocal(workout.start_time);

            workout.formatted_end_time =
                formatDateTimeLocal(workout.end_time);

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
    }
);

//=====================================================
// UPDATE WORKOUT
//=====================================================

router.post(
    "/workouts/:id/edit",
    requireLogin,
    upload.single("workout_image"),
    async (req, res) => {
        try {
            const workoutId = req.params.id;
            const userId = req.session.userId;

            const {
                title,
                workout_type,
                location,
                start_time,
                end_time
            } = req.body;

            if (
                !title ||
                !workout_type ||
                !location ||
                !start_time ||
                !end_time
            ) {
                return res.status(400).send(
                    "Please complete all required workout fields."
                );
            }

            if (new Date(end_time) <= new Date(start_time)) {
                return res.status(400).send(
                    "The end time must be later than the start time."
                );
            }

            const workoutDate = start_time.split("T")[0];

            const [existingRows] = await db.query(
                `SELECT workout_id
                 FROM workouts
                 WHERE workout_id = ?
                 AND user_id = ?`,
                [workoutId, userId]
            );

            if (existingRows.length === 0) {
                return res.status(404).send(
                    "Workout not found or you do not have permission to edit it."
                );
            }

            if (req.file) {
                const workoutImage =
                    `/uploads/${req.file.filename}`;

                await db.query(
                    `UPDATE workouts
                     SET title = ?,
                         workout_type = ?,
                         location = ?,
                         start_time = ?,
                         end_time = ?,
                         workout_date = ?,
                         workout_image = ?
                     WHERE workout_id = ?
                     AND user_id = ?`,
                    [
                        title,
                        workout_type,
                        location,
                        start_time,
                        end_time,
                        workoutDate,
                        workoutImage,
                        workoutId,
                        userId
                    ]
                );
            } else {
                await db.query(
                    `UPDATE workouts
                     SET title = ?,
                         workout_type = ?,
                         location = ?,
                         start_time = ?,
                         end_time = ?,
                         workout_date = ?
                     WHERE workout_id = ?
                     AND user_id = ?`,
                    [
                        title,
                        workout_type,
                        location,
                        start_time,
                        end_time,
                        workoutDate,
                        workoutId,
                        userId
                    ]
                );
            }

            res.redirect("/my-workouts");
        } catch (error) {
            console.error("Update workout error:", error);
            res.status(500).send("Unable to update workout");
        }
    }
);

//=====================================================
// CANCEL WORKOUT AND NOTIFY ACCEPTED PARTICIPANTS
//=====================================================

router.post(
    "/workouts/:id/cancel",
    requireLogin,
    async (req, res) => {
        let connection;

        try {
            const workoutId = Number(req.params.id);
            const ownerId = Number(req.session.userId);

            if (!workoutId || !ownerId) {
                return res.status(400).send(
                    "Workout ID or logged-in user is missing."
                );
            }

            connection = await db.getConnection();
            await connection.beginTransaction();

            // Find and temporarily lock the workout.
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

                return res.status(404).send(
                    "Workout not found."
                );
            }

            const workout = workoutRows[0];

            // Only the workout creator can cancel it.
            if (Number(workout.owner_id) !== ownerId) {
                await connection.rollback();

                return res.status(403).send(
                    "You cannot cancel another user's workout."
                );
            }

            // Prevent cancelling it repeatedly.
            if (
                String(workout.status).toLowerCase() ===
                "cancelled"
            ) {
                await connection.rollback();

                return res.status(400).send(
                    "This workout has already been cancelled."
                );
            }

            // A completed workout should not be cancelled.
            if (
                String(workout.status).toLowerCase() ===
                "completed"
            ) {
                await connection.rollback();

                return res.status(400).send(
                    "A completed workout cannot be cancelled."
                );
            }

            // Find every accepted participant.
            const [participants] = await connection.query(
                `SELECT
                    wp.user_id
                 FROM workout_participants wp
                 WHERE wp.workout_id = ?`,
                [workoutId]
            );

            // Change the workout status instead of deleting it.
            await connection.query(
                `UPDATE workouts
                 SET status = 'cancelled'
                 WHERE workout_id = ?
                   AND user_id = ?`,
                [workoutId, ownerId]
            );

            // Close any requests that are still pending.
            await connection.query(
                `UPDATE join_requests
                 SET status = 'rejected'
                 WHERE workout_id = ?
                   AND LOWER(status) = 'pending'`,
                [workoutId]
            );

            const ownerName =
                `${workout.owner_first_name} ${workout.owner_last_name}`;

            // Give each accepted participant their own notification.
            for (const participant of participants) {
                const participantId = Number(
                    participant.user_id
                );

                // Extra protection: never notify the owner.
                if (participantId !== ownerId) {
                    await createNotification(
                        participantId,
                        `${ownerName} cancelled the workout "${workout.title}".`,
                        connection
                    );
                }
            }

            await connection.commit();

            res.redirect("/my-workouts");
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }

            console.error(
                "CANCEL WORKOUT ERROR:",
                error
            );

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


//=====================================================
// COMPLETE WORKOUT
//=====================================================
router.post(
    "/workouts/:id/complete",
    requireLogin,
    async (req, res) => {
        let connection;

        try {
            const workoutId = Number(req.params.id);
            const ownerId = Number(req.session.userId);

            if (!workoutId || !ownerId) {
                return res.status(400).send(
                    "Workout ID or logged-in user is missing."
                );
            }

            connection = await db.getConnection();
            await connection.beginTransaction();

            // Get and temporarily lock the workout
            const [workoutRows] = await connection.query(
                `SELECT
                    w.workout_id,
                    w.user_id AS owner_id,
                    w.title,
                    w.status,
                    w.workout_date,
                    w.start_time,
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

                return res.status(404).send(
                    "Workout not found."
                );
            }

            const workout = workoutRows[0];

            // Only the workout creator can complete it
            if (Number(workout.owner_id) !== ownerId) {
                await connection.rollback();

                return res.status(403).send(
                    "You cannot complete another user's workout."
                );
            }

            const currentStatus =
                String(workout.status || "").toLowerCase();

            // Prevent completing the same workout twice
            if (currentStatus === "completed") {
                await connection.rollback();

                return res.status(400).send(
                    "This workout has already been completed."
                );
            }

            // Cancelled workouts cannot be completed
            if (currentStatus === "cancelled") {
                await connection.rollback();

                return res.status(400).send(
                    "A cancelled workout cannot be completed."
                );
            }

            // The workout must have a valid end time
            if (!workout.end_time) {
                await connection.rollback();

                return res.status(400).send(
                    "This workout does not have a valid scheduled end time."
                );
            }

            const currentTime = new Date();
            const workoutEndTime =
                new Date(workout.end_time);

            if (Number.isNaN(workoutEndTime.getTime())) {
                await connection.rollback();

                return res.status(400).send(
                    "The workout end time is invalid."
                );
            }

            // Prevent the owner from completing the workout early
            if (currentTime < workoutEndTime) {
                await connection.rollback();

                return res.status(400).send(
                    "You can only mark this workout as completed after its scheduled end time."
                );
            }

            // Find every accepted participant
            const [participantRows] =
                await connection.query(
                    `SELECT user_id
                     FROM workout_participants
                     WHERE workout_id = ?`,
                    [workoutId]
                );

            // Include both the owner and accepted participants
            const userIds = [
                ownerId,
                ...participantRows.map(
                    participant =>
                        Number(participant.user_id)
                )
            ];

            // Prevent duplicate user IDs
            const uniqueUserIds = [
                ...new Set(userIds)
            ];

            // Update the workout status
            await connection.query(
                `UPDATE workouts
                 SET status = 'completed'
                 WHERE workout_id = ?
                   AND user_id = ?`,
                [workoutId, ownerId]
            );

            const completionDate =
                workout.workout_date ||
                new Date()
                    .toISOString()
                    .slice(0, 10);

            // Add workout history and update streaks
            // for the owner and every accepted participant
            for (const userId of uniqueUserIds) {
                await connection.query(
                    `INSERT IGNORE INTO workout_history
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

                const completedWorkoutDate =
                    new Date(`${completionDate}T00:00:00`);

                if (streakRows.length === 0) {
                    // First completed workout for this user
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
                } else {
                    const streak = streakRows[0];

                    let currentStreak =
                        Number(
                            streak.current_streak || 0
                        );

                    let longestStreak =
                        Number(
                            streak.longest_streak || 0
                        );

                    const lastWorkoutDate =
                        streak.last_workout_date
                            ? new Date(
                                `${new Date(
                                    streak.last_workout_date
                                )
                                    .toISOString()
                                    .slice(0, 10)}T00:00:00`
                            )
                            : null;

                    if (!lastWorkoutDate) {
                        currentStreak = 1;
                    } else {
                        const millisecondsPerDay =
                            1000 * 60 * 60 * 24;

                        const differenceInDays =
                            Math.round(
                                (
                                    completedWorkoutDate -
                                    lastWorkoutDate
                                ) /
                                millisecondsPerDay
                            );

                        if (differenceInDays === 0) {
                            // Multiple workouts completed on the same day
                            currentStreak =
                                currentStreak || 1;
                        } else if (
                            differenceInDays === 1
                        ) {
                            // Consecutive workout day
                            currentStreak += 1;
                        } else {
                            // The user missed one or more days
                            currentStreak = 1;
                        }
                    }

                    if (
                        currentStreak >
                        longestStreak
                    ) {
                        longestStreak =
                            currentStreak;
                    }

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
            }

            const ownerName =
                `${workout.owner_first_name} ${workout.owner_last_name}`;

            // Notify accepted participants only
            for (const participant of participantRows) {
                const participantId =
                    Number(participant.user_id);

                if (participantId !== ownerId) {
                    await createNotification(
                        participantId,
                        `${ownerName} marked the workout "${workout.title}" as completed.`,
                        connection
                    );
                }
            }

            await connection.commit();

            res.redirect("/my-workouts");
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }

            console.error(
                "COMPLETE WORKOUT ERROR:",
                error
            );

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


//=====================================================
// DELETE WORKOUT
//===================================================== 

router.post(
    "/workouts/:id/delete",
    requireLogin,
    async (req, res) => {
        try {
            const workoutId = req.params.id;
            const userId = req.session.userId;

            const [result] = await db.query(
                `DELETE FROM workouts
                 WHERE workout_id = ?
                 AND user_id = ?`,
                [workoutId, userId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).send(
                    "Workout not found or you do not have permission to delete it."
                );
            }

            res.redirect("/my-workouts");
        } catch (error) {
            console.error("Delete workout error:", error);
            res.status(500).send("Unable to delete workout");
        }
    }
);

//=====================================================
// VIEW WORKOUT DETAILS
//===================================================== 

router.get("/workouts/:id", async (req, res) => {
    try {
        const workoutId = req.params.id;

        const [rows] = await db.query(
            `SELECT
                w.*,
                u.first_name AS creator_first_name,
                u.last_name AS creator_last_name,
                COUNT(wp.participant_id) AS participants_count
             FROM workouts w
             INNER JOIN users u
                ON w.user_id = u.user_id
             LEFT JOIN workout_participants wp
                ON w.workout_id = wp.workout_id
             WHERE w.workout_id = ?
             GROUP BY
                w.workout_id,
                u.first_name,
                u.last_name`,
            [workoutId]
        );

        if (rows.length === 0) {
            return res.status(404).send("Workout not found");
        }

        res.render("workout-details", {
            title: "Workout Details",
            workout: rows[0],
            loggedInUserId: req.session.userId || null
        });
    } catch (error) {
        console.error("Workout details error:", error);
        res.status(500).send("Error loading workout details");
    }
});

// --------------------------------------------------
// REQUEST TO JOIN WORKOUT
// --------------------------------------------------

router.post(
    "/workouts/:id/join",
    requireLogin,
    async (req, res) => {
        try {
            const workoutId = Number(req.params.id);
            const userId = Number(req.session.userId);

            if (!workoutId || !userId) {
                return res.status(400).send(
                    "Workout ID or logged-in user is missing."
                );
            }

            const [workoutRows] = await db.query(
                `SELECT
                    workout_id,
                    user_id,
                    title,
                    status
                 FROM workouts
                 WHERE workout_id = ?`,
                [workoutId]
            );

            if (workoutRows.length === 0) {
                return res.status(404).send(
                    "Workout not found."
                );
            }

            const workout = workoutRows[0];
            const hostId = Number(workout.user_id);

            if (hostId === userId) {
                return res.status(400).send(
                    "You cannot request to join your own workout."
                );
            }

            if (
                String(workout.status).toLowerCase() !==
                "open"
            ) {
                return res.status(400).send(
                    "This workout is not open for join requests."
                );
            }

            const [participantRows] = await db.query(
                `SELECT participant_id
                 FROM workout_participants
                 WHERE workout_id = ?
                   AND user_id = ?
                 LIMIT 1`,
                [workoutId, userId]
            );

            if (participantRows.length > 0) {
                return res.status(400).send(
                    "You have already joined this workout."
                );
            }

            const [requestRows] = await db.query(
                `SELECT
                    request_id,
                    status
                 FROM join_requests
                 WHERE workout_id = ?
                   AND user_id = ?
                 LIMIT 1`,
                [workoutId, userId]
            );

            if (requestRows.length > 0) {
                return res.status(400).send(
                    `You already have a ${requestRows[0].status} request for this workout.`
                );
            }

            await db.query(
                `INSERT INTO join_requests
                 (
                    workout_id,
                    user_id,
                    status
                 )
                 VALUES (?, ?, ?)`,
                [
                    workoutId,
                    userId,
                    "pending"
                ]
            );

            const requesterName =
                req.session.userName || "Someone";

            await createNotification(
                hostId,
                `${requesterName} requested to join your workout "${workout.title}".`
            );

            res.send(
                "Join request sent successfully."
            );
        } catch (error) {
            console.error(
                "JOIN REQUEST ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error sending join request."
            );
        }
    }
);


//=====================================================
// VIEW RECEIVED JOIN REQUESTS
//===================================================== 
router.get(
    "/workout-requests",
    requireLogin,
    async (req, res) => {
        try {
            const userId = Number(req.session.userId);

            console.log("WORKOUT REQUEST PAGE USER:", userId);

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

            console.log("PENDING REQUESTS FOUND:", requests);

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


// --------------------------------------------------
// ACCEPT WORKOUT JOIN REQUEST
// --------------------------------------------------
router.post(
    "/workout-requests/:id/accept",
    requireLogin,
    async (req, res) => {
        let connection;

        try {
            const requestId = Number(req.params.id);
            const hostId = Number(req.session.userId);

            if (!requestId || !hostId) {
                return res.status(400).send(
                    "Request ID or logged-in user is missing."
                );
            }

            connection = await db.getConnection();

            await connection.beginTransaction();

            const [requestRows] =
                await connection.query(
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
                        ON jr.workout_id =
                           w.workout_id

                     INNER JOIN users u
                        ON w.user_id =
                           u.user_id

                     WHERE jr.request_id = ?

                     FOR UPDATE`,
                    [requestId]
                );

            if (requestRows.length === 0) {
                await connection.rollback();

                return res.status(404).send(
                    "Join request not found."
                );
            }

            const request = requestRows[0];

            if (
                Number(request.host_id) !== hostId
            ) {
                await connection.rollback();

                return res.status(403).send(
                    "You cannot manage this join request."
                );
            }

            if (
                String(request.status).toLowerCase() !==
                "pending"
            ) {
                await connection.rollback();

                return res.status(400).send(
                    "This join request has already been processed."
                );
            }

            await connection.query(
                `UPDATE join_requests
                 SET status = 'accepted'
                 WHERE request_id = ?`,
                [requestId]
            );

            const [participantRows] =
                await connection.query(
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
                `${request.host_first_name} ${request.host_last_name}`;

            await createNotification(
                request.requester_id,
                `${hostName} accepted your request to join "${request.workout_title}".`,
                connection
            );

            await connection.commit();

            res.redirect("/workout-requests");
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }

            console.error(
                "ACCEPT REQUEST ERROR:",
                error
            );

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

//=====================================================
// VIEW JOINED WORKOUTS
//=====================================================
router.get(
    "/joined-workouts",
    requireLogin,
    async (req, res) => {
        try {
            const userId = req.session.userId;

            const [workouts] = await db.query(
                `SELECT
                w.workout_id,
                w.title,
                w.location,
                w.start_time,
                w.end_time,
                w.status,
                w.workout_image,
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
    }
);

     
// --------------------------------------------------
// REJECT WORKOUT JOIN REQUEST
// --------------------------------------------------

router.post(
    "/workout-requests/:id/reject",
    requireLogin,
    async (req, res) => {
        try {
            const requestId = Number(req.params.id);
            const hostId = Number(req.session.userId);

            if (!requestId || !hostId) {
                return res.status(400).send(
                    "Request ID or logged-in user is missing."
                );
            }

            const [requestRows] = await db.query(
                `SELECT
                    jr.request_id,
                    jr.user_id AS requester_id,
                    jr.status,

                    w.user_id AS host_id,
                    w.title AS workout_title,

                    u.first_name AS host_first_name,
                    u.last_name AS host_last_name

                 FROM join_requests jr

                 INNER JOIN workouts w
                    ON jr.workout_id =
                       w.workout_id

                 INNER JOIN users u
                    ON w.user_id =
                       u.user_id

                 WHERE jr.request_id = ?`,
                [requestId]
            );

            if (requestRows.length === 0) {
                return res.status(404).send(
                    "Join request not found."
                );
            }

            const request = requestRows[0];

            if (
                Number(request.host_id) !== hostId
            ) {
                return res.status(403).send(
                    "You cannot manage this join request."
                );
            }

            if (
                String(request.status).toLowerCase() !==
                "pending"
            ) {
                return res.status(400).send(
                    "This join request has already been processed."
                );
            }

            await db.query(
                `UPDATE join_requests
                 SET status = 'rejected'
                 WHERE request_id = ?`,
                [requestId]
            );

            const hostName =
                `${request.host_first_name} ${request.host_last_name}`;

            await createNotification(
                request.requester_id,
                `${hostName} rejected your request to join "${request.workout_title}".`
            );

            res.redirect("/workout-requests");
        } catch (error) {
            console.error(
                "REJECT REQUEST ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error rejecting workout request."
            );
        }
    }
);

//=====================================================
// View Workout Group Chat
//=====================================================

router.get(
    "/workouts/:id/chat",
    requireLogin,
    async (req, res) => {
        try {
            const workoutId = Number(req.params.id);
            const userId = Number(req.session.userId);

            if (!workoutId || !userId) {
                return res.status(400).send(
                    "Workout ID or logged-in user is missing."
                );
            }

            const [workoutRows] = await db.query(
                `SELECT
                    workout_id,
                    user_id AS creator_id,
                    title,
                    status
                 FROM workouts
                 WHERE workout_id = ?`,
                [workoutId]
            );

            if (workoutRows.length === 0) {
                return res.status(404).send(
                    "Workout not found."
                );
            }

            const workout = workoutRows[0];

            const [participantRows] = await db.query(
                `SELECT participant_id
                 FROM workout_participants
                 WHERE workout_id = ?
                   AND user_id = ?
                 LIMIT 1`,
                [workoutId, userId]
            );

            const isCreator =
                Number(workout.creator_id) === userId;

            const isParticipant =
                participantRows.length > 0;

            if (!isCreator && !isParticipant) {
                return res.status(403).send(
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

            const messages = messageRows.map(
                (message) => ({
                    ...message,
                    displayTime: formatDate(
                        message.created_at
                    )
                })
            );

            res.render("workout-chat", {
                title: `${workout.title} Group Chat`,
                workout,
                messages,
                currentUserId: userId
            });
        } catch (error) {
            console.error(
                "WORKOUT CHAT PAGE ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error loading workout group chat."
            );
        }
    }
);

//=====================================================
// Send Workout Group Chat Message
//=====================================================

router.post(
    "/workouts/:id/chat",
    requireLogin,
    async (req, res) => {
        try {
            const workoutId = Number(req.params.id);
            const userId = Number(req.session.userId);
            const message = req.body.message?.trim();

            if (!workoutId || !userId) {
                return res.status(400).send(
                    "Workout ID or logged-in user is missing."
                );
            }

            if (!message) {
                return res.status(400).send(
                    "Please enter a message."
                );
            }

            const [workoutRows] = await db.query(
                `SELECT
                    workout_id,
                    user_id AS creator_id
                 FROM workouts
                 WHERE workout_id = ?`,
                [workoutId]
            );

            if (workoutRows.length === 0) {
                return res.status(404).send(
                    "Workout not found."
                );
            }

            const workout = workoutRows[0];

            const [participantRows] = await db.query(
                `SELECT participant_id
                 FROM workout_participants
                 WHERE workout_id = ?
                   AND user_id = ?
                 LIMIT 1`,
                [workoutId, userId]
            );

            const isCreator =
                Number(workout.creator_id) === userId;

            const isParticipant =
                participantRows.length > 0;

            if (!isCreator && !isParticipant) {
                return res.status(403).send(
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
                [
                    workoutId,
                    userId,
                    message
                ]
            );

            res.redirect(
                `/workouts/${workoutId}/chat`
            );
        } catch (error) {
            console.error(
                "SEND WORKOUT CHAT MESSAGE ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error sending workout chat message."
            );
        }
    }
);

  
//=====================================================
// CALENDAR DOWNLOAD
//=====================================================

router.get(
    "/workouts/:id/calendar",
    async (req, res) => {
        try {
            const workoutId = req.params.id;

            const [rows] = await db.query(
                `SELECT *
                 FROM workouts
                 WHERE workout_id = ?`,
                [workoutId]
            );

            if (rows.length === 0) {
                return res.status(404).send(
                    "Workout not found"
                );
            }

            const workout = rows[0];

            const start = new Date(workout.start_time)
                .toISOString()
                .replace(/[-:]/g, "")
                .split(".")[0] + "Z";

            const end = new Date(workout.end_time)
                .toISOString()
                .replace(/[-:]/g, "")
                .split(".")[0] + "Z";

            const safeTitle = String(workout.title)
                .replace(/\n/g, " ")
                .replace(/,/g, "\\,");

            const safeLocation = String(workout.location)
                .replace(/\n/g, " ")
                .replace(/,/g, "\\,");

            const calendarContent =
`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//GymBuddy//Workout Calendar//EN
BEGIN:VEVENT
UID:${workout.workout_id}@gymbuddy
DTSTAMP:${start}
SUMMARY:${safeTitle}
DESCRIPTION:GymBuddy workout session
LOCATION:${safeLocation}
DTSTART:${start}
DTEND:${end}
END:VEVENT
END:VCALENDAR`;

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
            res.status(500).send(
                "Error creating calendar file"
            );
        }
    }
);

module.exports = router;