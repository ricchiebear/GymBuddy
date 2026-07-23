const express = require("express");
const multer = require("multer");
const path = require("path");
const db = require("../config/database");

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

//=====================================================
// REQUEST TO JOIN WORKOUT
//===================================================== 

router.post(
    "/workouts/:id/join",
    requireLogin,
    async (req, res) => {
        try {
            const workoutId = req.params.id;
            const userId = req.session.userId;

            const [workoutRows] = await db.query(
                `SELECT user_id, title, status
                 FROM workouts
                 WHERE workout_id = ?`,
                [workoutId]
            );

            if (workoutRows.length === 0) {
                return res.status(404).send(
                    "Workout not found"
                );
            }

            const workout = workoutRows[0];
            const hostId = workout.user_id;

            if (hostId === userId) {
                return res.status(400).send(
                    "You cannot request to join your own workout."
                );
            }

            if (
                workout.status.toLowerCase() !== "open"
            ) {
                return res.status(400).send(
                    "This workout is not currently open."
                );
            }

            const [existingParticipants] = await db.query(
                `SELECT participant_id
                 FROM workout_participants
                 WHERE workout_id = ?
                 AND user_id = ?
                 LIMIT 1`,
                [workoutId, userId]
            );

            if (existingParticipants.length > 0) {
                return res.status(400).send(
                    "You have already joined this workout."
                );
            }

            const [existingRequests] = await db.query(
                `SELECT request_id, status
                 FROM join_requests
                 WHERE workout_id = ?
                 AND user_id = ?
                 LIMIT 1`,
                [workoutId, userId]
            );

            if (existingRequests.length > 0) {
                return res.status(400).send(
                    `You already have a ${existingRequests[0].status} request for this workout.`
                );
            }

            await db.query(
                `INSERT INTO join_requests
                 (workout_id, user_id, status)
                 VALUES (?, ?, ?)`,
                [workoutId, userId, "pending"]
            );

            await db.query(
                `INSERT INTO notifications
                 (user_id, message)
                 VALUES (?, ?)`,
                [
                    hostId,
                    `Someone requested to join your workout: ${workout.title}`
                ]
            );

            res.redirect(`/workouts/${workoutId}`);
        } catch (error) {
            console.error("Join request error:", error);

            res.status(500).send(
                `Join request failed: ${Error.message}`
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
            const userId = req.session.userId;

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
            console.error("Workout requests error:", error);
            res.status(500).send(
                "Error loading workout requests"
            );
        }
    }
);

//=====================================================
// ACCEPT JOIN REQUEST
//===================================================== */

router.post(
    "/workout-requests/:id/accept",
    requireLogin,
    async (req, res) => {
        const connection = await db.getConnection();

        try {
            const requestId = req.params.id;
            const hostId = req.session.userId;

            await connection.beginTransaction();

            const [requestRows] = await connection.query(
                `SELECT
                    jr.request_id,
                    jr.user_id,
                    jr.workout_id,
                    jr.status,
                    w.user_id AS host_id
                 FROM join_requests jr
                 INNER JOIN workouts w
                    ON jr.workout_id = w.workout_id
                 WHERE jr.request_id = ?
                 FOR UPDATE`,
                [requestId]
            );

            if (requestRows.length === 0) {
                await connection.rollback();

                return res.status(404).send(
                    "Join request not found"
                );
            }

            const request = requestRows[0];

            if (request.host_id !== hostId) {
                await connection.rollback();

                return res.status(403).send(
                    "You cannot manage this request."
                );
            }

            if (
                request.status.toLowerCase() !== "pending"
            ) {
                await connection.rollback();

                return res.status(400).send(
                    "This request has already been processed."
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
                        request.user_id
                    ]
                );

            if (participantRows.length === 0) {
                await connection.query(
                    `INSERT INTO workout_participants
                     (workout_id, user_id)
                     VALUES (?, ?)`,
                    [
                        request.workout_id,
                        request.user_id
                    ]
                );
            }

            await connection.query(
                `INSERT INTO notifications
                 (user_id, message)
                 VALUES (?, ?)`,
                [
                    request.user_id,
                    "Your workout join request has been accepted."
                ]
            );

            await connection.commit();

            res.redirect("/workout-requests");
        } catch (error) {
            await connection.rollback();

            console.error("Accept request error:", error);
            res.status(500).send(
                "Error accepting workout request"
            );
        } finally {
            connection.release();
        }
    }
);

//=====================================================
// REJECT JOIN REQUEST
//===================================================== 

router.post(
    "/workout-requests/:id/reject",
    requireLogin,
    async (req, res) => {
        try {
            const requestId = req.params.id;
            const hostId = req.session.userId;

            const [requestRows] = await db.query(
                `SELECT
                    jr.user_id,
                    jr.status,
                    w.user_id AS host_id
                 FROM join_requests jr
                 INNER JOIN workouts w
                    ON jr.workout_id = w.workout_id
                 WHERE jr.request_id = ?`,
                [requestId]
            );

            if (requestRows.length === 0) {
                return res.status(404).send(
                    "Join request not found"
                );
            }

            const request = requestRows[0];

            if (request.host_id !== hostId) {
                return res.status(403).send(
                    "You cannot manage this request."
                );
            }

            if (
                request.status.toLowerCase() !== "pending"
            ) {
                return res.status(400).send(
                    "This request has already been processed."
                );
            }

            await db.query(
                `UPDATE join_requests
                 SET status = 'rejected'
                 WHERE request_id = ?`,
                [requestId]
            );

            await db.query(
                `INSERT INTO notifications
                 (user_id, message)
                 VALUES (?, ?)`,
                [
                    request.user_id,
                    "Your workout join request was rejected."
                ]
            );

            res.redirect("/workout-requests");
        } catch (error) {
            console.error("Reject request error:", error);
            res.status(500).send(
                "Error rejecting workout request"
            );
        }
    }
);

// =====================================================
// CANCEL CREATED WORKOUT
//===================================================== 

router.post(
    "/workouts/:id/cancel",
    requireLogin,
    async (req, res) => {
        try {
            const workoutId = req.params.id;
            const userId = req.session.userId;

            const [result] = await db.query(
                `UPDATE workouts
                 SET status = 'cancelled'
                 WHERE workout_id = ?
                 AND user_id = ?`,
                [workoutId, userId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).send(
                    "Workout not found or you cannot cancel it."
                );
            }

            const [participants] = await db.query(
                `SELECT user_id
                 FROM workout_participants
                 WHERE workout_id = ?`,
                [workoutId]
            );

            for (const participant of participants) {
                await db.query(
                    `INSERT INTO notifications
                     (user_id, message)
                     VALUES (?, ?)`,
                    [
                        participant.user_id,
                        "A workout you joined has been cancelled."
                    ]
                );
            }

            res.redirect("/my-workouts");
        } catch (error) {
            console.error("Cancel workout error:", error);
            res.status(500).send(
                "Error cancelling workout"
            );
        }
    }
);

// =====================================================
// LEAVE JOINED WORKOUT
// ===================================================== 

router.post(
    "/joined-workouts/:id/leave",
    requireLogin,
    async (req, res) => {
        try {
            const workoutId = req.params.id;
            const userId = req.session.userId;

            const [result] = await db.query(
                `DELETE FROM workout_participants
                 WHERE workout_id = ?
                 AND user_id = ?`,
                [workoutId, userId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).send(
                    "You are not currently part of this workout."
                );
            }

            await db.query(
                `INSERT INTO notifications
                 (user_id, message)
                 VALUES (?, ?)`,
                [
                    userId,
                    "You have left the workout session."
                ]
            );

            res.redirect("/joined-workouts");
        } catch (error) {
            console.error("Leave workout error:", error);
            res.status(500).send(
                "Error leaving workout"
            );
        }
    }
);

//=====================================================
// COMPLETE WORKOUT + UPDATE STREAK
//===================================================== 

router.post(
    "/workouts/:id/complete",
    requireLogin,
    async (req, res) => {
        try {
            const workoutId = req.params.id;
            const userId = req.session.userId;

            const [workoutRows] = await db.query(
                `SELECT workout_id
                 FROM workouts
                 WHERE workout_id = ?
                 AND user_id = ?`,
                [workoutId, userId]
            );

            if (workoutRows.length === 0) {
                return res.status(403).send(
                    "Only the workout creator can complete this workout."
                );
            }

            await db.query(
                `UPDATE workouts
                 SET status = 'completed'
                 WHERE workout_id = ?`,
                [workoutId]
            );

            const [historyRows] = await db.query(
                `SELECT history_id
                 FROM workout_history
                 WHERE user_id = ?
                 AND workout_id = ?
                 LIMIT 1`,
                [userId, workoutId]
            );

            if (historyRows.length === 0) {
                await db.query(
                    `INSERT INTO workout_history
                     (user_id, workout_id, workout_date)
                     VALUES (?, ?, CURDATE())`,
                    [userId, workoutId]
                );
            }

            const [streakRows] = await db.query(
                `SELECT *
                 FROM streaks
                 WHERE user_id = ?
                 ORDER BY streak_id DESC
                 LIMIT 1`,
                [userId]
            );

            if (streakRows.length === 0) {
                await db.query(
                    `INSERT INTO streaks
                     (
                        user_id,
                        current_streak,
                        longest_streak,
                        last_workout_date
                     )
                     VALUES (?, 1, 1, CURDATE())`,
                    [userId]
                );
            } else {
                await db.query(
                    `UPDATE streaks
                     SET current_streak =
                            current_streak + 1,
                         longest_streak =
                            GREATEST(
                                longest_streak,
                                current_streak + 1
                            ),
                         last_workout_date = CURDATE()
                     WHERE streak_id = ?`,
                    [streakRows[0].streak_id]
                );
            }

            res.redirect("/streaks");
        } catch (error) {
            console.error("Complete workout error:", error);
            res.status(500).send(
                "Error completing workout"
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