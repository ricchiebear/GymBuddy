# GymBuddy Build Instructions

This guide explains how to configure, build, run and verify the GymBuddy web application using Docker.

GymBuddy provides separate Docker configurations for local development and production-style environments.

## Requirements

### Required

Install the following software before continuing:

- **Git** – used to clone and manage the source-code repository.
- **Docker Desktop** – used to build and run the GymBuddy application containers.
- **Docker Compose** – used to manage the GymBuddy web and database services.
- **Web browser** – used to access and test the application.

### Recommended

- **Visual Studio Code** – recommended for viewing and editing the project source code.

### Optional Local Node.js Installation

GymBuddy currently uses **Node.js 20** inside its Docker environments.

A separate Node.js installation on the host computer is not required when running GymBuddy entirely through Docker.

However, Node.js 20 and npm can be installed locally if you want to run Node-related commands directly outside the containers.

## 1. Clone the Repository

Open a terminal and run:

```bash
git clone https://github.com/ricchiebear/GymBuddy.git
```

Move into the cloned project:

```bash
cd GymBuddy
```

Confirm that you are inside the project directory:

```bash
ls
```

You should see important project files such as:

```text
Dockerfile
docker-compose.yml
docker-compose.prod.yml
package.json
package-lock.json
src/
README.md
BUILD.md
```

## 2. Environment Configuration

GymBuddy uses environment variables for application configuration, database credentials, session security and external services.

Create your local `.env` file from the provided template:

```bash
cp .env.example .env
```

The `.env` file should contain the required variables documented in `.env.example`.

A typical development configuration looks like:

```env
NODE_ENV=development
PORT=3000
COOKIE_SECURE=false

SESSION_SECRET=your_session_secret_here

OPENAI_API_KEY=your_openai_api_key_here

DB_HOST=db
DB_PORT=3306
DB_USER=gymbuddy_user
DB_PASSWORD=your_database_password_here
DB_NAME=gymbuddy

MYSQL_ROOT_PASSWORD=your_mysql_root_password_here
```

Replace all placeholder secret values with your own values.

### Important

Never commit the real `.env` file to GitHub.

The following values should remain private:

- `SESSION_SECRET`
- `OPENAI_API_KEY`
- `DB_PASSWORD`
- `MYSQL_ROOT_PASSWORD`

The `.env.example` file should contain placeholders only.

## 3. Development Build

GymBuddy uses `docker-compose.yml` as its development Docker configuration.

The development environment includes:

- Node.js 20 web application container
- MySQL 8.0 database container
- phpMyAdmin
- Persistent MySQL database storage
- Automatic database schema initialisation
- Development seed data
- MySQL health checking

### 3.1 Build and Start the Development Environment

Make sure Docker Desktop is running.

From the GymBuddy project root, run:

```bash
docker compose up -d --build
```

This command:

1. Builds or prepares the required Docker services.
2. Starts the MySQL database.
3. Waits for MySQL to become healthy.
4. Starts the GymBuddy Node.js application.
5. Starts phpMyAdmin.
6. Runs the services in the background.

The `-d` option runs the containers in detached mode.

The `--build` option ensures that required application changes are included when the environment starts.

### 3.2 Check the Running Containers

Run:

```bash
docker compose ps
```

The GymBuddy services should appear in the container list.

The database should eventually report a healthy status.

If a service does not start correctly, inspect its logs:

```bash
docker compose logs web
```

For the database:

```bash
docker compose logs db
```

### 3.3 Development Database Initialisation

The development MySQL container uses:

```text
src/db/schema.sql
```

to create the GymBuddy database structure.

It also uses:

```text
src/db/seed.sql
```

to insert development/test data.

These SQL files are mounted into MySQL's Docker initialisation directory through `docker-compose.yml`.

MySQL automatically runs these initialisation files when the database volume is created for the first time.

### Important: Existing Database Volumes

If the `db_data` volume already exists, MySQL does not automatically run `schema.sql` and `seed.sql` again every time the containers start.

This is intentional because the existing database should be preserved.

Therefore, changing `schema.sql` does not automatically update an already-initialised database.

### 3.4 Persistent Development Database

Development database files are stored in the Docker volume:

```text
db_data
```

