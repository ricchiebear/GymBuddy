const express = require("express");
const db = require("../config/database");
const formatDate = require("../utils/formatDate");
const createNotification =
    require("../utils/createNotification");

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
// CHECK WHETHER TWO USERS CAN MESSAGE DIRECTLY
// --------------------------------------------------

async function usersCanMessageDirectly(
    userOneId,
    userTwoId
) {
    // Check whether one user created a workout
    // that the other user joined as an accepted participant.
    const [sharedWorkoutRows] = await db.query(
        `SELECT w.workout_id
         FROM workouts w
         INNER JOIN workout_participants wp
            ON w.workout_id = wp.workout_id
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

    if (sharedWorkoutRows.length > 0) {
        return true;
    }

    // Check whether a message request between
    // the users was previously accepted.
    const [acceptedRequestRows] = await db.query(
        `SELECT request_id
         FROM message_requests
         WHERE LOWER(status) = 'accepted'
           AND (
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

    return acceptedRequestRows.length > 0;
}

// --------------------------------------------------
// CONVERSATION LIST
// --------------------------------------------------

router.get(
    "/messages",
    requireLogin,
    async (req, res) => {
        try {
            const userId = Number(
                req.session.userId
            );

            /*
             * Load every private message involving
             * the logged-in user.
             *
             * The CASE expression identifies the
             * other person in each conversation.
             */
            const [messageRows] = await db.query(
                `SELECT
                    m.message_id,
                    m.sender_id,
                    m.receiver_id,
                    m.message,
                    m.is_read,
                    m.created_at,

                    CASE
                        WHEN m.sender_id = ?
                        THEN m.receiver_id
                        ELSE m.sender_id
                    END AS partner_id,

                    u.first_name
                        AS partner_first_name,

                    u.last_name
                        AS partner_last_name,

                    u.profile_picture
                        AS partner_profile_picture

                 FROM messages m

                 INNER JOIN users u
                    ON u.user_id =
                        CASE
                            WHEN m.sender_id = ?
                            THEN m.receiver_id
                            ELSE m.sender_id
                        END

                 WHERE m.sender_id = ?
                    OR m.receiver_id = ?

                 ORDER BY m.created_at DESC`,
                [
                    userId,
                    userId,
                    userId,
                    userId
                ]
            );

            /*
             * The query returns every message.
             * This Map keeps only the newest message
             * for each conversation partner.
             */
            const conversationMap = new Map();

            for (const message of messageRows) {
                if (
                    !conversationMap.has(
                        message.partner_id
                    )
                ) {
                    conversationMap.set(
                        message.partner_id,
                        {
                            ...message,
                            displayTime: formatDate(
                                message.created_at
                            )
                        }
                    );
                }
            }

            const conversations =
                Array.from(
                    conversationMap.values()
                );

            // Load users who can potentially
            // be contacted.
            const [users] = await db.query(
                `SELECT
                    user_id,
                    first_name,
                    last_name,
                    profile_picture
                 FROM users
                 WHERE user_id != ?
                 ORDER BY
                    first_name ASC,
                    last_name ASC`,
                [userId]
            );

            // Count pending incoming message requests.
            const [[pendingResult]] =
                await db.query(
                    `SELECT COUNT(*) AS total
                     FROM message_requests
                     WHERE receiver_id = ?
                       AND LOWER(status) =
                           'pending'`,
                    [userId]
                );

            res.render("messages", {
                title: "Messages",
                conversations,
                users,
                pendingRequestCount:
                    pendingResult.total
            });
        } catch (error) {
            console.error(
                "MESSAGES PAGE ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error loading messages."
            );
        }
    }
);

// --------------------------------------------------
// VIEW ONE PRIVATE CONVERSATION
// --------------------------------------------------

router.get(
    "/messages/:userId",
    requireLogin,
    async (req, res) => {
        try {
            const currentUserId = Number(
                req.session.userId
            );

            const partnerId = Number(
                req.params.userId
            );

            if (!partnerId) {
                return res.status(400).send(
                    "Chat partner is missing."
                );
            }

            if (currentUserId === partnerId) {
                return res.status(400).send(
                    "You cannot message yourself."
                );
            }

            const [partnerRows] =
                await db.query(
                    `SELECT
                        user_id,
                        first_name,
                        last_name,
                        profile_picture
                     FROM users
                     WHERE user_id = ?
                     LIMIT 1`,
                    [partnerId]
                );

            if (partnerRows.length === 0) {
                return res.status(404).send(
                    "User not found."
                );
            }

            const partner = partnerRows[0];

            const canMessage =
                await usersCanMessageDirectly(
                    currentUserId,
                    partnerId
                );

            let requestStatus = null;

            /*
             * If they cannot message directly,
             * check whether a message request exists
             * in either direction.
             */
            if (!canMessage) {
                const [requestRows] =
                    await db.query(
                        `SELECT
                            request_id,
                            sender_id,
                            receiver_id,
                            status
                         FROM message_requests
                         WHERE
                            (
                                sender_id = ?
                                AND receiver_id = ?
                            )
                            OR
                            (
                                sender_id = ?
                                AND receiver_id = ?
                            )
                         ORDER BY created_at DESC
                         LIMIT 1`,
                        [
                            currentUserId,
                            partnerId,
                            partnerId,
                            currentUserId
                        ]
                    );

                if (requestRows.length > 0) {
                    requestStatus =
                        requestRows[0].status;
                }
            }

            let messages = [];

            if (canMessage) {
                const [messageRows] =
                    await db.query(
                        `SELECT
                            m.message_id,
                            m.sender_id,
                            m.receiver_id,
                            m.message,
                            m.is_read,
                            m.created_at,

                            u.first_name
                                AS sender_first_name,

                            u.last_name
                                AS sender_last_name,

                            u.profile_picture
                                AS sender_profile_picture

                         FROM messages m

                         INNER JOIN users u
                            ON m.sender_id =
                               u.user_id

                         WHERE
                            (
                                m.sender_id = ?
                                AND m.receiver_id = ?
                            )
                            OR
                            (
                                m.sender_id = ?
                                AND m.receiver_id = ?
                            )

                         ORDER BY
                            m.created_at ASC`,
                        [
                            currentUserId,
                            partnerId,
                            partnerId,
                            currentUserId
                        ]
                    );

                messages = messageRows.map(
                    (message) => ({
                        ...message,
                        displayTime: formatDate(
                            message.created_at
                        )
                    })
                );

                // Mark incoming messages as read.
                await db.query(
                    `UPDATE messages
                     SET is_read = TRUE
                     WHERE sender_id = ?
                       AND receiver_id = ?
                       AND is_read = FALSE`,
                    [
                        partnerId,
                        currentUserId
                    ]
                );
            }

            res.render("private-chat", {
                title:
                    `${partner.first_name} ${partner.last_name}`,
                partner,
                messages,
                canMessage,
                requestStatus,
                currentUserId
            });
        } catch (error) {
            console.error(
                "PRIVATE CHAT PAGE ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error loading private conversation."
            );
        }
    }
);

// --------------------------------------------------
// SEND MESSAGE OR CREATE MESSAGE REQUEST
// --------------------------------------------------

router.post(
    "/messages/:userId",
    requireLogin,
    async (req, res) => {
        try {
            const senderId = Number(
                req.session.userId
            );

            const receiverId = Number(
                req.params.userId
            );

            const message =
                req.body.message?.trim();

            if (!receiverId) {
                return res.status(400).send(
                    "Message receiver is missing."
                );
            }

            if (senderId === receiverId) {
                return res.status(400).send(
                    "You cannot message yourself."
                );
            }

            if (!message) {
                return res.status(400).send(
                    "Please enter a message."
                );
            }

            const [receiverRows] =
                await db.query(
                    `SELECT
                        user_id,
                        first_name,
                        last_name
                     FROM users
                     WHERE user_id = ?
                     LIMIT 1`,
                    [receiverId]
                );

            if (receiverRows.length === 0) {
                return res.status(404).send(
                    "Receiver not found."
                );
            }

            const canMessage =
                await usersCanMessageDirectly(
                    senderId,
                    receiverId
                );

            const senderName =
                req.session.userName ||
                "Someone";

            // Matched users can message directly.
            if (canMessage) {
                await db.query(
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
                        message
                    ]
                );

                await createNotification(
                    receiverId,
                    `${senderName} sent you a private message.`
                );

                return res.redirect(
                    `/messages/${receiverId}`
                );
            }

            /*
             * The users are not matched.
             * Check whether the sender already
             * created a request.
             */
            const [existingRequestRows] =
                await db.query(
                    `SELECT
                        request_id,
                        status
                     FROM message_requests
                     WHERE sender_id = ?
                       AND receiver_id = ?
                     ORDER BY created_at DESC
                     LIMIT 1`,
                    [
                        senderId,
                        receiverId
                    ]
                );

            if (
                existingRequestRows.length > 0
            ) {
                const existingStatus =
                    String(
                        existingRequestRows[0]
                            .status
                    ).toLowerCase();

                if (
                    existingStatus === "pending"
                ) {
                    return res.status(400).send(
                        "You already have a pending message request for this user."
                    );
                }

                if (
                    existingStatus === "rejected"
                ) {
                    return res.status(403).send(
                        "Your previous message request was rejected."
                    );
                }
            }

            /*
             * Check whether the other person
             * already sent a pending request.
             */
            const [reverseRequestRows] =
                await db.query(
                    `SELECT request_id
                     FROM message_requests
                     WHERE sender_id = ?
                       AND receiver_id = ?
                       AND LOWER(status) =
                           'pending'
                     LIMIT 1`,
                    [
                        receiverId,
                        senderId
                    ]
                );

            if (
                reverseRequestRows.length > 0
            ) {
                return res.status(400).send(
                    "This user has already sent you a message request. Open Message Requests to respond."
                );
            }

            // Create the first message request.
            await db.query(
                `INSERT INTO message_requests
                 (
                    sender_id,
                    receiver_id,
                    first_message,
                    status
                 )
                 VALUES (?, ?, ?, 'pending')`,
                [
                    senderId,
                    receiverId,
                    message
                ]
            );

            await createNotification(
                receiverId,
                `${senderName} sent you a message request.`
            );

            res.redirect("/messages");
        } catch (error) {
            console.error(
                "SEND PRIVATE MESSAGE ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error sending private message."
            );
        }
    }
);

module.exports = router;