# THIRTY | The Roni Archives

A private, invitation-only archive for Roni's 30th birthday on **3 December 2026** (launch at 00:00, Africa/Lagos).

| Route | Who | Purpose |
| --- | --- | --- |
| `/` | Anyone | Countdown gate until launch. After launch, signed-in Roni (and family viewers, if enabled) see the birthday experience. Curators see it early in preview |
| `/contribute` | Contributors (no account) with the shared group link or a personal link | Contribution Studio: an 8-step guided form with uploads |
| `/admin` | Curator (`admin` role) | Contributors, invitation links, submissions, curation, library, launch settings, accounts |
| `/my-archive` | Roni (`roni` role) | The Original Thirty (read-only) and her Continuing Story |
| `/sign-in` | Roni, family viewers, curators | Email and password sign-in. There is no sign-up page |

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1. Foundation | Schema, RLS, private storage, roles, launch gating, audit log, Vercel config | Done |
| 2. Contribution portal | Invitation links, Contribution Studio, uploads, removal requests | Done |
| 3. Curation | Submission review and import, media library, timeline, stories, people, wishes, editorial copy, launch controls, accounts, Original Thirty lock | Done |
| 4. Birthday experience | Opening, timeline, Through Their Eyes, Memory Vault, Thirty Wishes, Roni Times, letters, finale; 3D scenes with HTML fallbacks | Done |
| 5. Personal archive | `/my-archive`: Original Thirty summary and Roni's Continuing Story with uploads | Done |
| 6. QA | RLS suite, build and lint, browser checks under the production CSP, test data removed | Done |

Not implemented: reminder emails or SMS (invitation links are copied by hand), and a load test.

## Stack

React 19, TypeScript, Vite 8, Tailwind 4, React Router 8, Motion, GSAP (ScrollTrigger), React Three Fiber, Drei and three.js, Zod 4, Supabase (Postgres, Storage, Auth, Edge Functions), Vercel.
Liquid Glass is a vendored, MIT-licensed port in `src/vendor/liquid-glass` with a CSS fallback.

## Architecture

```
Browser (Vercel static SPA)
 ├─ Contributors ──► Edge Function `contribute` (token auth, secret key server-side)
 │                     ├─ Postgres (service access, scoped to the invitation's contributor)
 │                     └─ Storage: one-time signed upload URLs, private bucket
 ├─ Curator ───────► Edge Function `admin-accounts` (create/delete users, set roles; admin checked in code)
 └─ Curator / Roni / family ─► Supabase Auth + Postgres RLS (publishable key only)
                                └─ Storage: short-lived signed read URLs
```

- **Contributors never get database access.** Every request goes through `supabase/functions/contribute`, which hashes the invitation token (SHA-256), checks it is active and unexpired, and only touches rows belonging to that contributor.
- **Shared link:** `/contribute#j=<token>` only allows `link` (is it valid?) and `join`. Joining takes a name, relationship and category, creates a contributor and a personal invitation, and returns that personal token; from then on the person is handled exactly like someone the curator invited individually. Joining is rate-limited per IP (8 per hour) and per link (300 per day).
- **Actions:** `link`, `join`, `session`, `start`, `save` (optimistic concurrency via `version`), `upload-url`, `finalize-upload` (magic-byte and size check of the stored object), `delete-media`, `submit` (idempotency key; freezes an immutable copy), `removal-request`.
- **Uploads:** browser → signed upload URL → private bucket. Photos are re-encoded on the device (longest edge 2800 px, JPEG) so EXIF/GPS data never leaves it. Anything that fails verification is marked `rejected` and its file deleted.
- **Drafts** autosave every 2 s after typing stops, are mirrored to `localStorage`, and are flushed on tab hide, reconnect and unload. A replacement link reaches the same draft (one open draft per contributor).
- **Curation** copies submitted content into separate curated tables. Originals stay immutable; nothing reaches the experience until a curator publishes it.
- **Birthday experience** (`src/features/experience`) reads only published content through RLS. Sections with no published content are hidden from viewers and shown to curators as clearly labelled "preview only" placeholders. Nothing is invented: if fewer than 30 wishes are published, the remaining stars stay unlit.
- **3D:** at most one scene canvas is mounted at a time (the opening "30", then the wishes constellation only while it is near the viewport). Every 3D element has an HTML/CSS equivalent. `?lite` in the URL, Save-Data, no WebGL or a scene error switch to the fallbacks. Reduced motion renders static frames.
- **Personal archive** (`src/features/archive`): Roni's Continuing Story lives in its own `continuing_story` collection (one per person, enforced by a unique index), created on her first visit after launch. Her files go to `continuing/<her user id>/…` in the private bucket.

