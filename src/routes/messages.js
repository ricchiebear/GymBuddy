const express = require("express");
const rateLimit = require("express-rate-limit");

const db = require("../config/database");
const formatDate = require("../utils/formatDate");
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
// MESSAGE RATE LIMITER
//
// Protects users from message flooding.
//
// Logged-in users are limited using their GymBuddy
// account ID rather than only their IP address.
// =====================================================

const messageRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,

    standardHeaders: true,
    legacyHeaders: false,

    keyGenerator: (req) => {
        return `user:${req.session.userId}`;
    },

    handler: (req, res) => {
        const receiverId =
            getNumericId(
                req.params.userId
            );

        setFeedback(
            req,
            "warning",
            "You're sending messages too quickly. Please wait a moment before sending another message."
        );

        if (receiverId) {
            return res.redirect(
                `/messages/${receiverId}`
            );
        }

        return res.redirect(
            "/messages"
        );
    }
});

// =====================================================
// MESSAGE REQUEST RATE LIMITER
//
// Prevents one account from rapidly sending message
// requests to large numbers of GymBuddy users.
// =====================================================

const messageRequestRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,

    standardHeaders: true,
    legacyHeaders: false,

    keyGenerator: (req) => {
        return `user:${req.session.userId}`;
    },

    handler: (req, res) => {
        const receiverId =
            getNumericId(
                req.params.userId
            );

        setFeedback(
            req,
            "warning",
            "You've sent several message requests recently. Please wait before sending more."
        );

        if (receiverId) {
            return res.redirect(
                `/messages/${receiverId}`
            );
        }

        return res.redirect(
            "/messages"
        );
    }
});

// =====================================================
// CHECK WHETHER TWO USERS CAN MESSAGE DIRECTLY
// =====================================================

async function usersCanMessageDirectly(
    userOneId,
    userTwoId,
    queryRunner = db
) {
    // =================================================
    // SHARED WORKOUT RELATIONSHIP
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
    // ACCEPTED MESSAGE REQUEST
    // =================================================

    const [acceptedRequestRows] =
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
        acceptedRequestRows.length >
        0
    );
}

// =====================================================
// CHECK MESSAGE REQUEST RATE LIMIT
//
// We only apply the message-request limiter when the
// users cannot already message each other directly.
// This means normal private conversations do not consume
// the message-request allowance.
// =====================================================

async function applyMessageProtection(
    req,
    res,
    next
) {
    try {
        const senderId =
            getNumericId(
                req.session.userId
            );

        const receiverId =
            getNumericId(
                req.params.userId
            );

        if (
            !senderId ||
            !receiverId
        ) {
            return next();
        }

        const canMessage =
            await usersCanMessageDirectly(
                senderId,
                receiverId
            );

        if (canMessage) {
            return messageRateLimiter(
                req,
                res,
                next
            );
        }

        return messageRequestRateLimiter(
            req,
            res,
            next
        );

    } catch (error) {
        console.error(
            "MESSAGE PROTECTION ERROR:",
            error
        );

        return res
            .status(500)
            .send(
                "Unable to process message request."
            );
    }
}

// =====================================================
// CONVERSATION LIST
// =====================================================

