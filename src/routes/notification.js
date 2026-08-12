const express = require("express");
const router = express.Router();
const db = require("../config/database");
const formatDate = require("../utils/formatDate");

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
                    target_url,
                    created_at
                 FROM notifications
                 WHERE user_id = ?
                 ORDER BY created_at DESC`,
                [userId]
            );

            const formattedNotifications =
                notifications.map((notification) => ({
                    ...notification,
                    displayTime: formatDate(
                        notification.created_at
                    )
                }));

            const [[unreadResult]] = await db.query(
                `SELECT COUNT(*) AS total
                 FROM notifications
                 WHERE user_id = ?
                   AND is_read = FALSE`,
                [userId]
            );

            res.render("notifications", {
                title: "Notifications",
                notifications: formattedNotifications,
                unreadCount: Number(
                    unreadResult.total || 0
                )
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
// OPEN NOTIFICATION
// Marks notification as read and redirects user
// to the content connected to the notification.
// --------------------------------------------------

router.get(
    "/notifications/:id/open",
    requireLogin,
    async (req, res) => {
        try {
            const notificationId =
                Number(req.params.id);

            const userId =
                Number(req.session.userId);

            if (!notificationId) {
                return res.redirect("/notifications");
            }

            // Find the notification and make sure
            // it belongs to the logged-in user.
            const [notifications] = await db.query(
                `SELECT
                    notification_id,
                    target_url
                 FROM notifications
                 WHERE notification_id = ?
                   AND user_id = ?
                 LIMIT 1`,
                [
                    notificationId,
                    userId
                ]
            );

            if (notifications.length === 0) {
                return res.status(404).send(
                    "Notification not found."
                );
            }

            const notification = notifications[0];

            // Mark the notification as read.
            await db.query(
                `UPDATE notifications
                 SET is_read = TRUE
                 WHERE notification_id = ?
                   AND user_id = ?`,
                [
                    notificationId,
                    userId
                ]
            );

            // If this notification does not have a
            // destination, return to notifications.
            if (!notification.target_url) {
                return res.redirect("/notifications");
            }

            // Security check:
            // Only allow internal GymBuddy URLs.
            if (!notification.target_url.startsWith("/")) {
                return res.redirect("/notifications");
            }

            res.redirect(notification.target_url);

        } catch (error) {
            console.error(
                "OPEN NOTIFICATION ERROR:",
                error
            );

            res.status(500).send(
                error.sqlMessage ||
                error.message ||
                "Error opening notification."
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
            const notificationId =
                Number(req.params.id);

            const userId =
                Number(req.session.userId);

            const [result] = await db.query(
                `UPDATE notifications
                 SET is_read = TRUE
                 WHERE notification_id = ?
                   AND user_id = ?`,
                [
                    notificationId,
                    userId
                ]
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
            const userId =
                Number(req.session.userId);

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
            const notificationId =
                Number(req.params.id);

            const userId =
                Number(req.session.userId);

            const [result] = await db.query(
                `DELETE FROM notifications
                 WHERE notification_id = ?
                   AND user_id = ?`,
                [
                    notificationId,
                    userId
                ]
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