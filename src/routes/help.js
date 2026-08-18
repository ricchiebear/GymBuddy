const express = require("express");

const {
    rateLimit
} = require("express-rate-limit");

const db = require("../config/database");

const router = express.Router();

// =====================================================
// CONFIGURATION
// =====================================================

const MAX_SUPPORT_MESSAGE_LENGTH = 1500;

// Prevent an identical open ticket from being created
// repeatedly within this number of minutes.
const DUPLICATE_TICKET_WINDOW_MINUTES =
    10;

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
// SUPPORT TICKET RATE LIMIT
// =====================================================

const supportTicketLimiter =
    rateLimit({
        windowMs:
            60 * 60 * 1000,

        limit:
            5,

        standardHeaders:
            "draft-8",

        legacyHeaders:
            false,

        keyGenerator:
            (req) => {
                return (
                    `gymbuddy-support-user-${req.session.userId}`
                );
            },

        handler:
            (req, res) => {

                setFeedback(
                    req,
                    "warning",
                    "You've submitted several support requests recently. Please wait before creating another ticket."
                );

                return res.redirect(
                    "/support"
                );
            }
    });

// =====================================================
// ALLOWED SUPPORT ISSUE TYPES
// =====================================================

const allowedIssueTypes = [
    "Login Problem",
    "Registration Problem",
    "Password Problem",
    "Profile Problem",
    "Workout Creation Problem",
    "Workout Request Problem",
    "Messaging Problem",
    "Notification Problem",
    "Image Upload Problem",
    "Account Access Problem",
    "Performance Problem",
    "Bug Report",
    "Feature Request",
    "Other"
];

// =====================================================
// HELP CENTRE
// =====================================================

router.get(
    "/help",
    (req, res) => {

        return res.render(
            "help",
            {
                title:
                    "Help Centre"
            }
        );
    }
);

// =====================================================
// SHOW SUPPORT FORM
// =====================================================

router.get(
    "/support",
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

            const [users] =
                await db.query(
                    `SELECT
                        email
                     FROM users
                     WHERE user_id = ?
                     LIMIT 1`,
                    [userId]
                );

            if (
                users.length ===
                0
            ) {

                req.session.destroy(
                    () => {}
                );

                return res.redirect(
                    "/login"
                );
            }

            return res.render(
                "support",
                {
                    title:
                        "Help and Support",

                    email:
                        users[0].email
                }
            );

        } catch (error) {

            console.error(
                "SUPPORT PAGE ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading support page."
                );
        }
    }
);

// =====================================================
// SUBMIT SUPPORT TICKET
// =====================================================