router.get(
    "/messages",
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
            // GET MESSAGE HISTORY
            // =================================================

            const [messageRows] =
                await db.query(
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

                     WHERE
                        m.sender_id = ?
                        OR
                        m.receiver_id = ?

                     ORDER BY
                        m.created_at DESC`,
                    [
                        userId,
                        userId,
                        userId,
                        userId
                    ]
                );

            // =================================================
            // KEEP LATEST MESSAGE PER CONVERSATION
            // =================================================

            const conversationMap =
                new Map();

            for (
                const message
                of messageRows
            ) {
                const partnerId =
                    getNumericId(
                        message.partner_id
                    );

                if (
                    !partnerId ||
                    conversationMap.has(
                        partnerId
                    )
                ) {
                    continue;
                }

                conversationMap.set(
                    partnerId,
                    {
                        ...message,

                        displayTime:
                            formatDate(
                                message.created_at
                            )
                    }
                );
            }

            const conversations =
                Array.from(
                    conversationMap.values()
                );

            // =================================================
            // USERS AVAILABLE TO START A CONVERSATION WITH
            // =================================================

            const [users] =
                await db.query(
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

            // =================================================
            // PENDING MESSAGE REQUEST COUNT
            // =================================================

            const [[pendingResult]] =
                await db.query(
                    `SELECT
                        COUNT(*) AS total
                     FROM message_requests
                     WHERE receiver_id = ?
                       AND LOWER(status) =
                           'pending'`,
                    [userId]
                );

            // =================================================
            // RENDER
            // =================================================

            return res.render(
                "messages",
                {
                    title:
                        "Messages",

                    conversations,

                    users,

                    pendingRequestCount:
                        Number(
                            pendingResult.total ||
                            0
                        )
                }
            );

        } catch (error) {
            console.error(
                "MESSAGES PAGE ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading messages."
                );
        }
    }
);

// =====================================================
// VIEW ONE PRIVATE CONVERSATION
// =====================================================

router.get(
    "/messages/:userId",
    requireLogin,
    async (req, res) => {
        try {
            const currentUserId =
                getNumericId(
                    req.session.userId
                );

            const partnerId =
                getNumericId(
                    req.params.userId
                );

            // =================================================
            // VALIDATE SESSION
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
            // VALIDATE CHAT PARTNER
            // =================================================

            if (!partnerId) {
                setFeedback(
                    req,
                    "warning",
                    "That chat partner could not be found."
                );

                return res.redirect(
                    "/messages"
                );
            }

            if (
                currentUserId ===
                partnerId
            ) {
                setFeedback(
                    req,
                    "warning",
                    "You cannot message yourself."
                );

                return res.redirect(
                    "/messages"
                );
            }

            // =================================================
            // FIND CHAT PARTNER
            // =================================================

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

            if (
                partnerRows.length ===
                0
            ) {
                setFeedback(
                    req,
                    "warning",
                    "That GymBuddy user could not be found."
                );

                return res.redirect(
                    "/messages"
                );
            }

            const partner =
                partnerRows[0];

            // =================================================
            // CHECK DIRECT MESSAGE PERMISSION
            // =================================================

            const canMessage =
                await usersCanMessageDirectly(
                    currentUserId,
                    partnerId
                );

            let requestStatus =
                null;

            // =================================================
            // FIND CURRENT MESSAGE REQUEST STATUS
            // =================================================

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
                         ORDER BY
                            created_at DESC
                         LIMIT 1`,
                        [
                            currentUserId,
                            partnerId,
                            partnerId,
                            currentUserId
                        ]
                    );

                if (
                    requestRows.length >
                    0
                ) {
                    requestStatus =
                        String(
                            requestRows[0]
                                .status ||
                            ""
                        ).toLowerCase();
                }
            }

            let messages = [];

            // =================================================
            // LOAD PRIVATE MESSAGES
            // =================================================

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

                messages =
                    messageRows.map(
                        (message) => ({
                            ...message,

                            displayTime:
                                formatDate(
                                    message.created_at
                                )
                        })
                    );

                // =================================================
                // MARK RECEIVED MESSAGES AS READ
                // =================================================

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

            // =================================================
            // RENDER PRIVATE CHAT
            // =================================================

            return res.render(
                "private-chat",
                {
                    title:
                        `${partner.first_name} ${partner.last_name}`,

                    partner,

                    messages,

                    canMessage,

                    requestStatus,

                    currentUserId
                }
            );

        } catch (error) {
            console.error(
                "PRIVATE CHAT PAGE ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading private conversation."
                );
        }
    }
);

// =====================================================
// SEND MESSAGE OR CREATE MESSAGE REQUEST
// =====================================================

