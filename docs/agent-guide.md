# Contributor & agent guide

Read this fully before writing code. Also read `AGENTS.md` (Next.js 16 differs from older
versions — check `node_modules/next/dist/docs/` before using an API), `NOTES.md` and
`IMPLEMENTATION_STATUS.md`.

## Product in one paragraph
Albanian beauty salon/academy. Public marketing site + private portal. The administrator (the
teacher) creates student accounts (students set their own password from an emailed link),
creates lessons with access deadlines and shares **one invitation link per lesson** with the
class. A logged-in student opens the link and clicks "Bashkohu" to enroll. Students join live
classes (Zoom later; a clearly labelled **demo classroom** now), read materials (PDF) beside the
class and watch recordings until their deadline. All UI text is **Albanian** with correct
diacritics (ë, ç). Code, identifiers and docs are English.

## Golden rules
1. **Every protected read/grant goes through the central policy**: `requireLessonCapability()`
   (`src/server/access/lesson-access.ts`) or the existing services. Never write your own date
   or enrolment checks.
2. **Identity**: pages use `requirePageUser(role?)` / `getPageUser()`; API routes use
   `requireApiUser(request, role?)` (`src/server/auth/session.ts`). The proxy is only a redirect.
3. **Reads in Server Components, writes through the API.** Server Components may call services
   directly after `requirePageUser`. All mutations, polling and short-lived grants go through
   `/api/v1/**` route handlers called with the Axios client (`api`, `apiGet`, `apiSend` from
   `src/lib/api/client.ts`). No Server Actions (one auth mechanism for mutations: Bearer token).
4. **Route handlers are thin**: `export const POST = route(async (request, { params }) => { … })`
   from `src/server/http.ts`; validate input with Zod (`schema.parse(await readJson(request))`);
   return `ok(data)`; throw `ApiError(code, albanianMessage)`. Never return raw DB rows with
   secrets/object keys; never return provider errors.
5. **Never expose**: object keys, `tokenHash`, presigned URLs in lists (only from grant endpoints),
   invitation tokens after creation, other users' data.
6. **Don't modify shared core** without asking the lead: `prisma/schema.prisma`, `src/server/auth/**`,
   `src/server/access/**`, `src/server/http.ts`, `src/server/storage/**`, `src/server/services/**`,
   `src/lib/api/**`, `src/lib/datetime.ts`, `next.config.ts`, `src/app/layout.tsx`,
   `src/app/globals.css`, `src/components/ui/**`. If you need a change there, describe it in your
   final report instead (small additive helpers in a *new* file are fine).
7. **No new dependencies** unless unavoidable; if you add one, pin an exact version that is at least
   two weeks old and explain why in your report.
8. **No schema changes / migrations.** All models already exist. Ask if something is missing.
9. **`npm run check` must pass** (typecheck + lint + unit tests) before you finish. Run
   `npm run test:integration` if you touched services. Report real outcomes.

## Conventions
- **Dates**: store/compare UTC; display with `formatDate`, `formatTime`, `formatDateTime`,
  `formatTimeRange` from `src/lib/datetime.ts` (Europe/Tirane, Albanian). Admin forms use
  `<input type="datetime-local">` with `toZonedInputValue` / `fromZonedInputValue`. Always show the
  timezone next to schedules and deadlines.
- **Strings**: put UI text in your area's dictionary file `src/i18n/<area>.ts` (plain exported
  object). Don't hard-code long copy inside components. Shared words are in `src/i18n/common.ts`.
- **UI kit**: shadcn/ui components in `src/components/ui` (Radix). Brand tokens: `bg-background`,
  `text-foreground`, `text-muted-foreground`, `bg-secondary`, `text-rose-deep`, `bg-sand`,
  `bg-live`, headings use `font-heading` (Cormorant Garamond) automatically on h1–h3.
  Restrained editorial style: generous whitespace, no gradients/glass, subtle borders, rounded-md.
  Mobile first; must work at 360px wide. Use `lucide-react` icons.