This means normal container shutdowns and recreations do not delete the database.

For example:

```bash
docker compose down
```

stops and removes the containers but keeps the persistent database volume.

### 3.5 Access GymBuddy

Once the containers are running, open:

```text
http://localhost:3000
```

The GymBuddy application should load in your browser.

### 3.6 Access phpMyAdmin

The development environment includes phpMyAdmin for viewing and managing the MySQL database.

Open:

```text
http://localhost:8081
```

phpMyAdmin connects to the MySQL Docker service using:

```text
Host: db
Port: 3306
```

phpMyAdmin is intended for development use and is not included in GymBuddy's production Docker configuration.

### 3.7 View Application Logs

To follow the GymBuddy application logs:

```bash
docker compose logs -f web
```

To follow the database logs:

```bash
docker compose logs -f db
```

Press:

```text
Ctrl + C
```

to stop following the logs. This does not stop the containers.

### 3.8 Stop the Development Environment

Run:

```bash
docker compose down
```

The containers will stop and be removed, while persistent database data remains available.

To start the environment again:

```bash
docker compose up -d
```

If application dependencies or Docker configuration have changed, rebuild with:

```bash
docker compose up -d --build
```

### 3.9 Reset the Development Database

Only reset the database when a completely fresh development environment is intentionally required.

Run:

```bash
docker compose down -v
```

Then rebuild:

```bash
docker compose up -d --build
```

Removing the volume causes MySQL to create a new database and run `schema.sql` and `seed.sql` again.

> **Warning:** `docker compose down -v` permanently deletes data stored in the development Docker volumes. Do not use it as a normal restart command.

## 4. Production Build

GymBuddy uses a separate production Docker configuration:

```text
docker-compose.prod.yml
```

The production setup is designed to run GymBuddy with a smaller and safer service footprint than development.

It includes:

- Production Node.js web container
- MySQL 8.0 database container
- Persistent MySQL storage
- Persistent upload storage
- Database health checking
- Web application health checking
- MySQL-backed sessions
- Production security configuration
- No phpMyAdmin service
- No direct MySQL host-port exposure

### 4.1 Production Dockerfile

The production web application is built using:

```text
Dockerfile
```

The Dockerfile:

- Uses Node.js 20
- Installs production dependencies with `npm ci --omit=dev`
- Copies the GymBuddy application into the image
- Creates the uploads directory
- Runs the application as the non-root `node` user
- Exposes port `3000`
- Includes a web health check
- Starts GymBuddy using `npm start`

### 4.2 Production Environment Configuration

Before starting the production environment, configure the `.env` file with secure values.

A production configuration should include:

```env
NODE_ENV=production
PORT=3000
COOKIE_SECURE=true

SESSION_SECRET=your_secure_session_secret

OPENAI_API_KEY=your_openai_api_key

DB_HOST=db
DB_PORT=3306
DB_USER=gymbuddy_user
DB_PASSWORD=your_secure_database_password
DB_NAME=gymbuddy

MYSQL_ROOT_PASSWORD=your_secure_mysql_root_password
```

For a real HTTPS deployment:

```env
COOKIE_SECURE=true
```

When testing production locally over:

```text
http://localhost:3000
```

use:

```env
COOKIE_SECURE=false
```

### Important

The following values should never be committed to GitHub:

```text
SESSION_SECRET
OPENAI_API_KEY
DB_PASSWORD
MYSQL_ROOT_PASSWORD
```

Use `.env.example` only as a public configuration template.

### 4.3 Build and Start Production

From the GymBuddy project root, run:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This command:

1. Builds the GymBuddy production image.
2. Starts the MySQL database.
3. Waits for the database health check to pass.
4. Starts the GymBuddy web container.
5. Mounts persistent database and upload storage.
6. Runs the containers in the background.

### 4.4 Check Production Container Status

Run:

```bash
docker compose -f docker-compose.prod.yml ps
```

After startup, the important services should report:

```text
gymbuddy-db-1     Up (healthy)
gymbuddy-web-1    Up (healthy)
```

The exact container names may vary depending on the project directory or Docker Compose version.

### 4.5 Production Database Initialisation

The production database mounts:

```text
src/db/schema.sql
```

into MySQL's initialisation directory.

