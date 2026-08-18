const express = require("express");

const db = require("../config/database");
const createNotification =
    require("../utils/createNotification");

const router = express.Router();

// =====================================================
// CONFIGURATION
// =====================================================

const MAX_MESSAGE_LENGTH = 2000;

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
// LOCK TWO USERS IN CONSISTENT ORDER
// =====================================================

async function lockUserPair(
    connection,
    userOneId,
    userTwoId
) {
    const firstUserId =
        Math.min(
            userOneId,
            userTwoId
        );

    const secondUserId =
        Math.max(
            userOneId,
            userTwoId
        );

    const [rows] =
        await connection.query(
            `SELECT
                user_id

             FROM users

             WHERE user_id IN (?, ?)

             ORDER BY user_id

             FOR UPDATE`,
            [
                firstUserId,
                secondUserId
            ]
        );

    return rows;
}

// =====================================================
// CHECK WHETHER TWO USERS CAN MESSAGE DIRECTLY
// =====================================================

async function usersCanMessageDirectly(
    userOneId,
    userTwoId,
    queryRunner = db
) {
    // =================================================
    // SHARED WORKOUT
    // =================================================

    const [sharedWorkoutRows] =
        await queryRunner.query(
            `SELECT
                w.workout_id

             FROM workouts w

             INNER JOIN workout_participants wp
                ON w.workout_id =
                   wp.workout_id

             WHERE
                (
                    w.user_id = ?
                    AND wp.user_id = ?
                )
                OR
                (
                    w.user_id = ?
                    AND wp.user_id = ?
                )

             LIMIT 1`,
            [
                userOneId,
                userTwoId,
                userTwoId,
                userOneId
            ]
        );

    if (
        sharedWorkoutRows.length >
        0
    ) {
        return true;
    }

    // =================================================
    // ACCEPTED REQUEST
    // =================================================

    const [acceptedRows] =
        await queryRunner.query(
            `SELECT
                request_id

             FROM message_requests

             WHERE LOWER(status) =
                   'accepted'

               AND
               (
                    (
                        sender_id = ?
                        AND receiver_id = ?
                    )
                    OR
                    (
                        sender_id = ?
                        AND receiver_id = ?
                    )
               )

             LIMIT 1`,
            [
                userOneId,
                userTwoId,
                userTwoId,
                userOneId
            ]
        );

    return (
        acceptedRows.length >
        0
    );
}

// =====================================================
// VIEW INCOMING MESSAGE REQUESTS
// =====================================================

router.get(
    "/message-requests",
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

            const [requests] =
                await db.query(
                    `SELECT
                        mr.request_id,
                        mr.sender_id,
                        mr.receiver_id,
                        mr.first_message,
                        mr.status,
                        mr.created_at,

                        u.first_name
                            AS sender_first_name,

                        u.last_name
                            AS sender_last_name,

                        u.profile_picture
                            AS sender_profile_picture

                     FROM message_requests mr

                     INNER JOIN users u
                        ON mr.sender_id =
                           u.user_id

                     WHERE mr.receiver_id = ?
                       AND LOWER(mr.status) =
                           'pending'

                     ORDER BY
                        mr.created_at DESC`,
                    [userId]
                );

            return res.render(
                "message-requests",
                {
                    title:
                        "Message Requests",

                    requests
                }
            );

        } catch (error) {

            console.error(
                "MESSAGE REQUESTS PAGE ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading message requests."
                );
        }
    }
);

// =====================================================
// ACCEPT MESSAGE REQUEST
// =====================================================