## Data model (summary)

- `user_roles` (`admin`, `roni`, `family_viewer`) and `site_settings` (`launch_at`, `timezone`, `experience_active`, `preview_enabled`, `family_access_enabled`, `contributions_open`).
- `contributors` (`shared_link_id` marks people who joined via the shared link), `invitations` and `shared_links` (only `token_hash` is stored; at most one active shared link), `contributions` (`submitted_payload` is immutable once set), `contribution_drafts`, `media_assets`, `removal_requests`.
- Curated content, kept separate from originals: `archive_collections` (`original_thirty`, which can be locked, and `continuing_story`), `chapters`, `memories`, `timeline_milestones`, `birthday_wishes`, `letters`, `experience_content`, `contributor_profiles`, `content_approvals`.
- `audit_logs` and `rate_limits` are server-only.

Migrations are in `supabase/migrations` and are applied to project `wwhhdrixdsoueupsdzab` (eu-west-2).

## Security model

- Only the **publishable** key ships to the browser. `src/lib/env.ts` refuses to start if a secret or service-role key is configured.
- RLS on every table. Helpers live in a non-exposed `private` schema. `RequireRole` and hidden buttons are conveniences only; the database enforces access.
- **Launch gate:** curated content is readable only when `experience_active` is on **and** `now() >= launch_at` **and** the user has a role (family viewers also need `family_access_enabled`). Curators can read unpublished content to curate it. The countdown screen unlocks nothing.
- **Original Thirty lock:** once locked, its memories, chapters, milestones, letters, wishes, profiles, editorial copy and media are read-only for everyone, curators included. Roni's Continuing Story is unaffected.
- **Continuing Story:** Roni can create and edit it only after launch, only in her own collection, and only with media in her own storage folder. She cannot write to the Original Thirty or see contributions, drafts or unpublished items.
- Private bucket; reads use 10-minute signed URLs; uploads use one-time signed URLs (contributors) or path-restricted storage policies (Roni).
- Invitation and shared-link tokens: 256-bit random, base64url, shown once, stored hashed, revocable, expiring. Links carry the token in the URL fragment (`#t=` personal, `#j=` shared), so it is never sent to servers or logs, and the app removes it from the address bar.
- The shared link lets anyone who has it create a contributor, so treat it like a group password: share it only in private groups, and replace or turn it off if it leaks. People who already joined keep their own links and drafts. Nothing they submit appears anywhere until a curator approves and publishes it.
- Rate limits per IP and per invitation; audit log for invitations, submissions, uploads, rejections and account changes.
- Camera and microphone are requested only when the contributor presses record. Nothing autoplays, including the optional soundtrack.
- `vercel.json` sets CSP (no `'unsafe-eval'`), HSTS, `X-Frame-Options: DENY`, `noindex` and a restrictive Permissions-Policy. Zod runs with `z.config({ jitless: true })` so it never probes `new Function` under that CSP.

## Design system

