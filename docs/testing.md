# Testing guide

Two kinds of testing: **automated** (commands, run before every commit) and a **manual walkthrough**
(click through the app as the teacher and as students). Setup is in `README.md`.

> Everything below runs locally with demo data. It does **not** prove real Zoom works — that is
> Phase 2 and has its own checklist.

---

## 1. Automated tests

| Command | What it checks | Needs |
|---|---|---|
| `npm run check` | TypeScript, lint, unit tests (access rules, deadlines, timezone/DST, file-type checks, safe redirects, polling backoff…) | nothing |
| `npm run test:integration` | real database + storage + realtime: invitations (incl. 6 students racing for 3 spots), live alerts, materials (incl. multipart MP4 videos, per-type size limits, deadline-bound grants)/recordings upload & access, Socket.IO delivery, gallery uploads | `docker compose up -d` |
| `npm run build` | production build succeeds | database running |

All three must be green before committing. Integration tests use a separate database
(`academy_test`) and never touch your development data. Don't run two integration runs at the
same time — they share that database.

---

## 2. Manual walkthrough

### Start everything
```bash
docker compose up -d
npm run dev          # terminal 1 → http://localhost:3000
npm run realtime     # terminal 2 → live updates
```
Optional fresh start: `npm run db:reset` (wipes and reseeds the dev database).

### Test accounts (local only, password `Demo-fjalekalim-2026`)
| Account | Role | Seeded situation |
|---|---|---|
| `admin@akademia.local` | teacher/admin | — |
| `ana@akademia.local` | student | enrolled in demo, upcoming, replay and expired lessons |
| `elira@akademia.local` | student | same as Ana |
| `sara@akademia.local` | student | only the replay lesson, with a personal deadline of tomorrow; **not** in the upcoming lesson |

Tip: use a normal window for one account and a private/incognito window for another.
Emails (password setup/reset) arrive in **Mailpit: http://localhost:8025**.

### A. Public website (no login)
- [ ] Open `/` — home, services, courses, gallery placeholder, contact. Content shows "[…]" placeholders (real copy comes from the client).
- [ ] Visit Rreth nesh, Shërbimet, Akademia (open a course → enquiry buttons), Galeria, Kontakt, Privatësia/Kushtet (marked DRAFT).
- [ ] Shrink the browser to phone width (~360 px): menu opens as a side sheet, nothing overflows.

### B. Login and passwords
- [ ] `/hyr` with a wrong password → Albanian error. 6 quick wrong attempts → "too many attempts".
- [ ] Log in as Ana → lands on `/portal`. Log in as admin → lands on `/admin`.
- [ ] "Keni harruar fjalëkalimin?" → enter Ana's email → email in Mailpit → link → set a new password → log in with it. (Then `npm run db:reset` if you want the default password back.)
- [ ] While logged out, open `/portal` → redirected to `/hyr`.

### C. Student portal (as Ana)
- [ ] Dashboard shows upcoming lessons and recent replays.
- [ ] `Mësimet` filters: Të ardhshme / Live / Regjistrime / Skaduar. The expired lesson is listed but opens only as history (no materials).
- [ ] Open the replay lesson → Materialet → "Shiko" opens the sample PDF inside the panel; "Shkarko" downloads it.
- [ ] Times show Tirana time with the zone (CET/CEST) and "Aksesi deri më …".
- [ ] Profili → change password works; other sessions get signed out.

