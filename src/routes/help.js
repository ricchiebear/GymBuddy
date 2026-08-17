const express = require("express");

const {
    rateLimit
} = require("express-rate-limit");

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
// SUPPORT TICKET RATE LIMIT
//
// Maximum:
// 5 support ticket submissions per logged-in user
// every 60 minutes.
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
// Must match support.pug exactly.
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
// Public so users can still access help if they
// are having trouble logging into GymBuddy.
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
            // GET USER EMAIL
            // =================================================

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

            // =================================================
            // RENDER SUPPORT FORM
            // =================================================

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
        try {
            const userId =
                getNumericId(
                    req.session.userId
                );

            const issueType =
                req.body.issue_type
                    ?.trim();

            const message =
                req.body.message
                    ?.trim();

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
                1500
            ) {
                setFeedback(
                    req,
                    "warning",
                    "Your support message must be 1500 characters or fewer."
                );

                return res.redirect(
                    "/support"
                );
            }

            // =================================================
            // GET ACCOUNT EMAIL FROM DATABASE
            // Do not trust browser-submitted email data.
            // =================================================

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

            const accountEmail =
                users[0].email;

            // =================================================
            // CREATE SUPPORT TICKET
            // =================================================

            await db.query(
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

            // =================================================
            // SUCCESS FEEDBACK
            // =================================================

            setFeedback(
                req,
                "success",
                "Your support ticket has been submitted successfully."
            );

            return res.redirect(
                "/my-support-tickets"
            );

        } catch (error) {
            console.error(
                "SUBMIT SUPPORT TICKET ERROR:",
                error
            );

            return res
                .status(500)
                .send(
                    "Error submitting support ticket."
                );
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
            // GET CURRENT USER'S TICKETS
            // =================================================

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

            // =================================================
            // RENDER
            // =================================================

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
            // VALIDATE TICKET ID
            // =================================================

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

            // =================================================
            // FIND USER'S TICKET ONLY
            // =================================================

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

            // =================================================
            // RENDER DETAILS
            // =================================================

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