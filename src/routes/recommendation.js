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
// CALCULATE COMPATIBILITY SCORE
// =====================================================

function calculateCompatibility(
    currentUser,
    candidate
) {
    let score = 0;

    const reasons = [];

    // =================================================
    // 1. SAME FITNESS GOAL
    // Maximum: 40 points
    // =================================================

    if (
        currentUser.fitness_goal &&
        candidate.fitness_goal &&
        String(
            currentUser.fitness_goal
        ).toLowerCase() ===
        String(
            candidate.fitness_goal
        ).toLowerCase()
    ) {
        score += 40;

        reasons.push(
            "Same fitness goal"
        );
    }

    // =================================================
    // 2. SIMILAR WORKOUT STREAK
    // Maximum: 20 points
    // Only award points when both users actually
    // have an active workout streak.
    // =================================================

    const currentUserStreak =
        Number(
            currentUser.current_streak ||
            0
        );

    const candidateStreak =
        Number(
            candidate.current_streak ||
            0
        );

    if (
        currentUserStreak > 0 &&
        candidateStreak > 0
    ) {
        const streakDifference =
            Math.abs(
                currentUserStreak -
                candidateStreak
            );

        if (
            streakDifference === 0
        ) {
            score += 20;

            reasons.push(
                "Identical workout streak"
            );

        } else if (
            streakDifference <= 2
        ) {
            score += 15;

            reasons.push(
                "Very similar workout streak"
            );

        } else if (
            streakDifference <= 5
        ) {
            score += 10;

            reasons.push(
                "Reasonably similar workout streak"
            );
        }
    }

    // =================================================
    // 3. SIMILAR NUMBER OF COMPLETED WORKOUTS
    // Maximum: 20 points
    // Only award points when both users have completed
    // at least one workout.
    // =================================================

    const currentCompleted =
        Number(
            currentUser.completedWorkouts ||
            0
        );

    const candidateCompleted =
        Number(
            candidate.completedWorkouts ||
            0
        );

    if (
        currentCompleted > 0 &&
        candidateCompleted > 0
    ) {
        const completedDifference =
            Math.abs(
                currentCompleted -
                candidateCompleted
            );

        if (
            completedDifference === 0
        ) {
            score += 20;

            reasons.push(
                "Same workout experience"
            );

        } else if (
            completedDifference <= 2
        ) {
            score += 15;

            reasons.push(
                "Similar workout experience"
            );

        } else if (
            completedDifference <= 5
        ) {
            score += 10;

            reasons.push(
                "Comparable workout experience"
            );
        }
    }

    // =================================================
    // 4. SHARED WORKOUT TYPES
    // Maximum: 20 points
    // =================================================

    const currentWorkoutTypes = [
        ...new Set(
            (
                currentUser.workoutHistory ||
                []
            )
                .map(
                    (workout) =>
                        workout.workout_type
                            ? String(
                                workout.workout_type
                            ).toLowerCase()
                            : null
                )
                .filter(Boolean)
        )
    ];

    const candidateWorkoutTypes = [
        ...new Set(
            (
                candidate.workoutHistory ||
                []
            )
                .map(
                    (workout) =>
                        workout.workout_type
                            ? String(
                                workout.workout_type
                            ).toLowerCase()
                            : null
                )
                .filter(Boolean)
        )
    ];

    const sharedWorkoutTypes =
        currentWorkoutTypes.filter(
            (workoutType) =>
                candidateWorkoutTypes.includes(
                    workoutType
                )
        );

    if (
        sharedWorkoutTypes.length >
        0
    ) {
        score += 20;

        reasons.push(
            `Shared workout interests (${sharedWorkoutTypes.join(", ")})`
        );
    }

    // =================================================
    // RETURN FINAL RESULT
    // =================================================

    return {
        score,
        reasons
    };
}

// =====================================================
// GROUP WORKOUT HISTORY BY USER
// =====================================================

function groupWorkoutHistoryByUser(
    historyRows
) {
    const historyMap =
        new Map();

    for (
        const row
        of historyRows
    ) {
        const userId =
            getNumericId(
                row.user_id
            );

        if (!userId) {
            continue;
        }

        if (
            !historyMap.has(
                userId
            )
        ) {
            historyMap.set(
                userId,
                []
            );
        }

        historyMap
            .get(userId)
            .push({
                workout_id:
                    row.workout_id,

                workout_date:
                    row.workout_date,

                title:
                    row.title,

                workout_type:
                    row.workout_type,

                location:
                    row.location
            });
    }

    return historyMap;
}

// =====================================================
// RECOMMENDATIONS PAGE
// =====================================================

