const express = require("express");
const db = require("../config/database");
const createNotification =
    require("../utils/createNotification");

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
            // GET PENDING REQUESTS FOR CURRENT USER
            // =================================================

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


            // =================================================
            // RENDER
            // =================================================

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


            // =================================================
            // VALIDATE SESSION
            // =================================================

            if (!receiverId) {

                req.session.destroy(
                    () => {}
                );


                return res.redirect(
                    "/login"
                );
            }


            // =================================================
            // VALIDATE REQUEST ID
            // =================================================

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
            // OWNERSHIP IS CHECKED IN SQL
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
                    request.sender_id,
                    request.receiver_id,
                    request.first_message
                ]
            );


            // =================================================
            // NOTIFY ORIGINAL SENDER
            // =================================================

            await createNotification(
                request.sender_id,
                `${
                    req.session.userName ||
                    "The user"
                } accepted your message request.`,
                `/messages/${receiverId}`,
                connection
            );


            // =================================================
            // COMMIT TRANSACTION
            // =================================================

            await connection
                .commit();


            setFeedback(
                req,
                "success",
                "Message request accepted."
            );


            return res.redirect(
                `/messages/${request.sender_id}`
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


            // =================================================
            // VALIDATE SESSION
            // =================================================

            if (!receiverId) {

                req.session.destroy(
                    () => {}
                );


                return res.redirect(
                    "/login"
                );
            }


            // =================================================
            // VALIDATE REQUEST ID
            // =================================================

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
            // OWNERSHIP IS CHECKED IN SQL
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
                request.sender_id,
                `${
                    req.session.userName ||
                    "The user"
                } rejected your message request.`,
                `/messages/${receiverId}`,
                connection
            );


            // =================================================
            // COMMIT TRANSACTION
            // =================================================

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