Unlike development, production does not automatically load:

```text
src/db/seed.sql
```

This prevents development/test data from being inserted into a new production database.

As with development, `schema.sql` runs automatically only when MySQL initialises a new database volume.

### 4.6 Production Database Network

The production MySQL container does not expose port `3306` directly to the host.

The GymBuddy web container connects through Docker's internal network using:

```env
DB_HOST=db
DB_PORT=3306
```

The application should connect using:

```env
DB_USER=gymbuddy_user
```

rather than the MySQL root administrator account.

### 4.7 Persistent Database Storage

Production MySQL data is stored in:

```text
db_data
```

This volume is mounted at:

```text
/var/lib/mysql
```

Recreating the database container does not normally delete the stored database.

### 4.8 Persistent Upload Storage

GymBuddy stores production profile and workout images in:

```text
uploads_data
```

The volume is mounted at:

```text
/app/src/public/uploads
```

This means uploaded files survive web-container rebuilds and recreations.

### 4.9 Production Session Storage

GymBuddy uses `express-mysql-session` to store authenticated user sessions inside MySQL.

This avoids Express's default in-memory session storage and allows login sessions to survive web-container restarts.

The session table is created automatically when required.

### 4.10 Production Health Checks

The MySQL service includes a Docker health check using `mysqladmin`.

The web application image also includes a health check that sends a request to:

```text
http://localhost:3000/
```

Docker can therefore distinguish between:

```text
Container running
```

and:

```text
Application responding correctly
```

### 4.11 View Production Logs

Follow the web application logs:

```bash
docker compose -f docker-compose.prod.yml logs -f web
```

Follow the database logs:

```bash
docker compose -f docker-compose.prod.yml logs -f db
```

Show only recent web logs:

```bash
docker compose -f docker-compose.prod.yml logs web --tail=200
```

### 4.12 Rebuild the Production Web Application

After application code changes, rebuild with:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

To force the web container to be recreated:

```bash
docker compose -f docker-compose.prod.yml up -d --build --force-recreate web
```

### 4.13 Stop the Production Environment

Run:

```bash
docker compose -f docker-compose.prod.yml down
```

This removes the production containers while preserving named volumes.

Do not normally run:

```bash
docker compose -f docker-compose.prod.yml down -v
```

because `-v` removes persistent volumes and can permanently delete:

- MySQL data
- Uploaded profile images
- Uploaded workout images

> **Warning:** Production Docker volumes should not be deleted as part of a normal restart or rebuild.

## 5. Build Verification Checklist

After building GymBuddy, verify that the containers, database and main application features are working correctly.

The following checks can be used for both development and production-style testing.

### 5.1 Check Container Status

For development:

```bash
docker compose ps
```

For production:

```bash
docker compose -f docker-compose.prod.yml ps
```

Confirm that the required services are running.

The MySQL database should report:

```text
healthy
```

The production web container should also report:

```text
healthy
```

### 5.2 Check Application Logs

For development:

```bash
docker compose logs web --tail=100
```

For production:

```bash
docker compose -f docker-compose.prod.yml logs web --tail=100
```

Check for unexpected startup errors, database connection failures or missing environment variables.

### 5.3 Open the Application

Open:

```text
http://localhost:3000
```

Confirm that the GymBuddy home page loads successfully.

Also confirm that:

- CSS styling loads correctly.
- Images and static assets load.
- Desktop navigation works.
- Mobile navigation works when the browser window is reduced.

### 5.4 Test User Authentication

Verify the authentication flow:

1. Open the registration page.
2. Register a test account using an accepted email address.
3. Log in with the account.
4. Confirm that the authenticated home/dashboard page loads.
5. Open the user profile.
6. Log out.
7. Confirm that protected pages are no longer accessible without logging in.

If login immediately redirects back to the login page during local production testing, verify:

```env
COOKIE_SECURE=false
```

### 5.5 Test Database-Backed Pages

After logging in, open pages that retrieve information from MySQL.

Examples include:

- Profile
- Workouts
- My Workouts
- Joined Workouts
- Workout History
- Streaks
- Notifications
- Messages
- Recommendations
- Support History

Confirm that the pages load without database errors.

### 5.6 Test a Database Write

Create a new workout.

