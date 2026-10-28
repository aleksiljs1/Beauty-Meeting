# Project notes — Akademia CEM

Client: salon/aesthetics academy (owner's wife teaches). Brand name: "Akademia CEM".

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

- **"The class has started" email (decided by user, 2026-10-25).** When a lesson goes LIVE (Zoom webhook,
  host-room status check or demo go-live), every currently eligible student (same rule as the in-site alert)
  gets one email per live occurrence with a link to `/portal/mesimet/<id>?bashkohu=1`. It opens the lesson and
  joins automatically, after sign-in if needed (the sign-in redirect keeps the query). Sent in the background so
  the webhook answers fast; one failing address doesn't stop the others; addresses are never logged.
  Integration tests always use Mailpit and demo mode (pinned in `vitest.integration.config.mts`), whatever `.env` says.

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

  Open student lesson pages also re-render on any signal (user request, 2026-10-27): uploading, renaming,

  reordering or deleting materials/recordings signals the enrolled students, so new files appear without a reload.

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

## Course students (user request, 2026-10-27)

- Lessons belong to a course; now **students belong to courses too** (`CourseMember`, many-to-many: a
  student can attend several courses). Set when creating the student or later via Studentët → ⋯ → Kurset.
  The students list shows each student's courses and filters by course.
- **Membership never grants access by itself.** Access is still only a `LessonEnrollment`, checked by the
  central policy, so per-lesson deadlines, revocation, invitations, live alerts and emails work as before.
  Membership decides who is *offered*:
  - **New lesson in a course** → the course's active students appear pre-selected; untick anyone who
    shouldn't attend. They are enrolled when the lesson is created (source `COURSE`).
  - **Lesson → Studentët** → "Studentët e kursit" lists members not yet in the lesson, pre-selected, one
    button to add them. Anyone from outside the course is still added with the search below it.
  - **Student added to a course** → option (on by default) to also enrol them in that course's upcoming
    lessons (draft or published, not finished, not cancelled/archived).
- Nothing changes behind the admin's back: removing a student from a course, changing a lesson's course
  or deleting a course never removes lesson access. A student whose access to a lesson was revoked is never
  re-added automatically: in the roster they're listed unticked ("Aksesi u hoq më parë").
- Deactivated accounts are never offered. Tests: `course-members.integration.test.ts`.

## Excel student onboarding (2026-10-28)

- Admin opens `/admin/studentet` → **Student i ri** → **Importo nga Excel**. The existing single-student
  creation form remains available in the same dialog.
- The `.xlsx` workbook must have `Emrat`, `Email`, and `Abonimet` headers in its first worksheet's first row.
  `Emri` is accepted as an alias for `Emrat`; other non-empty headers are rejected. Multiple subscription
  names in a cell can be separated by commas or semicolons. An empty `Abonimet` cell is allowed.
- Preview and import are separate admin-authenticated API requests. Preview checks the file (5 MB maximum),
  rows (100 students maximum), required values, and email format. It returns only the three fields needed for
  onboarding; the workbook is read in memory and is never written to disk or retained by the API.
- On confirmation, subscription names are normalized and matched case-insensitively to existing course titles.
  Unmatched names block the import. The admin may also choose to add each student to upcoming lessons for
  their matched courses. Each account receives the same password-setup email as manual student creation.
- Implementation: `src/components/admin/students/import-students-panel.tsx`, the integration in
  `src/components/admin/students/create-student-dialog.tsx`, parser `src/app/api/v1/admin/students/csvparse.ts`,
  and API routes under `src/app/api/v1/admin/students/import/`. Existing account and course services are reused.
- Browser acceptance: user confirmed the Excel import and review workflow works. The batch is prevalidated
  before writes, but account creation/course assignment is sequential rather than a single transaction; an
  unexpected server/database failure mid-batch can leave earlier rows imported. Check the students list before
  retrying after such a failure.

## Lessons never get stuck in the wrong state (2026-10-27, from the business-logic review)

Live state comes from Zoom events; if one is lost, the lesson used to stay "waiting for the teacher"
or "live" for up to 30 days. Now:
- **One rule, one place:** `effectiveMeetingStatus` in `src/server/access/policy.ts`. `END_GRACE_MS` (2 h)
  after the scheduled end a lesson is over, whatever Zoom last reported (live or never started); until
  then an overrunning class stays joinable. Time never makes a lesson LIVE. Every reader uses it: join
  permission, lesson phase, classroom stage, live pop-up and the admin pages (dashboard, lesson status,
  publication and demo guards), so a recording uploaded later shows as a replay and nothing stays locked.
- **Admin → lesson → "Shëno si të përfunduar"** (`DELETE /api/v1/admin/lessons/:id/live`) ends a class the
  site still shows as live; alerts close at once. It doesn't close a meeting still open in Zoom.
- **Students can join while "waiting for the teacher"** (the join window is open). Before handing out the
  join details the server asks Zoom once whether the meeting started (`catchUpMeetingStart`); if so the
  lesson goes LIVE and everyone gets the pop-up, so a lost `meeting.started` can't hold up the class. If
  Zoom says the host hasn't started (SDK error 3008) the student sees "Mësuesja nuk e ka nisur ende
  klasën" and can retry. The pop-up's "Bashkohu" now joins in this state too.

## Students hear about cancelled or moved lessons (2026-10-27)

- **Cancelling a published lesson** (not yet over) → in-site notice "Mësimi u anulua" + email; its live and
  "starts soon" pop-ups close. Cancelling a draft notifies nobody (students never saw it).
- **Moving a published lesson** (start or end changed, not yet over) → notice "Orari i mësimit ndryshoi" +
  email with the new time; "starts soon" notices for the old time close. Once per new time.
- All notices (live, recording ready, cancelled, moved) go to the same students: active enrolment, active
  account, deadline not passed (`eligibleRecipients` in `services/live.ts`). Recording-ready notices now
  also skip expired students and unpublished lessons. Emails are sent in the background.
- Saving the lesson form unchanged is no longer logged as "summary/details changed" (empty vs. null).
- **Zoom warnings reach the admin:** if Zoom can't be updated after a move, or the meeting can't be
  removed after a cancel, the change is saved and a warning toast says so.
- **Dashboard → "Kërkon vëmendje"** lists published, upcoming lessons without a Zoom meeting (live mode).

## Lesson materials: MP4 videos and multi-file upload (2026-10-23)

- Materials may now include **MP4 videos** (`.mp4`/`.m4v`, declared `video/mp4`, verified by the `ftyp`
  box like recordings) for short technique demos next to the lesson. `.mov`/WebM and other containers
  stay out: MP4 (H.264/AAC) is the one format every target browser, including iPhone Safari, plays inline.
- **Size limits per type**: videos up to **4 GB**, PDF/Word/PowerPoint documents up to **100 MB**, and
  images up to **50 MB**. Full lesson
  recordings (up to 8 GB) still belong in Regjistrimet. Limits live on the allowlist rules
  (`file-types.ts`, `maxBytes`); `checkDeclaredFile()` is the single check used by the server and,
  for early feedback, by the admin UI (the server stays the authority and still verifies the bytes).
- **Why multipart for videos**: a single presigned PUT of hundreds of MB fails as a whole on any
  network blip and needs one URL that outlives the entire transfer. Video materials therefore reuse the
  recordings' multipart flow (64 MB parts, part URLs in batches, per-part retries with fresh URLs,
  ETags → complete → verify). Small documents keep the simpler single PUT. The open upload id is stored
  on `LessonMaterial.uploadId` (migration `20261023120000_material_multipart_upload`); deleting a
  pending material aborts the multipart upload, so cancelled uploads leave no parts behind.
