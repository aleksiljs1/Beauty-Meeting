# Implementation status

Single source of truth for progress. Update at the end of every work session / stage.
Last updated: 2026-10-23
Legend: ✅ done & verified · 🟡 in progress · ⬜ not started · ⛔ blocked (reason)

How to run: `README.md` · How to test: `docs/testing.md` · Decisions: `NOTES.md`

## Phase 1 — site, portals, auth, materials, manual recordings, demo classroom

### Foundation
- ✅ Next.js 16.3.8 / React 19.2.8 / TypeScript 6 strict, ESLint flat config, pinned deps, prod `npm audit` = 0
- ✅ Docker Compose: Postgres 17.11 (port 5433), SeaweedFS 4.48 (S3), Mailpit 1.31.3
- ✅ Prisma 7 schema + migrations; dev seed with lessons in every state, sample PDF, shared invite link
- ✅ Validated server env; security headers / CSP; no-referrer on invitation links
- ✅ Better Auth: invite-only (no sign-up), admin/student roles, hashed tokens, DB rate limits, 5-min access JWT
- ✅ Axios client + interceptors (single-flight refresh, one retry, 403 ≠ logout, own-origin only), cross-tab sign-out
- ✅ `src/proxy.ts` optimistic redirect; real checks in the DAL (`requirePageUser`, `requireApiUser`)
- ✅ Central access policy + loader (unit-tested incl. exact deadline edge)
- ✅ Admin bootstrap command (`npm run admin:create`)
- ✅ Design system: shadcn/ui (Radix), brand palette, Cormorant Garamond + Manrope
- ✅ Timezone helpers (Europe/Tirane ⇄ UTC, DST-tested)
- ✅ Services: accounts, course students, shared invitations, live alerts, materials, recordings, audit (integration-tested)
- ✅ Socket.IO realtime service (`npm run realtime`) with Postgres LISTEN/NOTIFY, token re-auth, expiry sweep
- ✅ Clean clone from GitHub installs, passes checks and builds (verified after the `.gitignore` fix)

### Features
- ✅ Public website: home, about, services, courses (+ detail with WhatsApp/phone/email enquiry), gallery, contact, privacy/terms drafts — prerendered + tag revalidation
- ✅ Admin content editor (`/admin/permbajtja`): academy info, services, courses, gallery uploads (verified images)
- ✅ Gallery display controls: independent switches for `/galeria`, home hero, home gallery, and About; new uploads default to `/galeria` only; one active image per single-image slot
- ✅ Lesson materials: MP4 video materials (≤ 1 GB, multipart upload, inline protected player with grant renewal, download, deadline-bound) and multi-file upload (multiple select + drag-and-drop, 2 at a time, per-file progress/errors, summary) — integration-tested; browser click-through pending (docs/testing.md)
- ✅ Auth pages: login (`/hyr`), forgot password, set/reset password (incl. first-time setup link)
- ✅ Student portal: dashboard, lessons with filters, notifications, profile/password change
- ✅ Lesson/classroom page: demo classroom (labelled, no fake Zoom), materials panel (PDF viewer/download), recording player with grant renewal, mobile tabs, stage never remounts
- ✅ Invitation page `/ftese/[token]`: read-only preview + explicit "Bashkohu" (verified GET never enrolls)
- ✅ Live-class pop-up + notification bell via Socket.IO (+120 s safety poll), cross-tab dismissal — verified end to end
- ✅ Live-class pop-up on public pages for signed-in students (lazy-loaded; anonymous visitors don't download it)
- ✅ Admin portal: dashboard, students (create + setup email, deactivate/reactivate, resend), lessons CRUD/publish/cancel/archive/restore, roster & per-student deadlines, shared invitation links, material & multipart recording uploads, demo go-live/end/reset, integrations status, audit history (56 live API checks)
- ✅ Phase 1 merged: 67 unit + 50 integration tests, production build green
- ✅ Independent security review: no critical/high issues. Fixed all findings — rate limits no longer bypassable by
  spoofed X-Forwarded-For (TRUSTED_IP_HEADER required in production + per-account throttle), access tokens bound to
  their session (logout/reset revoke instantly), missing gallery upload route, normalized `next` redirect check,
  gallery cache shortened to 1 h. Verified live.

### Known issues / small follow-ups
- ⬜ Integration tests share one `academy_test` DB → random failures if two runs overlap (give each worktree its own DB)
- ⬜ Pages for lessons a student can't see return HTTP 200 with not-found content (streaming starts first); content is non-disclosing
- ⬜ Shared `Sheet` close button has an English screen-reader label ("Close") — translate in `src/components/ui/sheet.tsx`
- ⬜ "Aksesi deri më" is read twice by screen readers on lesson cards/header
- ⬜ Demo join endpoint allows join once the join window opens (UI only offers it when LIVE) — decide if it should require LIVE
- ⬜ Abandoned gallery uploads can leave orphan objects in storage (needs a cleanup job)
- ⬜ No visual/browser pass at 360 px yet (only HTTP-level checks) — do a manual click-through (see docs/testing.md); also verify in a browser that storage CORS exposes the ETag header (multipart recording upload)

## Phase 2 — real Zoom (code complete; needs the academy's Zoom account to test live)
- ✅ Isolated Zoom SDK frame (Client View, CDN SDK 6.5.0, scoped CSP) + shared `useZoomFrame` protocol — Eli + review
- ✅ S2S OAuth client (cached token), duplicate-safe meeting creation, reschedule sync, delete on cancel
- ✅ Student join (policy-checked, role-0 signature) and host start (role-1 + ZAK) inside the site
- ✅ Webhooks: verified, durable (WebhookEvent), deduplicated, order-safe → LIVE/ENDED + realtime pop-up
- ✅ Passcodes encrypted at rest; ZOOM_MODE=live refuses to start half-configured
- ✅ 15-case integration test against a fake Zoom API + unit tests (signatures, bodies, encryption)
- ✅ "Open in Zoom app" fallback for students (policy-checked, Zoom `join_url` stored encrypted, audited) and admin
  "start in the Zoom desktop app" (fresh `start_url`, never stored) — fake-API integration-tested
- ✅ Teacher help page `/admin/ndihme` (start options, video with sound, Zoom controls, materials vs chat, recordings, expiry)
- ⬜ Every Zoom feature is still untested against real Zoom — see `docs/zoom-feature-matrix.md`
- ⬜ Real-account acceptance test (desktop/Android/iPhone, 30 participants, 3 h) — see NOTES.md "Zoom setup checklist"

## Phase 3 — cloud recording import (needs Zoom Pro)
- ⬜ pg-boss worker, streamed multipart copy, idempotent import, retries

## Docs
- ✅ README.md (setup, run, scripts) · ✅ docs/testing.md · ✅ docs/agent-guide.md
- ✅ docs/zoom-feature-matrix.md (tested / not tested / unsupported; nothing real-Zoom tested yet)
- ⬜ docs/architecture.md, docs/storage-and-recordings.md, docs/zoom-setup.md

## Deferred
- ⬜ Playwright smoke tests (postponed by request)
- ⬜ Deployment target (undecided; must support long-lived WebSocket connections)