Confirm that:

1. The form submits successfully.
2. The workout is stored in MySQL.
3. The new workout appears in the appropriate GymBuddy pages.
4. The workout can be opened again after navigating away.

Then edit the workout and confirm that the updated information is saved.

This verifies both database reads and database writes.

### 5.7 Test Image Uploads

Upload a supported profile or workout image.

Confirm that:

- The upload succeeds.
- The image appears in the application.
- Unsupported image formats are rejected.
- Oversized files are rejected when they exceed the configured upload limit.

For production, confirm that uploaded files are stored through:

```text
uploads_data
```

### 5.8 Test Persistent Storage

For production, create or update some test data and upload an image.

Restart the environment:

```bash
docker compose -f docker-compose.prod.yml down
```

Then start it again:

```bash
docker compose -f docker-compose.prod.yml up -d
```

Confirm that:

- User accounts still exist.
- Workouts still exist.
- Messages and other stored data remain available.
- Uploaded images still load.

This verifies the `db_data` and `uploads_data` persistent volumes.

### 5.9 Test Workout Workflow

Test the main GymBuddy workout flow using two test users where required.

Verify:

1. A user can create a workout.
2. Another user can discover the workout.
3. The second user can request to join.
4. The creator can review the request.
5. The creator can accept or reject the request.
6. An accepted workout appears under Joined Workouts.
7. Eligible workouts can be completed.
8. Completed activity appears in workout history.
9. Streak information updates where applicable.

### 5.10 Test Messaging and Notifications

Verify that:

- Message requests can be sent.
- Message requests can be accepted or rejected.
- Accepted users can communicate through private messages.
- Relevant application actions generate notifications.
- Notifications can be opened and managed.

### 5.11 Test Workout Recommendations

Open the workout-partner recommendations page.

Confirm that:

- Recommendations load successfully.
- Compatibility information is displayed.
- Match reasons are displayed where available.
- Recommended user profiles can be accessed.

### 5.12 Test Google Maps

Open a workout that contains location information.

Confirm that the embedded Google Maps content loads correctly and is not blocked by the application's Content Security Policy.

### 5.13 Test AI Coach

Open the GymBuddy AI Coach.

Ask a simple fitness-related question.

Confirm that:

- The message is submitted successfully.
- A response is returned.
- No OpenAI API error appears in the application.

If the feature fails, verify that a valid `OPENAI_API_KEY` exists in `.env`.

### 5.14 Test Help and Support

Submit a test support request.

Confirm that:

- The support form submits successfully.
- The ticket appears in Support History.
- The ticket details can be opened.

### 5.15 Test Workout Reporting

Using an appropriate test account:

1. Open a workout created by another user.
2. Submit a workout report.
3. Confirm that the report is accepted.
4. Confirm that users cannot report their own workouts.
5. Confirm that duplicate pending reports are prevented where applicable.

### 5.16 Final Log Check

After completing the functional tests, inspect the production logs:

```bash
docker compose -f docker-compose.prod.yml logs web --tail=200
```

Also inspect the database logs if necessary:

```bash
docker compose -f docker-compose.prod.yml logs db --tail=200
```

Expected validation messages may appear when intentionally testing invalid input.

Investigate unexpected application crashes, database errors, repeated exceptions or failed service connections.

### 5.17 Build Verification Result

The build can be considered successfully verified when:

- Required containers are running.
- Health checks pass.
- GymBuddy loads in the browser.
- Authentication works.
- Database reads and writes work.
- Persistent storage works.
- Image uploads work.
- Main workout workflows work.
- Messaging and notifications work.
- Recommendations work.
- Google Maps loads.
- AI Coach responds.
- Help and support works.
- Reporting works.
- No unexpected critical errors appear in the logs.

## 6. Useful Docker Commands

This section provides commonly used Docker commands for developing, testing and maintaining GymBuddy.

### 6.1 Development Commands

Start development:

```bash
docker compose up -d
```

Build and start development:

```bash
docker compose up -d --build
```

Check container status:

```bash
docker compose ps
```

Stop development:

```bash
docker compose down
```

Restart development services:

```bash
docker compose restart
```

Follow web logs:

```bash
docker compose logs -f web
```

View database logs:

```bash
docker compose logs db
```

