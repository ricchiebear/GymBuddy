const db = require("../config/database");

/**
 * Creates a notification for one specific user.
 *
 * @param {number} receiverId User who should receive the notification
 * @param {string} message Notification text
 * @param {object|null} connection Optional transaction connection
 */
async function createNotification(
    receiverId,
    message,
    connection = null
) {
    const recipientId = Number(receiverId);
    const cleanMessage = String(message || "").trim();

    if (!recipientId) {
        throw new Error(
            "Notification receiver ID is missing."
        );
    }

    if (!cleanMessage) {
        throw new Error(
            "Notification message is missing."
        );
    }

    const database = connection || db;

    await database.query(
        `INSERT INTO notifications
         (user_id, message)
         VALUES (?, ?)`,
        [recipientId, cleanMessage]
    );
}

module.exports = createNotification;