- **Colours:** Midnight `#101014`, Ivory `#F6F1E8`, Champagne Gold `#C6A66B`, Burgundy `#572C3D`, Warm Grey `#A9A39C` (tokens in `src/styles/index.css`).
- **Type:** Cormorant Garamond (display, editorial serif) and DM Sans (UI), self-hosted via Fontsource. The 3D "30" uses a digits-only three.js typeface generated by `scripts/make-typeface.mjs` (instructions in the file; OFL licence in `src/features/experience/three/OFL.txt`).
- **Motion:** restrained, honours `prefers-reduced-motion`. Glass is disabled for reduced transparency, forced colours, Save-Data and low-power devices.

## Setup

```bash
cp .env.example .env.local   # VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev                  # http://localhost:5173
npm run build && npm run preview
npm run lint
```

> **Local development note:** this folder is inside `~/Documents`, which iCloud "Desktop & Documents" syncs. iCloud touches file metadata, which makes the Vite dev server restart and reload the page unexpectedly. Production builds are unaffected. For a stable dev loop, move the project outside `~/Documents` (for example `~/Developer`).

## Required configuration (not done automatically)

The project currently has **no user accounts**.

1. **First curator account:** Supabase Dashboard → Authentication → Users → *Add user*, then in the SQL editor:
   `insert into public.user_roles (user_id, role) values ('<user id>', 'admin');`
   After that, create Roni's account (role `roni`) and any family viewers (role `family_viewer`) from `/admin/accounts`, which calls the `admin-accounts` edge function.
2. **Disable public sign-ups:** Authentication → Sign In / Providers → turn off *Allow new users to sign up*.
3. **Edge function secrets** (Dashboard → Edge Functions → Secrets):
   - `ALLOWED_ORIGINS` (both functions): comma-separated, for example `https://your-domain.com,http://localhost:5173`. While unset, any origin is accepted.
   - `RATE_LIMIT_SALT` (`contribute`): a long random string.
4. **Vercel:** install the CLI (`npm i -g vercel`), link the project and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The CSP in `vercel.json` hard-codes the Supabase domain; update it if the project changes.
5. **Email/SMS:** no provider is configured. Invitation links and account passwords are shared by hand. Supabase's built-in mailer is rate-limited and not meant for production; add custom SMTP if you want password-reset emails.
6. **Music:** the soundtrack is optional (Editorial → Music, choosing an audio file from the Library). Only use a track you have the rights to.
7. **Plan limits:** the Free plan caps uploads at 50 MB per file, which is why video is limited to 50 MB.

## Launch controls (`/admin`)

| Setting | Current | Effect |
| --- | --- | --- |
| Launch time | 3 Dec 2026 00:00 Lagos (`2026-12-02 23:00 UTC`) | Content unlocks at this moment, if the experience is on |
| Experience active | Off | Master switch. **Turn it on before launch**, otherwise the gate stays closed after the countdown |
| Curator preview | On | Curators see the full experience at `/` before launch. Turn off to see what Roni sees |
| Family access | Off | Lets `family_viewer` accounts into the experience after launch |
| Contributions open | On | Turn off to stop new submissions |

Lock the Original Thirty from the overview once curation is final. A curator can unlock it again; only do that to correct a genuine mistake.

## Inviting contributors

- **Shared link (easiest):** `/admin/contributors` → *Shared link* → *Create shared link*. Post it (or the ready-made group message) in a private group chat. Each person types their name and how they know Roni, then gets their own draft and a personal link to continue on another device. *Replace link* stops the old link immediately; *Turn off* stops new people joining. Both keep existing drafts.
- **Personal links:** add a person → *Create link*. The link is shown **once**; copy it into a private message. *Replace link* revokes the old one and keeps the contributor's draft.

## Sample content

The project currently holds **clearly labelled sample content** so every section of the experience can be seen filled in before real contributions arrive: six sample contributors (all named "Sample …"), 13 memories, 6 wishes on stars, 3 letters, 5 people cards, 4 timeline milestones, a sample Roni Times and a sample final message, with placeholder photos that show no people. Every text says it is a placeholder; nothing describes the real Roni.

