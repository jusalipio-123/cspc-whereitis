# CSPC WhereITis — Lost & Found Management System

CSPC WhereITis is a full-stack, server-rendered Lost &amp; Found management system built for Camarines Sur Polytechnic Colleges as a CCIT 106 midterm project. Students report lost or found items, file claims on items they believe are theirs, and track everything from a single "My Reports" page; ; the person who posted a report reviews claims on it and marks the item returned. There are no staff or admin accounts. "Kung nawala, hanapin dito. Kung nakita, i-report dito."

## Live demo (planned)

This midterm runs locally only — no hosted deployment yet (deployment is a Week 16 concern, see the handoff table later in this README). The current demo lives at:

http://localhost:3000


## Screenshots

| Filename | Description | What to capture |
|---|---|---|
| `screenshots/home.png` | Home page | Hero, search box, live counters, latest reports grid |
| `screenshots/reports-list.png` | Reports list | Filter form filled in, a full page of result cards |
| `screenshots/report-detail.png` | Report detail page | Status pills, possible matches section, comments |
| `screenshots/my-reports.png` | My Reports page | Signed-in view with reports and claims sections |

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

There is no frontend framework, no build step, and no single-page app here on purpose. This is a Week 1–8 project: the assignment is to demonstrate server-rendered fundamentals — Express routing, EJS templating, parameterised SQL, and Post/Redirect/Get — cleanly, not to reach for tools (React, Webpack, Tailwind) that would hide those fundamentals behind tooling the course hasn't covered yet.

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

| Student No. | Full name | PIN |
|---|---|---|
| 2021-00001 | Juan Miguel Dela Cruz | 1234 |
| 2021-00002 | Maria Clara Santos | 2345 |
| 2021-00003 | Jose Rizal Bautista | 3456 |
| 2022-00004 | Andrea Lyn Villanueva | 4567 |
| 2022-00005 | Miguel Antonio Reyes | 5678 |

These PINs are published here because this is a midterm demo. Week 11 replaces PINs with bcrypt-hashed passwords and real account provisioning.

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
| `MATCH_WINDOW_DAYS` | No | `30` | Day window the matching engine (FR-09) searches for candidates. |
| `HOLDING_PERIOD_DAYS` | No | `90` | Default days before a found item may be archived as unclaimed (FR-15). |

## Database
A fresh install from `schema.sql` creates 10 tables. `categories` and `locations` are lookup tables for the report forms. `users` holds the pre-seeded demo accounts, including the PIN salt/hash pair used by the midterm's sign-in mechanism; every account is an ordinary user. `reports` is the core table: every lost or found item, tied to the user who filed it, a category, and a location. `claims` records a user's assertion that a found report belongs to them. `report_comments` lets an owner add follow-up notes. `report_status_history` is an append-only audit trail of status changes (NFR-08). `tags` and `report_tags` provide a fixed allow-list of tags and the many-to-many link to reports. `counter_sequence` backs the transactional reference-number generator.

categories locations users
| | |
| category_id | location_id | user_id
+------------------+--------------------+
|
reports <---------------------- report_status_history
/ | \ (report_id, changed_by)
/ |
report_comments
(report_id,
user_id)

claims
(report_id, claimant_user_id,
decided_by)

counter_sequence — standalone, keyed by year, feeds reports.reference_no


**ENUM values**

- `reports.kind`: `lost` | `found`
- `reports.status`: `open` | `matched` | `claimed` | `returned` | `archived`
- Every account is an ordinary user (there is no role column)
- `claims.status`: `pending` | `approved` | `rejected`

**Retention rule:** reports are kept for one academic year, then archived and purged of personal data; the reference number and item description are retained for statistical purposes only.

**Reference-number format:** `LF-YYYY-NNNN`, zero-padded to four digits, resetting each calendar year. Generated transactionally in `lib/refs.js` via `counter_sequence` with `SELECT ... FOR UPDATE`, so concurrent submissions can never collide or skip a number.

## Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | Public | Home — hero, live counters, latest reports, quick search |
| GET | `/health` | Public | JSON liveness/DB check |
| GET | `/reports` | Public | List + filter reports |
| GET | `/reports/new` | Identity required | Report form (signed-out visitors are redirected to sign-in) |
| POST | `/reports` | Identity required | Create a report (registered users; published immediately) |
| GET | `/reports/:reference` | Public | Report detail page |
| GET | `/reports/:reference/edit` | Owner only | Edit form (status must be `open`) |
| POST | `/reports/:reference/edit` | Owner only | Update a report |
| POST | `/reports/:reference/withdraw` | Owner only | Withdraw (soft-archive) a report |
| POST | `/reports/:reference/comments` | Owner only | Add a comment |
| GET | `/claims/new` | Identity required | Claim form for a found report |
| POST | `/claims` | Identity required | File a claim |
| GET | `/claims/:id` | Identity required | Claim detail |
| POST | `/claims/:id/approve` | Report owner only | Approve a claim on your own report |
| POST | `/claims/:id/reject` | Report owner only | Reject a claim on your own report (reason required) |
| POST | `/reports/:reference/returned` | Report owner only | Mark your report's item as handed over |
| GET | `/my-reports` | Identity required | My reports and claims |
| GET | `/my-reports/sign-in` | Public | Sign-in form |
| POST | `/my-reports/sign-in` | Public | Verify PIN, set signed cookie |
| POST | `/my-reports/sign-out` | Identity required | Clear the signed cookie |
| GET | `/about` | Public | About page |
| GET | `/privacy` | Public | Privacy Notice |
| GET | `/terms` | Public | Terms of Use |
| GET | `/cookies` | Public | Cookie Notice |
| GET | `/accessibility` | Public | Accessibility Statement |
| GET | `/help` | Public | User guide |
| GET | `*` | Public | 404 page |

