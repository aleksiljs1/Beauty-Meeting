# Implementation status

Single source of truth for progress. Update at the end of every work session / stage.
Last updated: 2026-10-20
Legend: ✅ done & verified · 🟡 in progress · ⬜ not started · ⛔ blocked (reason)

## Phase 1 — site, portals, auth, materials, manual recordings, demo classroom

### Foundation
- ✅ Next.js 16.3.8 / React 19.2.8 / TypeScript 6 strict scaffold, ESLint flat config
- ✅ Pinned dependencies, lockfile, prod `npm audit` = 0
- ✅ Docker Compose: Postgres 17.11, SeaweedFS 4.48 (S3), Mailpit 1.31.3
- ✅ Prisma 7 schema (auth + academy domain + public content), client generated
- ✅ Migrations + dev seed (`npm run db:seed`, all lesson states, sample PDF, shared invite link)
- ✅ Validated server env (`src/server/env.ts`)
- ✅ Better Auth config: no public sign-up, admin/student roles, hashed reset tokens, DB-backed rate limits, 5-min access JWT
- ✅ Typed API envelope + error handling (`src/server/http.ts`), `GET /api/v1/me`
- ✅ Access-token verifier with cached JWKS; DAL (`requirePageUser`, `requireApiUser`)
- ✅ Axios client + interceptors (single-flight refresh, one retry, 403 ≠ logout, own-origin only), cross-tab sign-out
- ✅ `src/proxy.ts` optimistic redirect for /portal and /admin
- ✅ Central access policy (pure) + loader; 15 unit tests passing
- ✅ Security headers / CSP (next.config.ts), no-referrer on /ftese
- ✅ Admin bootstrap command (`npm run admin:create`)
- ✅ Design system: shadcn/ui (Radix), brand tokens, Cormorant Garamond + Manrope (latin-ext)
- ✅ Timezone helpers (Europe/Tirane ⇄ UTC, DST-tested)
- ✅ Services: accounts, shared invitations, live alerts/notifications, materials, recordings (34 integration tests)
- ✅ End-to-end auth checks: role escalation, sign-up, foreign origin, forged token all rejected

### Features
- 🟡 Public website (home, about, services, academy/courses, gallery, contact, privacy/terms drafts) + admin content forms — public-site agent
- 🟡 Login, password reset/setup, password change pages — student agent
- 🟡 Admin portal: students (create + setup email, deactivate), lessons CRUD + publish/cancel/archive, roster, invitation links, uploads, demo controls, integrations, audit view — admin agent
- ✅ Invitation redemption service (transactional, idempotent, limit-safe) — UI pending
- ✅ Private storage provider + material upload/verify/grant services — UI pending
- ✅ Manual recording multipart upload + playback grant services — UI pending
- 🟡 Student portal: dashboard, lesson list filters, lesson/classroom page, invitation page — student agent
- ✅ Live alert/notification service + demo go-live simulation service (tested)
- ✅ Socket.IO realtime service + browser client + publish hooks in services (6 integration tests)
- 🟡 Live-class pop-up UI, live-feed hook (Socket.IO signals + safety poll), notification bell — student agent
- 🟡 Demo classroom (clearly labelled) — student agent
- ✅ Audit entries written by services (accounts, invitations, live, materials, recordings)

## Phase 2 — real Zoom
- ⬜ Isolated Zoom frame (CDN SDK, Client View mobile / Component View desktop)
- ⬜ Server-to-Server OAuth, meeting creation (idempotent), SDK signature, host ZAK
- ⬜ Webhooks (signature verification, durable storage) → LIVE/ENDED state

## Phase 3 — cloud recording import
- ⬜ pg-boss worker, streamed multipart copy, idempotent import, retries

## How to verify
- `npm run check` (typecheck + lint + unit tests) · `npm run test:integration` (needs `docker compose up`; uses the separate `academy_test` DB) · `npm run build`

## Lead follow-ups (after merging agents)
- ⬜ Mount `<LiveClassAlert />` on public pages
- ⬜ README.md, docs/architecture.md, docs/storage-and-recordings.md, docs/acceptance-checklist.md

## Deferred
- ⬜ Playwright smoke tests (postponed by request)
- ⬜ Deployment target (undecided)
