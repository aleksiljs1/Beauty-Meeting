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

## Zoom docs verified 2026-10-20
- https://developers.zoom.us/docs/meeting-sdk/ — March 2, 2026: apps joining meetings outside their account must be authorized (ZAK/OBF/RTMS).
- https://developers.zoom.us/docs/meeting-sdk/obf-faq/
- https://developers.zoom.us/docs/meeting-sdk/web/browser-support/ — Component View not supported on mobile/tablet; use Client View.
## Zoom integration status and implementation notes (2026-10-21)

### Current development state

- A General app has been created in Zoom App Marketplace with **Features → Embed → Meeting SDK** enabled. Its Client ID/Client Secret are for Meeting SDK signatures, not Server-to-Server OAuth.
- A separate **Server-to-Server OAuth** app has been created and activated for backend meeting management.
- The S2S token request initially failed with HTTP 400 while the app was inactive. After activating the S2S app, meeting creation succeeded.
- A real Zoom meeting was created through the admin action and its details were confirmed saved in the local Prisma database. This verifies S2S OAuth, the Zoom Create Meeting API, and persistence for the tested lesson.
- `Lesson` now has nullable fields `zoomMeetingNumber`, `zoomMeetingUuid`, and `zoomMeetingPassword`. Migration: `20261021111611_add_zoom_meeting_details`.
- `src/server/zoom/meeting-sdk-signature.ts` creates a participant (`role: 0`) Meeting SDK JWT. Unit tests verify the token structure and HMAC signature. **The signature generator has not yet been wired into the student join endpoint or verified by joining a real meeting.**
- `src/server/zoom/meetings.ts` implements S2S OAuth, creates meetings under the configured host user, stores meeting details, and has a compensation delete attempt if persistence fails. `POST /api/v1/admin/lessons/[id]/zoom-meeting` is the protected admin endpoint. The admin lesson status UI has a confirmation-protected “Krijo takim Zoom (test)” action.
- Last reported `npm run check`: TypeScript and ESLint passed; 72 unit tests passed. Integration tests previously passed (53 tests) before the latest Zoom changes; rerun them before merging/releasing.
- `ZOOM_MODE` remains `demo`. The real-meeting creation flow works, but **real student joining and live host start are not implemented yet**. Do not switch to `live` as a production mode until the join/signature flow, host authentication, and embedded SDK have been integrated and tested.
- The `@zoom/meetingsdk` npm install was rejected by npm because its declared peer dependency is React 18.3.1 while this app uses React 19.2.8. Do not use `--force` or `--legacy-peer-deps` to bypass that conflict. The intended direction is to isolate the Zoom Web Meeting SDK in a dedicated frame page using Zoom's supported web/CDN SDK build; that approach still needs end-to-end implementation and verification.
- The admin integrations/status page currently displays legacy names such as `ZOOM_ACCOUNT_ID`, `ZOOM_MEETING_SDK_KEY`, and `ZOOM_MEETING_SDK_SECRET`. Those do not match the environment variables currently used by the new implementation. Update the status page and its configuration checks to use the current names below; do not add duplicate obsolete variables just to make its indicators green.
- **Security TODO:** `zoomMeetingPassword` is currently stored in Prisma as a regular string. Before production, decide and implement encryption at rest (with a separate encryption key managed as a deployment secret) and ensure the password and host `start_url` are never included in general lesson APIs, client props, logs, notifications, or audit metadata. Do not store/return the Zoom host `start_url` unless a secure, narrowly scoped host workflow explicitly needs it.

### Environment variables — current names

Set these in local `.env` for development and in the deployment platform's secret/environment settings for production. `.env` must remain git-ignored and must never be committed. `.env.example` should contain **empty placeholders only**, never real values.

