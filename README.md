# GymBuddy

GymBuddy is a full-stack social fitness web application designed to help people find workout partners, organise workout sessions and stay consistent with their fitness goals.

Users can create and discover workouts, request to join other users' sessions, communicate with workout partners, receive notifications and track their workout activity and streaks. GymBuddy also includes personalised workout-partner recommendations and an AI Coach that provides conversational fitness support.

## Live Application

GymBuddy is deployed publicly and available at:

**https://gymbuddyapp.uk**

The production application is hosted on Railway with a MySQL database. The custom domain is registered and managed through Cloudflare.

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
- AI Coach with persistent conversation history
- Help and support ticket system
- Workout reporting
- Responsive navigation for desktop and mobile devices

## Target Users

GymBuddy is designed for people who want to exercise consistently but may not always have someone to train with.

The application provides a platform for finding workout partners, arranging workout sessions and maintaining motivation through social interaction, workout tracking and progress features.

## Technology Stack

GymBuddy is built using a full-stack JavaScript architecture with MySQL for persistent data storage.

Docker is used to provide reproducible local development and containerised environments, while the live application is deployed through Railway.

### Backend

- **Node.js** – JavaScript runtime used to run the server-side application.
- **Express.js** – Web framework used for routing, middleware, sessions and application logic.
- **MySQL** – Relational database used to store users, workouts, messages, notifications, AI conversations, workout history, streaks and other application data.
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
- **JavaScript** – Provides client-side interactions and responsive application behaviour.

### External Services

- **OpenAI API** – Powers the GymBuddy AI Coach.
- **Google Maps** – Provides workout-location mapping functionality.

### Development and Deployment

- **Docker** – Containerises the GymBuddy application and supporting services.
- **Docker Compose** – Manages local application and MySQL containers.
- **Git** – Provides source control and development history.
- **GitHub** – Hosts the GymBuddy source-code repository and provides the source for production deployments.
- **Railway** – Hosts the live GymBuddy web application and production MySQL database.
- **Cloudflare** – Provides domain registration and DNS management for the GymBuddy custom domain.

## Production Architecture

The live GymBuddy application uses Railway as its production hosting platform.

The production architecture can be represented as:

```text
                    Internet
                       |
                       v
                gymbuddyapp.uk
                       |
                       v
                   Cloudflare
               Domain / DNS Layer
                       |
                       v
                    Railway
                       |
             +---------+---------+
             |                   |
             v                   v
      GymBuddy Web App      MySQL Database
      Node.js / Express     Railway MySQL
             |
             v
       External Services
       - OpenAI API
       - Google Maps
```

The production environment includes:

- Railway-hosted Node.js application
- Railway-hosted MySQL database
- Custom `gymbuddyapp.uk` domain
- Cloudflare DNS management
- HTTPS access
- Environment-based production configuration
- Persistent MySQL-backed application sessions
- Production database schema
- OpenAI API integration
- Google Maps integration
- GitHub-connected deployment workflow

Production secrets, credentials and API keys are supplied through environment variables and are not stored directly in source code.

## Project Structure

The main GymBuddy project structure is organised as follows:

