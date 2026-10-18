# Guest and registered reporting: system design

CSPC WhereITis. Covers what changed, why, and how to apply it. Everything described here is implemented in this repo and was tested against MySQL 8.

## 1. The idea in one paragraph

A person who finds a wallet should not have to register before handing it in, but an open form invites spam and nonsense. So: **anyone may report a found item, but a guest report is private until staff approve it.** Accounts stay worth having because they unlock tracking, notifications, messaging, and edit/withdraw. Nothing about the look of the site or the existing registered flow changes.

| | Guest | Registered |
|---|---|---|
| Report a found item | Yes, simple form | Yes, full form (photo, tags) |
| Report a lost item | No (needs account) | Yes |
| Appears publicly | After staff approval | Immediately |
| Edit / withdraw | No | Yes (while open) |
| Track reports, notifications, messages | No | Yes |
| Contact details | Optional, staff-only | From the account |

Lost reports stay account-only on purpose: the owner is the one who needs to be told when someone responds.

## 2. Step 1: database

Run `add-guest-reports.sql` once on an existing database (fresh installs use `schema.sql`).

### reports (changed)

```sql
user_id             INT NULL,                     -- NULL only for guest reports
submitter_type      ENUM('registered','guest') NOT NULL DEFAULT 'registered',
moderation_status   ENUM('approved','pending','rejected') NOT NULL DEFAULT 'approved',
moderated_by        INT NULL,  moderated_at DATETIME NULL,  moderation_note VARCHAR(255) NULL,
guest_contact_name  VARCHAR(120) NULL,            -- optional, staff-only
guest_contact_email VARCHAR(160) NULL,
guest_contact_phone VARCHAR(20)  NULL,
submitter_ip_hash   CHAR(64) NULL,                -- HMAC of the IP, never the IP

CONSTRAINT chk_reports_submitter CHECK (
     (submitter_type = 'registered' AND user_id IS NOT NULL)
  OR (submitter_type = 'guest'      AND user_id IS NULL))
```

Decisions worth knowing:

- **`moderation_status` is separate from `status`.** `status` is the item's life cycle (open to returned) and is driven by `lib/status.js`. Moderation answers a different question: may the public see this at all? Keeping them apart meant no change to the status state machine.
- **Defaults keep old rows valid.** Existing reports become `registered` + `approved`; registered inserts need no code change.
- **The CHECK is defence in depth**, like the existing `holding_location` check: a bug in a route cannot create an ownerless "registered" report.
- **IP is stored as an HMAC.** Enough to rate-limit and to spot "three reports from one connection", not reversible.
- Rejected reports are kept (not deleted) so there is a record of what was refused.

### New tables

| Table | Purpose | Key constraints |
|---|---|---|
| `notifications` | In-app alerts: `claim_filed`, `claim_decided`, `status_changed`, `message_received` | index on `(user_id, is_read, created_at)` for the nav badge |
| `conversations` | One thread per person per report | `UNIQUE (report_id, starter_user_id)` |
| `messages` | Messages in a thread, `read_at` NULL until opened | FK to conversation, sender RESTRICT |

A conversation is always about one report. That keeps messaging purposeful (no open-ended DMs between students) and gives staff context if a thread is ever reported.

### Public queries only ever see approved reports

Every public query (lists, counters, facets, matching, expiring items, stats) includes one fixed fragment:

```js
const APPROVED = "r.moderation_status = 'approved'";   // models/reportModel.js
```

`DETAIL_SELECT` now `LEFT JOIN`s users (guest reports have no owner) and returns `'Guest'` as the reporter name.

## 3. Step 2: spam safeguards

Layered, because no single check is reliable. Checks 1 to 4 raise the cost of abuse; check 5 is what actually stops it.

```text
POST /reports/guest
 1. honeypot      hidden field "website" filled?      -> pretend success, store nothing
 2. time token    signed "<issuedAt>.<hmac>" in form  -> reject if forged, < 4 s old, or > 2 h old
 3. validation    same rules as the registered form, plus: no links in text, contact well-formed
 4. rate limit    COUNT guest reports from this hashed source in 24 h >= 3 -> 429
    duplicate     same source + same item name in 24 h -> 422
 5. approval      row is inserted 'pending'; invisible until staff approve
```

```js
// lib/antispam.js
function issueFormToken() {
  const ts = String(Date.now());
  return ts + '.' + hmac.sign('guestform.' + ts);      // uses PROCESS_SECRET
}
function checkFormToken(token) { /* forged | too-fast | expired | ok */ }
```

The rate limit lives in the database, not in memory, so restarting the server does not reset anyone's quota. Limit is configurable with `GUEST_REPORTS_PER_DAY`.

**Why approval and not email verification.** The brief offered either. The project has no mail sender (the About page says so), and contact details are optional, so there is often nothing to verify. Approval needs no new infrastructure and also catches abusive content that a verified email would not. If you later add a mailer: store a token on the report, send a link, and only show reports in the queue once verified.

