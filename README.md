# Akademia CEM

Website and academy portal for a beauty salon / aesthetics academy: a public marketing site
(Albanian), a student portal with live lessons, materials and recordings, and an admin portal.
Live video is provided by Zoom (Meeting SDK — Phase 2); until then a clearly labelled demo
classroom is used.

See `NOTES.md` for business and technical decisions, `IMPLEMENTATION_STATUS.md` for progress and
`docs/agent-guide.md` for code conventions.

## Stack
Next.js 16 (App Router) · React 19 · TypeScript (strict) · PostgreSQL 17 · Prisma 7 · Better Auth
· Axios · Zod · React Hook Form · Tailwind CSS 4 + shadcn/ui (Radix) · Socket.IO (realtime service)
· S3-compatible private storage (SeaweedFS locally, e.g. Cloudflare R2 in production) · Vitest.

## Components
| Component | Command | Notes |
|---|---|---|
| Web app (site, portals, API) | `npm run dev` / `npm run build && npm start` | port 3000 |
| Realtime service (Socket.IO) | `npm run realtime` | port 3100; must support long-lived connections |
| PostgreSQL | Docker | localhost:**5433** (5432 is often taken by a local install) |
| Private object storage | Docker (SeaweedFS) | localhost:8333 |
| Mail (dev inbox) | Docker (Mailpit) | UI at http://localhost:8025 |

Admin gallery uploads support independent display switches for the public gallery, home hero,
home gallery section, and About page. New uploads go to the gallery only, unless the admin changes the
switches; see `docs/testing.md` for a manual walkthrough.

## Local setup
Requirements: Node.js ≥ 22, Docker Desktop.

```bash
cp .env.example .env
# generate a secret and put it in BETTER_AUTH_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

docker compose up -d          # Postgres, SeaweedFS, Mailpit
npm ci                        # installs and generates the Prisma client
npx prisma migrate deploy     # apply migrations
npm run storage:init          # create the private bucket + CORS
npm run db:seed               # demo data (local only)

npm run dev                   # terminal 1 — http://localhost:3000
npm run realtime              # terminal 2 — live updates
```

Seeded local accounts (password `Demo-fjalekalim-2026`, development only):
`admin@akademia.local` (admin), `ana@akademia.local`, `elira@akademia.local`, `sara@akademia.local` (students).
`npm run db:reset` wipes and reseeds the development database.

### First real administrator
There is no public sign-up and no web page that can create an admin:
```bash
npm run admin:create -- --email owner@example.com --name "Emri Mbiemri"
```
The account is created without a password; a single-use setup link (72 h) is emailed and printed.

## Scripts
| Script | Purpose |
|---|---|
| `npm run check` | typecheck + lint + unit tests (run before every commit) |
| `npm run test:integration` | tests against Docker services, using a separate `academy_test` database |
| `npm run db:migrate` | create/apply a migration in development and regenerate the client |
| `npm run db:deploy` | apply migrations (production) |
| `npm run db:studio` | Prisma Studio |

## Security model (short)
- Our API (`/api/v1`) accepts only a short-lived access JWT (`Authorization: Bearer`), kept in
  memory by the Axios client; the long-lived session is an HttpOnly cookie. No cookie auth on the
  API means no CSRF surface there.
- Every protected read or grant goes through one central access policy (`src/server/access`).
- Private files are only reachable through presigned URLs valid ≤ 60 s (5 min for video playback),
  never beyond the student's access deadline.
- Invitation, reset and setup tokens are stored hashed.

## Deployment
Undecided. Whatever is chosen must run the web app, the realtime service (long-lived WebSocket
connections), PostgreSQL and S3-compatible storage, and later the recording-import worker and a
public HTTPS webhook endpoint. Ordinary PHP shared hosting cannot run this.
