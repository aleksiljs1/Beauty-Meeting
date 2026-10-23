# Project notes — Beauty Academy

Client: salon/aesthetics academy (owner's wife teaches). Placeholder name "Beauty Academy" until real name/branding supplied.

Original brief: `c:\Users\aleksiljs\Downloads\Beauty_Academy_Zoom_Claude_Megaprompt.md`

## Scope (four parts)

1. Public website (replaces client's existing, poor site) — Albanian default, admin-editable content.

2. Student portal — lessons (upcoming/live/replay/expired), live-class pop-up, lesson page with embedded Zoom + materials, replays, notifications.

3. Admin portal — students, lessons, invitations, enrolments/deadlines, materials, recordings, public content, Zoom status.

4. Meeting + expiry — embedded Zoom Meeting SDK; central server-side access policy enforcing deadlines on join, replay and files.

## Decisions (2026-10-20)

- Auth: **Better Auth** (maintained library) + custom invitation/enrolment/access logic.

  - Token design kept from the brief: HttpOnly session cookie (refresh role) + Better Auth JWT plugin issuing short-lived access JWTs held **in memory**.

  - Central Axios instance with interceptors: request attaches `Authorization: Bearer` only to our own API; response does single-flight token refresh, retries once, skips auth endpoints, and treats 403/LESSON_EXPIRED as "no access", not logout.

  - Next.js middleware/proxy (per installed Next version's convention) for route-level redirects; real authorization always re-checked server-side.

- Zoom: create a Zoom account **for the academy**; Meeting SDK app lives in the **same account**, and all lessons are hosted from it.

  Same-account joins need only the SDK JWT → avoids the March 2026 OBF/external-account review requirement. Students need no Zoom account.

- Zoom plan: develop on **Free** (40-min meetings, no cloud recording). Upgrade to **Pro** (monthly) shortly before the client demo if recording / long meetings must be shown.

- Mobile: Meeting SDK Web **Client View** on phones (Component View is desktop-only per docs). Materials in a tab beside it.

- Hosting: **undecided** — revisit later. Build stays deployment-agnostic (S3-compatible storage, Docker-friendly). Candidate: Hetzner VPS + Cloudflare R2.

- Phasing: 1) site + portals + auth + materials + manual recordings + demo classroom → 2) real Zoom join/host/webhooks → 3) automatic cloud-recording import.

## Accounts & invitations (decided by user, 2026-10-20)

- **Admin creates every student account** (name + email). The student receives a "set your password" email.

  No self-registration anywhere — not even through a lesson link.

- **One shared invitation link per lesson** (not per student). Teacher shares it with the class (e.g. WhatsApp).

  Student opens it → logs in with their own credentials → explicitly clicks "Bashkohu" → enrolled.

  Opening the link (GET / link previews) never enrolls. Optional redemption limit + redeem deadline per link.

## Technical decisions (2026-10-20)

- Versions: newest stable ≥2 weeks old, pinned exactly. Next 16.3.8 + React 19.2.8 (as pinned by create-next-app 16.3.8),

  Prisma 7.10.1 (security patch, Prisma 8 is still RC and unsupported by Better Auth), TypeScript 6.0.3 (typescript-eslint < 6.1).

- Next 16: `src/proxy.ts` (formerly middleware) does optimistic cookie redirects only; the DAL in `src/server/auth/session.ts` authorizes.

- API auth: our `/api/v1` accepts **only** `Authorization: Bearer <access JWT>` (no cookie auth → no CSRF surface).

  Better Auth's `/api/auth/*` is cookie-based with its own Origin checks. Mutations go through the API, not Server Actions.

- Access JWT verified with `jose` against in-memory cached public keys (Better Auth's `verifyJWT` hits the DB each call).

- **Zoom SDK isolated in its own frame page** loading Zoom's CDN build: `@zoom/meetingsdk` pins React 18.3.1 exactly,

  which conflicts with React 19. Frame also isolates Zoom CSS, avoids remounts, and scopes COOP/COEP headers. (Phase 2)

- **Realtime: Socket.IO** (user request, 2026-10-20) as a separate small service (`npm run realtime`, port 3100) —

  Next.js route handlers can't hold WebSockets. Auth = same access JWT (verified via the app's JWKS), one room per user,

  token re-sent before expiry, expired sockets disconnected. Fan-in via Postgres LISTEN/NOTIFY (no Redis).

  Events carry no data ("feed:changed"); clients refetch the policy-checked API. Resync on (re)connect + slow safety poll.

  Hosting must support long-lived connections (VPS fine; plain serverless not).