| Variable | Purpose | Required when |
|---|---|---|
| `ZOOM_MODE=demo` or `ZOOM_MODE=live` | Controls whether the application's lesson experience uses demo or live mode. Keep `demo` until the join flow is complete. | Explicit in production; defaults to `demo` in development according to `src/server/env.ts` |
| `ZOOM_CLIENT_ID` | Meeting SDK app Client ID used as the SDK JWT `appKey`. | When `ZOOM_MODE=live` |
| `ZOOM_CLIENT_SECRET` | Meeting SDK app Client Secret used only server-side to sign SDK JWTs. Never expose to browser. | When `ZOOM_MODE=live` |
| `ZOOM_S2S_ACCOUNT_ID` | Account ID shown on the Server-to-Server OAuth app page. Must belong to the Zoom account whose meetings this app manages. | For meeting management; the code considers the S2S configuration complete when all four S2S settings are present |
| `ZOOM_S2S_CLIENT_ID` | Client ID from the **Server-to-Server OAuth app**, not the Meeting SDK app. | For meeting management |
| `ZOOM_S2S_CLIENT_SECRET` | Client Secret from the **Server-to-Server OAuth app**, not the Meeting SDK app. Server-only. | For meeting management |
| `ZOOM_HOST_USER_ID` | Host user's Zoom user ID or email address in the same Zoom account; meetings are created under this user. | For meeting management |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | Secret Token from Zoom's webhook/event-subscription configuration, used to verify webhook signatures. This is **planned/not yet wired into `src/server/env.ts` or webhook code**. Add only when implementing the webhook endpoint. | Later: meeting lifecycle / recording webhook integration |

Example **template only** (do not copy placeholder values as credentials):

```dotenv
# Meeting SDK app (separate from S2S OAuth app)
ZOOM_MODE=demo
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=

# Server-to-Server OAuth app — backend meeting management
ZOOM_S2S_ACCOUNT_ID=
ZOOM_S2S_CLIENT_ID=
ZOOM_S2S_CLIENT_SECRET=
ZOOM_HOST_USER_ID=

# Add when webhook handling is implemented; not currently consumed by the app
# ZOOM_WEBHOOK_SECRET_TOKEN=
```

Do not set either of the Client ID/Secret pairs to credentials from the wrong Zoom app. Do not prefix secrets with `NEXT_PUBLIC_`. Rotating a credential requires updating the matching deployment secret and restarting/redeploying the service.

### Zoom setup checklist for the client / production

The academy should own the Zoom account and control billing, app ownership, users, and credentials. The developer should not make the client's production app dependent on a personal Zoom account. Prefer creating these apps while signed in as the academy account owner or an authorized admin.

