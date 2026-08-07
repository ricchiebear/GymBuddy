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
// HELP CENTRE
//=====================================================

/*
 * The Help Centre is public.
 *
 * This means users can read common help information
 * even if they are having problems logging in.
 *
 * Support ticket submission still requires login.
 */

router.get(
    "/help",
    (req, res) => {
        res.render("help", {
            title: "Help Centre"
        });
    }
);

//=====================================================
// SHOW SUPPORT FORM
//=====================================================

router.get(
    "/support",
    requireLogin,
    async (req, res) => {
        try {
            const userId =
                Number(req.session.userId);

            const [users] = await db.query(
                `SELECT email
                 FROM users
                 WHERE user_id = ?
                 LIMIT 1`,
                [userId]
            );

            if (users.length === 0) {
                return res.status(404).send(
                    "User not found."
                );
            }

            res.render("support", {
                title: "Help and Support",
                email: users[0].email
            });
        } catch (error) {
            console.error(
                "SUPPORT PAGE ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error loading support page."
            );
        }
    }
);

//=====================================================
// SUBMIT SUPPORT TICKET
//=====================================================

router.post(
    "/support",
    requireLogin,
    async (req, res) => {
        try {
            const userId =
                Number(req.session.userId);

            const email =
                req.body.email?.trim();

            const issueType =
                req.body.issue_type?.trim();

            const message =
                req.body.message?.trim();

            if (
                !email ||
                !issueType ||
                !message
            ) {
                return res.status(400).send(
                    "Please complete all support fields."
                );
            }

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
                    email,
                    issueType,
                    message
                ]
            );

            res.redirect(
                "/my-support-tickets"
            );
        } catch (error) {
            console.error(
                "SUBMIT SUPPORT TICKET ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error submitting support ticket."
            );
        }
    }
);

//=====================================================
// VIEW LOGGED-IN USER'S SUPPORT TICKETS
//=====================================================

router.get(
    "/my-support-tickets",
    requireLogin,
    async (req, res) => {
        try {
            const userId =
                Number(req.session.userId);

            const [tickets] = await db.query(
                `SELECT
                    ticket_id,
                    email,
                    issue_type,
                    message,
                    status,
                    created_at
                 FROM support_tickets
                 WHERE user_id = ?
                 ORDER BY created_at DESC`,
                [userId]
            );

            res.render(
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

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error loading support tickets."
            );
        }
    }
);

//=====================================================
// VIEW ONE SUPPORT TICKET
//=====================================================

router.get(
    "/support-tickets/:id",
    requireLogin,
    async (req, res) => {
        try {
            const ticketId =
                Number(req.params.id);

            const userId =
                Number(req.session.userId);

            if (!ticketId) {
                return res.status(400).send(
                    "Support ticket ID is missing."
                );
            }

            const [tickets] = await db.query(
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

            if (tickets.length === 0) {
                return res.status(404).send(
                    "Support ticket not found."
                );
            }

            res.render(
                "support-ticket-details",
                {
                    title:
                        `Support Ticket #${ticketId}`,
                    ticket: tickets[0]
                }
            );
        } catch (error) {
            console.error(
                "SUPPORT TICKET DETAILS ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error loading support ticket."
            );
        }
    }
);

module.exports = router;