- Local S3: **SeaweedFS** (MinIO community images discontinued). Code uses plain S3 API → R2/S3 in production.

- npm 10.9 has an arborist crash (`edgesOut`) resolving Vitest's optional peers; Vitest was installed with `npx npm@11`.

- Known dev-only audit item: `braces` via eslint-config-next — no patched release exists; does not affect the site.

## Deferred / remember

- [ ] **Playwright smoke tests** (admin lesson creation/material upload; student login/enrolment/access/replay/expiry; responsive) — postponed by request, add later.

- [ ] Ask client about budget after the demo.

- [ ] Get real name, logo, address, copy, photos from client.

## Public gallery display controls (2026-10-22)

- Admin gallery images have independent public-display flags: `showInGallery`, `showOnHomeHero`,
  `showOnHomeGallery`, and `showOnAbout`. `isPublished` remains the master public-visibility switch.
- The upload form starts with only `showInGallery` on (the database default stays off). The admin can
  enable any combination, so an About image only appears on `/galeria` when `showInGallery` is also on.
- Empty single-image slots (home hero, About) fall back to the monogram placeholder, not stock photos.
- The admin editor saves only edited fields and mirrors slot hand-overs to the other cards, so a stale
  card can never take a slot back.
- `/galeria`, the home hero, the home gallery section, and `/rreth-nesh` each query only images
  selected for that destination. Home hero and About each render one image; assigning a new one
  clears the previous image from that same slot. Home gallery and `/galeria` support multiple images.
- Migration history: `20261022190000_gallery_placement` introduced a single-placement enum;
  `20261022200000_gallery_visibility_flags` converted it to independent booleans, backfilled each
  existing image from its old placement, then removed the enum. Keep both migrations in the repo;
  do not rewrite already-applied migration history.
- The migrations were applied to the configured local `academy` database (`localhost:5433`).
  Run `npm run db:generate` after schema edits and restart a running Next dev server after Prisma
  schema/client changes so it does not keep using an old generated client.
- Verification on 2026-10-22: `npm run check` passed (84 unit tests);
  `npm run test:integration` passed (69 tests), including independent-flag, single-slot replacement,
  and all four public-query filters. `npx prisma migrate status` reported the database up to date.

## Zoom docs verified 2026-10-20

- https://developers.zoom.us/docs/meeting-sdk/ — March 2, 2026: apps joining meetings outside their account must be authorized (ZAK/OBF/RTMS).

- https://developers.zoom.us/docs/meeting-sdk/obf-faq/

- https://developers.zoom.us/docs/meeting-sdk/web/browser-support/ — Component View not supported on mobile/tablet; use Client View.

## Zoom (Phase 2) — status 2026-10-22

First implementation by Eli (branch `Experimental`, 2026-10-21): meeting creation via Server-to-Server
OAuth, Meeting SDK signatures, host start with ZAK, isolated SDK frame with scoped CSP. Reviewed and
completed on branch `zoom-integration` (2026-10-22): see "Review fixes" below.

### How it works
- **Two Zoom apps in the academy's own account** (same account → no OBF/external-join review):
  a General app with **Embed → Meeting SDK** (`ZOOM_CLIENT_ID/SECRET`, signs join JWTs) and a
  **Server-to-Server OAuth** app (`ZOOM_S2S_*`, creates/updates/deletes meetings, issues the host ZAK).
- **Admin → lesson → "Klasa live në Zoom"**: create the meeting (once), start it as host inside the site,
  "Rifresko statusin nga Zoom" to recover from a missed webhook.
- **Students** click Join on the lesson page → `POST /api/v1/lessons/:id/join` re-checks the access
  policy and returns a role-0 signature + meeting number + passcode → handed to `/zoom-frame.html`.
- **Live state comes only from Zoom webhooks** (`/api/webhooks/zoom`): `meeting.started` → LIVE (students
  get the pop-up via Socket.IO), `meeting.ended` → ENDED. When the host ends the meeting, Zoom itself
  removes every participant; our pages switch to "ended" through the same realtime signal.
