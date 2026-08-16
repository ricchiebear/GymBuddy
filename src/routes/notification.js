const express = require("express");
const db = require("../config/database");
const formatDate = require("../utils/formatDate");

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
// SAFE INTERNAL URL
// =====================================================

function getSafeInternalUrl(value) {
    if (
        typeof value !== "string" ||
        !value.startsWith("/") ||
        value.startsWith("//") ||
        value.includes("\\")
    ) {
        return null;
    }

    try {
        const baseUrl =
            "http://gymbuddy.local";

        const parsedUrl =
            new URL(
                value,
                baseUrl
            );

        if (
            parsedUrl.origin !==
            baseUrl
        ) {
            return null;
        }

        return (
            parsedUrl.pathname +
            parsedUrl.search +
            parsedUrl.hash
        );

    } catch (error) {
        return null;
    }
}

// =====================================================
// VIEW NOTIFICATIONS
// =====================================================

router.get(
    "/notifications",
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


            // =================================================
            // GET USER NOTIFICATIONS
            // =================================================

            const [notifications] =
                await db.query(
                    `SELECT
                        notification_id,
                        message,
                        is_read,
                        target_url,
                        created_at
                     FROM notifications
                     WHERE user_id = ?
                     ORDER BY
                        created_at DESC`,
                    [userId]
                );


            // =================================================
            // FORMAT DATES
            // =================================================

            const formattedNotifications =
                notifications.map(
                    (notification) => ({
                        ...notification,

                        displayTime:
                            formatDate(
                                notification.created_at
                            )
                    })
                );


            // =================================================
            // UNREAD COUNT
            // =================================================

            const [[unreadResult]] =
                await db.query(
                    `SELECT
                        COUNT(*) AS total
                     FROM notifications
                     WHERE user_id = ?
                       AND is_read = FALSE`,
                    [userId]
                );


            // =================================================
            // RENDER PAGE
            // =================================================

            return res.render(
                "notifications",
                {
                    title:
                        "Notifications",

                    notifications:
                        formattedNotifications,

                    unreadCount:
                        Number(
                            unreadResult.total ||
                            0
                        )
                }
            );

        } catch (error) {

            console.error(
                "NOTIFICATIONS PAGE ERROR:",
                error
            );


            return res
                .status(500)
                .send(
                    "Error loading notifications."
                );
        }
    }
);

// =====================================================
// OPEN NOTIFICATION
// Marks the notification as read before redirecting
// to its connected GymBuddy page.
// =====================================================