### 6.2 Production Commands

Build and start production:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Start production without rebuilding:

```bash
docker compose -f docker-compose.prod.yml up -d
```

Check production status:

```bash
docker compose -f docker-compose.prod.yml ps
```

Stop production:

```bash
docker compose -f docker-compose.prod.yml down
```

Restart production:

```bash
docker compose -f docker-compose.prod.yml restart
```

Follow production web logs:

```bash
docker compose -f docker-compose.prod.yml logs -f web
```

View production database logs:

```bash
docker compose -f docker-compose.prod.yml logs db
```

### 6.3 View Running Containers

```bash
docker ps
```

Show running and stopped containers:

```bash
docker ps -a
```

### 6.4 View Docker Volumes

```bash
docker volume ls
```

GymBuddy uses persistent volumes including:

```text
db_data
uploads_data
```

Docker Compose may display names similar to:

```text
gymbuddy_db_data
gymbuddy_uploads_data
```

### 6.5 Open a Shell Inside the Web Container

Development:

```bash
docker compose exec web sh
```

Production:

```bash
docker compose -f docker-compose.prod.yml exec web sh
```

Exit with:

```bash
exit
```

### 6.6 Access MySQL

Development:

```bash
docker compose exec db mysql -u root -p
```

Production:

```bash
docker compose -f docker-compose.prod.yml exec db mysql -u root -p
```

MySQL will request the root password configured through `MYSQL_ROOT_PASSWORD`.

### 6.7 Inspect Compose Configuration

Development:

```bash
docker compose config
```

Production:

```bash
docker compose -f docker-compose.prod.yml config
```

> The resolved output may contain environment values. Check it carefully before sharing it.

### 6.8 Rebuild Only the Web Application

Development:

```bash
docker compose up -d --build web
```

Production:

```bash
docker compose -f docker-compose.prod.yml up -d --build web
```

### 6.9 Force-Recreate the Web Container

Development:

```bash
docker compose up -d --force-recreate web
```

Production:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate web
```

### 6.10 Reset Development Volumes

```bash
docker compose down -v
docker compose up -d --build
```

> **Warning:** Removing volumes permanently deletes their stored data.

### 6.11 Production Volume Warning

Do not normally run:

```bash
docker compose -f docker-compose.prod.yml down -v
```

It can delete persistent production database records and uploaded images.

For normal production shutdown:

```bash
docker compose -f docker-compose.prod.yml down
```

## 7. Build Troubleshooting

### 7.1 Docker Desktop Is Not Running

Make sure Docker Desktop is running, then try:

```bash
docker compose ps
```

### 7.2 Docker Compose Configuration Error

Validate development:

```bash
docker compose config
```

Validate production:

```bash
docker compose -f docker-compose.prod.yml config
```

If Docker reports a YAML error, check indentation and structure.

### 7.3 Database Container Is Unhealthy

Check status and logs:

```bash
docker compose ps
docker compose logs db
```

For production:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs db
```

Verify the database variables in `.env`.

### 7.4 Web Container Does Not Start

Check:

```bash
docker compose logs web
```

or:

```bash
docker compose -f docker-compose.prod.yml logs web
```

Common causes include missing environment variables, invalid database credentials, dependency problems or JavaScript errors.

### 7.5 Missing Environment Variable

Compare `.env` against:

```text
.env.example
```

GymBuddy validates important environment variables during startup.

### 7.6 Invalid COOKIE_SECURE Value

Valid values are:

```env
COOKIE_SECURE=true
```

or:

```env
COOKIE_SECURE=false
```

### 7.7 Login Returns to Login

For local production testing over HTTP:

```env
COOKIE_SECURE=false
```

