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

## Deferred / remember
- [ ] **Playwright smoke tests** (admin lesson creation/material upload; student login/enrolment/access/replay/expiry; responsive) — postponed by request, add later.
- [ ] Ask client about budget after the demo.
- [ ] Get real name, logo, address, copy, photos from client.

## Zoom docs verified 2026-10-20
- https://developers.zoom.us/docs/meeting-sdk/ — March 2, 2026: apps joining meetings outside their account must be authorized (ZAK/OBF/RTMS).
- https://developers.zoom.us/docs/meeting-sdk/obf-faq/
- https://developers.zoom.us/docs/meeting-sdk/web/browser-support/ — Component View not supported on mobile/tablet; use Client View.
