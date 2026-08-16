const express = require("express");
const db = require("../config/database");

const router = express.Router();

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
    const id = Number(value);

    return (
        Number.isInteger(id) &&
        id > 0
    )
        ? id
        : null;
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
// VIEW CURRENT USER'S STREAK
// =====================================================

router.get(
    "/streaks",
    requireLogin,
    async (req, res) => {

        try {

            const userId =
                getNumericId(
                    req.session.userId
                );

            // =================================================
            // VALIDATE SESSION USER
            // =================================================

            if (!userId) {

                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            // =================================================
            // GET USER'S STREAK
            // =================================================

            const [rows] =
                await db.query(
                    `SELECT
                        streak_id,
                        user_id,
                        current_streak,
                        longest_streak,
                        last_workout_date
                     FROM streaks
                     WHERE user_id = ?
                     ORDER BY streak_id DESC
                     LIMIT 1`,
                    [userId]
                );

            // =================================================
            // DEFAULT STREAK
            // User may not have completed a workout yet.
            // =================================================

            const streak =
                rows.length > 0
                    ? rows[0]
                    : {
                        user_id:
                            userId,

                        current_streak:
                            0,

                        longest_streak:
                            0,

                        last_workout_date:
                            null
                    };

            // =================================================
            // RENDER STREAK PAGE
            // =================================================

            return res.render(
                "streaks",
                {
                    title:
                        "My Workout Streak",

                    streak
                }
            );

        } catch (error) {

            console.error(
                "STREAKS PAGE ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error fetching streak data."
                );
        }
    }
);

module.exports = router;