router.get(
    "/notifications/:id/open",
    requireLogin,
    async (req, res) => {

        try {

            const notificationId =
                getNumericId(
                    req.params.id
                );


            const userId =
                getNumericId(
                    req.session.userId
                );


            // =================================================
            // VALIDATE USER
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
            // VALIDATE NOTIFICATION ID
            // =================================================

            if (!notificationId) {

                setFeedback(
                    req,
                    "warning",
                    "That notification could not be found."
                );


                return res.redirect(
                    "/notifications"
                );
            }


            // =================================================
            // FIND USER'S NOTIFICATION
            // =================================================

            const [notifications] =
                await db.query(
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


            if (
                notifications.length ===
                0
            ) {

                setFeedback(
                    req,
                    "warning",
                    "That notification could not be found."
                );


                return res.redirect(
                    "/notifications"
                );
            }


            const notification =
                notifications[0];


            // =================================================
            // MARK AS READ
            // =================================================

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


            // =================================================
            // NO DESTINATION
            // =================================================

            if (
                !notification.target_url
            ) {

                return res.redirect(
                    "/notifications"
                );
            }


            // =================================================
            // SAFE INTERNAL DESTINATION
            // =================================================

            const safeTargetUrl =
                getSafeInternalUrl(
                    notification.target_url
                );


            if (!safeTargetUrl) {

                console.warn(
                    "BLOCKED UNSAFE NOTIFICATION URL:",
                    notification.target_url
                );


                setFeedback(
                    req,
                    "warning",
                    "This notification does not have a valid destination."
                );


                return res.redirect(
                    "/notifications"
                );
            }


            return res.redirect(
                safeTargetUrl
            );

        } catch (error) {

            console.error(
                "OPEN NOTIFICATION ERROR:",
                error
            );


            return res
                .status(500)
                .send(
                    "Error opening notification."
                );
        }
    }
);

// =====================================================
// MARK ONE NOTIFICATION AS READ
// =====================================================

router.post(
    "/notifications/:id/read",
    requireLogin,
    async (req, res) => {

        try {

            const notificationId =
                getNumericId(
                    req.params.id
                );


            const userId =
                getNumericId(
                    req.session.userId
                );


            // =================================================
            // VALIDATE USER
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
            // VALIDATE NOTIFICATION ID
            // =================================================

            if (!notificationId) {

                setFeedback(
                    req,
                    "warning",
                    "That notification could not be found."
                );


                return res.redirect(
                    "/notifications"
                );
            }


            // =================================================
            // UPDATE USER'S NOTIFICATION
            // =================================================

            const [result] =
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


            if (
                result.affectedRows ===
                0
            ) {

                setFeedback(
                    req,
                    "warning",
                    "That notification could not be found."
                );


                return res.redirect(
                    "/notifications"
                );
            }


            setFeedback(
                req,
                "success",
                "Notification marked as read."
            );


            return res.redirect(
                "/notifications"
            );

        } catch (error) {

            console.error(
                "MARK NOTIFICATION READ ERROR:",
                error
            );


            return res
                .status(500)
                .send(
                    "Error updating notification."
                );
        }
    }
);

// =====================================================
// MARK ALL NOTIFICATIONS AS READ
// =====================================================

router.post(
    "/notifications/read-all",
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


            const [result] =
                await db.query(
                    `UPDATE notifications
                     SET is_read = TRUE
                     WHERE user_id = ?
                       AND is_read = FALSE`,
                    [userId]
                );


            if (
                result.affectedRows ===
                0
            ) {

                setFeedback(
                    req,
                    "info",
                    "You have no unread notifications."
                );


                return res.redirect(
                    "/notifications"
                );
            }


            setFeedback(
                req,
                "success",
                "All notifications have been marked as read."
            );


            return res.redirect(
                "/notifications"
            );

        } catch (error) {

            console.error(
                "MARK ALL NOTIFICATIONS READ ERROR:",
                error
            );


            return res
                .status(500)
                .send(
                    "Error updating notifications."
                );
        }
    }
);

// =====================================================
// DELETE ONE NOTIFICATION
// =====================================================

router.post(
    "/notifications/:id/delete",
    requireLogin,
    async (req, res) => {

        try {

            const notificationId =
                getNumericId(
                    req.params.id
                );


            const userId =
                getNumericId(
                    req.session.userId
                );


            // =================================================
            // VALIDATE USER
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
            // VALIDATE NOTIFICATION ID
            // =================================================

            if (!notificationId) {

                setFeedback(
                    req,
                    "warning",
                    "That notification could not be found."
                );


                return res.redirect(
                    "/notifications"
                );
            }


            // =================================================
            // DELETE USER'S NOTIFICATION ONLY
            // =================================================

            const [result] =
                await db.query(
                    `DELETE FROM notifications
                     WHERE notification_id = ?
                       AND user_id = ?`,
                    [
                        notificationId,
                        userId
                    ]
                );


            if (
                result.affectedRows ===
                0
            ) {

                setFeedback(
                    req,
                    "warning",
                    "That notification could not be found."
                );


                return res.redirect(
                    "/notifications"
                );
            }


            setFeedback(
                req,
                "success",
                "Notification deleted successfully."
            );


            return res.redirect(
                "/notifications"
            );

        } catch (error) {

            console.error(
                "DELETE NOTIFICATION ERROR:",
                error
            );


            return res
                .status(500)
                .send(
                    "Error deleting notification."
                );
        }
    }
);

module.exports = router;