```text
GymBuddy/
|
├── src/
│   ├── config/
│   │   └── database.js
│   │
│   ├── db/
│   │   ├── schema.sql
│   │   ├── schema.railway.sql
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
- **`src/db/`** – Contains database schemas and development seed data.
- **`src/routes/`** – Contains Express routes and backend logic for GymBuddy features.
- **`src/views/`** – Contains the Pug templates used to render application pages.
- **`src/public/css/`** – Contains application stylesheets.
- **`src/public/js/`** – Contains client-side JavaScript.
- **`src/public/uploads/`** – Stores uploaded profile and workout images.
- **`src/app.js`** – Configures Express, middleware, security, sessions and application routes.

### Database Schema Files

GymBuddy maintains database schema definitions for its different environments.

- **`src/db/schema.sql`** – Main/local database schema.
- **`src/db/schema.railway.sql`** – Production Railway database schema.
- **`src/db/seed.sql`** – Development seed data.

The Railway schema includes the database structures required by the deployed application, including AI Coach conversation and message storage.

### Important Root Files

- **`Dockerfile`** – Defines the GymBuddy application container image.
- **`docker-compose.yml`** – Defines the local development Docker environment.
- **`docker-compose.prod.yml`** – Provides a containerised production-style environment for local testing.
- **`.env.example`** – Documents required environment variables without exposing real credentials.
- **`package.json`** – Defines Node.js dependencies and application scripts.

## Getting Started

The recommended way to run GymBuddy locally is with Docker and Docker Compose.

This starts the Node.js application and MySQL database using the configuration included in the repository.

### Prerequisites

Before running GymBuddy locally, install:

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

The local development environment also includes phpMyAdmin at:

```text
http://localhost:8081
```

phpMyAdmin is provided for local database administration and is not part of the public Railway deployment.

### 5. Development Database

The main development database schema is defined in:

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

unless you intentionally want to delete Docker volumes and their stored data.

## Local Production-Style Testing

GymBuddy includes a separate Docker Compose configuration for testing the application locally using production-oriented settings.

This is separate from the live Railway deployment.

### 1. Configure Environment Variables

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Configure the variables with appropriate values.

For the live HTTPS environment:

```env
NODE_ENV=production
COOKIE_SECURE=true
```

When testing production mode locally through:

```text
http://localhost:3000
```

use:

```env
NODE_ENV=production
COOKIE_SECURE=false
```

because the local connection uses HTTP rather than HTTPS.

Never store production passwords, API keys or session secrets in the Git repository.

### 2. Build and Start

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

### 4. Local Production Database

Within the Docker Compose environment, GymBuddy communicates with MySQL through Docker's internal network:

```env
DB_HOST=db
DB_PORT=3306
```

The application uses a dedicated MySQL application account rather than the MySQL root administrator account.

Development seed data is intentionally excluded from the production-style configuration.

### 5. Persistent Storage

The Docker environment uses named volumes to preserve important data.

#### Database Storage

MySQL data is stored in:

```text
db_data
```

#### Uploaded Images

Uploaded files are stored through the configured upload storage.

In the Docker production-style environment, persistent upload storage can be mounted at:

```text
/app/src/public/uploads
```

### 6. Production-Style Sessions

Authenticated sessions are stored in MySQL instead of Express's default in-memory session store.

Session cookies use protections including:

```text
HttpOnly
SameSite=Lax
Secure when COOKIE_SECURE=true
```

### 7. Stop the Environment

Run:

```bash
docker compose -f docker-compose.prod.yml down
```

Persistent volumes remain available.

Do not normally run:

```bash
docker compose -f docker-compose.prod.yml down -v
```

because `-v` removes persistent Docker volumes.

### 8. Rebuild After Changes

Run:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Then verify:

```bash
docker compose -f docker-compose.prod.yml ps
```

## Railway Production Deployment

The public GymBuddy application is deployed using Railway.

### Web Application

Railway builds and runs the GymBuddy Node.js application from the project's GitHub repository.

Changes pushed to the deployment branch can trigger a new Railway deployment.

The public application is available through:

```text
https://gymbuddyapp.uk
```

### Production Database

GymBuddy uses a Railway-hosted MySQL database.

Production database credentials are supplied to the application using Railway environment variables rather than being stored in the repository.

The production schema is maintained in:

```text
src/db/schema.railway.sql
```

This schema contains the structures required by the live application.

### Custom Domain

The GymBuddy custom domain is:

```text
gymbuddyapp.uk
```

The domain is registered and managed through Cloudflare.

Cloudflare DNS records point the domain to the Railway-hosted GymBuddy service.

### HTTPS

The public application is accessed through HTTPS:

```text
https://gymbuddyapp.uk
```

Secure production session cookies can therefore use:

```env
COOKIE_SECURE=true
```

## Using GymBuddy

GymBuddy follows a social workout flow: create an account, discover or create workouts, connect with other users and track fitness activity over time.

### 1. Create an Account

New users can register for a GymBuddy account and provide the information required by the registration form.

After registration, users can log in and access their personal GymBuddy profile.

### 2. Manage Your Profile

Users can:

- Update profile information
- Add or edit a profile bio
- Upload a profile picture
- View workout statistics
- Access created workouts
- Access joined workouts
- View workout history
- Open messages
- View notifications
- Access the AI Coach

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
- Google Maps location information

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

The workout creator can accept or reject the request.

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

GymBuddy recommends potential workout partners using available user and workout information.

Recommendation factors can include:

- Fitness goals
- Workout streaks
- Completed workout activity
- Shared workout interests

Recommendations can include a compatibility score and reasons for the match.

### 8. Messaging

GymBuddy supports private messaging between users.

Before a new private conversation begins, users can send a message request.

The receiving user can accept or reject the request. Once accepted, both users can communicate through a private conversation.

### 9. Notifications

Notifications keep users informed about important GymBuddy activity.

Depending on the event, notifications can direct users to relevant areas of the application.

### 10. AI Coach

The GymBuddy AI Coach provides conversational fitness support using the OpenAI API.

The AI Coach can answer general fitness questions and, where appropriate, use available GymBuddy account context such as:

- Workout streaks
- Workout history
- Upcoming workouts
- Joined workouts
- Created workouts
- Recommended workout partners

AI Coach conversations and messages can be stored in the GymBuddy database, allowing users to maintain conversation history across sessions.

The production database includes dedicated AI conversation and message tables for this functionality.

The AI Coach is intended to provide general fitness support and does not replace qualified medical or healthcare advice.

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

GymBuddy includes security measures designed to protect user accounts, application data and production configuration.

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

- Database credentials
- MySQL administrator credentials where applicable
- Session secrets
- OpenAI API credentials
- Production configuration values

Local credentials belong in `.env`.

Production credentials are configured through the hosting environment.

`.env.example` contains only placeholder configuration.

The real `.env` file must never be committed to source control.

### Database Security

GymBuddy uses application-specific database credentials for normal database operations.

The public web application communicates with its production MySQL service using Railway's configured database environment.

Database credentials are not exposed to the browser.

### Application Security Headers

GymBuddy uses Helmet for HTTP security headers and related protections.

These include security controls such as:

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

### Request Protection

Standard form and JSON request bodies have configured size limits.

Important routes also perform server-side validation before database operations are completed.

### Production Error Handling

Development environments can expose additional debugging information to developers.

Production responses avoid exposing unnecessary internal application details to users.

### Container Security

The GymBuddy Docker image is configured to run the Node.js application using a non-root container user.

Local production-style environments also exclude unnecessary database-administration services such as phpMyAdmin.

### AI Coach Privacy

The AI Coach uses the OpenAI API to generate fitness-related responses.

Relevant GymBuddy account or workout information may be included as context when required by the feature.

OpenAI API credentials are stored using environment variables and are not exposed to the browser.

AI Coach conversations can be stored in GymBuddy's database to provide persistent conversation history.

Users should avoid submitting unnecessary sensitive personal information through the AI Coach.

### Production Security

The public GymBuddy deployment uses:

- HTTPS
- Environment-based production secrets
- Secure session configuration
- Hashed passwords
- Server-side authentication
- Database-backed sessions
- Security HTTP headers
- Server-side validation
- Restricted file uploads
- Cloudflare-managed DNS
- Railway production infrastructure

Regular dependency updates, database backups, monitoring and security reviews remain important ongoing maintenance responsibilities.

## Troubleshooting

### Docker Containers Are Not Starting

Check container status:

```bash
docker compose ps
```

For the production-style Docker environment:

```bash
docker compose -f docker-compose.prod.yml ps
```

View development logs:

```bash
docker compose logs web
```

View production-style Docker logs:

```bash
docker compose -f docker-compose.prod.yml logs web
```

Rebuild development:

```bash
docker compose up -d --build
```

Rebuild the production-style Docker environment:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Database Is Not Healthy Locally

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

### Railway Production Errors

For problems affecting the live application:

1. Open the GymBuddy Railway project.
2. Select the GymBuddy web service.
3. Open **Deployments**.
4. Select the latest deployment.
5. Review the deployment/runtime logs.

Database-related production errors should also be checked against the Railway MySQL service and the production database schema.

### Missing Production Database Table

If Railway reports an error similar to:

```text
ER_NO_SUCH_TABLE
```

verify that the required table exists in the Railway MySQL database and that:

```text
src/db/schema.railway.sql
```

contains the corresponding table definition.

Database schema changes committed to Git do not automatically guarantee that an already-existing production database has been migrated. Required schema changes must also be applied to the live database.

### Login Redirects Back to Login

When testing production mode locally over:

```text
http://localhost:3000
```

use:

```env
COOKIE_SECURE=false
```

For the live HTTPS deployment:

```env
COOKIE_SECURE=true
```

After changing local environment variables, recreate the web container:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate web
```