router.post(
    "/message-requests/:id/accept",
    requireLogin,
    async (req, res) => {

        let connection;

        try {

            const requestId =
                getNumericId(
                    req.params.id
                );

            const receiverId =
                getNumericId(
                    req.session.userId
                );

            if (!receiverId) {

                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            if (!requestId) {

                setFeedback(
                    req,
                    "warning",
                    "That message request could not be found."
                );

                return res.redirect(
                    "/message-requests"
                );
            }

            // =================================================
            // START TRANSACTION
            // =================================================

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
                        request_id,
                        sender_id,
                        receiver_id,
                        first_message,
                        status

                     FROM message_requests

                     WHERE request_id = ?
                       AND receiver_id = ?

                     FOR UPDATE`,
                    [
                        requestId,
                        receiverId
                    ]
                );

            if (
                requestRows.length ===
                0
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "That message request could not be found or you do not have permission to manage it."
                );

                return res.redirect(
                    "/message-requests"
                );
            }

            const request =
                requestRows[0];

            const senderId =
                getNumericId(
                    request.sender_id
                );

            if (!senderId) {

                await connection.query(
                    `DELETE FROM message_requests
                     WHERE request_id = ?`,
                    [requestId]
                );

                await connection
                    .commit();

                setFeedback(
                    req,
                    "warning",
                    "This message request is invalid and has been removed."
                );

                return res.redirect(
                    "/message-requests"
                );
            }

            // =================================================
            // LOCK BOTH USERS
            // =================================================

            const lockedUsers =
                await lockUserPair(
                    connection,
                    senderId,
                    receiverId
                );

            if (
                lockedUsers.length <
                2
            ) {

                await connection.query(
                    `DELETE FROM message_requests
                     WHERE request_id = ?`,
                    [requestId]
                );

                await connection
                    .commit();

                setFeedback(
                    req,
                    "warning",
                    "This message request is no longer valid."
                );

                return res.redirect(
                    "/message-requests"
                );
            }

            // =================================================
            // STATUS CHECK
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
                    "This message request has already been processed."
                );

                return res.redirect(
                    "/message-requests"
                );
            }

            // =================================================
            // CHECK WHETHER USERS ALREADY HAVE DIRECT ACCESS
            // =================================================

            const alreadyCanMessage =
                await usersCanMessageDirectly(
                    senderId,
                    receiverId,
                    connection
                );

            if (alreadyCanMessage) {

                // =============================================
                // STALE PENDING REQUEST
                // =============================================

                await connection.query(
                    `DELETE FROM message_requests
                     WHERE request_id = ?`,
                    [requestId]
                );

                await connection
                    .commit();

                setFeedback(
                    req,
                    "info",
                    "You can already message this user directly, so the old pending request was removed."
                );

                return res.redirect(
                    `/messages/${senderId}`
                );
            }

            // =================================================
            // VALIDATE STORED FIRST MESSAGE
            // =================================================

            if (
                typeof request.first_message !==
                    "string" ||
                !request.first_message.trim() ||
                request.first_message.trim().length >
                    MAX_MESSAGE_LENGTH
            ) {

                await connection.query(
                    `DELETE FROM message_requests
                     WHERE request_id = ?`,
                    [requestId]
                );

                await connection
                    .commit();

                setFeedback(
                    req,
                    "warning",
                    "This message request contained invalid message content and has been removed."
                );

                return res.redirect(
                    "/message-requests"
                );
            }

            const firstMessage =
                request.first_message
                    .trim();

            // =================================================
            // ACCEPT REQUEST
            // =================================================

            await connection.query(
                `UPDATE message_requests
                 SET status = 'accepted'

                 WHERE request_id = ?
                   AND receiver_id = ?`,
                [
                    requestId,
                    receiverId
                ]
            );

            // =================================================
            // REMOVE OTHER PENDING REQUESTS BETWEEN SAME USERS
            // =================================================

            await connection.query(
                `DELETE FROM message_requests

                 WHERE request_id != ?

                   AND LOWER(status) =
                       'pending'

                   AND
                   (
                        (
                            sender_id = ?
                            AND receiver_id = ?
                        )
                        OR
                        (
                            sender_id = ?
                            AND receiver_id = ?
                        )
                   )`,
                [
                    requestId,
                    senderId,
                    receiverId,
                    receiverId,
                    senderId
                ]
            );

            // =================================================
            // CREATE FIRST MESSAGE
            // =================================================

            await connection.query(
                `INSERT INTO messages
                 (
                    sender_id,
                    receiver_id,
                    message,
                    is_read
                 )
                 VALUES (?, ?, ?, FALSE)`,
                [
                    senderId,
                    receiverId,
                    firstMessage
                ]
            );

            // =================================================
            // NOTIFY ORIGINAL SENDER
            // =================================================

            await createNotification(
                senderId,
                `${
                    req.session.userName ||
                    "The user"
                } accepted your message request.`,
                `/messages/${receiverId}`,
                connection
            );

            // =================================================
            // COMMIT
            // =================================================

            await connection
                .commit();

            setFeedback(
                req,
                "success",
                "Message request accepted."
            );

            return res.redirect(
                `/messages/${senderId}`
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
                        "ACCEPT MESSAGE REQUEST ROLLBACK ERROR:",
                        rollbackError
                    );
                }
            }

            console.error(
                "ACCEPT MESSAGE REQUEST ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error accepting message request."
                );

        } finally {

            if (connection) {
                connection.release();
            }
        }
    }
);

// =====================================================
// REJECT MESSAGE REQUEST
// =====================================================

router.post(
    "/message-requests/:id/reject",
    requireLogin,
    async (req, res) => {

        let connection;

        try {

            const requestId =
                getNumericId(
                    req.params.id
                );

            const receiverId =
                getNumericId(
                    req.session.userId
                );

            if (!receiverId) {

                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            if (!requestId) {

                setFeedback(
                    req,
                    "warning",
                    "That message request could not be found."
                );

                return res.redirect(
                    "/message-requests"
                );
            }

            // =================================================
            // START TRANSACTION
            // =================================================

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
                        request_id,
                        sender_id,
                        receiver_id,
                        status

                     FROM message_requests

                     WHERE request_id = ?
                       AND receiver_id = ?

                     FOR UPDATE`,
                    [
                        requestId,
                        receiverId
                    ]
                );

            if (
                requestRows.length ===
                0
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "That message request could not be found or you do not have permission to manage it."
                );

                return res.redirect(
                    "/message-requests"
                );
            }

            const request =
                requestRows[0];

            const senderId =
                getNumericId(
                    request.sender_id
                );

            if (!senderId) {

                await connection.query(
                    `DELETE FROM message_requests
                     WHERE request_id = ?`,
                    [requestId]
                );

                await connection
                    .commit();

                setFeedback(
                    req,
                    "warning",
                    "This message request was invalid and has been removed."
                );

                return res.redirect(
                    "/message-requests"
                );
            }

            // =================================================
            // LOCK USER PAIR
            // =================================================

            await lockUserPair(
                connection,
                senderId,
                receiverId
            );

            // =================================================
            // STATUS CHECK
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
                    "This message request has already been processed."
                );

                return res.redirect(
                    "/message-requests"
                );
            }

            // =================================================
            // REJECT REQUEST
            // =================================================

            await connection.query(
                `UPDATE message_requests
                 SET status = 'rejected'

                 WHERE request_id = ?
                   AND receiver_id = ?`,
                [
                    requestId,
                    receiverId
                ]
            );

            // =================================================
            // NOTIFY ORIGINAL SENDER
            // =================================================

            await createNotification(
                senderId,
                `${
                    req.session.userName ||
                    "The user"
                } rejected your message request.`,
                `/messages/${receiverId}`,
                connection
            );

            await connection
                .commit();

            setFeedback(
                req,
                "success",
                "Message request rejected."
            );

            return res.redirect(
                "/message-requests"
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
                        "REJECT MESSAGE REQUEST ROLLBACK ERROR:",
                        rollbackError
                    );
                }
            }

            console.error(
                "REJECT MESSAGE REQUEST ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error rejecting message request."
                );

        } finally {

            if (connection) {
                connection.release();
            }
        }
    }
);

module.exports = router;