### D. Live class pop-up (the key feature)
Log in as **Ana** in one window and **Sara** in another, both on any page (portal or public site).
- [ ] Run `npm run demo -- live` → within ~1 second Ana sees **"Mësimi ka filluar"** with "Bashkohu në mësim" / "Më vonë". Sara sees **nothing** (not enrolled).
- [ ] Click "Më vonë" → pop-up closes (also in Ana's other tabs). The Join button is still on the dashboard and the lesson page.
- [ ] Click Join → lesson page → "Bashkohu" → **"Klasa demo — pa lidhje me Zoom"** stage. Switch to Materialet and open the PDF → the stage doesn't reload.
- [ ] Reload the page / log out and back in → the live state is still shown (catch-up after login).
- [ ] Run `npm run demo -- end` → alert disappears, the stage shows the lesson ended.
- [ ] Run `npm run demo -- reset` to make it repeatable.

### E. Shared invitation link
The seed printed a link for the upcoming lesson (or create one in the admin portal once merged).
- [ ] Logged out → open the link → asked to log in first.
- [ ] As **Sara** → preview page with "Bashkohu në mësim". Just opening it does **not** enroll her (check `Mësimet`).
- [ ] Click the button → enrolled → the lesson appears in her list. Opening the link again says she's already enrolled.
- [ ] As admin → the page explains links are for students.

### F. Admin portal (after the admin portal is merged)
- [ ] Create a student → setup email arrives in Mailpit → the student sets a password and logs in.
- [ ] Create a lesson; try an access deadline before the lesson end → you must confirm explicitly.
- [ ] Publish it, create an invitation link with a limit, copy it (shown only once), revoke it.
- [ ] Upload a PDF to the lesson → students see it; upload an MP4 recording → students can play it.
- [ ] Revoke a student's access while they have the lesson open → their Join button disappears immediately.
- [ ] Deactivate a student → their open tabs are signed out.
- [ ] Demo lesson → "Simulo fillimin" button does the same as `npm run demo -- live`.
- [ ] Historiku shows every action; Integrimet shows "Zoom: demo mode" honestly.
- [ ] Përmbajtja → edit academy info / a service / upload a gallery photo → public site updates on the next visit.

### Gallery display switches
- [ ] In `/admin/permbajtja/galeria`, turn every display switch off before uploading an image (only "Në galeri" starts on); confirm it stays out of all public pages.
- [ ] Enable only "Në galeri"; confirm it appears on `/galeria` and nowhere else.
- [ ] Enable only "Te Rreth nesh"; confirm it appears on `/rreth-nesh` but not `/galeria`. Enable both flags and confirm it appears in both places.
- [ ] Test the home switches independently: "Në krye të faqes kryesore" displays beside the home title; "Në galerinë e faqes kryesore" displays in the home gallery section.
- [ ] Assign another image to the home hero, then another to About; confirm each replaces the previous image in that single-image slot while other display flags stay unchanged — the previous image's switch turns off on its card without reloading.
- [ ] Disable "Publikuar" for an image with display switches enabled; confirm it disappears from public pages but remains in the admin gallery.

### Lesson materials: several files at once and MP4 videos
Prepare: two PDFs/images, one short `.mp4` (a phone clip works), one file over 50 MB that is not a
video (e.g. a large PDF), and a disallowed file (e.g. `.exe`, `.mov` or `.zip`).
- [ ] Admin → lesson → Materialet → "Ngarko materiale" → select all files at once. Each file gets its
      own row: invalid ones fail immediately with a reason ("nuk lejohet" / "shumë i madh (maksimumi 50 MB)")
      while the others upload, at most two at a time, each with its own progress bar.
- [ ] When the batch ends the header shows a summary ("3 skedarë u ngarkuan · 2 dështuan"); the uploaded
      files appear in the list in the selected order, the video with a film icon. "Mbyll listën" clears it.
- [ ] Drag the same files from the file explorer onto the Materialet panel → a dashed outline and
      "Lëshojini skedarët këtu…" appear; dropping starts the same batch.
- [ ] Start a batch with the video and press "Ndalo ngarkimet" → in-flight files show "U ndalua", nothing
      half-uploaded stays in the list. Closing the tab during a batch asks for confirmation.
- [ ] Rename a `.pdf` file to `.mp4` and upload it → "Dështoi" (the bytes are checked, not the name).
- [ ] Larger video (a few hundred MB): the upload continues if the Wi-Fi blips for a few seconds (parts are
      retried). In DevTools → Network you see several PUTs to `…partNumber=…`, not one huge PUT.
- [ ] As Ana (enrolled) open the lesson → Materialet → "Shiko" on the video → it plays inside the panel;
      seeking works. "Shkarko" downloads the `.mp4`.
- [ ] During a demo live class (`npm run demo -- live`, "Bashkohu"), play the video in the panel → the class
      stage does not reload. Switch to Info/Regjistrimet (or the "Klasa" tab on a phone) → the video pauses.
- [ ] Leave the video paused/playing for more than 5 minutes → it keeps working (the URL is renewed in the
      background; DevTools shows a new `…/access` request before expiry).
- [ ] As Sara (personal deadline): after her deadline passes, "Shiko"/"Shkarko" refuse with an Albanian
      message and an open video stops at its next renewal.

### G. Security spot checks (optional, terminal)
```bash
# API without a token → 401
curl -i http://localhost:3000/api/v1/me
# Public sign-up is disabled → 400 EMAIL_PASSWORD_SIGN_UP_DISABLED
curl -i -H "Origin: http://localhost:3000" -H "Content-Type: application/json" \
  -X POST http://localhost:3000/api/auth/sign-up/email \
  -d '{"email":"x@example.com","password":"Abcdefghij12","name":"X"}'
```

---

## 3. Real Zoom checklist (Phase 2 — not possible yet)
Embedded joining from desktop Chrome/Edge, Android Chrome and iPhone Safari · teacher hosting in the
browser and in the desktop app · 30 participants for 3 hours · microphone permissions, hand raising,
video with sound · reconnection after losing Wi-Fi · cloud recording import · storage size per lesson.
