const express = require("express");
const router = express.Router();
const db = require("../config/database");

const TEMP_USER_ID = 1;

// View inbox/messages
router.get("/messages", async (req, res) => {
  try {
    const userId = TEMP_USER_ID;

    const [messages] = await db.query(
      `SELECT 
          m.message_id,
          m.message,
          m.is_read,
          m.created_at,
          m.sender_id,
          CONCAT(u.first_name, ' ', u.last_name) AS sender_name
       FROM messages m
       JOIN users u ON m.sender_id = u.user_id
       WHERE m.receiver_id = ?
       ORDER BY m.created_at DESC`,
      [userId]
    );

    const [users] = await db.query(
      "SELECT user_id, first_name, last_name FROM users WHERE user_id != ?",
      [userId]
    );

    res.render("messages", {
      title: "Messages",
      messages,
      users
    });
  } catch (error) {
    console.error("Messages error:", error);
    res.status(500).send("Error loading messages");
  }
});

// Send direct message
router.post("/messages/send", async (req, res) => {
  try {
    const senderId = TEMP_USER_ID;
    const { receiver_id, message } = req.body;

    await db.query(
      `INSERT INTO messages (sender_id, receiver_id, message, is_read)
       VALUES (?, ?, ?, FALSE)`,
      [senderId, receiver_id, message]
    );

    await db.query(
      "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
      [receiver_id, "You received a new direct message."]
    );

    res.redirect("/messages");
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).send("Error sending message");
  }
});

// Mark message as read
router.post("/messages/:id/read", async (req, res) => {
  try {
    const messageId = req.params.id;

    await db.query(
      "UPDATE messages SET is_read = TRUE WHERE message_id = ?",
      [messageId]
    );

    res.redirect("/messages");
  } catch (error) {
    console.error("Mark read error:", error);
    res.status(500).send("Error marking message as read");
  }
});

// View workout grap chat 
router.get("/workout/:id/chat", async (req, res) => {
    try {
        const workoutId = req.params.id;

        const [workoutRows] = await db.query(
            "SELECT * FROM workouts WHERE workout_id = ?",
            [workoutId]
        );

        const [message] = await db.query(
            `SELECT
                gm.message,
                gm.created_at
                CONCAT(u.first_name, ' ', u.last_name) AS sender_name
                FROM workout_group_messages gm
                JOIN users u ON gm.sender_id = u.user_id
                WHERE gm.workouut_id = ?
                ORDER BY gm.created_at ASC`,
               [workoutId]
            );

            res.render("workout-chat", {
                title: "WOrkout Chat",
                workout: workoutRows[0],
                messages
            });
        }   catch (eror) {
            console.error("Semd group message error:", error);
            res.status(500).send("Error sending group message");
        }
});

module.exports = router;






































// // Messages page route
// router.get("/messages", async (req, res) => {
//     try {
//         const userId = 1; // Placeholder for logged-in user ID

//         const [messages] = await db.query(
//             `SELECT 
//             m.message_id, 
//             m.created_at, 
//             CONCAT(u.first_name, ' ', u.last_name) AS sender_name
//             FROM messages m
//             JOIN users u ON m.sender_id = u.user_id
//             WHERE m.receiver_id = ?
//             ORDER BY m.created_at DESC`,
//             [userId]
//         );
//         res.render("Messages", { 
//             title: "Messages", 
//             messages 
//         });
//     } catch (error) {
//         console.error("Messages page error:", error);
//         res.status(500).send("Error fetching messages");
//     }
// });

// // Message POST page route
// router.post("/messages/send", async (req, res) => {
//     try {
//         const senderId = 1; // Placeholder for logged-in user ID
//         const { receiverId, content } = req.body;

//         await db.query(
//             "INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)",
//             [senderId, receiverId, content]
//         );
//         await db.query( 
//             "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
//             [receiverId, "You have a new message!"]
//         );
//         res.redirect("/messages");
//     } catch (error) {
//         console.error("Send message error:", error);
//         res.status(500).send("Error sending message");
//     }
// });

// module.exports = router;
