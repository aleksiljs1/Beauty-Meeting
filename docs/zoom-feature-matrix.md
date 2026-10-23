# Zoom feature matrix

Status of every Zoom-related capability, as of 2026-10-23.

**Nothing has been tested against real Zoom yet** — the academy has no Zoom account. Our server code
is covered by `src/server/zoom/zoom.integration.test.ts`, which runs against a **fake Zoom API**
(meeting creation, links, ZAK, webhooks). That proves our logic (access checks, encryption, auditing,
ordering), not Zoom's behaviour. The acceptance test in `NOTES.md` → "Zoom setup checklist" must be
done on staging with the real account before any row below can move to "tested".

States: **tested** (verified against real Zoom) · **not tested** (implemented or relied on, never
tried with real Zoom) · **unsupported** (not available / not built).

| Feature | State | How it works / notes |
|---|---|---|
| Student joins embedded — desktop browser | not tested | Meeting SDK Web Client View in `/zoom-frame.html`; `POST /api/v1/lessons/:id/join` (policy-checked, role-0 signature). Fake-API tested. |
| Student joins embedded — Android | not tested | Client View is the only mobile-supported SDK view per Zoom's docs. Needs a real device check. |
| Student joins embedded — iPhone (Safari) | not tested | As above; iOS Safari audio/camera permissions are the main risk. |
| Host starts in the browser (embedded) | not tested | `POST /api/v1/admin/lessons/:id/host-authorization` → role-1 signature + ZAK. Fake-API tested. |
| Host starts in the Zoom desktop app | not tested | `POST /api/v1/admin/lessons/:id/host-app-start` → fresh `start_url` from `GET /meetings/{id}`; never stored or logged; same time window as the browser start; audited. Fake-API tested. |
| Share MP4 with sound — Zoom desktop app | not tested | Zoom's own Share Screen → Advanced → Video. Documented on `/admin/ndihme`. |
| Share a browser tab with tab audio — embedded host | not tested | Depends on the Web SDK and the browser (Chromium on desktop); may not work at all. |
| Chat | not tested | Zoom's own control. Files sent in chat are **not** saved by us (teacher uploads to Materials instead). |
| Raise hand | not tested | Zoom's own control. |
| Screen share (host) | not tested | Zoom's own control, browser or desktop app. |
| Screen share (students) | not tested | Governed by the Zoom account/meeting settings; we don't set it. |
| Cloud recording → automatic import | unsupported | Phase 3 (needs Zoom Pro). Today: manual MP4 upload per lesson. |
| Manual recording upload (MP4) | tested (our side only) | Not a Zoom feature; integration-tested against local storage. |
| End meeting for all | not tested | Zoom's own control; Zoom removes all participants, our `meeting.ended` webhook marks the lesson ENDED. |
| Remove one participant / eject on expiry | unsupported (by us) | Access expiry or revocation blocks *new* joins only; someone already in the meeting stays until removed in Zoom or the meeting ends. |
| Webhook `meeting.started` → LIVE + student alert | not tested | Verified signature, dedupe, order-safe; fake-signed events in tests. Needs the real endpoint validation on public HTTPS. |
| Webhook `meeting.ended` → ENDED | not tested | As above. |
| "Open in Zoom app" fallback (student) | not tested | `POST /api/v1/lessons/:id/zoom-app-link`: same `JOIN_LIVE` policy check as the embedded join, live mode + real meeting only, never in demo lessons; returns Zoom's `join_url` (with Zoom's encrypted `pwd`), stored AES-GCM encrypted, backfilled from `GET /meetings/{id}` if missing; audited. Caveat: unlike an SDK signature, the link doesn't expire and can be forwarded while the meeting is open. Fake-API tested. |
| Demo classroom (`ZOOM_MODE=demo`) | tested (our side only) | No Zoom involved. |