router.get(
    "/recommendations",
    requireLogin,
    async (req, res) => {
        try {
            const currentUserId =
                getNumericId(
                    req.session.userId
                );

            // =================================================
            // VALIDATE SESSION USER
            // =================================================

            if (!currentUserId) {
                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            // =================================================
            // 1. LOAD LOGGED-IN USER
            // Use the latest streak row only.
            // =================================================

            const [currentUserRows] =
                await db.query(
                    `SELECT
                        u.user_id,
                        u.first_name,
                        u.last_name,
                        u.profile_picture,
                        u.fitness_goal,

                        COALESCE(
                            (
                                SELECT
                                    s.current_streak
                                FROM streaks s
                                WHERE s.user_id =
                                      u.user_id
                                ORDER BY
                                    s.streak_id DESC
                                LIMIT 1
                            ),
                            0
                        ) AS current_streak

                     FROM users u

                     WHERE u.user_id = ?

                     LIMIT 1`,
                    [currentUserId]
                );

            if (
                currentUserRows.length ===
                0
            ) {
                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            const currentUser =
                currentUserRows[0];

            // =================================================
            // 2. LOAD ALL OTHER USERS
            // Use latest streak for each candidate.
            // =================================================

            const [candidateRows] =
                await db.query(
                    `SELECT
                        u.user_id,
                        u.first_name,
                        u.last_name,
                        u.profile_picture,
                        u.fitness_goal,

                        COALESCE(
                            (
                                SELECT
                                    s.current_streak
                                FROM streaks s
                                WHERE s.user_id =
                                      u.user_id
                                ORDER BY
                                    s.streak_id DESC
                                LIMIT 1
                            ),
                            0
                        ) AS current_streak

                     FROM users u

                     WHERE u.user_id != ?

                     ORDER BY
                        u.first_name ASC,
                        u.last_name ASC`,
                    [currentUserId]
                );

            // =================================================
            // 3. LOAD ALL RELEVANT WORKOUT HISTORY IN ONE QUERY
            // =================================================

            const relevantUserIds = [
                currentUserId,
                ...candidateRows.map(
                    (candidate) =>
                        Number(
                            candidate.user_id
                        )
                )
            ];

            let historyRows = [];

            if (
                relevantUserIds.length >
                0
            ) {
                const placeholders =
                    relevantUserIds
                        .map(() => "?")
                        .join(", ");

                const [rows] =
                    await db.query(
                        `SELECT
                            wh.user_id,
                            wh.workout_id,
                            wh.workout_date,

                            w.title,
                            w.workout_type,
                            w.location

                         FROM workout_history wh

                         INNER JOIN workouts w
                            ON wh.workout_id =
                               w.workout_id

                         WHERE wh.user_id
                               IN (${placeholders})

                         ORDER BY
                            wh.user_id ASC,
                            wh.workout_date DESC`,
                        relevantUserIds
                    );

                historyRows = rows;
            }

            // =================================================
            // 4. GROUP HISTORY BY USER
            // =================================================

            const historyMap =
                groupWorkoutHistoryByUser(
                    historyRows
                );

            currentUser.workoutHistory =
                historyMap.get(
                    currentUserId
                ) || [];

            currentUser.completedWorkouts =
                currentUser
                    .workoutHistory
                    .length;

            for (
                const candidate
                of candidateRows
            ) {
                const candidateId =
                    getNumericId(
                        candidate.user_id
                    );

                candidate.workoutHistory =
                    candidateId
                        ? historyMap.get(
                            candidateId
                        ) || []
                        : [];

                candidate.completedWorkouts =
                    candidate
                        .workoutHistory
                        .length;
            }

            // =================================================
            // 5. CALCULATE COMPATIBILITY + REASONS
            // =================================================

            for (
                const candidate
                of candidateRows
            ) {
                const result =
                    calculateCompatibility(
                        currentUser,
                        candidate
                    );

                candidate.compatibility =
                    result.score;

                candidate.matchReasons =
                    result.reasons;
            }

            // =================================================
            // 6. SORT HIGHEST COMPATIBILITY FIRST
            // =================================================

            candidateRows.sort(
                (a, b) =>
                    Number(
                        b.compatibility ||
                        0
                    ) -
                    Number(
                        a.compatibility ||
                        0
                    )
            );

            // =================================================
            // 7. RENDER RECOMMENDATIONS PAGE
            // =================================================

            return res.render(
                "recommendations",
                {
                    title:
                        "Recommended Partners",

                    currentUser,

                    recommendations:
                        candidateRows
                }
            );

        } catch (error) {
            console.error(
                "RECOMMENDATIONS ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading recommendations."
                );
        }
    }
);

module.exports = router;