- **Accessibility**: labels on every input, visible focus, keyboard reachable, `aria-live` for
  async status, respect reduced motion (global CSS already does). Meaningful alt text.
- **Loading/empty/error states** for every list and async action, with Albanian copy.
  Show `ApiClientError.message` (already user-safe) — never raw errors.
- **Performance**: Server Components by default; `"use client"` only for interactive leaves.
  Avoid client-side data waterfalls for initial render. Paginate admin lists (take ≤ 50).
  Use `next/image` for images. No heavy libraries for simple things.
- **Files**: components in `src/components/<area>/`, server queries in `src/server/queries/<area>.ts`
  (new files, `import "server-only"`), API routes under `src/app/api/v1/...`.

## Routes (Albanian slugs)
Public: `/`, `/rreth-nesh`, `/sherbimet`, `/akademia`, `/akademia/[slug]`, `/galeria`, `/kontakt`,
`/privatesia`, `/kushtet`.
Auth: `/hyr` (login, supports `?next=` — only allow relative paths starting with a single `/`),
`/fjalekalimi/harruar`, `/fjalekalimi/i-ri?token=…[&setup=1]`.
Student: `/portal`, `/portal/mesimet`, `/portal/mesimet/[id]`, `/portal/njoftimet`, `/portal/profili`,
invitation `/ftese/[token]`.
Admin: `/admin`, `/admin/studentet`, `/admin/mesimet`, `/admin/mesimet/[id]` (tabs: detaje, studentët,
ftesat, materialet, regjistrimet), `/admin/permbajtja/**`, `/admin/integrimet`, `/admin/historiku`.

## Existing building blocks (use them)
- Access: `requireLessonCapability(user, lessonId, "VIEW_CARD" | "VIEW_CONTENT" | "JOIN_LIVE")`,
  pure `evaluateLessonAccess`, `checkCapability`, `lessonPhase`, `effectiveDeadline` (`src/server/access/policy.ts`).
- Accounts: `createAccount`, `sendAccountSetupEmail`, `setAccountActive` (`services/accounts.ts`).
- Invitations: `createInvitation`, `revokeInvitation`, `previewInvitation`, `redeemInvitation`.
- Live: `markLessonLive`/`markLessonEnded` (demo source only for `isDemo` lessons), `getLiveFeed`,
  `dismissNotification`, `markNotificationsRead` (`services/live.ts`).
- Materials: `startMaterialUpload` → browser PUT to `uploadUrl` with `headers` → `finishMaterialUpload`;
  `listMaterials`, `grantMaterialAccess`, `deleteMaterial`.
- Recordings: `startRecordingUpload` → `presignRecordingParts` → browser PUT each part (collect
  `ETag` response header) → `completeRecordingUpload` / `abortRecordingUpload`; `listRecordings`,
  `grantRecordingPlayback` (5-min URL: the player must request a new grant before expiry or on error,
  then restore `currentTime`), `deleteRecording`.
- Audit: `audit(actorId, action, targetType, targetId, details)`.
- Client auth: `signIn`, `signOut`, `requestPasswordReset`, `resetPassword`, `changePassword`
  (`src/lib/api/auth.ts`); `getAccessToken`/`refreshAccessToken`; `onSignedOut`.

## Local setup in a worktree
```bash
cp ../<main checkout>/.env .env   # then set APP_URL=http://localhost:<your port>
npm ci                            # also generates the Prisma client
npx next dev --port <your port>   # 3001 public, 3002 admin, 3003 student
```
Docker services and the dev database are shared — **don't reset or reseed the database** and
don't run migrations. Seed accounts: `admin@akademia.local`, `ana@akademia.local`,
`elira@akademia.local`, `sara@akademia.local`, password `Demo-fjalekalim-2026`.

## Finishing
Commit on your branch with clear messages (no AI attribution trailers). Final report: what you
built (routes, endpoints, components), what you verified and how, what's incomplete, and any
change you need in shared core.