- **Playback**: "Shiko" plays the video inline in the materials panel with the same protected player as
  recordings (`ProtectedVideo`): 5-minute inline grant bounded by the student's deadline, renewed before
  expiry or on a media error, position restored, stops with an Albanian message once access has ended.
  Downloads stay 60-second `attachment` grants. The video pauses when the materials panel is hidden, and
  the classroom stage is untouched (a sibling of the panel, never remounted).
- **Multi-file upload** (admin): `multiple` file input + drag-and-drop onto the Materialet panel; files
  upload two at a time with per-file progress/errors and a final summary. Invalid files are rejected
  locally without stopping the others; a cancelled or failed transfer deletes its pending record.

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
- **Zoom app fallbacks (2026-10-23)** — deliberate secondary options, never automatic redirects:
  - Student "Hap në aplikacionin Zoom" on the live classroom (live mode, real lesson with a meeting, never demo):
    `POST /api/v1/lessons/:id/zoom-app-link` runs the same `JOIN_LIVE` policy check, then returns Zoom's `join_url`
    (its `pwd` is Zoom's *encrypted* passcode, so the plain passcode would not work in a link). Stored AES-GCM
    encrypted in `Lesson.zoomJoinUrlEncrypted` (migration `20261023125056_zoom_join_url`), taken from the create
    response or backfilled once from `GET /meetings/{id}`; cleared when the meeting is deleted. Audited
    (`lesson.zoom_app_join`). Trade-off: the link doesn't expire like an SDK signature and can be forwarded while
    the meeting is open — acceptable for a fallback, and every hand-out is in the audit log.
  - Admin "Nis në aplikacionin Zoom": `POST /api/v1/admin/lessons/:id/host-app-start` fetches a fresh `start_url`
    (embeds a host token) from `GET /meetings/{id}`; same checks/time window as the in-browser start; never stored
    or logged; audited (`lesson.zoom_host_app_start`). For sharing an MP4 with sound (Share Screen → Advanced → Video).
  - Teacher guide at `/admin/ndihme` (nav + link in the Zoom panel). Feature status: `docs/zoom-feature-matrix.md`.
- Code: `src/server/zoom/{client,meetings,meeting-body,host,join,webhooks,webhook-signature,meeting-sdk-signature,zoom-url}.ts`,
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
3. Server-to-Server OAuth app (same account), activated. Only these scopes are needed (verified 2026-10-24 on a
   free test account): `meeting:write:meeting:admin`, `meeting:read:meeting:admin`, `meeting:update:meeting:admin`,
   `meeting:delete:meeting:admin`, `meeting:read:list_meetings:admin`, `user:read:zak:admin` (ZAK via
   `GET /users/{id}/zak`; `/users/{id}/token` would need the broader `user:read:token:admin`).
   → `ZOOM_S2S_ACCOUNT_ID`, `ZOOM_S2S_CLIENT_ID`, `ZOOM_S2S_CLIENT_SECRET`; host email (or `me` for the account
   owner, verified) → `ZOOM_HOST_USER_ID`. Free accounts work for testing (40-minute meetings, no cloud recording).
4. In the S2S (or General) app: Event Subscriptions → endpoint `<APP_URL>/api/webhooks/zoom`, events
   **Meeting Started** and **Meeting Ended**; copy the Secret Token → `ZOOM_WEBHOOK_SECRET_TOKEN`. Zoom validates
   the URL immediately, so the site must be deployed on public HTTPS first.
5. Generate `APP_ENCRYPTION_KEY` (command in `.env.example`), set `ZOOM_MODE=live`, restart.
6. Acceptance test on staging: create meeting, host start, student join on desktop/Android/iPhone, end meeting →
   students leave and the lesson shows ended, reschedule → Zoom updated, cancel → Zoom meeting deleted.
   Also: host start in the Zoom desktop app + MP4 share with sound, student "open in Zoom app" link, tab-audio share
   in the browser. Record results in `docs/zoom-feature-matrix.md` (currently nothing is tested against real Zoom).

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
