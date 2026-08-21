# GymBuddy

GymBuddy is a full-stack social fitness web application designed to help people find workout partners, organise workout sessions and stay consistent with their fitness goals.

Users can create and discover workouts, request to join other users' sessions, communicate with workout partners, receive notifications and track their workout activity and streaks. GymBuddy also includes personalised workout-partner recommendations and an AI Coach to provide additional fitness support.

## Core Features

- User registration, login and profile management
- Profile image uploads
- Create, edit, cancel and complete workout sessions
- Browse and filter available workouts
- Workout image uploads
- Request to join workouts
- Accept or reject workout requests
- View created and joined workouts
- Workout partner recommendations
- Private messaging between users
- Application notifications
- Workout history and streak tracking
- Google Maps integration for workout locations
- AI Coach
- Help and support ticket system
- Workout reporting
- Responsive navigation for desktop and mobile devices

## Target Users

GymBuddy is designed for people who want to exercise consistently but may not always have someone to train with. It provides a platform for finding workout partners, arranging sessions and maintaining motivation through social interaction and progress tracking.

## Technology Stack

GymBuddy is built using a full-stack JavaScript architecture with MySQL for persistent data storage and Docker for development and production containerisation.

### Backend

- **Node.js** – JavaScript runtime used to run the server-side application.
- **Express.js** – Web framework used for routing, middleware, sessions and application logic.
- **MySQL** – Relational database used to store users, workouts, messages, notifications, workout history, streaks and other application data.
- **mysql2** – Provides the connection between the Node.js application and MySQL.
- **express-session** – Manages authenticated user sessions.
- **express-mysql-session** – Stores user sessions persistently in MySQL.
- **bcrypt** – Hashes user passwords before they are stored.
- **Multer** – Handles profile and workout image uploads.
- **Helmet** – Adds security-related HTTP headers to the Express application.

### Frontend

- **Pug** – Server-side template engine used to generate GymBuddy pages.
- **HTML5** – Provides the structure of rendered web pages.
- **CSS3** – Provides the application's responsive design and styling.
- **JavaScript** – Provides client-side interactions such as mobile navigation.

### External Services

- **OpenAI API** – Powers the GymBuddy AI Coach functionality.
- **Google Maps** – Displays workout locations within the application.

### Development and Deployment

- **Docker** – Containerises the GymBuddy application and its supporting services.
- **Docker Compose** – Manages the web application and MySQL containers.
- **Git** – Provides source control and development history.
- **GitHub** – Hosts the GymBuddy source-code repository.

### Production Architecture

The production environment runs GymBuddy using separate Docker containers for the web application and MySQL database.

- The Node.js application runs as a non-root container user.
- MySQL data is stored using a persistent Docker volume.
- User-uploaded profile and workout images are stored using persistent Docker storage.
- MySQL and web-container health checks are used to monitor service availability.
- Application sessions are stored persistently in MySQL.
- Production secrets and credentials are supplied through environment variables rather than stored in source code.
- MySQL is not directly exposed through a host port in the production configuration.
- phpMyAdmin is excluded from the production environment.

## Project Structure

The main GymBuddy project structure is organised as follows:

```text
GymBuddy/
│
├── src/
│   ├── config/
│   │   └── database.js
│   │
│   ├── db/
│   │   ├── schema.sql
│   │   └── seed.sql
│   │
│   ├── routes/
│   │   ├── authentication.js
│   │   ├── workout.js
│   │   ├── notification.js
│   │   ├── streaks.js
│   │   ├── messages.js
│   │   ├── privateMessages.js
│   │   ├── recommendation.js
│   │   ├── chatbot.js
│   │   ├── report.js
│   │   └── help.js
│   │
│   ├── views/
│   │   └── ...
│   │
│   ├── public/
│   │   ├── css/
│   │   ├── js/
│   │   └── uploads/
│   │
│   └── app.js
│
├── .dockerignore
├── .env.example
├── .gitignore
├── docker-compose.yml
├── docker-compose.prod.yml
├── Dockerfile
├── package.json
├── package-lock.json
└── README.md
```

### Important Directories

- **`src/config/`** – Contains application configuration such as the MySQL database connection.
- **`src/db/`** – Contains the database schema and development seed data.
- **`src/routes/`** – Contains Express routes and backend logic for GymBuddy features.
- **`src/views/`** – Contains the Pug templates used to render application pages.
- **`src/public/css/`** – Contains application stylesheets.
- **`src/public/js/`** – Contains client-side JavaScript.
- **`src/public/uploads/`** – Stores uploaded profile and workout images.
- **`src/app.js`** – Configures Express, middleware, security, sessions and application routes.

### Important Root Files

