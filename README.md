# BookingWebApp

Express + SQLite booking app: signup/login, admin-managed resources and weekly availability, customer booking.

## Run locally

    npm install
    ADMIN_EMAILS=you@example.com npm start   # http://localhost:3000
    npm test

## Configuration

| Variable | Purpose | Default |
|---|---|---|
| `ADMIN_EMAILS` | Comma-separated emails that become admins (on signup, or at startup for existing accounts) | none |
| `DB_FILE` | SQLite file path | `booking.db` |
| `PORT` | HTTP port | `3000` |
| `NODE_ENV` | `production` makes the session cookie `Secure` (HTTPS only) | unset |

## Deploy (Render)

1. Render dashboard > **New > Blueprint**, connect this GitHub repo and branch.
2. When prompted, set `ADMIN_EMAILS` to your email.
3. Deploy. Render gives you an `https://…onrender.com` URL. Sign up with the admin email, then open `/admin.html`.

The database is a SQLite file on a 1 GB persistent disk mounted at `/data`. Because of the disk, run a single instance only. The `Dockerfile` also works on Fly.io or Railway (mount a volume at `/data`).