1. **Create/confirm the academy-owned Zoom account.** Decide who owns it, who can administer it, and who will host classes. Confirm the plan limits and whether cloud recording / longer sessions are needed before the demo; do not promise automatic cloud recordings on a plan that does not support them.
2. **Meeting SDK app (General app).** In Zoom App Marketplace, create/configure a General app, enable `Features → Embed → Meeting SDK`, and retrieve the Client ID and Client Secret for the correct environment. Configure allowed domains / production settings as required by the final deployed site. Keep the secret server-side. This app should belong to the same academy Zoom account that owns the meetings, matching the project decision to avoid external-account join authorization requirements.
3. **Server-to-Server OAuth app.** Create a separate Server-to-Server OAuth app in that same academy account and **activate** it. Copy its Account ID, Client ID, and Client Secret into the three `ZOOM_S2S_*` variables. Do not reuse the General/Meeting SDK app's Client ID or Secret.
4. **Scopes.** Grant least privilege for the operations actually used. Current code creates meetings and may issue a compensating delete if database persistence fails, so it needs the meeting-create and meeting-delete granular admin scopes. If update/cancel operations are implemented later, add the corresponding scopes then. Verify scope names against the current Zoom API documentation when configuring production: create `meeting:write:meeting:admin`, delete `meeting:delete:meeting:admin`, update `meeting:update:meeting:admin`.
5. **Host user.** Set `ZOOM_HOST_USER_ID` to the actual academy host's Zoom user ID or email address within the same account. Verify the account user is active and allowed to schedule/host meetings. The server sends requests to `/users/{ZOOM_HOST_USER_ID}/meetings`.
6. **Use the right credential environment.** Keep development credentials in local `.env`; use the appropriate production app credentials in the production secret store. Do not copy personal development credentials into client production. Test the final app/host/account combination before launch.
7. **Production environment.** Configure all required variables in the real hosting environment and restart/redeploy. Also configure `APP_URL`, `TRUSTED_IP_HEADER` for the actual reverse proxy, database/storage/email settings, HTTPS, backups, and logs according to the deployment plan. Never commit `.env` or paste secrets into tickets/chat/docs.
8. **Webhooks (later phase).** Once the deployment has a stable public HTTPS URL, configure Zoom event notifications for meeting lifecycle events (`meeting.started`, `meeting.ended`) and later `recording.completed`. Store the webhook Secret Token as `ZOOM_WEBHOOK_SECRET_TOKEN`, validate requests using Zoom's signature algorithm, handle retries/duplicate and out-of-order events, and return the required success response promptly. Localhost by itself is not a publicly reachable webhook URL.
9. **Host starts / teacher's embedded experience (not complete).** A participant signature (`role: 0`) only authorizes joining as a participant. To start a meeting as host with the Web Meeting SDK, implement a separate secure host flow with an appropriate `role: 1` signature and the host's Zoom Access Key (ZAK) token. Never expose the host `start_url`, S2S tokens, ZAK, or app Client Secret to students.
10. **Embedded student classroom (not complete).** Wire the current join API to re-check the Better Auth/API session, enrolment, meeting state, and deadline each time; return only the necessary meeting number, password, display name, and short-lived participant signature. Finish and test the SDK frame integration on desktop and mobile Client View before changing production `ZOOM_MODE` to `live`.
11. **Recordings (later phase).** Automatic cloud-recording import is deferred. Implement only after confirming the account plan supports cloud recording and adding authenticated webhook/download handling, private storage, retry/idempotency logic, expiry/access-policy enforcement, and encryption/security review.
12. **Final acceptance test.** From a deployed staging environment, create a meeting for a future non-demo lesson; verify Zoom and Prisma agree; join as an enrolled student; reject a non-enrolled user and an expired enrolment; test host start, lesson start/end events, mobile layout, and private materials/replays. Confirm app credentials and secrets are absent from browser bundles, responses, logs, Git history, and backups shared outside the client team.

### Known mismatch to fix before handing over

The current admin integrations page was showing checks for `ZOOM_ACCOUNT_ID`, `ZOOM_MEETING_SDK_KEY`, `ZOOM_MEETING_SDK_SECRET`, and `ZOOM_WEBHOOK_SECRET_TOKEN`. These are not the names used by the current S2S meeting-creation service and environment schema. Update the page to report separate readiness for:

- Meeting SDK: `ZOOM_CLIENT_ID` + `ZOOM_CLIENT_SECRET`.
- Meeting management: `ZOOM_S2S_ACCOUNT_ID` + `ZOOM_S2S_CLIENT_ID` + `ZOOM_S2S_CLIENT_SECRET` + `ZOOM_HOST_USER_ID`.
- Webhooks: show as not implemented until `ZOOM_WEBHOOK_SECRET_TOKEN` and verified webhook handling are added.

### Official Zoom references

- Server-to-Server OAuth: https://developers.zoom.us/docs/integrations/oauth/
- Meeting SDK credentials: https://developers.zoom.us/docs/meeting-sdk/get-credentials/
- Meeting SDK authorization / JWT and host ZAK requirements: https://developers.zoom.us/docs/meeting-sdk/auth/
- Web Meeting SDK (Client View): https://developers.zoom.us/docs/meeting-sdk/web/client-view/meetings-webinars/
- Meetings API: https://developers.zoom.us/docs/api/meetings/
- Zoom webhook verification: https://developers.zoom.us/docs/api/webhooks/