- **`Dockerfile`** – Defines the production GymBuddy web application image.
- **`docker-compose.yml`** – Defines the local development Docker environment.
- **`docker-compose.prod.yml`** – Defines the production Docker environment.
- **`.env.example`** – Documents required environment variables without exposing real credentials.
- **`package.json`** – Defines Node.js dependencies and application scripts.

## Getting Started

The recommended way to run GymBuddy locally is with Docker and Docker Compose. This starts the Node.js application and MySQL database using the configuration included in the repository.

### Prerequisites

Before running GymBuddy, install:

- **Git**
- **Docker Desktop**
- **Docker Compose**

You will also need an **OpenAI API key** if you want to use the AI Coach feature.

### 1. Clone the Repository

Clone the GymBuddy repository:

```bash
git clone <your-github-repository-url>
```

Move into the project directory:

```bash
cd GymBuddy
```

Replace `<your-github-repository-url>` with the actual GitHub repository URL.

### 2. Create the Environment File

Copy the example environment file:

```bash
cp .env.example .env
```

The `.env` file should contain variables similar to:

```env
# Application
NODE_ENV=development
PORT=3000
COOKIE_SECURE=false

# Session
SESSION_SECRET=your_session_secret_here

# OpenAI
OPENAI_API_KEY=your_openai_api_key_here

# Database
DB_HOST=db
DB_PORT=3306
DB_USER=gymbuddy_user
DB_PASSWORD=your_database_password_here
DB_NAME=gymbuddy

# MySQL administrator
MYSQL_ROOT_PASSWORD=your_mysql_root_password_here
```

Replace the placeholder values with your own secure credentials.

> Never commit the real `.env` file to GitHub. It contains private credentials and secrets.

### 3. Start GymBuddy

Start the development environment:

```bash
docker compose up -d --build
```

Check that the containers are running:

```bash
docker compose ps
```

### 4. Open GymBuddy

Open:

```text
http://localhost:3000
```

GymBuddy should now be running locally.

The development environment also includes phpMyAdmin at:

```text
http://localhost:8081
```

phpMyAdmin is provided for local database administration and is not included in the production configuration.

### 5. Development Database

The database schema is defined in:

```text
src/db/schema.sql
```

Development seed data is defined in:

```text
src/db/seed.sql
```

MySQL data is stored in a Docker volume, allowing it to persist when containers are stopped or recreated.

### 6. Stop GymBuddy

Stop the development environment:

```bash
docker compose down
```

The persistent database volume is retained.

Avoid using:

```bash
docker compose down -v
```

unless you intentionally want to delete the Docker volumes and their stored data.

## Production Setup

GymBuddy includes a separate Docker configuration for running the application in production mode.

The production environment uses:

- A dedicated production Docker image
- A Node.js web application container
- A MySQL database container
- Persistent database storage
- Persistent storage for uploaded images
- MySQL and web application health checks
- MySQL-backed user sessions
- Production security configuration
- Environment-based secrets and credentials

### 1. Configure Production Environment Variables

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Configure the variables with secure production values.

For a real HTTPS deployment:

```env
NODE_ENV=production
COOKIE_SECURE=true
```

`COOKIE_SECURE=true` ensures authentication cookies are only transmitted over secure HTTPS connections.

When testing production mode locally through:

```text
http://localhost:3000
```

use:

```env
NODE_ENV=production
COOKIE_SECURE=false
```

because the local connection is using HTTP rather than HTTPS.

Never store production passwords, API keys or session secrets in the Git repository.

### 2. Build and Start Production

Run:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 3. Check Container Health

Run:

```bash
docker compose -f docker-compose.prod.yml ps
```

After startup, the web application and database should report healthy statuses.

Example:

```text
gymbuddy-db-1     Up (healthy)
gymbuddy-web-1    Up (healthy)
```

### 4. Production Database

The production MySQL container does not expose its database port directly to the host.

GymBuddy communicates with MySQL through Docker's internal network:

```env
DB_HOST=db
DB_PORT=3306
```

The application uses the dedicated:

```env
DB_USER=gymbuddy_user
```

account rather than the MySQL root administrator account.

The production database loads:

```text
src/db/schema.sql
```

when a new database volume is first initialised.

Development `seed.sql` data is intentionally excluded from production.

### 5. Persistent Storage

GymBuddy uses named Docker volumes to preserve important data.

#### Database Storage

MySQL data is stored in:

```text
db_data
```

#### Uploaded Images

Profile pictures and workout images are stored in:

```text
uploads_data
```

The volume is mounted at:

```text
/app/src/public/uploads
```

This allows uploaded files to survive web-container rebuilds and recreations.

### 6. Production Sessions

Authenticated sessions are stored in MySQL instead of Express's default in-memory store.

This allows login sessions to survive web-container restarts.

Session cookies use:

```text
HttpOnly
SameSite=Lax
Secure when COOKIE_SECURE=true
```

### 7. Production Security

Production-related protections include:

