# CSPC WhereITis — Lost & Found Management System

CSPC WhereITis is a full-stack, server-rendered Lost &amp; Found management system built for Camarines Sur Polytechnic Colleges as a CCIT 106 midterm project. Students report lost or found items, file claims on items they believe are theirs, and track everything from a single "My Reports" page; staff review claims and mark items returned or archived; admins watch monthly trends and manage the category and location lists. "Kung nawala, hanapin dito. Kung nakita, i-report dito."

## Live demo (planned)

This midterm runs locally only — no hosted deployment yet (deployment is a Week 16 concern, see the handoff table later in this README). The current demo lives at:

http://localhost:3000


## Screenshots

| Filename | Description | What to capture |
|---|---|---|
| `screenshots/home.png` | Home page | Hero, search box, live counters, latest reports grid |
| `screenshots/reports-list.png` | Reports list | Filter form filled in, a full page of result cards |
| `screenshots/report-detail.png` | Report detail page | Status pills, possible matches section, comments |
| `screenshots/my-reports.png` | My Reports page | Signed-in view with reports, claims, and bookmarks sections |

## Technology

- **Node.js 20/22 LTS** — the JavaScript runtime the whole app runs on.
- **Express 4** — the web framework handling routing, middleware, and request/response.
- **EJS** — the server-side view engine; every page is rendered as HTML on the server, never in the browser.
- **MySQL 8** — the relational database storing every report, claim, comment, and user.
- **mysql2/promise** — the MySQL driver, used with a connection pool and `async`/`await`.
- **dotenv** — loads configuration (DB credentials, secrets) from a local `.env` file.
- **nodemon** (dev only) — restarts the server automatically while developing.
- **Vanilla CSS** (`public/css/style.css`) — one hand-written stylesheet, no framework.
- **Vanilla JS** (`public/js/app.js`) — progressive enhancement only; every feature still works with JavaScript off.

There is no frontend framework, no build step, and no single-page app here on purpose. The project demonstrates server-rendered fundamentals — Express routing, EJS templating, parameterised SQL, and Post/Redirect/Get — cleanly, rather than hiding them behind React/Webpack/Tailwind. Later weeks added accounts, roles, email and guest reporting on top of that same foundation.

## Setup from a clean clone

1. `git clone <repo-url> cspc-whereitis`
2. `cd cspc-whereitis && npm install`
3. `cp .env.example .env` (Windows: `copy .env.example .env`) — then fill in the values, especially `DB_PASSWORD` and `PROCESS_SECRET`.
4. Create the database:

mysql -u root -p -e "CREATE DATABASE whereitis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

5. Load the schema and seed data:

mysql -u root -p whereitis < schema.sql
mysql -u root -p whereitis < seed.sql