### CSS or JavaScript Does Not Load in Docker or Railway

Linux environments use case-sensitive file paths.

For example:

```text
src/public/css/
```

must match the paths used by the application.

The same rule applies to:

- Pug filenames
- JavaScript files
- CSS files
- images
- route imports
- other application resources

A filename that works on a case-insensitive local filesystem may fail after deployment to Linux.

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

Ensure deployed filenames and application references use identical casing.

### Image Upload Is Rejected

If an image is rejected:

- Check that it uses an accepted image format.
- Check that it is within the configured size limit.
- Try exporting the image again using a supported format.
- Make sure the file is a genuine image rather than a renamed unsupported file.

### Environment Variable Is Missing

For local development, check that `.env` exists in the project root and contains all required variables documented in `.env.example`.

For Railway production, check the GymBuddy service's configured environment variables.

Restart or redeploy the application after changing required production configuration.

### AI Coach Is Not Responding

For local development, check that the real `.env` contains a valid:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

Never commit a real API key to GitHub.

For the live application, verify that the OpenAI API key is configured as a Railway environment variable.

Also check the application logs for OpenAI API, database or AI conversation errors.

### Custom Domain Does Not Load

If:

```text
https://gymbuddyapp.uk
```

does not load correctly:

- Check the custom-domain status in Railway.
- Check the DNS records in Cloudflare.
- Confirm the CNAME points to the Railway-provided target.
- Confirm Railway's domain verification record is present if required.
- Allow time for DNS changes to propagate.
- Check that HTTPS/certificate provisioning has completed.

