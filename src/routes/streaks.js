const express = require("express");
const router = express.Router();
const db = require("../config/database");

// View streaks page
router.get("/streaks", async (req, res) => {
    try {
        const userId = 1; // Placeholder for logged-in user ID

        const [rows] = await db.query(
            "SELECT * FROM streaks WHERE user_id = ?",
            [userId]
        );
        res.render("streaks",{ 
            title: "My Workout Streak", 
            streak: row[0] 
        });
    } catch (error) {
        console.error("Streaks page error:", error);
        res.status(500).send("Error fetching streak data");
    }
});

module.exports = router;