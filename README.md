# Everafter — Wedding Planning

A local full-stack wedding planning workspace built with React, TypeScript, Vite, Express and SQLite. It is designed for a single Windows computer and works without a hosted backend.

## Requirements

- Node.js 24 or newer (uses Node's built-in SQLite driver)
- npm

## Start locally

1. Open a terminal in this project folder and run `npm install`.
2. Copy `.env.example` to `.env`.
3. Set a long random `SESSION_SECRET`, plus a private `ADMIN_EMAIL` and `ADMIN_PASSWORD`. The administrator account is created the first time the server starts. Use a password with at least 12 characters for the administrator.
4. Run `npm run dev`.
5. Open `http://localhost:5173`.

To open the administrator workspace, sign out of any customer account and use **Log in** with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`. It uses the same login form; after signing in, the **Administration → Operations** item appears in the sidebar. Do not use the example values as real credentials.

The API runs on `http://localhost:4000`. SQLite is stored in `data/wedding.sqlite`; uploaded images are stored under `uploads/`. Both remain on this computer.

## Accounts

Create a customer account from the registration form. To create the first administrator, set `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PASSWORD` in `.env` before the first server startup. If the database already exists, set these values and restart; the administrator is added if that email is not present. No administrator password is shipped in the source.

## Useful commands

- `npm run dev` — start the frontend and API for development
- `npm run build` — type-check and build the frontend for production
- `npm start` — start the API server
- `npm run db:seed` — verify the local demo catalogue and administrator configuration

To reset the local database, stop the server and remove `data/wedding.sqlite`, `data/wedding.sqlite-shm`, and `data/wedding.sqlite-wal`. Restarting the server recreates the schema and sample venues, service providers and packages. It also recreates the administrator if the environment variables are set. This removes local customer accounts and planning records, so copy the database file elsewhere first if you need to keep them.

## What is included

- Customer registration, login and logout with bcrypt password hashes, HTTP-only session cookies and SQLite-backed sessions.
- Private wedding events and multiple ceremony functions, with ownership enforced by the API.
- Local SQLite catalogue of venues, service providers and packages, with search and category filtering.
- Booking requests that remain pending until an administrator reviews them; approval checks for an existing approved booking for the same resource and date inside the database transaction.
- Budget estimates and actual expenses, guest list and RSVP management, chronological schedule, and review eligibility for completed bookings.
- Administrator summary, customer list endpoint, booking decisions, venue and service CRUD endpoints, package creation and review moderation endpoints.
- Admin catalogue includes active and inactive records, with deactivated venues and providers available to reactivate.
- Validated local image upload endpoint for JPEG, PNG and WebP files up to 5 MB.
- Responsive public site and customer/admin planning workspace with local SVG illustrations.

## Structure

```text
src/                 React pages and shared interface
server/db.ts         SQLite schema, indexes and demo catalogue
server/auth.ts       Authentication and role middleware
server/index.ts      Express API routes and validation
server/sessionStore.ts Persistent session store backed by SQLite
public/images/       Local artwork used by the catalogue and landing page
data/                Created locally for the persistent SQLite database
uploads/              Created locally for user-uploaded images
```

## Troubleshooting

- If port 4000 is busy, change `PORT` in `.env` and update the Vite proxy in `vite.config.ts` to the same port.
- If the database was created by an earlier incompatible schema, stop the server and reset the local SQLite files as described above.
- If `npm install` fails, confirm Node.js 24+ and npm are installed, then retry from this folder.
- Keep `.env`, the SQLite database, and uploaded files private; they are excluded from Git.

## Project notes

The shipped artwork consists of locally bundled SVG illustrations rather than licensed wedding photographs. The catalogue includes illustrative sample records. This is a practical offline demo; replace the artwork with photographs you own or have permission to use before presenting it as a real vendor marketplace. The production frontend can be served by a static host separately; this project itself has no hosted-service dependency.