### Port 3000 Is Already in Use Locally

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

Do not remove persistent volumes as a normal troubleshooting step.

## Development Status

GymBuddy has completed its main development, production-readiness and initial deployment stages.

The application is now publicly deployed at:

**https://gymbuddyapp.uk**

The current application includes:

- User authentication and profile management
- Social workout discovery
- Workout creation and management
- Join requests
- Private messaging
- Notifications
- Workout history
- Workout streak tracking
- Workout partner recommendations
- Google Maps integration
- AI Coach functionality
- Persistent AI Coach conversation history
- Help and support tickets
- Workout reporting
- Responsive desktop and mobile interfaces
- Docker-based local environments
- Production database configuration
- Railway deployment
- Railway MySQL integration
- Custom domain configuration
- Cloudflare DNS management
- HTTPS production access

The project has progressed from local development through containerisation, production preparation, database deployment and public hosting.

Future development may include:

- Automated unit and integration testing
- End-to-end testing
- Expanded workout recommendation logic
- Additional AI Coach capabilities
- Improved application monitoring
- Automated database migrations
- Database backup strategies
- Further UI and accessibility improvements
- Performance optimisation
- Additional security hardening

## Author

**Richard Akole**

Computer Science student and developer of the GymBuddy web application.

GymBuddy was developed as a personal software engineering project focused on gaining practical experience with:

- Full-stack JavaScript development
- Node.js and Express.js
- MySQL database design
- Relational database integration
- User authentication and session management
- Application routing
- File uploads
- Third-party API integration
- AI-powered application features
- Persistent AI conversation systems
- Docker containerisation
- Production configuration
- Application security
- Cloud deployment
- Production database management
- DNS and custom-domain configuration
- Git and GitHub version control

## Project Notice

GymBuddy is a personal software engineering project.

The application is intended primarily for educational, portfolio and development purposes.

Fitness information provided through GymBuddy, including responses generated by the AI Coach, should not be considered professional medical advice.

## License

No open-source licence has currently been assigned to this project.

Unless a licence is added in the future, the source code should not be assumed to grant permission for copying, modification, redistribution or commercial use.