const db = require("../config/database");

/**
 * Creates a notification for one specific user.
 *
 * @param {number} receiverId User who should receive the notification
 * @param {string} message Notification text
 * @param {string|null} targetUrl Internal GymBuddy URL to open when clicked
 * @param {object|null} connection Optional transaction connection
 */
async function createNotification(
    receiverId,
    message,
    targetUrl = null,
    connection = null
) {
    const recipientId = Number(receiverId);
    const cleanMessage = String(message || "").trim();

    let cleanTargetUrl = null;

    if (targetUrl) {
        cleanTargetUrl = String(targetUrl).trim();

        // Only allow internal GymBuddy routes
        if (!cleanTargetUrl.startsWith("/")) {
            throw new Error(
                "Notification target URL must be an internal GymBuddy route."
            );
        }
    }

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
         (
            user_id,
            message,
            target_url
         )
         VALUES (?, ?, ?)`,
        [
            recipientId,
            cleanMessage,
            cleanTargetUrl
        ]
    );
}

module.exports = createNotification;