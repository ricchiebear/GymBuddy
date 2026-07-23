USE GymBuddy;

-- =========================
-- USERS
-- =========================
INSERT INTO users (first_name, last_name, email, password, fitness_goal, profile_bio)
VALUES
('Richard', 'Akole', 'richard@buddy.co.uk', '1234', 'Build Muscle', 'Looking for consistent gym partners.'),
('Sita', 'Panda', 'sita@buddy.co.uk', '1234', 'Lose Weight', 'Interested in cardio workouts.'),
('Olivia', 'Stars', 'olivia@buddy.co.uk', '1234', 'Improve Fitness', 'Love group training.'),
('Tom', 'Francis', 'tom@buddy.co.uk', '1234', 'Strength Training', 'Focused on lifting.'),
('Gloria', 'Amelia', 'gloria@buddy.co.uk', '1234', 'Endurance', 'Long-distance cardio lover.'),
('James', 'Brown', 'james@buddy.co.uk', '1234', 'Weight Loss', 'Looking for motivation.'),
('Sarah', 'Johnson', 'sarah@buddy.co.uk', '1234', 'Tone Body', 'Beginner at gym.'),
('Michael', 'Lee', 'michael@buddy.co.uk', '1234', 'Gain Strength', 'Heavy lifting sessions.'),
('Emma', 'Wilson', 'emma@buddy.co.uk', '1234', 'Stay Fit', 'Regular workouts.'),
('Sam', 'Smith', 'SamSmith@buddy.co.uk', '1234', 'Muscle Gain', 'Gym every day.');

-- =========================
-- WORKOUTS
-- =========================
INSERT INTO workouts (user_id, title, workout_type, location, start_time, end_time, status)
VALUES
(1, 'Chest & Triceps Blast', 'Strength', 'PureGym London', '2026-06-01 10:00', '2026-06-01 11:30', 'Open'),
(2, 'Beginner Cardio', 'Cardio', 'The Gym Group', '2026-06-02 14:00', '2026-06-02 15:00', 'Open'),
(3, 'Leg Day Madness', 'Strength', 'JD Gyms', '2026-06-03 12:00', '2026-06-03 13:30', 'Open'),
(4, 'HIIT Training', 'HIIT', 'Fitness First', '2026-06-04 18:00', '2026-06-04 19:00', 'Open'),
(5, 'Upper Body Strength', 'Strength', 'PureGym', '2026-06-05 10:00', '2026-06-05 11:30', 'Open'),
(6, 'Core Workout', 'Core', 'The Gym Group', '2026-06-06 09:00', '2026-06-06 10:00', 'Open'),
(7, 'Full Body Burn', 'HIIT', 'JD Gyms', '2026-06-07 17:00', '2026-06-07 18:30', 'Open'),
(8, 'Morning Cardio', 'Cardio', 'PureGym', '2026-06-08 07:00', '2026-06-08 08:00', 'Open'),
(9, 'Strength & Conditioning', 'Strength', 'Fitness First', '2026-06-09 16:00', '2026-06-09 17:30', 'Open'),
(10, 'Beginner Gym Session', 'Beginner', 'The Gym Group', '2026-06-10 13:00', '2026-06-10 14:30', 'Open');

-- =========================
-- JOIN REQUESTS
-- =========================
INSERT INTO join_request (user_id, workout_id, status)
VALUES
(3, 1, 'Pending'),
(4, 2, 'Accepted'),
(5, 3, 'Pending'),
(6, 4, 'Accepted'),
(7, 5, 'Pending');

-- =========================
-- WORKOUT PARTICIPANTS
-- =========================
INSERT INTO workout_participants (user_id, workout_id)
VALUES
(1,1),(2,2),(3,3),(4,4),(5,5);

-- =========================
-- MESSAGES
-- =========================
INSERT INTO messages (sender_id, receiver_id, message)
VALUES
(1,2,'Hey, joining your session!'),
(2,1,'Nice, see you there!'),
(3,4,'Are you coming tomorrow?'),
(4,3,'Yes I am!');

-- =========================
-- NOTIFICATIONS
-- =========================
INSERT INTO notifications (user_id, message)
VALUES
(1,'Someone requested to join your workout'),
(2,'Your request was accepted'),
(3,'New message received'),
(4,'Workout reminder');

-- =========================
-- STREAKS
-- =========================
INSERT INTO streaks (user_id, current_count, last_workout_date)
VALUES
(1,5,'2026-06-01'),
(2,2,'2026-06-02'),
(3,7,'2026-06-03');

-- =========================
-- HELP QUESTIONS
-- =========================
INSERT INTO help_questions (keyword, question)
VALUES
('join','How do I join a workout?'),
('create','How do I create a workout session?'),
('streak','How do streaks work?'),
('message','How do I message someone?'),
('profile','How do I edit my profile?'),
('cancel','How do I cancel a workout?'),
('location','How do I find gym locations?'),
('equipment','Do I need equipment?');

-- =========================
-- HELP ANSWERS
-- =========================
INSERT INTO help_answers (question_id, answer)
VALUES
(1,'Go to workouts and click join'),
(2,'Click create workout and fill the form'),
(3,'Streak increases when you attend sessions daily'),
(4,'Go to messages and start chat'),
(5,'Go to profile and click edit'),
(6,'Go to your workout and click cancel'),
(7,'Locations are shown on each workout'),
(8,'Check workout description for equipment');