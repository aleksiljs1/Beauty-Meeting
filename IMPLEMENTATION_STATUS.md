# Implementation status

Single source of truth for progress. Update at the end of every work session / stage.
Legend: ✅ done & verified · 🟡 in progress · ⬜ not started · ⛔ blocked (reason)

## Phase 1 — site, portals, auth, materials, manual recordings, demo classroom

### Foundation
- ✅ Next.js 16.3.8 / React 19.2.8 / TypeScript 6 strict scaffold, ESLint flat config
- ✅ Pinned dependencies, lockfile, prod `npm audit` = 0
- ✅ Docker Compose: Postgres 17.11, SeaweedFS 4.48 (S3), Mailpit 1.31.3
- ✅ Prisma 7 schema (auth + academy domain + public content), client generated
- ⬜ First migration + seed (needs Docker running)
- ✅ Validated server env (`src/server/env.ts`)
- ✅ Better Auth config: no public sign-up, admin/student roles, hashed reset tokens, DB-backed rate limits, 5-min access JWT
- ✅ Typed API envelope + error handling (`src/server/http.ts`), `GET /api/v1/me`
- ✅ Access-token verifier with cached JWKS; DAL (`requirePageUser`, `requireApiUser`)
- ✅ Axios client + interceptors (single-flight refresh, one retry, 403 ≠ logout, own-origin only), cross-tab sign-out
- ✅ `src/proxy.ts` optimistic redirect for /portal and /admin
- ✅ Central access policy (pure) + loader; 15 unit tests passing
- ⬜ Security headers / CSP
- ⬜ Admin bootstrap command (`npm run admin:create`)

### Features
- ⬜ Public website (home, about, services, academy/courses, gallery, contact, privacy/terms drafts)
- ⬜ Login, password reset, password change pages
- ⬜ Admin: students (invite/create, deactivate), lessons CRUD + publish/cancel/archive, roster, invitations
- ⬜ Invitation redemption (transactional, idempotent, limit-safe)
- ⬜ Private storage provider + material upload/verify/view
- ⬜ Manual recording upload (multipart) + protected playback
- ⬜ Student portal: dashboard, lesson list filters, lesson page
- ⬜ Notifications + live-class pop-up (polling) + demo "go live" simulation
- ⬜ Demo classroom (clearly labelled)
- ⬜ Audit log entries for sensitive admin actions

## Phase 2 — real Zoom
- ⬜ Isolated Zoom frame (CDN SDK, Client View mobile / Component View desktop)
- ⬜ Server-to-Server OAuth, meeting creation (idempotent), SDK signature, host ZAK
- ⬜ Webhooks (signature verification, durable storage) → LIVE/ENDED state

## Phase 3 — cloud recording import
- ⬜ pg-boss worker, streamed multipart copy, idempotent import, retries

## Deferred
- ⬜ Playwright smoke tests (postponed by request)
- ⬜ Deployment target (undecided)
