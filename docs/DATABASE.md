# Database setup

Postgres (Neon) via Drizzle ORM, using Neon's HTTP driver (`@neondatabase/serverless`) rather than a raw TCP connection — this environment only allows outbound HTTPS, and Neon's HTTP driver tunnels queries over HTTPS instead of opening a TCP socket on port 5432. Swapping to a different Postgres host later (e.g. Supabase, or Neon over TCP) means switching `src/db/index.ts` and `src/db/migrate.ts` back to `drizzle-orm/node-postgres` with the `pg` driver.

## 1. Get a connection string

- **Neon**: neon.tech → sign up → create a project → copy the connection string shown right after creation.

## 2. Configure

```
cp .env.example .env
```

Paste the connection string into `.env` as `DATABASE_URL`.

## 3. Install and set up the schema

```
npm install
npm run db:generate   # generates SQL migration files from src/db/schema.ts
npm run db:migrate    # applies them to your database
npm run db:seed       # inserts sample data (one tenant, one facility, users, a booking)
```

Seeded logins (all share the password `password123`):

| Role           | Email                        |
| -------------- | ----------------------------- |
| Platform Admin | platform-admin@example.com    |
| Admin          | admin@meridian.example.com    |
| Member         | alex@email.com                |

`npm run db:studio` opens Drizzle Studio to browse the data visually.

## Schema overview

| Table               | Purpose                                                              |
| -------------------- | --------------------------------------------------------------------- |
| `tenants`            | Venue businesses onboarded by the Platform Admin                     |
| `categories`         | Global, category-agnostic lookup (`table_tennis` seeded)              |
| `users`               | All three roles in one table (`platform_admin`, `admin`, `member`)    |
| `sessions`            | Opaque session tokens for the self-built auth                        |
| `facilities`         | A tenant's bookable resources (tables, courts, rooms, desks)          |
| `availability_slots` | Bookable time windows; unique per `(facility_id, start_at)`           |
| `packages`           | Session bundles a tenant sells                                       |
| `member_packages`    | A member's purchased package balance ("wallet")                      |
| `bookings`           | One reserved slot; `auto_approved` (has package) or `pending_approval` (pay-per-use) |
| `payments`           | Amount/status per booking or package purchase — gateway integration is deferred, so this stays `pending_manual` until an Admin marks it paid |

Full field-level detail is in `src/db/schema.ts`.