- Code: `src/server/zoom/{client,meetings,meeting-body,host,join,webhooks,webhook-signature,meeting-sdk-signature}.ts`,
  shared frame protocol `src/hooks/use-zoom-frame.ts`, frame `public/zoom-frame.{html,js}`.

### Design rules
- Webhooks match lessons by **meeting number** — a scheduled meeting gets a **new UUID every time it starts**.
- Events are verified (HMAC over the raw body, ±5 min timestamp), stored in `WebhookEvent` with a dedupe key
  (`zoom:<event>:<meeting>:<event_ts>`) before being applied, and applied **order-safely** (a delayed "started"
  can't reopen an ended lesson; a stale "ended" can't close a newer session; a real restart goes live again).
  FAILED events are re-processed on Zoom's retry.
- Meeting creation is duplicate-safe: DB lock (`zoomProvisioningStartedAt`), lesson marker in the agenda, and a
  lookup of existing meetings before creating and after any uncertain failure (timeout/5xx).
- No waiting room (our access policy decides who joins; 30 manual admissions would be unworkable),
  no Zoom accounts for students, cameras off on entry, `auto_recording` from `ZOOM_AUTO_RECORDING`.
- Passcodes encrypted at rest (AES-256-GCM, `APP_ENCRYPTION_KEY`); returned only inside a join/host authorization.
- Rescheduling a lesson PATCHes the Zoom meeting; cancelling or deleting it deletes the meeting. Zoom failures
  are audited and shown to the admin, never block saving the lesson.
- `ZOOM_MODE=demo` never touches Zoom. `ZOOM_MODE=live` refuses to start unless every Zoom variable is set.

### Zoom setup checklist (client / production)
1. Academy Zoom account on a plan with long meetings (Pro+); cloud recording if `ZOOM_AUTO_RECORDING=cloud`.
2. General app → Embed → Meeting SDK → `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`.
3. Server-to-Server OAuth app (same account), activated, scopes for meetings (create/read/update/delete) and
   user ZAK token → `ZOOM_S2S_ACCOUNT_ID`, `ZOOM_S2S_CLIENT_ID`, `ZOOM_S2S_CLIENT_SECRET`; host email → `ZOOM_HOST_USER_ID`.
4. In the S2S (or General) app: Event Subscriptions → endpoint `<APP_URL>/api/webhooks/zoom`, events
   **Meeting Started** and **Meeting Ended**; copy the Secret Token → `ZOOM_WEBHOOK_SECRET_TOKEN`. Zoom validates
   the URL immediately, so the site must be deployed on public HTTPS first.
5. Generate `APP_ENCRYPTION_KEY` (command in `.env.example`), set `ZOOM_MODE=live`, restart.
6. Acceptance test on staging: create meeting, host start, student join on desktop/Android/iPhone, end meeting →
   students leave and the lesson shows ended, reschedule → Zoom updated, cancel → Zoom meeting deleted.

### Review fixes (2026-10-22, on top of Eli's branch)
- Student join was broken (`mode: "zoom"` vs frame expecting `"student"`) → one shared `useZoomFrame` hook.
- `ZOOM_MODE=demo` was ignored (real meetings/credentials in demo) → gated everywhere.
- UUID-based matching would have broken webhooks → meeting number.
- Waiting room on → off. Duplicate meetings on timeout → lock + recovery. No token caching → cached.
- Rescheduling/cancelling didn't touch Zoom → synced. Integrations page showed old variable names → fixed.
- Plaintext passcode → encrypted. Hand-written JWT → `jose`. 400-line service with 3 copy-pasted request
  blocks → split modules + one `zoomRequest()`. Logic moved out of routes into services. UI text → `src/i18n/zoom.ts`.
- Webhooks implemented (they didn't exist yet). Tests: webhook signature, meeting bodies, secret box, and a
  15-case integration test against a fake Zoom API.

### Official Zoom references
- Server-to-Server OAuth: https://developers.zoom.us/docs/internal-apps/s2s-oauth/
- Meeting SDK auth (JWT, ZAK): https://developers.zoom.us/docs/meeting-sdk/auth/
- Web Meeting SDK Client View: https://developers.zoom.us/docs/meeting-sdk/web/client-view/
- Webhooks (validation, signature): https://developers.zoom.us/docs/api/webhooks/
- Meetings API: https://developers.zoom.us/docs/api/meetings/
