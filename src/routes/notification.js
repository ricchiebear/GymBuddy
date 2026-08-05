const express = require("express");
const router = express.Router();
const db = require("../config/database");

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
// VIEW NOTIFICATIONS
// --------------------------------------------------
router.get(
    "/notifications",
    requireLogin,
    async (req, res) => {
        try {
            const userId = Number(req.session.userId);

            const [notifications] = await db.query(
                `SELECT
                    notification_id,
                    message,
                    is_read,
                    created_at
                 FROM notifications
                 WHERE user_id = ?
                 ORDER BY created_at DESC`,
                [userId]
            );

            const [[unreadResult]] = await db.query(
                `SELECT COUNT(*) AS total
                 FROM notifications
                 WHERE user_id = ?
                   AND is_read = FALSE`,
                [userId]
            );

            res.render("notifications", {
                title: "Notifications",
                notifications,
                unreadCount: unreadResult.total
            });
        } catch (error) {
            console.error(
                "NOTIFICATIONS PAGE ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error loading notifications."
            );
        }
    }
);

// --------------------------------------------------
// MARK ONE NOTIFICATION AS READ
// --------------------------------------------------
router.post(
    "/notifications/:id/read",
    requireLogin,
    async (req, res) => {
        try {
            const notificationId = Number(req.params.id);
            const userId = Number(req.session.userId);

            const [result] = await db.query(
                `UPDATE notifications
                 SET is_read = TRUE
                 WHERE notification_id = ?
                   AND user_id = ?`,
                [notificationId, userId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).send(
                    "Notification not found."
                );
            }

            res.redirect("/notifications");
        } catch (error) {
            console.error(
                "MARK NOTIFICATION READ ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error updating notification."
            );
        }
    }
);

// --------------------------------------------------
// MARK ALL NOTIFICATIONS AS READ
// --------------------------------------------------
router.post(
    "/notifications/read-all",
    requireLogin,
    async (req, res) => {
        try {
            const userId = Number(req.session.userId);

            await db.query(
                `UPDATE notifications
                 SET is_read = TRUE
                 WHERE user_id = ?
                   AND is_read = FALSE`,
                [userId]
            );

            res.redirect("/notifications");
        } catch (error) {
            console.error(
                "MARK ALL NOTIFICATIONS READ ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error updating notifications."
            );
        }
    }
);

// --------------------------------------------------
// DELETE ONE NOTIFICATION
// --------------------------------------------------
router.post(
    "/notifications/:id/delete",
    requireLogin,
    async (req, res) => {
        try {
            const notificationId = Number(req.params.id);
            const userId = Number(req.session.userId);

            const [result] = await db.query(
                `DELETE FROM notifications
                 WHERE notification_id = ?
                   AND user_id = ?`,
                [notificationId, userId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).send(
                    "Notification not found."
                );
            }

            res.redirect("/notifications");
        } catch (error) {
            console.error(
                "DELETE NOTIFICATION ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error deleting notification."
            );
        }
    }
);

module.exports = router;