- Helmet HTTP security headers
- Content Security Policy
- Removal of the Express `X-Powered-By` header
- HTTP request-body size limits
- Restricted image upload types
- Environment-based secrets
- Non-root Node.js container user
- Dedicated MySQL application credentials
- MySQL isolated from direct host access
- Safer production error responses
- Secure HTTPS session-cookie support

### 8. Health Checks

The MySQL container includes a health check that verifies the database is responding before GymBuddy starts.

The production Docker image also includes a web application health check that verifies the Express application is responding.

### 9. Stop Production

Run:

```bash
docker compose -f docker-compose.prod.yml down
```

Persistent volumes remain available.

Do not normally run:

```bash
docker compose -f docker-compose.prod.yml down -v
```

because `-v` removes persistent Docker volumes and can delete database data and uploaded images.

### 10. Rebuild After Changes

Run:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Then verify:

```bash
docker compose -f docker-compose.prod.yml ps
```

## Using GymBuddy

GymBuddy follows a social workout flow: create an account, discover or create workouts, connect with other users and track fitness activity over time.

### 1. Create an Account

New users can register using a valid `@buddy.co.uk` email address and choose a fitness goal.

After registration, users can log in and access their personal GymBuddy profile.

### 2. Manage Your Profile

Users can:

- Update their name and fitness goal
- Add or edit a profile bio
- Upload a profile picture
- View workout statistics
- Access created workouts
- Access joined workouts
- View workout history
- Open messages, notifications and AI Coach

### 3. Discover Workouts

The Workouts page allows users to browse available workout sessions.

Workout details can include:

- Workout title
- Workout type
- Location
- Start and end time
- Workout creator
- Workout status
- Workout image
- Embedded Google Maps location

### 4. Create and Manage Workouts

Users can create workout sessions with information such as workout type, location, schedule and an optional image.

Workout creators can:

- Edit workout information
- Review join requests
- Accept or reject workout requests
- Cancel workouts
- Mark eligible workouts as completed

### 5. Join a Workout

Users can request to join workouts created by other users.

The creator can accept or reject the request.

Accepted sessions appear under **Joined Workouts** for the participant.

Users can also leave joined workouts when appropriate.

### 6. Workout History and Streaks

Completed workouts are recorded in workout history.

GymBuddy tracks:

- Completed workouts
- Current workout streak
- Longest workout streak
- Recent workout history

### 7. Workout Partner Recommendations

GymBuddy recommends potential workout partners using factors including:

- Fitness goals
- Workout streaks
- Completed workout activity
- Shared workout interests

Recommendations include a compatibility score and match reasons.

### 8. Messaging

GymBuddy supports private messaging between users.

Before a new private conversation begins, users can send a message request.

The receiving user can accept or reject that request. Once accepted, both users can communicate through a private conversation.

### 9. Notifications

Notifications keep users informed about important GymBuddy activity.

Depending on the event, users can view notifications and follow links to relevant parts of the application.

### 10. AI Coach

The AI Coach provides conversational fitness support.

It can answer general fitness questions and, where appropriate, use available GymBuddy account context such as:

- Workout streaks
- Workout history
- Upcoming workouts
- Joined workouts
- Created workouts
- Recommended workout partners

The AI Coach does not replace qualified medical advice.

### 11. Help and Support

Users can submit support tickets for GymBuddy-related issues.

Tickets can include:

- Issue type
- Description
- Submission date
- Current status

Users can review previous requests through Support History and open individual ticket details.

### 12. Reporting

Users can report workouts that appear unsafe, misleading, abusive or inappropriate.

GymBuddy prevents users from reporting their own workouts and blocks duplicate pending reports for the same workout.

## Security and Privacy

GymBuddy includes security measures designed to protect user accounts, application data and production infrastructure.

### Authentication and Password Security

- Authentication uses server-side sessions.
- User passwords are hashed using bcrypt before storage.
- Protected routes require an authenticated session.
- Sessions are stored persistently in MySQL.
- Session cookies use `HttpOnly`.
- `SameSite=Lax` is enabled.
- HTTPS deployments can enforce secure cookies using `COOKIE_SECURE=true`.

### Environment Variables and Secrets

Sensitive configuration is supplied using environment variables.

This includes:

- Database passwords
- MySQL administrator credentials
- Session secrets
- OpenAI API credentials

Real credentials belong in `.env`.

`.env.example` contains only placeholder configuration.

The real `.env` file must never be committed to source control.

### Database Security

GymBuddy uses a dedicated `gymbuddy_user` MySQL account for normal application operations instead of using the root administrator account.

In production, the database is available to the web application through Docker's internal network and does not expose a host database port.

### Application Security Headers

GymBuddy uses Helmet for HTTP security headers, including protections such as:

- Content Security Policy
- Restricted resource origins
- Frame restrictions
- Referrer policy
- Removal of the Express `X-Powered-By` header