router.post(
    "/messages/:userId",
    requireLogin,
    applyMessageProtection,
    async (req, res) => {
        let connection;

        try {
            const senderId =
                getNumericId(
                    req.session.userId
                );

            const receiverId =
                getNumericId(
                    req.params.userId
                );

            const message =
                req.body.message
                    ?.trim();

            // =================================================
            // VALIDATE SESSION
            // =================================================

            if (!senderId) {
                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            // =================================================
            // VALIDATE RECEIVER
            // =================================================

            if (!receiverId) {
                setFeedback(
                    req,
                    "warning",
                    "That message receiver could not be found."
                );

                return res.redirect(
                    "/messages"
                );
            }

            if (
                senderId ===
                receiverId
            ) {
                setFeedback(
                    req,
                    "warning",
                    "You cannot message yourself."
                );

                return res.redirect(
                    "/messages"
                );
            }

            // =================================================
            // VALIDATE MESSAGE
            // =================================================

            if (!message) {
                setFeedback(
                    req,
                    "warning",
                    "Please enter a message."
                );

                return res.redirect(
                    `/messages/${receiverId}`
                );
            }

            if (
                message.length >
                MAX_MESSAGE_LENGTH
            ) {
                setFeedback(
                    req,
                    "warning",
                    `Messages cannot be longer than ${MAX_MESSAGE_LENGTH} characters.`
                );

                return res.redirect(
                    `/messages/${receiverId}`
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
            // CONFIRM RECEIVER EXISTS
            // =================================================

            const [receiverRows] =
                await connection.query(
                    `SELECT
                        user_id,
                        first_name,
                        last_name
                     FROM users
                     WHERE user_id = ?
                     LIMIT 1`,
                    [receiverId]
                );

            if (
                receiverRows.length ===
                0
            ) {
                await connection
                    .rollback();

                setFeedback(
                    req,
                    "warning",
                    "That GymBuddy user could not be found."
                );

                return res.redirect(
                    "/messages"
                );
            }

            // =================================================
            // CHECK DIRECT MESSAGE PERMISSION
            // =================================================

            const canMessage =
                await usersCanMessageDirectly(
                    senderId,
                    receiverId,
                    connection
                );

            const senderName =
                req.session.userName ||
                "Someone";

            // =================================================
            // DIRECT MESSAGE
            // =================================================

            if (canMessage) {
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
                        message
                    ]
                );

                await createNotification(
                    receiverId,
                    `${senderName} sent you a private message.`,
                    `/messages/${senderId}`,
                    connection
                );

                await connection
                    .commit();

                return res.redirect(
                    `/messages/${receiverId}`
                );
            }

            // =================================================
            // CHECK EXISTING MESSAGE REQUEST
            // =================================================

            const [existingRequestRows] =
                await connection.query(
                    `SELECT
                        request_id,
                        status
                     FROM message_requests
                     WHERE sender_id = ?
                       AND receiver_id = ?
                     ORDER BY
                        created_at DESC
                     LIMIT 1`,
                    [
                        senderId,
                        receiverId
                    ]
                );

            if (
                existingRequestRows.length >
                0
            ) {
                const existingStatus =
                    String(
                        existingRequestRows[0]
                            .status ||
                        ""
                    ).toLowerCase();

                // =============================================
                // PENDING REQUEST
                // =============================================

                if (
                    existingStatus ===
                    "pending"
                ) {
                    await connection
                        .rollback();

                    setFeedback(
                        req,
                        "warning",
                        "You already have a pending message request for this user."
                    );

                    return res.redirect(
                        `/messages/${receiverId}`
                    );
                }

                // =============================================
                // ACCEPTED REQUEST
                // =============================================

                if (
                    existingStatus ===
                    "accepted"
                ) {
                    await connection
                        .rollback();

                    setFeedback(
                        req,
                        "info",
                        "Your message request has already been accepted. You can message this user directly."
                    );

                    return res.redirect(
                        `/messages/${receiverId}`
                    );
                }

                // =============================================
                // REJECTED REQUEST
                // =============================================

                if (
                    existingStatus ===
                    "rejected"
                ) {
                    await connection
                        .rollback();

                    setFeedback(
                        req,
                        "warning",
                        "Your previous message request to this user was rejected."
                    );

                    return res.redirect(
                        `/messages/${receiverId}`
                    );
                }
            }

            // =================================================
            // CHECK REVERSE PENDING REQUEST
            // =================================================

            const [reverseRequestRows] =
                await connection.query(
                    `SELECT
                        request_id
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
                reverseRequestRows.length >
                0
            ) {
                await connection
                    .rollback();

                setFeedback(
                    req,
                    "info",
                    "This user has already sent you a message request. Open Message Requests to respond."
                );

                return res.redirect(
                    "/message-requests"
                );
            }

            // =================================================
            // CREATE MESSAGE REQUEST
            // =================================================

            await connection.query(
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
                `${senderName} sent you a message request.`,
                "/message-requests",
                connection
            );

            await connection
                .commit();

            setFeedback(
                req,
                "success",
                "Message request sent successfully."
            );

            return res.redirect(
                `/messages/${receiverId}`
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
                        "MESSAGE ROLLBACK ERROR:",
                        rollbackError
                    );
                }
            }

            console.error(
                "SEND PRIVATE MESSAGE ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error sending private message."
                );

        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
);

module.exports = router;