router.post(
    "/support",
    requireLogin,
    supportTicketLimiter,
    async (req, res) => {

        let connection;

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

            // =================================================
            // VALIDATE BODY TYPES
            // =================================================

            if (
                !isStringInput(
                    req.body.issue_type
                ) ||
                !isStringInput(
                    req.body.message
                )
            ) {

                setFeedback(
                    req,
                    "warning",
                    "Invalid support information was submitted."
                );

                return res.redirect(
                    "/support"
                );
            }

            const issueType =
                req.body.issue_type
                    .trim();

            const message =
                req.body.message
                    .trim();

            // =================================================
            // VALIDATE REQUIRED FIELDS
            // =================================================

            if (
                !issueType ||
                !message
            ) {

                setFeedback(
                    req,
                    "warning",
                    "Please complete all support fields."
                );

                return res.redirect(
                    "/support"
                );
            }

            // =================================================
            // VALIDATE ISSUE TYPE
            // =================================================

            if (
                !allowedIssueTypes.includes(
                    issueType
                )
            ) {

                setFeedback(
                    req,
                    "warning",
                    "Please select a valid support issue type."
                );

                return res.redirect(
                    "/support"
                );
            }

            // =================================================
            // VALIDATE MESSAGE LENGTH
            // =================================================

            if (
                message.length >
                MAX_SUPPORT_MESSAGE_LENGTH
            ) {

                setFeedback(
                    req,
                    "warning",
                    `Your support message must be ${MAX_SUPPORT_MESSAGE_LENGTH} characters or fewer.`
                );

                return res.redirect(
                    "/support"
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
            // LOCK CURRENT USER + GET EMAIL
            // =================================================

            const [users] =
                await connection.query(
                    `SELECT
                        email
                     FROM users
                     WHERE user_id = ?
                     FOR UPDATE`,
                    [userId]
                );

            if (
                users.length ===
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

            const accountEmail =
                users[0].email;

            // =================================================
            // DUPLICATE OPEN TICKET CHECK
            //
            // Prevent accidental double-click submissions
            // creating the exact same ticket repeatedly.
            // =================================================

            const [existingTickets] =
                await connection.query(
                    `SELECT
                        ticket_id
                     FROM support_tickets
                     WHERE user_id = ?
                       AND issue_type = ?
                       AND message = ?
                       AND LOWER(status) = 'open'
                       AND created_at >=
                           DATE_SUB(
                               NOW(),
                               INTERVAL ? MINUTE
                           )
                     ORDER BY
                        created_at DESC
                     LIMIT 1
                     FOR UPDATE`,
                    [
                        userId,
                        issueType,
                        message,
                        DUPLICATE_TICKET_WINDOW_MINUTES
                    ]
                );

            if (
                existingTickets.length >
                0
            ) {

                await connection
                    .rollback();

                setFeedback(
                    req,
                    "info",
                    "You already submitted this support request recently."
                );

                return res.redirect(
                    `/support-tickets/${existingTickets[0].ticket_id}`
                );
            }

            // =================================================
            // CREATE SUPPORT TICKET
            // =================================================

            const [result] =
                await connection.query(
                    `INSERT INTO support_tickets
                     (
                        user_id,
                        email,
                        issue_type,
                        message,
                        status
                     )
                     VALUES (?, ?, ?, ?, 'open')`,
                    [
                        userId,
                        accountEmail,
                        issueType,
                        message
                    ]
                );

            await connection
                .commit();

            setFeedback(
                req,
                "success",
                "Your support ticket has been submitted successfully."
            );

            if (
                result.insertId
            ) {

                return res.redirect(
                    `/support-tickets/${result.insertId}`
                );
            }

            return res.redirect(
                "/my-support-tickets"
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
                        "SUPPORT TICKET ROLLBACK ERROR:",
                        rollbackError
                    );
                }
            }

            console.error(
                "SUBMIT SUPPORT TICKET ERROR:",
                error
            );

            setFeedback(
                req,
                "error",
                "Something went wrong while submitting your support ticket."
            );

            return res.redirect(
                "/support"
            );

        } finally {

            if (connection) {
                connection.release();
            }
        }
    }
);

// =====================================================
// VIEW LOGGED-IN USER'S SUPPORT TICKETS
// =====================================================

router.get(
    "/my-support-tickets",
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

            const [tickets] =
                await db.query(
                    `SELECT
                        ticket_id,
                        email,
                        issue_type,
                        message,
                        status,
                        created_at

                     FROM support_tickets

                     WHERE user_id = ?

                     ORDER BY
                        created_at DESC`,
                    [userId]
                );

            return res.render(
                "my-support-tickets",
                {
                    title:
                        "My Support Tickets",

                    tickets
                }
            );

        } catch (error) {

            console.error(
                "MY SUPPORT TICKETS ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading support tickets."
                );
        }
    }
);

// =====================================================
// VIEW ONE SUPPORT TICKET
// =====================================================

router.get(
    "/support-tickets/:id",
    requireLogin,
    async (req, res) => {

        try {

            const ticketId =
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

            if (!ticketId) {

                setFeedback(
                    req,
                    "warning",
                    "That support ticket could not be found."
                );

                return res.redirect(
                    "/my-support-tickets"
                );
            }

            const [tickets] =
                await db.query(
                    `SELECT
                        ticket_id,
                        email,
                        issue_type,
                        message,
                        status,
                        created_at

                     FROM support_tickets

                     WHERE ticket_id = ?
                       AND user_id = ?

                     LIMIT 1`,
                    [
                        ticketId,
                        userId
                    ]
                );

            if (
                tickets.length ===
                0
            ) {

                setFeedback(
                    req,
                    "warning",
                    "That support ticket could not be found or you do not have permission to view it."
                );

                return res.redirect(
                    "/my-support-tickets"
                );
            }

            return res.render(
                "support-ticket-details",
                {
                    title:
                        `Support Ticket #${ticketId}`,

                    ticket:
                        tickets[0]
                }
            );

        } catch (error) {

            console.error(
                "SUPPORT TICKET DETAILS ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error loading support ticket."
                );
        }
    }
);

module.exports = router;