Then recreate the web container:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate web
```

### 7.8 MySQL Credentials Changed but Old Values Remain

MySQL user/password environment variables are mainly applied when a fresh database volume is initialised.

Changing `.env` does not automatically rewrite credentials inside an existing MySQL database.

Do not reset production data simply to change credentials.

### 7.9 schema.sql Changes Are Not Appearing

`schema.sql` runs automatically when MySQL initialises a fresh volume.

Changes to `schema.sql` do not automatically update an existing database.

### 7.10 Seed Data Is Missing

Development `seed.sql` is loaded only when a fresh development database is initialised.

Production intentionally excludes it.

### 7.11 Static Files Do Not Load

Linux uses case-sensitive paths.

For example:

```text
src/public/css/
```

is different from:

```text
src/public/CSS/
```

### 7.12 Pug View Not Found

Check that the view name matches the filename exactly.

For example:

```javascript
res.render("login");
```

should match:

```text
login.pug
```

### 7.13 Image Upload Fails

Check the image format, size and file validity.

Expected validation rejection does not necessarily indicate an application failure.

### 7.14 Uploaded Images Disappear

Production uploads should use:

```text
uploads_data
```

mounted at:

```text
/app/src/public/uploads
```

### 7.15 Port 3000 Is Already in Use

Check:

```bash
docker ps
```

Stop the conflicting service before starting GymBuddy again.

### 7.16 Port 8081 Is Already in Use

Port `8081` is used by development phpMyAdmin.

Check running containers and stop the conflicting service.

### 7.17 AI Coach Does Not Respond

Check that `.env` contains a valid `OPENAI_API_KEY`.

Never publish the real key.

### 7.18 Production Container Is Running but Unhealthy

Check:

```bash
docker compose -f docker-compose.prod.yml ps
```

Then:

```bash
docker compose -f docker-compose.prod.yml logs web --tail=200
```

### 7.19 Full Development Reset

If development data is disposable:

```bash
docker compose down -v
docker compose up -d --build
```

> **Warning:** This deletes development volume data.

### 7.20 Production Data Warning

Avoid:

```bash
docker compose -f docker-compose.prod.yml down -v
```

for routine maintenance.

A normal production restart should preserve volumes.

## 8. Quick Start and Build Completion

### 8.1 Quick Development Setup

```bash
git clone https://github.com/ricchiebear/GymBuddy.git
cd GymBuddy
cp .env.example .env
docker compose up -d --build
docker compose ps
```

Open:

```text
http://localhost:3000
```

Development phpMyAdmin:

```text
http://localhost:8081
```

Stop development:

```bash
docker compose down
```

### 8.2 Quick Production-Style Setup

For local production testing:

```env
NODE_ENV=production
COOKIE_SECURE=false
```

Build and start:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Check:

```bash
docker compose -f docker-compose.prod.yml ps
```

Open:

```text
http://localhost:3000
```

### 8.3 Real HTTPS Production

Use:

```env
NODE_ENV=production
COOKIE_SECURE=true
```

A public deployment should also provide:

- HTTPS/TLS
- Secure secret management
- Database backups
- Server and network security
- Monitoring and logging
- Appropriate access controls
- Regular dependency and security updates

### 8.4 Build Completion Checklist

Before considering a GymBuddy build complete, confirm:

- [ ] `.env` has been created from `.env.example`.
- [ ] Real secrets are not committed to Git.
- [ ] Docker configuration validates successfully.
- [ ] Required containers start successfully.
- [ ] MySQL reports a healthy status.
- [ ] The production web container reports a healthy status.
- [ ] GymBuddy loads at `http://localhost:3000`.
- [ ] Registration and login work.
- [ ] MySQL-backed sessions work.
- [ ] Database reads and writes work.
- [ ] Workout creation and editing work.
- [ ] Profile and workout image uploads work.
- [ ] Persistent database storage works.
- [ ] Persistent upload storage works.
- [ ] Workout join requests work.
- [ ] Messaging and notifications work.
- [ ] Workout recommendations work.
- [ ] Google Maps loads correctly.
- [ ] AI Coach responds correctly.
- [ ] Workout history and streaks work.
- [ ] Help and support tickets work.
- [ ] Workout reporting works.
- [ ] Mobile navigation works.
- [ ] Application logs contain no unexpected critical errors.

### 8.5 Build Documentation

For project overview, features and architecture, see:

```text
README.md
```

For detailed build, Docker, verification and troubleshooting instructions, use:

```text
BUILD.md
```

## Build Status

GymBuddy's development and production-style Docker environments have been built and tested successfully.

The application has completed a production smoke test covering its main user flows, database operations, persistent storage, external integrations and Docker services.

Future deployment to a public hosting environment may require additional provider-specific configuration.