- **Only curators see it.** Rows are flagged `is_sample`, and restrictive policies hide them (and their files) from Roni, family and visitors, before and after launch. "What Roni will see" on the Overview ignores them.
- **Where things come from.** With *Curator preview* on, every item in the experience carries a dashed tag: who it's from (or "Added by a curator"), a *Sample* chip, *View submission* (the contributor's original words) and *Edit* (opens that exact item in the dashboard, in a new tab). Real contributions get the same tags.
- **How it was made.** `scripts/seed-samples.mjs` sends each sample person through the real contributor studio (the `contribute` function, uploads included), then approves, adds to the archive and publishes as a curator would. It needs curator credentials: `SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/seed-samples.mjs`. It refuses to run while samples exist and never overwrites editorial copy you've written.
- **Turning a sample into real content.** Open the item's editor (the Edit link on its tag in the preview, or the dashboard), rewrite the text, remove any sample photos and attach real ones, tick *Make this real content when I save*, and save. The database (`admin_make_real`) refuses while any text still says "sample" or a sample photo is attached. Roni Times, the final message and milestones simply stop being samples. Memories, wishes and letters become curator content with the attribution you typed, unlinked from the sample person. A people card gets a new real contributor named after its display name. Once real, an item survives *Remove all sample content*.
- **Removing it.** Overview → *Remove all sample content* deletes every sample row and file in one go. The Original Thirty can't be locked until this is done.

## Tests

- `supabase/tests/rls_smoke.sql`: 132 checks of RLS, storage policies, launch gating, the lock, the Continuing Story, shared links, sample content and admin RPCs, run as anonymous, contributor-less, family, Roni and curator users before and after launch. Everything runs in one transaction and rolls back; results come back as the error message `RLS_RESULTS {...}` (paste into the SQL editor and run). Last run (25 Oct): 132/132 passed.
- `scripts/smoke-contribute.mjs`: end-to-end test of the `contribute` edge function. Needs an active test invitation and leaves one submission behind, so delete it afterwards. Last run (Phase 2): 24/24 passed.
- Shared link (25 Oct): checked against the deployed function and in the browser. Joining, validation, the personal link, reloading, "Forget this device", replacing and turning off the link, and that shared and personal tokens can't be swapped all work.
- Browser checks (Phase 6): public routes and the full curator preview on a production build served with the `vercel.json` headers, with no CSP violations; desktop, 390 px mobile, reduced motion and `?lite` were checked in Phases 4 and 5.

There is no test data in the project: all QA accounts and test submissions have been removed. The only content is the labelled sample content described above.

## Known notes

- **Supabase advisors** report three intentional security warnings: `rate_limits` has RLS with no policies (server-only by design); `experience_access()` is a `SECURITY DEFINER` function callable by anyone (it only returns gate state); `ensure_my_collection()` is `SECURITY DEFINER` and checks the role itself. Performance notes (unindexed `*_by` foreign keys, multiple permissive policies) don't matter at this scale.
- **Temporary:** the countdown has an *Explore now* button that opens a public sneak peek of the experience. It loads no data at all (every section shows a "Sneak peek · placeholder" card), so it can't reveal contributions. To remove it, drop the `onExplore` prop passed to `GatePage` in `src/features/experience/HomePage.tsx`.
- The Supabase CLI isn't installed here, so edge functions were deployed through the Supabase MCP. The deployed `contribute` function (version 3) matches `supabase/functions/contribute`.
- Consider turning on *Leaked password protection* (Authentication → Sign In / Providers → Email) for curator and Roni accounts.
- Lint reports warnings only (mostly `set-state-in-effect` in data-loading effects); no errors.
- The largest JS chunk is three.js (~245 kB gzipped). It loads only with the birthday experience, not on `/contribute` or `/admin`.
