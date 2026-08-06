const express = require("express");
const db = require("../config/database");
const createNotification = require("../utils/createNotification");

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
// VIEW INCOMING MESSAGE REQUESTS
// --------------------------------------------------

router.get(
    "/message-requests",
    requireLogin,
    async (req, res) => {
        try {
            const userId =
                Number(req.session.userId);

            const [requests] = await db.query(
                `SELECT
                    mr.request_id,
                    mr.sender_id,
                    mr.receiver_id,
                    mr.first_message,
                    mr.status,
                    mr.created_at,
                    u.first_name AS sender_first_name,
                    u.last_name AS sender_last_name,
                    u.profile_picture AS sender_profile_picture
                 FROM message_requests mr
                 INNER JOIN users u
                    ON mr.sender_id = u.user_id
                 WHERE mr.receiver_id = ?
                   AND LOWER(mr.status) = 'pending'
                 ORDER BY mr.created_at DESC`,
                [userId]
            );

            res.render("message-requests", {
                title: "Message Requests",
                requests
            });
        } catch (error) {
            console.error(
                "MESSAGE REQUESTS PAGE ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error loading message requests."
            );
        }
    }
);

// --------------------------------------------------
// ACCEPT MESSAGE REQUEST
// --------------------------------------------------

router.post(
    "/message-requests/:id/accept",
    requireLogin,
    async (req, res) => {
        let connection;

        try {
            const requestId =
                Number(req.params.id);

            const receiverId =
                Number(req.session.userId);

            if (!requestId) {
                return res.status(400).send(
                    "Message request ID is missing."
                );
            }

            connection =
                await db.getConnection();

            await connection.beginTransaction();

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
                     FOR UPDATE`,
                    [requestId]
                );

            if (requestRows.length === 0) {
                await connection.rollback();

                return res.status(404).send(
                    "Message request not found."
                );
            }

            const request = requestRows[0];

            if (
                Number(request.receiver_id) !==
                receiverId
            ) {
                await connection.rollback();

                return res.status(403).send(
                    "You cannot manage this message request."
                );
            }

            if (
                String(request.status).toLowerCase() !==
                "pending"
            ) {
                await connection.rollback();

                return res.status(400).send(
                    "This message request has already been processed."
                );
            }

            await connection.query(
                `UPDATE message_requests
                 SET status = 'accepted'
                 WHERE request_id = ?`,
                [requestId]
            );

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

            await createNotification(
                request.sender_id,
                `${
                    req.session.userName ||
                    "The user"
                } accepted your message request.`,
                connection
            );

            await connection.commit();

            res.redirect(
                `/messages/${request.sender_id}`
            );
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }

            console.error(
                "ACCEPT MESSAGE REQUEST ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error accepting message request."
            );
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
);

// --------------------------------------------------
// REJECT MESSAGE REQUEST
// --------------------------------------------------

router.post(
    "/message-requests/:id/reject",
    requireLogin,
    async (req, res) => {
        try {
            const requestId =
                Number(req.params.id);

            const receiverId =
                Number(req.session.userId);

            const [requestRows] = await db.query(
                `SELECT
                    request_id,
                    sender_id,
                    receiver_id,
                    status
                 FROM message_requests
                 WHERE request_id = ?`,
                [requestId]
            );

            if (requestRows.length === 0) {
                return res.status(404).send(
                    "Message request not found."
                );
            }

            const request = requestRows[0];

            if (
                Number(request.receiver_id) !==
                receiverId
            ) {
                return res.status(403).send(
                    "You cannot manage this message request."
                );
            }

            if (
                String(request.status).toLowerCase() !==
                "pending"
            ) {
                return res.status(400).send(
                    "This message request has already been processed."
                );
            }

            await db.query(
                `UPDATE message_requests
                 SET status = 'rejected'
                 WHERE request_id = ?`,
                [requestId]
            );

            await createNotification(
                request.sender_id,
                `${
                    req.session.userName ||
                    "The user"
                } rejected your message request.`
            );

            res.redirect("/message-requests");
        } catch (error) {
            console.error(
                "REJECT MESSAGE REQUEST ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error rejecting message request."
            );
        }
    }
);

module.exports = router;