## Reporting and notifications

Reporting needs an account. The person who files a report is the one who later approves or rejects claims on it, so `GET /reports/new` redirects signed-out visitors to the sign-in page. Anyone, signed in or not, can browse and search reports and open report details.

Signed-in users can file lost and found reports (full form with photo and tags), edit a report while it is open, withdraw it, comment on their own reports, file claims on other people's found reports, and use My Reports to see their reports and claims. Nothing is emailed.
## Identification Without Sessions — Midterm Approach

This identity is now VISIBLE and usable site-wide, not just on /my-reports. Every request runs an `optionalIdentity` check that sets `req.identity` (and exposes it to every view) without ever redirecting — guest browsing and guest reporting are never interrupted. The top navigation shows "Hi, <student_no>" with a sign-out link when signed in, or a "Sign in" link when not; gated actions (like filing a claim) link to `/sign-in?next=<path>` so the person returns to what they were doing afterward. `/sign-in` and `/sign-out` are now available as short top-level aliases of `/my-reports/sign-in` and `/my-reports/sign-out`.

None of this changes the underlying mechanism or its guarantees — the cookie name (`whereitis_id`), HMAC signing, and 30-minute lifetime are exactly as described above. Explicitly, this deliverable did NOT add: a registration/sign-up page, a "forgot PIN" flow, real passwords, or sessions. Signing in still means "type a seeded student number and 4-digit PIN," and reporting a lost or found item still never requires signing in first (FR-01/FR-02). All of that remains deliberate Week 11 scope.

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

No automated test suite exists yet (Week 15 territory — see Known issues). Manual test cases are tracked here and re-run before every merge to `main`.

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
| 10 | Sign in with valid PIN | `whereitis_id` cookie set, redirect to `/my-reports` |
| 11 | Sign in with wrong PIN | 401, generic "do not match our records" message, no hint whether the student number exists |
| 12 | Edit own open report | Fields update, `updated_at` bumped, redirect 303 |
| 13 | Withdraw own open report | Status → `archived`, reason `withdrawn by owner`, history row written |
| 14 | Illegal status transition (e.g. `archived` → `open`) | 422 with "That status change is not allowed from archived." |
| 15 | Refresh after POST | Because every POST redirects 303, a refresh re-fetches via GET — no duplicate submission |

## Known issues

- Guest reports are verified by staff approval, not by email: the system has no mail sender (see `/about`), so email verification is not implemented. Adding it needs a mailer and a token table; the approval queue would then be the fallback.
- There are no notifications. Owners see a badge on the profile icon (and on My Reports) for claims waiting for their decision; claimants check My Reports for the outcome. Nothing is emailed.
- There are no staff or admin roles. The user who uploaded a report is the only one who can approve or reject claims on it (`POST /claims/:id/approve|reject`) and mark it returned (`POST /reports/:reference/returned`).

- PIN-based identification is a documented midterm compromise (SHA-256, not bcrypt) — see "Identification Without Sessions" above.
- No rate limiting on `/my-reports/sign-in` (Week 12 — `express-rate-limit`).
- No CSRF tokens on any form (Week 12 — `csurf`).
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

| Feature | Week | Why it is not here yet |
|---|---|---|
| Real login + bcrypt passwords | 11 | Replaces the PIN + signed-cookie approach |
| express-session | 11 | Replaces the whereitis_id cookie |
| Rate limiting on /my-reports/sign-in | 12 | Currently unlimited |
| CSRF tokens on every POST form | 12 | Currently none |
| helmet() + Content-Security-Policy | 12 | Currently no CSP |
| Server-side HTML escaping audit | 12 | We escape, but there is no automated check yet |
| WCAG 2.2 AA audit + fixes | 13 | Statement written, but no external audit |
| Usability heuristic evaluation | 13 | Designed to Nielsen's heuristics, not yet reviewed by others |
| Vitest unit tests | 15 | Manual test cases only this term |
| SuperTest route tests | 15 | Manual only |
| Mutation testing on the matching engine | 15 | Not yet |
| Source code inspection report | 15 | Not yet |
| Deployment (Fly.io or similar) | 16 | Local only this term |
| Database-backed session store | 16 | In-memory not used, so nothing to migrate |
| Managed MySQL + backups | 16 | Local MySQL only |
| User guide on the deployed URL | 16 | Written, not hosted |
| Turnover note | 16 | Not yet written |

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