6. `npm run dev` → open [http://localhost:3000](http://localhost:3000)

## Demo accounts and seed data

| Student No. | Full name | Role | Old PIN (first sign-in only) |
|---|---|---|---|
| 2021-00001 | Juan Miguel Dela Cruz | student | 1234 |
| 2021-00002 | Maria Clara Santos | student | 2345 |
| 2021-00003 | Jose Rizal Bautista | student | 3456 |
| 2022-00004 | Andrea Lyn Villanueva | student | 4567 |
| 2022-00005 | Miguel Antonio Reyes | student | 5678 |

These demo accounts were created with a 4-digit PIN. Each one can sign in **once** with its PIN, and the app then makes the person choose a real password (10+ characters). After that the PIN is erased and no longer works. New accounts choose a password at sign-up and never have a PIN.

## Environment variables

| Name | Required | Example | Purpose |
|---|---|---|---|
| `PORT` | No | `3000` | Port the Express server listens on. |
| `NODE_ENV` | No | `development` | `development` or `production`; controls cookie `Secure` flag behaviour. |
| `DB_HOST` | Yes | `localhost` | MySQL 8 server hostname. |
| `DB_PORT` | No | `3306` | MySQL 8 server port. |
| `DB_USER` | Yes | `root` | MySQL user for the connection pool. |
| `DB_PASSWORD` | Yes | `changeme` | MySQL password — never commit a real value. |
| `DB_NAME` | Yes | `whereitis` | Database created by `schema.sql`. |
| `PROCESS_SECRET` | Yes | `<64 random hex chars>` | HMAC key signing the `whereitis_id` cookie. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and NEVER commit the real value. |
| `GOOGLE_CLIENT_ID` | For real Google sign-in | _(empty)_ | Google Cloud **OAuth 2.0 Client ID (Web application)**. Add `http://localhost:3000` and `https://whereitis.xyz` as Authorised JavaScript origins. When empty, the Google button is still shown but simply opens Google in a new tab (no app sign-in). |
| `MATCH_WINDOW_DAYS` | No | `30` | Day window the matching engine (FR-09) searches for candidates. |
| `GUEST_REPORTS_PER_DAY` | No | `3` | Most guest reports one connection may send in 24 hours. |
| `HOLDING_PERIOD_DAYS` | No | `90` | Default days before a found item may be archived as unclaimed (FR-15). |
| `APP_URL` | For email | `http://localhost:3000` | Public base URL of the site (used in notification emails). |
| `BREVO_API_KEY` | For email | _(empty)_ | Brevo API key. Leave empty in development to print the 6-digit codes to the terminal instead of emailing them. |
| `MAIL_FROM_EMAIL` | For email | _(empty)_ | Verified Brevo sender address. |
| `MAIL_FROM_NAME` | No | `CSPC WhereITis` | Sender display name. |
| `DB_SSL` | No | `true` (prod) | TLS to MySQL; set `false` for a local MySQL server. |
| `DB_SSL_REJECT_UNAUTHORIZED` | No | `true` | Certificate verification. Keep `true` unless your provider requires otherwise. |
| `SESSION_STORE` | No | _(unset)_ | Set to `db` to keep sign-in sessions in MySQL instead of the stateless signed cookie. |

## Database

The schema has fourteen tables:

| Table | Purpose |
|---|---|
| `categories`, `locations` | Admin-managed lookup lists. |
| `users` | Accounts: scrypt `password_hash`, `role`, email-verification and password-reset tokens, plus the legacy `pin_salt`/`pin_hash` pair used for one final sign-in before setting a password. |
| `reports` | The core table — every lost or found item, its category, location, submitter type, moderation state and staff-only guest contact details. |
| `claims` | A student's assertion that a found report belongs to them. |
| `report_comments`, `report_status_history` | Owner follow-up notes and the append-only status audit trail (NFR-08). |
| `bookmarks` | Many-to-many join between users and reports. |
| `tags`, `report_tags` | Fixed, seeded tag allow-list and its join table. |
| `notifications` | In-app badges and inbox entries. |
| `conversations`, `messages` | Direct messages between registered users about a report. |
| `counter_sequence` | Row-locked counter that feeds the transactional reference-number generator. |

`lib/migrate.js` runs on every boot and adds any columns/tables introduced after the original schema, so an old database is upgraded in place (including the guest-report columns). Fresh installs get everything from `schema.sql`.

**ENUM values**

- `reports.kind`: `lost` | `found`
- `reports.status`: `open` | `matched` | `claimed` | `returned` | `archived`
- `reports.submitter_type`: `registered` | `guest`
- `reports.moderation_status`: `approved` | `pending` | `rejected`
- `users.role`: `user` | `staff` | `teacher` | `admin`
- `claims.status`: `pending` | `approved` | `rejected`

**Retention rule:** reports are kept for one academic year, then archived and purged of personal data; the reference number and item description are retained for statistical purposes only.

**Reference-number format:** `LF-YYYY-NNNN`, zero-padded to four digits, resetting each calendar year. Generated transactionally in `lib/refs.js` via `counter_sequence` with `SELECT ... FOR UPDATE`, so concurrent submissions can never collide or skip a number.

## Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | Public | Home — hero, live counters, latest reports, quick search |
| GET | `/nexus` | Public | Command centre — campus radar, match scanner, live pulse |
| GET | `/api/nexus/pulse` | Public | JSON feed of the newest public reports |
| GET | `/api/nexus/radar` | Public | JSON zone counts for the campus radar |
| POST | `/api/nexus/scan` | Public | Explainable match scan against open reports (rate-limited) |
| GET | `/health` | Public | JSON liveness/DB check |
| GET | `/reports` | Public | List + filter reports |
| GET | `/reports/new` | Public | Guests get the simple found-item form; signed-in users get the full form (`?kind=lost` needs sign-in) |
| POST | `/reports` | Identity required | Create a report (registered users; published immediately) |
| POST | `/reports/guest` | Public | Create a found-item report without an account (held for staff review) |
| GET | `/reports/guest/thanks` | Public | Confirmation page with the reference number |
| GET | `/reports/:reference` | Public | Report detail page |
| GET | `/reports/:reference/edit` | Owner only | Edit form (status must be `open`) |
| POST | `/reports/:reference/edit` | Owner only | Update a report |
| POST | `/reports/:reference/withdraw` | Owner only | Withdraw (soft-archive) a report |
| POST | `/reports/:reference/comments` | Owner only | Add a comment |
| POST | `/reports/:reference/bookmark` | Identity required | Toggle a bookmark |
| GET | `/claims/new` | Identity required | Claim form for a found report |
| POST | `/claims` | Identity required | File a claim |
| GET | `/claims/:id` | Identity required | Claim detail |
| POST | `/claims/:id/approve` | Report owner only | Approve a claim on your own report |
| POST | `/claims/:id/reject` | Report owner only | Reject a claim on your own report (reason required) |
| POST | `/reports/:reference/returned` | Report owner only | Mark your report's item as handed over |
| GET | `/notifications` | Identity required | In-app notifications |
| POST | `/notifications/read-all` | Identity required | Mark all notifications read |
| POST | `/notifications/:id/read` | Owner only | Mark one notification read |
| GET | `/messages` | Identity required | Message inbox |
| GET | `/messages/new?report=` | Identity required | Start a message about a report |
| POST | `/messages` | Identity required | Send the first message (opens the thread) |
| GET | `/messages/:id` | Participants only | Message thread |
| POST | `/messages/:id` | Participants only | Reply in a thread |
| GET | `/my-reports` | Identity required | My reports, claims, and bookmarks |
| GET | `/my-reports/sign-in` | Public | Sign-in form |
| POST | `/my-reports/sign-in` | Public | Verify password (rate-limited), set signed cookie |
| GET, POST | `/set-password` | Old PIN accounts only | Choose a new password right after the one-time PIN sign-in |
| POST | `/my-reports/sign-out` (`/sign-out`) | Identity required | Clear the signed cookie |
| GET, POST | `/register` | Public | Step 1: enter the CSPC email, a 6-digit code is emailed |
| GET, POST | `/verify-code` | Public | Type the emailed code (registration, or an older unverified account) |
| POST | `/verify-code/resend` | Public | Send a fresh code (once a minute) |
| GET, POST | `/register/details` | Public | Step 2 (only after the code is accepted): name, role, ID, password; creates a verified account and signs in |
| GET | `/verify-email` | Public | Only for links emailed before codes existed (valid 24 hours) |
| GET | `/check-email` | Public | Old address; redirects to `/verify-code` or sign-in |
| GET, POST | `/forgot-password` | Public | Email a 6-digit password-reset code |
| GET, POST | `/reset-password` | Public | Type the code and the new password on one page |
| GET, POST | `/admin/login` | Public | Staff/admin sign-in |
| GET | `/admin` | Admin only | Dashboard, CSV export link, bulk update and lookup management links |
| GET | `/admin/staff` | Staff or admin | Pending claims and aging found items |
| GET | `/admin/export.csv` | Admin only | CSV export of this month's reports |
| GET, POST | `/admin/bulk` | Admin only | All-or-nothing bulk status update |
| GET, POST | `/admin/categories` | Admin only | Add a category |
| GET, POST | `/admin/locations` | Admin only | Add a location |
| GET | `/admin/moderation` | Staff or admin | Guest-report review queue |
| POST | `/admin/moderation/:reference/approve` | Staff or admin | Publish a guest report |
| POST | `/admin/moderation/:reference/reject` | Staff or admin | Reject a guest report (reason required) |
| GET | `/about` | Public | About page |
| GET | `/privacy` | Public | Privacy Notice |
| GET | `/terms` | Public | Terms of Use |
| GET | `/cookies` | Public | Cookie Notice |
| GET | `/accessibility` | Public | Accessibility Statement |
| GET | `/help` | Public | User guide |
| GET | `*` | Public | 404 page |

## Guest and registered reports

Anyone can report a **found** item without an account. A guest report needs only an item name, category, description, where it was found, the date, and where the item is now; name, email and phone are optional and visible to staff only. Guest reports are created with `moderation_status = 'pending'` and stay invisible everywhere public (lists, counters, matching, detail page) until a staff member approves them at `/admin/moderation`. **Lost** reports still need an account, because the owner is the person who needs notifications and messages.

Spam safeguards on `POST /reports/guest` (`lib/antispam.js`): hidden honeypot field, signed time token (rejects instant, forged and stale posts), per-source rate limit stored in the database (default 3 per 24 hours, keyed by an HMAC of the IP, never the raw IP), duplicate and link checks, and the staff approval step above, which is the control that actually stops abuse.

Registered users keep everything they had (full form with photo and tags, edit while open, withdraw, claims, bookmarks, My Reports) and additionally get in-app notifications (claim filed on their report, status changed, their claim decided, new message) and direct messages with other registered users about a report. Existing databases: run `add-guest-reports.sql` once. Fresh installs get it from `schema.sql`.

## Accounts, identity and roles

Every request runs `optionalIdentity`, which sets `req.identity` and exposes it to all views without redirecting — guests can browse and file a found-item report uninterrupted. The nav shows the signed-in user's ID with a sign-out link, or a "Sign in" link; gated actions link to `/sign-in?next=<path>` so the user returns to what they were doing. `/sign-in` and `/sign-out` are short aliases of the longer `/my-reports/...` paths.

- **Passwords:** scrypt with a per-account salt (`lib/passwords.js`). New users choose a password at registration; legacy demo accounts can sign in once with their old PIN and must then set a password.
- **Google sign-in:** with `GOOGLE_CLIENT_ID` set, the auth pages render the official Google Identity Services button. The ID token is verified server-side in `routes/googleAuth.js`; CSPC email accounts are linked to an existing user or created as verified, passwordless accounts. The usual `whereitis_id` cookie is then set, so every role guard works unchanged. Without a Client ID, the same-styled button opens Google in a new tab and never claims to have signed the user into WhereITis.
- **Verification:** registration sends a link via Brevo (`lib/mailer.js`); with `BREVO_API_KEY` unset the link is printed to the terminal instead. Accounts that predate the feature were backfilled as verified.
- **Password reset:** `/forgot-password` emails a 6-digit code, `/reset-password` checks it and stores a new scrypt hash.
- **Email codes (`lib/otp.js`):** 6 random digits, stored only as an HMAC hash in `email_otps`; valid 10 minutes, single use, 5 wrong tries kill the code, one new code per minute per address, 5 wrong codes per address / 20 per IP pause code entry for 15 minutes, and 40 code requests per IP per hour.
- **Cookie:** the default login is still a stateless, HMAC-signed `whereitis_id` cookie with the role embedded for UI purposes. Role checks never trust it: `middleware/roles.js` and `routes/adminAuth.js` re-read `users.role` from the database on every protected request. Set `SESSION_STORE=db` for revocable MySQL-backed sessions.
- **Roles:** `user` (default), `staff`, `teacher`, `admin`. Registration can only create `user`/`staff`/`teacher`; `admin` is seeded or promoted in the database. Staff see the claims queue and guest-review queue; admins additionally get the dashboard, CSV export, bulk updates and lookup management.

## Matching engine

FR-09's "Possible matches" feature scores every opposite-kind report in the same category against a fixed, published rubric:

+40 same category
+25 same location
+15 within 3 days
+10 within 7 days
+20 at least two significant words from the title overlap
+15 at least one significant word appears in the other's description


Candidates are pulled from within `MATCH_WINDOW_DAYS` (default 30, read from `.env`) of the source report's date, and only the top 5 scoring candidates are shown.

This scorer is deliberately deterministic and explainable rather than AI-based. Every point on the rubric traces back to one plain-English reason, and that reason is always shown alongside the score on the report detail page — nobody is ever asked to trust an opaque number. AI image recognition to match items is explicitly out of scope for this project (see the WON'T list on `/about`), in line with the Week 8 discussion of AI limits: a fixed rubric is auditable and reproducible in a way a trained model at this course stage would not be.
## Git workflow

**Branching model**
- `main` — protected. Always deployable, always demo-ready.
- `feat/*` — new features (e.g. `feat/matching-engine`, `feat/bulk-status-update`).
- `fix/*` — bug fixes (e.g. `fix/duplicate-claim-guard`).
- `docs/*` — documentation-only changes (e.g. `docs/readme-setup-steps`).

**Conventional commit examples**

feat(reports): add reference-number generator with FOR UPDATE lock
fix(claims): prevent duplicate claims via UNIQUE constraint
docs(readme): add identification-without-sessions explanation
refactor(matching): extract stop-word list
chore(deps): bump express to 4.19.2


**PR template summary**
- **Description** — what changed, in a sentence or two.
- **Why** — the requirement or bug this addresses (FR/NFR number if applicable).
- **How tested** — the manual steps taken to verify it (see the Testing section below).
- **Screenshots** — required for any UI change.
- **Checklist**:
  - [ ] Every form control has a matching `<label for>`
  - [ ] No errors in the browser console
  - [ ] No stack traces shown anywhere in the response
  - [ ] Checked on a mobile-width viewport
  - [ ] Checked keyboard-only (Tab, Shift+Tab, Enter, Space)

**Review checklist before merge**
- [ ] Every new/changed SQL query uses `?` placeholders
- [ ] Every POST redirects with 303
- [ ] Every new form field is validated server-side
- [ ] No forbidden Week 11+ dependency was added
- [ ] README/AUDIT.md updated if behaviour changed

## Accessibility

Four manual tests were run against this build. Full detail lives on [`/accessibility`](/accessibility); this is the honest summary.

**a. Unplug the mouse** — every main task (report an item, search, file a claim, sign in, approve/reject a claim) was completed using only Tab, Shift+Tab, Enter, and Space. Result: pass. The one rough edge was the bulk-update checkbox table, where Tab order through many rows is long but still linear and correct.

**b. Tab and watch** — focus is visible on every interactive element via `:focus-visible`, and the tab order follows the visual/reading order on every page tested. Result: pass.

**c. Zoom to 200%** — no content disappeared or overlapped. Wide tables (monthly counts, bulk-update list) scroll horizontally inside `.table-wrap` rather than forcing the whole page to scroll sideways. Result: pass.

**d. Greyscale** — every status pill and days-held badge remains distinguishable because each carries a text label, not just a colour. Result: pass.

**What is still incomplete:** no external WCAG 2.2 AA audit has been performed (self-testing only, Week 13 territory); denser pages (the admin dashboard tables) have not been tested with a screen reader end-to-end.

## Privacy and data handling

WhereITis follows the Data Privacy Act of 2012 (RA 10173): transparency (every collected field and its purpose is listed on [`/privacy`](/privacy)), legitimate purpose (every field is read by at least one screen or report), and proportionality (we collect only what those screens actually need). No gender, religion, birthday, marital status, or government ID number is collected anywhere in this system — none of those fields exists on any form, and none is stored in the schema. Full detail, including retention and data-subject rights, is on [`/privacy`](/privacy).

## Testing (manual, this midterm)

There is no full route/integration suite yet, but `npm run check` parses every `.js` file and compiles every EJS template without needing a database. Run it before every commit — it catches the "a router has a syntax error so the feature silently 404s" class of bug. The manual cases below are re-run before every merge to `main`.

| # | Test case | Expected result |
|---|---|---|
| 1 | Report a lost item | Report created, reference `LF-YYYY-NNNN` shown, redirect 303 |
| 2 | Report a found item | Report created with holding_location required, same as above |
| 3 | Search by keyword | Only reports matching title/description LIKE the term appear |
| 4 | Filter by category + date range | Result set narrows to matching category and `occurred_on` window |
| 5 | File a valid claim | Claim created with status `pending`, redirect to claim detail |
| 6 | File a duplicate claim | Second claim by the same user on the same report is rejected with a friendly message |
| 7 | Claim with too-short proof | 422, form re-rendered, values preserved, error next to the field |
| 8 | Approve a claim | Claim → `approved`, every sibling pending claim → `rejected`, report → `claimed`, all in one transaction |
| 9 | Reject a claim | Claim → `rejected` with a note, report status untouched |
| 10 | Sign in with valid password | `whereitis_id` cookie set, redirect to `/my-reports` |
| 11 | Sign in with wrong password | 401, generic "do not match our records" message, no hint whether the student number exists |
| 12 | Edit own open report | Fields update, `updated_at` bumped, redirect 303 |
| 13 | Withdraw own open report | Status → `archived`, reason `withdrawn by owner`, history row written |
| 14 | Illegal status transition (e.g. `archived` → `open`) | 422 with "That status change is not allowed from archived." |
| 15 | Refresh after POST | Because every POST redirects 303, a refresh re-fetches via GET — no duplicate submission |

## Known issues

- Guest reports are held for staff approval rather than email verification. Account verification and password reset **do** use email (`lib/mailer.js`, Brevo); in-app notifications and direct messages are never emailed.
- Only the report owner can approve/reject claims on their own report and mark it returned. Staff/admin handle the separate guest-review and claims queues.
- Passwords must be 10+ characters, are checked against common/guessable passwords and the person's own name, student number and email, and are stored with scrypt (`lib/passwords.js`).
- Sign-in is rate-limited in memory (`lib/loginLimiter.js`): 5 wrong attempts pause that student number for 15 minutes, 20 from one IP pause that address. Counters reset when the server restarts. Guest submissions use a DB-backed per-IP quota instead.
- There is no "change password" page for a signed-in user yet (the reset flow covers forgotten passwords).
- No CSRF tokens on forms. Cookies use `SameSite=Lax` and a same-origin check on state-changing requests, but a per-form token is still the recommended hardening (Week 12).
- No external WCAG 2.2 AA audit has been performed (Week 13).
- No automated test suite — Vitest/SuperTest are Week 15 additions.
- Local-only deployment; nothing is hosted yet (Week 16).
- Very long report titles truncate visually on narrow report cards.
- The bulk-update screen loads only the 100 most-recent reports by design, to keep the page fast and the form manageable.

## AI-assisted development log

| Date | Tool | Purpose | Prompt summary | Accepted / edited / rejected |
|---|---|---|---|---|
| 2026-09-10 | Claude | Draft schema.sql design-note comments | "Explain why UNIQUE/CASCADE/CHECK choices were made in the reports/claims schema" | Edited — trimmed wording, added the counter_sequence rationale |
| 2026-09-11 | Claude | Draft the matching engine scoring rubric write-up | "Explain the matching engine as deterministic, not AI-based" | Accepted with minor wording tweaks |
| 2026-09-13 | Claude | Draft /privacy page copy | "Write an RA 10173 privacy notice matching the field table" | Edited — added the DPO email and breach-notification timeline |
| 2026-09-14 | Claude | Draft /accessibility page copy | "Write an accessibility statement covering POUR and the manual tests" | Edited — updated the "still incomplete" list after actual testing |
| 2026-09-16 | Claude | Review claim-approval transaction logic | "Check that approving a claim can't leave the report in an inconsistent state" | Accepted as-is |
| 2026-09-18 | Claude | Draft this AI-assisted development log | "Summarise AI usage across the project in a table" | Edited — dates and rows adjusted to match actual work |

## Weeks 1–8 mapping

| Week | Topic | Artefact in this repo |
|---|---|---|
| Week 1 | HTML fundamentals | `views/partials/*.ejs` |
| Week 2 | CSS fundamentals | `public/css/style.css` |
| Week 3 | UX + RA 10173 + gender-fair design | `/privacy`, `/accessibility` |
| Week 4 | Requirements + use cases | This README's FR map, the claim exception paths in AUDIT.md |
| Week 5 | Node + Express basics | `app.js`, `server.js`, `middleware/logger.js` |
| Week 6 | Forms + validation + SQL | `middleware/validate.js`, `models/*`, `lib/refs.js`, Post/Redirect/Get throughout `routes/*` |
| Week 7 | Accessibility + progressive enhancement | `public/js/app.js`, ARIA attributes across every form view |
| Week 8 | AI limits + documentation | This section, the AI-assisted development log above, the deterministic (non-AI) matching engine in `lib/matching.js` |

## Week 11–16 handoff

| Feature | Status | Notes |
|---|---|---|
| Registration, scrypt passwords, email verification, password reset | **Done** | `routes/myReports.js`, `lib/passwords.js`, `lib/mailer.js` |
| Roles and DB-backed staff/admin guards | **Done** | `middleware/roles.js`; admin/moderation routers are mounted in `app.js` |
| Guest found-item reports with anti-spam and staff approval | **Done** | `POST /reports/guest`, `lib/antispam.js`, `/admin/moderation` |
| Optional DB session store | **Done (opt-in)** | Set `SESSION_STORE=db`; default remains the signed cookie |
| Same-origin check on state-changing requests | **Done** | Rejects cross-origin POSTs; not a replacement for per-form tokens |
| Shared (Redis) sign-in rate limiting | Remaining | Sign-in limits are in memory today; guest quotas are already in MySQL |
| CSRF tokens on every POST form | Remaining | Same-origin + `SameSite=Lax` today; a token is still preferable |
| helmet() + Content-Security-Policy | Remaining | Currently no security-header middleware |
| Automated HTML-escaping audit | Remaining | EJS auto-escapes, but there is no automated check |
| External WCAG 2.2 AA audit | Remaining | Self-tested only |
| Usability heuristic evaluation | Remaining | Designed to Nielsen's heuristics, not externally reviewed |
| Automated tests (Vitest / SuperTest) | Remaining | Manual test table above |
| Mutation testing on the matching engine | Remaining | Not yet |
| Source code inspection report | Remaining | Not yet |
| Deployment (Fly.io or similar) | Remaining | Local only this term |
| Managed MySQL + backups | Remaining | Local MySQL only |
| User guide on a deployed URL | Remaining | Written, not hosted |
| Turnover note | Remaining | Not yet written |

## License

MIT — see [LICENSE](./LICENSE).

## Credits and acknowledgements

- CCIT 106 — Application Development and Emerging Technologies
- Camarines Sur Polytechnic Colleges, College of Computer Studies
- Student Affairs office
- IT office
- Data Protection Officer
- Built with Node.js, Express, EJS, and MySQL

## Time zone

The whole app runs on Philippine Standard Time (UTC+08:00, `Asia/Manila`). The server, the MySQL connection and every date shown on screen use it, whatever time zone the computer or host is set to. The helpers live in `lib/time.js`.

## Categories and locations

The category and location lists include an "Other (please specify)" choice; the reporter types their own text, shown on the report as "Other: ...". To add the new categories, the CSPC Nabua campus places and the new columns to an existing database, the server now applies `add-more-categories-locations.sql` automatically the first time it starts (you can also run it by hand once). Admins can rename, add or hide places under Admin > Locations.
