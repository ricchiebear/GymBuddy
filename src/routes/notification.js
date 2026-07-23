const express = require("express");
const router = express.Router();
const db = require("../config/database");

// Notifications page route
router.get("/notifications", async (req, res) => {
    try {
        // Temporary user ID for demonstration
        const userId = 1;

        const [notifications] = await db.query(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC",
            [userId]
        );
        res.render("Notifications", { 
            title: "Notifications", 
            notifications 
        });
     }   catch (error) {
        console.error("Notifications page error:", error);
        res.status(500).send("Error fetching notifications");
    }
});

// Route to clear all notifications for the user
router.post("/notifications/clear", async (req, res) => {
    try {
        const userId = 1; // Placeholder for logged-in user ID

        await db.query(
            "DELETE FROM notifications WHERE user_id = ?",
            [userId]
        );
        res.redirect("/notifications");
    } catch (error) {
        console.error("Clear notifications error:", error);
        res.status(500).send("Error clearing notifications");
    }
});

// Route to mark a specific notification as read
router.post("/notifications/:id/mark-read", async (req, res) => {
    try {
        const notificationId = req.params.id;

        await db.query(
            "UPDATE notifications SET is_read = TRUE WHERE notification_id = ?",
            [notificationId]
        );
        res.redirect("/notifications");
    } catch (error) {
        console.error("Mark notification read error:", error);
        res.status(500).send("Error marking notification as read");
     }
});

// Route to delete a specific notification
router.post("/notifications/:id/delete", async (req, res) => {
    try {
        const notificationId = req.params.id;

        await db.query(
            "DELETE FROM notifications WHERE notification_id = ?",
            [notificationId]
        );
        res.redirect("/notifications");
    } catch (error) {
        console.error("Delete notification error:", error);
        res.status(500).send("Error deleting notification");
     }
});

module.exports = router;