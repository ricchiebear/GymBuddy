const express = require("express");
const db = require("../config/database");

const router = express.Router();

//=====================================================
// LOGIN PROTECTION
//=====================================================

function requireLogin(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.redirect("/login");
    }

    next();
}

//=====================================================
// CALCULATE COMPATIBILITY SCORE
//=====================================================

function calculateCompatibility(
    currentUser,
    candidate
) {
    let score = 0;
    const reasons = [];

    //=================================================
    // 1. SAME FITNESS GOAL
    // Maximum: 40 points
    //=================================================

    if (
        currentUser.fitness_goal &&
        candidate.fitness_goal &&
        String(currentUser.fitness_goal).toLowerCase() ===
        String(candidate.fitness_goal).toLowerCase()
    ) {
        score += 40;

        reasons.push(
            "Same fitness goal"
        );
    }

    //=================================================
    // 2. SIMILAR WORKOUT STREAK
    // Maximum: 20 points
    //=================================================

    const currentUserStreak =
        Number(currentUser.current_streak || 0);

    const candidateStreak =
        Number(candidate.current_streak || 0);

    const streakDifference =
        Math.abs(
            currentUserStreak -
            candidateStreak
        );

    if (streakDifference === 0) {
        score += 20;

        reasons.push(
            "Identical workout streak"
        );
    } else if (streakDifference <= 2) {
        score += 15;

        reasons.push(
            "Very similar workout streak"
        );
    } else if (streakDifference <= 5) {
        score += 10;

        reasons.push(
            "Reasonably similar workout streak"
        );
    }

    //=================================================
    // 3. SIMILAR NUMBER OF COMPLETED WORKOUTS
    // Maximum: 20 points
    //=================================================

    const currentCompleted =
        Number(
            currentUser.completedWorkouts || 0
        );

    const candidateCompleted =
        Number(
            candidate.completedWorkouts || 0
        );

    const completedDifference =
        Math.abs(
            currentCompleted -
            candidateCompleted
        );

    if (completedDifference === 0) {
        score += 20;

        reasons.push(
            "Same workout experience"
        );
    } else if (completedDifference <= 2) {
        score += 15;

        reasons.push(
            "Similar workout experience"
        );
    } else if (completedDifference <= 5) {
        score += 10;

        reasons.push(
            "Comparable workout experience"
        );
    }

    //=================================================
    // 4. SHARED WORKOUT TYPES
    // Maximum: 20 points
    //=================================================

    const currentWorkoutTypes = [
        ...new Set(
            (currentUser.workoutHistory || [])
                .map(
                    workout =>
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
            (candidate.workoutHistory || [])
                .map(
                    workout =>
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
            workoutType =>
                candidateWorkoutTypes.includes(
                    workoutType
                )
        );

    if (sharedWorkoutTypes.length > 0) {
        score += 20;

        reasons.push(
            `Shared workout interests (${sharedWorkoutTypes.join(", ")})`
        );
    }

    //=================================================
    // RETURN FINAL RESULT
    //=================================================

    return {
        score,
        reasons
    };
}

//=====================================================
// RECOMMENDATIONS PAGE
//=====================================================

router.get(
    "/recommendations",
    requireLogin,
    async (req, res) => {
        try {
            const currentUserId =
                Number(req.session.userId);

            //=================================================
            // 1. LOAD LOGGED-IN USER
            //=================================================

            const [currentUserRows] =
                await db.query(
                    `SELECT
                        u.user_id,
                        u.first_name,
                        u.last_name,
                        u.profile_picture,
                        u.fitness_goal,

                        COALESCE(
                            s.current_streak,
                            0
                        ) AS current_streak

                     FROM users u

                     LEFT JOIN streaks s
                        ON u.user_id =
                           s.user_id

                     WHERE u.user_id = ?

                     LIMIT 1`,
                    [currentUserId]
                );

            if (
                currentUserRows.length === 0
            ) {
                return res.status(404).send(
                    "Logged-in user not found."
                );
            }

            const currentUser =
                currentUserRows[0];

            //=================================================
            // 2. LOAD ALL OTHER USERS
            //=================================================

            const [candidateRows] =
                await db.query(
                    `SELECT
                        u.user_id,
                        u.first_name,
                        u.last_name,
                        u.profile_picture,
                        u.fitness_goal,

                        COALESCE(
                            s.current_streak,
                            0
                        ) AS current_streak

                     FROM users u

                     LEFT JOIN streaks s
                        ON u.user_id =
                           s.user_id

                     WHERE u.user_id != ?

                     ORDER BY
                        u.first_name ASC,
                        u.last_name ASC`,
                    [currentUserId]
                );

            //=================================================
            // 3. LOAD CURRENT USER'S WORKOUT HISTORY
            //=================================================

            const [currentHistoryRows] =
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
                        wh.workout_date DESC`,
                    [currentUserId]
                );

            currentUser.workoutHistory =
                currentHistoryRows;

            currentUser.completedWorkouts =
                currentHistoryRows.length;

            //=================================================
            // 4. LOAD EACH CANDIDATE'S WORKOUT HISTORY
            //=================================================

            for (
                const candidate of candidateRows
            ) {
                const [historyRows] =
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
                            wh.workout_date DESC`,
                        [candidate.user_id]
                    );

                candidate.workoutHistory =
                    historyRows;

                candidate.completedWorkouts =
                    historyRows.length;
            }

            //=================================================
            // 5. CALCULATE COMPATIBILITY + REASONS
            //=================================================

            for (
                const candidate of candidateRows
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

            //=================================================
            // 6. SORT HIGHEST COMPATIBILITY FIRST
            //=================================================

            candidateRows.sort(
                (a, b) =>
                    b.compatibility -
                    a.compatibility
            );

            //=================================================
            // 7. RENDER RECOMMENDATIONS PAGE
            //=================================================

            res.render("recommendations", {
                title: "Recommended Partners",
                currentUser,
                recommendations:
                    candidateRows
            });

        } catch (error) {
            console.error(
                "RECOMMENDATIONS ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error loading recommendations."
            );
        }
    }
);

module.exports = router;