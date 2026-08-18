const express = require("express");

const {
    rateLimit
} = require("express-rate-limit");

const db = require("../config/database");

const router = express.Router();

// =====================================================
// CONFIGURATION
// =====================================================

const MAX_OTHER_REASON_LENGTH = 1000;

// =====================================================
// FEEDBACK HELPER
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
// STRING INPUT VALIDATION
// =====================================================

function isStringInput(value) {
    return (
        typeof value ===
        "string"
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
        !req.session ||
        !req.session.userId
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
// REPORT RATE LIMIT
// =====================================================

const reportLimiter =
    rateLimit({
        windowMs:
            60 * 60 * 1000,

        limit:
            10,

        standardHeaders:
            "draft-8",

        legacyHeaders:
            false,

        keyGenerator:
            (req) => {
                return (
                    `gymbuddy-report-user-${req.session.userId}`
                );
            },

        handler:
            (req, res) => {

                const workoutId =
                    getNumericId(
                        req.params.id
                    );

                setFeedback(
                    req,
                    "warning",
                    "You've submitted several reports recently. Please wait before submitting another report."
                );

                if (workoutId) {
                    return res.redirect(
                        `/workouts/${workoutId}`
                    );
                }

                return res.redirect(
                    "/workouts"
                );
            }
    });

// =====================================================
// ALLOWED REPORT REASONS
// =====================================================

const allowedReportReasons = [
    "Spam or misleading content",
    "Unsafe activity",
    "Harassment or abusive behaviour",
    "Inappropriate content",
    "Fake workout or false information",
    "Scam or suspicious activity",
    "Dangerous location",
    "Duplicate workout",
    "Other"
];

// =====================================================
// SHOW REPORT WORKOUT FORM
// =====================================================

router.get(
    "/workouts/:id/report",
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
                    "/workouts"
                );
            }

            const [workoutRows] =
                await db.query(
                    `SELECT
                        workout_id,
                        user_id AS owner_id,
                        title,
                        workout_type,
                        location
                     FROM workouts
                     WHERE workout_id = ?
                     LIMIT 1`,
                    [workoutId]
                );

            if (
                workoutRows.length ===
                0
            ) {

                setFeedback(
                    req,
                    "warning",
                    "That workout could not be found."
                );

                return res.redirect(
                    "/workouts"
                );
            }

            const workout =
                workoutRows[0];

            if (
                Number(
                    workout.owner_id
                ) === userId
            ) {

                setFeedback(
                    req,
                    "warning",
                    "You cannot report your own workout."
                );

                return res.redirect(
                    `/workouts/${workoutId}`
                );
            }

            return res.render(
                "report-workout",
                {
                    title:
                        "Report Workout",

                    workout,

                    allowedReportReasons
                }
            );

        } catch (error) {

            console.error(
                "REPORT WORKOUT PAGE ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading report form."
                );
        }
    }
);

// =====================================================
// SUBMIT WORKOUT REPORT
// =====================================================

router.post(
    "/workouts/:id/report",
    requireLogin,
    reportLimiter,
    async (req, res) => {

        let connection;

        try {

            const workoutId =
                getNumericId(
                    req.params.id
                );

            const reporterId =
                getNumericId(
                    req.session.userId
                );

            if (!reporterId) {

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
                    "/workouts"
                );
            }

            // =================================================
            // VALIDATE BODY TYPES
            // =================================================

            if (
                !isStringInput(
                    req.body.reason
                ) ||
                (
                    req.body.other_reason !==
                        undefined &&
                    !isStringInput(
                        req.body.other_reason
                    )
                )
            ) {

                setFeedback(
                    req,
                    "warning",
                    "Invalid report information was submitted."
                );

                return res.redirect(
                    `/workouts/${workoutId}/report`
                );
            }

            const selectedReason =
                req.body.reason
                    .trim();

            const otherReason =
                req.body.other_reason
                    ?.trim() ||
                "";

            // =================================================
            // VALIDATE REPORT REASON
            // =================================================

            if (!selectedReason) {

                setFeedback(
                    req,
                    "warning",
                    "Please select a reason for the report."
                );

                return res.redirect(
                    `/workouts/${workoutId}/report`
                );
            }

            if (
                !allowedReportReasons.includes(
                    selectedReason
                )
            ) {

                setFeedback(
                    req,
                    "warning",
                    "Please select a valid report reason."
                );

                return res.redirect(
                    `/workouts/${workoutId}/report`
                );
            }

            // =================================================
            // BUILD FINAL REASON
            // =================================================

            let finalReason =
                selectedReason;

            if (
                selectedReason ===
                "Other"
            ) {

                if (!otherReason) {

                    setFeedback(
                        req,
                        "warning",
                        "Please explain the reason for your report."
                    );

                    return res.redirect(
                        `/workouts/${workoutId}/report`
                    );
                }

                if (
                    otherReason.length >
                    MAX_OTHER_REASON_LENGTH
                ) {

                    setFeedback(
                        req,
                        "warning",
                        `Your report explanation must be ${MAX_OTHER_REASON_LENGTH} characters or fewer.`
                    );

                    return res.redirect(
                        `/workouts/${workoutId}/report`
                    );
                }

                finalReason =
                    `Other: ${otherReason}`;
            }

            // =================================================
            // START TRANSACTION
            // =================================================

            connection =
                await db.getConnection();

            await connection
                .beginTransaction();

            // =================================================
            // LOCK REPORTER
            //
            // This gives concurrent report submissions from the
            // same account a consistent lock before checking for
            // duplicates.
            // =================================================

            const [reporterRows] =
                await connection.query(
                    `SELECT
                        user_id
                     FROM users
                     WHERE user_id = ?
                     FOR UPDATE`,
                    [reporterId]
                );

            if (
                reporterRows.length ===
                0
            ) {

                await connection
                    .rollback();

                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            // =================================================
            // FIND + LOCK WORKOUT
            // =================================================

            const [workoutRows] =
                await connection.query(
                    `SELECT
                        workout_id,
                        user_id AS owner_id,
                        title
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

                setFeedback(
                    req,
                    "warning",
                    "That workout could not be found."
                );

                return res.redirect(
                    "/workouts"
                );
            }

            const workout =
                workoutRows[0];

            // =================================================
            // BLOCK REPORTING OWN WORKOUT
            // =================================================

            if (
                Number(
                    workout.owner_id
                ) === reporterId
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "You cannot report your own workout."
                );

                return res.redirect(
                    `/workouts/${workoutId}`
                );
            }

            // =================================================
            // CHECK DUPLICATE PENDING REPORT
            // =================================================

            const [existingReports] =
                await connection.query(
                    `SELECT
                        report_id
                     FROM reports
                     WHERE reporter_id = ?
                       AND reported_workout_id = ?
                       AND LOWER(status) = 'pending'
                     LIMIT 1
                     FOR UPDATE`,
                    [
                        reporterId,
                        workoutId
                    ]
                );

            if (
                existingReports.length >
                0
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "info",
                    "You already have a pending report for this workout."
                );

                return res.redirect(
                    `/workouts/${workoutId}`
                );
            }

            // =================================================
            // CREATE REPORT
            // =================================================

            await connection.query(
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

            await connection
                .commit();

            setFeedback(
                req,
                "success",
                `Your report for "${workout.title}" has been submitted successfully.`
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
                        "REPORT ROLLBACK ERROR:",
                        rollbackError
                    );
                }
            }

            console.error(
                "SUBMIT WORKOUT REPORT ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error submitting workout report."
                );

        } finally {

            if (connection) {
                connection.release();
            }
        }
    }
);

module.exports = router;