## 4. Step 3: routes (this app is server-rendered, so these are its endpoints)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/reports/new` | Public | Guest gets the simple form; `?kind=lost` redirects to sign-in |
| POST | `/reports/guest` | Public | Safeguards above, then 303 to `/reports/guest/thanks?ref=` |
| GET | `/reports/guest/thanks` | Public | Echoes a well-formed reference only; looks nothing up |
| POST | `/reports` | Registered | Unchanged, published at once |
| GET | `/reports/:reference` | Public / staff | Non-approved reports: staff only, everyone else gets 404 |
| GET | `/admin/moderation` | Staff | Queue, `?view=pending\|approved\|rejected` |
| POST | `/admin/moderation/:reference/approve` | Staff | Locks the row; only `pending` can be decided |
| POST | `/admin/moderation/:reference/reject` | Staff | Reason required (5+ chars) |
| GET | `/notifications`, POST `/notifications/read-all`, POST `/notifications/:id/read` | Registered | Ownership enforced in the SQL `WHERE` |
| GET | `/messages`, `/messages/new?report=`, `/messages/:id` | Registered | Thread visible to its two participants only |
| POST | `/messages`, `/messages/:id` | Registered | 20 messages per hour per user |

Rules enforced server-side, not just in the UI:

- A non-approved report cannot be viewed, printed, bookmarked, claimed, or have its status changed (staff must approve it first).
- Guest reports cannot be edited, withdrawn, or messaged: they have no owner.
- Role checks on the review routes look the user up in the database (`middleware/roles.js`); non-staff get the same 404 as a missing page.
- Notifications are created by claims, staff status changes, claim decisions, and messages. A failed notification is logged and never blocks the action that caused it.

Moderation core:

```js
// models/reportModel.js: one transaction, row locked, pending -> approved|rejected only
const [rows] = await conn.execute(
  'SELECT id, submitter_type, moderation_status FROM reports WHERE id = ? FOR UPDATE', [id]);
if (rows[0].moderation_status !== 'pending') throw new Error('This report was already ' + ...);
await conn.execute(
  `UPDATE reports SET moderation_status = ?, moderated_by = ?, moderated_at = NOW(),
   moderation_note = ? WHERE id = ?`, [decision, moderatorId, note, id]);
```

## 5. Step 4: UI/UX guidelines

**Guest form** (`/reports/new`, same layout and classes as the registered form)
- Three short sections: what you found, where and when, optional contact.
- Required: item name, category, description (20+ chars), location, date (defaults to today), where the item is now.
- No photo, tags, or account fields. Fewer fields means fewer abandoned reports and less to abuse.
- Contact is optional and says plainly: staff only, never public.
- Hints explain rules before the error appears (no links, 20 characters, keep one detail back).

**Encouraging an account, without nagging.** Three places, each at a moment the benefit is obvious, never blocking:
1. Side card on the guest form: what an account adds.
2. Confirmation page: after the report is in, a card explaining that guest reports can't be edited or tracked.
3. Report pages and the sign-in page: a one-line note for visitors who are not signed in.

**After submitting.** The guest sees their reference number and an honest message: staff review it first, then it is listed. They are never shown a link to a page that would 404.

**Registered users.** "Inbox" in the nav with an unread badge; notifications and messages as two tabs; "Message the finder" on other people's reports; My Reports links to both. Edit and withdraw are unchanged (withdraw is a soft delete with an audit row, which the project's traceability rule requires).

**Admin.**
- Dashboard: new "Reports by source" table (registered vs guest, by approved / pending / rejected) and a link showing the pending count.
- Review queue: one row per report with description, location, contact, how many reports came from the same source today, and Approve / Reject with a reason.
- A staff-only panel on the report page shows source, contact, and review state, with the same actions.
- Guest reports carry a "Guest report" pill so staff can tell them apart at a glance.

## 6. Rollout

```bash
mysql -u root -p whereitis < add-guest-reports.sql     # existing database, run once
# fresh install: schema.sql + seed.sql (seed now includes demo guest reports, a message thread, notifications)
```

Optional: `GUEST_REPORTS_PER_DAY` in `.env`. Behind a proxy, add `app.set('trust proxy', 1)` so the rate limit sees the visitor's IP and not the proxy's.

## 7. What was tested

Run against MySQL 8.0 with the seed data, driving the app with HTTP requests as a guest, a student, and staff:

- Guest form opens without sign-in; `?kind=lost` still redirects to sign-in.
- Rejected: too-fast post, forged token, link in text, duplicate title, 4th report in a day. Honeypot post stores nothing.
- A pending guest report returns 404 on its page, print view, claims, and bookmark, and is absent from lists and the home page. Staff can see it. Contact details never appear on a public page.
- Staff queue: students get 404, guests are sent to sign-in; approve, reject (short reason refused), double-decision refused; status change on a pending report refused.
- Notifications for: claim filed, status changed, claim approved. Badge counts, mark read, cannot mark someone else's.
- Messages: own report, guest report and pending report refused; one thread per pair; outsider gets 404; unread clears on open.
- Registered create, edit and withdraw unchanged. The database CHECK rejects a mixed-up row.
- The migration was applied to a database built from the original schema; existing rows were preserved.

Not tested: visual rendering in a browser (CSS reuses existing tokens and classes but was not screenshot-checked), and MariaDB.

## 8. Not done, and worth knowing

- **Email verification** (see section 3).
- **Guests can't later claim their reports** when they sign up. A natural next step is to match on contact email.
- **No automated tests.** The project plans Vitest/SuperTest for Week 15; the scenarios in section 7 are ready to turn into those.
- **Existing problems found while working, left alone** (not part of this request): `/admin` was unreachable because the admin router was only mounted at `/` (fixed in `app.js`, since the dashboard needed it); the views `admin/staff`, `admin/categories` and `admin/locations` do not exist, so those pages error; `last_value` in `schema.sql` and `lib/refs.js` is a reserved word on MySQL 8 (works on MariaDB); and the `public/` folder contains stale copies of the whole project, which Express serves as static files.
