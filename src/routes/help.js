const express = require("express");
const router = express.Router();
const db = require("../config/database");

// Help page route
router.get("/help", async (req, res) => {
  try {
    const query = req.query.q || "";
    let answer = null;

    if (query) {
      const [rows] = await db.query(
        `SELECT ha.answer
         FROM help_questions hq
         JOIN help_answers ha ON hq.question_id = ha.question_id
         WHERE ? LIKE CONCAT('%', hq.keyword, '%')
         LIMIT 1`,
        [query.toLowerCase()]
      );

      if (rows.length > 0) {
        answer = rows[0].answer;
      } else {
        answer = "Sorry, we could not find an answer to your question.";
      }
    }

    const [questions] = await db.query(
      `SELECT hq.question, ha.answer
       FROM help_questions hq
       JOIN help_answers ha ON hq.question_id = ha.question_id`
    );

    res.render("help", {
      title: "Help",
      query,
      answer,
      questions
    });

  } catch (error) {
    console.error("Help page error:", error);
    res.status(500).send("Error fetching help questions");
  }
});

// Show contact support form
router.get("/support", (req, res) => {
  res.render("contact-support", {
    title: "Contact Support"
  });
});

// Submit support ticket
router.post("/support", async (req, res) => {
  try {
    const { name, email, issue_type, message } = req.body;

    await db.query(
      `INSERT INTO support_tickets 
       (name, email, issue_type, message, status)
       VALUES (?, ?, ?, ?, ?)`,
      [name, email, issue_type, message, "Pending"]
    );

    res.redirect("/support/tickets");
  } catch (error) {
    console.error("Support ticket error:", error);
    res.status(500).send("Error submitting support ticket");
  }
});

// View support tickets
router.get("/support/tickets", async (req, res) => {
  try {
    const [tickets] = await db.query(
      "SELECT * FROM support_tickets ORDER BY created_at DESC"
    );

    res.render("support-tickets", {
      title: "Support Tickets",
      tickets
    });
  } catch (error) {
    console.error("Tickets error:", error);
    res.status(500).send("Error loading tickets");
  }
});

// Show report form
router.get("/report", (req, res) => {
  res.render("report", {
    title: "Report",
    workout_id: req.query.workout_id || null,
    reported_user_id: req.query.user_id || null
  });
});

// Submit report
router.post("/report", async (req, res) => {
  try {
    const reporterId = 1;
    const { workout_id, reported_user_id, report_type, reason } =req.body;

    await db.query(
      `INSERT INTO reports
      (reporter_id, reported_user_id, workout_id, report_type, reason, status)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [
      reported_user_id,
      reported_user_id || null,
      workout_id || null,
      report_type,
      reason,
      "Pending"
    ]
  );
  res.redirect("/help");
} catch (error) {
  console.error("Report error:", error);
  res.status(500).send("Error submitting report");
}
});

module.exports = router;