### File Upload Security

Profile and workout image uploads are validated before being accepted.

Upload handling includes restrictions on:

- Accepted image formats
- File size
- Upload destination
- File content where applicable

Production uploads are stored using persistent Docker storage.

### Request Protection

Standard form and JSON request bodies have configured size limits.

Important routes also perform server-side validation before database operations are completed.

### Production Error Handling

Development logging can contain additional debugging information.

Production responses avoid exposing unnecessary internal application details to users.

### Container Security

The production Node.js application runs using the non-root `node` container user.

The production environment also excludes unnecessary database-administration services such as phpMyAdmin.

### AI Coach Privacy

The AI Coach uses the OpenAI API to generate fitness-related responses.

Relevant GymBuddy account or workout information may be included as context when required by the feature.

OpenAI API credentials are stored using environment variables and are not exposed to the browser.

Users should avoid submitting unnecessary sensitive personal information through the AI Coach.

### Security Reminder

A real public deployment should also use:

- HTTPS
- Strong production secrets
- Appropriate server and network security
- Regular dependency updates
- Database backups
- Monitoring and logging

## Troubleshooting

### Docker Containers Are Not Starting

Check container status:

```bash
docker compose ps
```

For production:

```bash
docker compose -f docker-compose.prod.yml ps
```

View development logs:

```bash
docker compose logs web
```

View production logs:

```bash
docker compose -f docker-compose.prod.yml logs web
```

Rebuild development:

```bash
docker compose up -d --build
```

Rebuild production:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Database Is Not Healthy

Check:

```bash
docker compose -f docker-compose.prod.yml ps
```

The database should eventually show:

```text
Up (healthy)
```

If not, inspect:

```bash
docker compose -f docker-compose.prod.yml logs db
```

Also verify the database-related variables in `.env`.

### Login Redirects Back to Login

When testing production mode locally over:

```text
http://localhost:3000
```

use:

```env
COOKIE_SECURE=false
```

For a real HTTPS deployment:

```env
COOKIE_SECURE=true
```

After changing environment variables, recreate the web container:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate web
```

### CSS or JavaScript Does Not Load in Docker

Linux containers use case-sensitive file paths.

For example:

```text
src/public/css/
```

must match:

```text
/css/style.css
```

The same rule applies to Pug filenames and JavaScript files.

### Pug Template Cannot Be Found

Linux treats differently capitalised filenames as different files.

For example:

```text
login.pug
```

should be rendered using:

```javascript
res.render("login");
```

### Image Upload Is Rejected

If an image is rejected:

- Check that it uses an accepted image format.
- Check that it is within the configured size limit.
- Try exporting the image again using a supported format.
- Make sure the file is a genuine image rather than a renamed unsupported file.

### Uploaded Images Disappear

Production uses the `uploads_data` Docker volume mounted at:

```text
/app/src/public/uploads
```

Avoid removing Docker volumes unless you intentionally want to delete stored data.

### Environment Variable Is Missing

Check that `.env` exists in the project root and contains all variables documented in `.env.example`.

Restart or recreate containers after changing environment configuration.

### AI Coach Is Not Responding

Check that the real `.env` contains a valid:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

Never commit a real API key to GitHub.

Check production logs with:

```bash
docker compose -f docker-compose.prod.yml logs web
```

### Port 3000 Is Already in Use

Check running containers:

```bash
docker ps
```

Stop the conflicting container or process before starting GymBuddy again.

### Resetting Development

Stop development containers with:

```bash
docker compose down
```

Removing volumes can permanently delete stored data.

Do not remove production volumes as a normal troubleshooting step.

## Development Status

GymBuddy has completed its main development and production-readiness stages.

The current application includes social workout features, user authentication, workout management, messaging, notifications, recommendations, workout tracking, AI Coach functionality, support features and production Docker configuration.

The application has also completed a production smoke test covering its main user flows and Docker services.

Future development may include additional features, UI improvements, expanded recommendation logic, automated testing, monitoring and deployment to a public hosting environment.

## Author

**Richard Akole**

Computer Science student and developer of the GymBuddy web application.

GymBuddy was developed as a personal software engineering project focused on applying practical experience with:

- Full-stack JavaScript development
- Node.js and Express.js
- MySQL database design
- User authentication and session management
- Application routing
- File uploads
- Third-party API integration
- AI-assisted application features
- Docker containerisation
- Production configuration
- Application security
- Git and GitHub version control

## Project Notice

GymBuddy is currently a personal software engineering project.

The application is intended for educational, portfolio and development purposes.

Fitness information provided through GymBuddy, including responses generated by the AI Coach, should not be considered professional medical advice.

## License

No open-source licence has currently been assigned to this project.

Unless a licence is added in the future, the source code should not be assumed to grant permission for copying, modification, redistribution or commercial use.