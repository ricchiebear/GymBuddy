const express = require("express");
const db = require("../config/database");

const router = express.Router();

// --------------------------------------------------
// LOGIN PROTECTION
// --------------------------------------------------

function requireLogin(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.redirect("/login");
    }

    next();
}

// --------------------------------------------------
// SHOW REPORT WORKOUT FORM
// --------------------------------------------------

router.get(
    "/workouts/:id/report",
    requireLogin,
    async (req, res) => {
        try {
            const workoutId = Number(req.params.id);
            const userId = Number(req.session.userId);

            if (!workoutId) {
                return res.status(400).send(
                    "Workout ID is missing."
                );
            }

            const [workoutRows] = await db.query(
                `SELECT
                    workout_id,
                    user_id AS owner_id,
                    title,
                    workout_type,
                    location
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

            if (Number(workout.owner_id) === userId) {
                return res.status(400).send(
                    "You cannot report your own workout."
                );
            }

            res.render("report-workout", {
                title: "Report Workout",
                workout
            });
        } catch (error) {
            console.error(
                "REPORT WORKOUT PAGE ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error loading report form."
            );
        }
    }
);

// --------------------------------------------------
// SUBMIT WORKOUT REPORT
// --------------------------------------------------

router.post(
    "/workouts/:id/report",
    requireLogin,
    async (req, res) => {
        try {
            const workoutId = Number(req.params.id);
            const reporterId = Number(req.session.userId);

            const selectedReason =
                req.body.reason?.trim();

            const otherReason =
                req.body.other_reason?.trim();

            if (!workoutId || !reporterId) {
                return res.status(400).send(
                    "Workout ID or logged-in user is missing."
                );
            }

            if (!selectedReason) {
                return res.status(400).send(
                    "Please select a reason for the report."
                );
            }

            let finalReason = selectedReason;

            if (selectedReason === "Other") {
                if (!otherReason) {
                    return res.status(400).send(
                        "Please explain the reason for your report."
                    );
                }

                finalReason = `Other: ${otherReason}`;
            }

            const [workoutRows] = await db.query(
                `SELECT
                    workout_id,
                    user_id AS owner_id,
                    title
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

            if (Number(workout.owner_id) === reporterId) {
                return res.status(400).send(
                    "You cannot report your own workout."
                );
            }

            const [existingReports] = await db.query(
                `SELECT report_id
                 FROM reports
                 WHERE reporter_id = ?
                   AND reported_workout_id = ?
                   AND LOWER(status) = 'pending'
                 LIMIT 1`,
                [reporterId, workoutId]
            );

            if (existingReports.length > 0) {
                return res.status(400).send(
                    "You have already submitted a pending report for this workout."
                );
            }

            await db.query(
                `INSERT INTO reports
                 (
                    reporter_id,
                    reported_user_id,
                    reported_workout_id,
                    reason,
                    status
                 )
                 VALUES (?, NULL, ?, ?, 'pending')`,
                [
                    reporterId,
                    workoutId,
                    finalReason
                ]
            );

            res.send(
                `Your report for "${workout.title}" has been submitted successfully.`
            );
        } catch (error) {
            console.error(
                "SUBMIT WORKOUT REPORT ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error submitting workout report."
            );
        }
    }
);

module.exports = router;