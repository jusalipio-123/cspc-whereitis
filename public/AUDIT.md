# AUDIT.md

This document is CSPC WhereITis's honest, self-conducted audit against the requirements of the midterm brief: privacy (RA 10173), terms of use, cookies, accessibility (WCAG 2.2 AA preview), the claims flow, common failure modes, and basic HTTP hygiene. It was run on **2026-09-24**, against the state of the codebase at the end of Deliverable 10b, by the project team itself — not by an external reviewer. The intent of this document is to list every gap we found, not to hide them; several rows below end in "not yet" or "manual only," and that is deliberate honesty, not an oversight to be cleaned up before submission.

## Summary

| Area | Status | Gaps | Next action |
|---|---|---|---|
| Privacy (RA 10173) | Mostly compliant | No automated retention/purge job; retention is a manual custodian workflow | Automate the one-year purge as a scheduled job (Week 11+ infra) |
| Terms of Use | Compliant | None found — every clause traced and readable | Re-review after any new feature that changes acceptable use |
| Cookie Notice | Compliant | `Secure` flag only applies in production, by design | None — this is correct behaviour, documented as such |
| Accessibility (WCAG 2.2 AA) | Self-tested pass | No external audit; no full screen-reader test matrix | Schedule an external WCAG 2.2 AA audit (Week 13) |
| Claims flow | Compliant, exceptions handled | Some exception paths (role enforcement) are honour-system only | Add `requireRole()` in Week 11 |
| Possible errors | Handled for every case tested | No automated regression tests yet | Add Vitest/SuperTest coverage (Week 15) |
| Headers and hygiene | Baseline only | No helmet, no CSP, no CSRF, no rate limiting | Add helmet + CSRF + rate limiting (Week 12) |

## 1. PRIVACY AUDIT (RA 10173 — Week 3)

### Column-by-column traceability

| Table | Column | Read by (screen or report) | Verdict |
|---|---|---|---|
| users | student_no | Sign-in form, My Reports, claim/report ownership checks | Traceable |
| users | full_name | Comments, claim detail (claimant name), print receipt | Traceable |
| users | email | Stored only; not yet surfaced anywhere (email notifications are Week 11+ WON'T-list territory) | Traceable to purpose, unused by UI — flagged below |
| users | role | Route honour-system checks, admin user list | Traceable |
| users | pin_salt | Sign-in PIN verification (`userModel.verifyPin`) | Traceable |
| users | pin_hash | Sign-in PIN verification | Traceable |
| users | contact_no | Optional; intended for staff to call a reporter directly | Traceable, low usage — kept as optional |
| users | created_at | Admin user list, audit context | Traceable |
| categories | name, slug, icon_key, sort_order | Report forms, filter dropdowns, category admin screen | Traceable |
| locations | name, zone, is_public | Report forms, filter dropdowns, location admin screen | Traceable |
| reports | reference_no | Every report-facing page and the print receipt | Traceable |
| reports | user_id | Ownership checks, My Reports, history | Traceable |
| reports | kind, category_id, location_id | Display, filtering, matching engine | Traceable |
| reports | title, description | Display, search (LIKE), matching engine | Traceable |
| reports | occurred_on | Display, matching engine date window, aging calculation | Traceable |
| reports | holding_location | Report detail, claim form, print receipt | Traceable |
| reports | status | Display (pills), staff queue, transition enforcement | Traceable |
| reports | archived_reason | Report detail (when archived), staff queue | Traceable |
| reports | returned_to, returned_at | Report detail, print receipt | Traceable |
| reports | created_at, updated_at | Sorting (latest reports), edit-window logic | Traceable |
| claims | proof_text, distinguishing_features | Claim detail, staff decision screen | Traceable |
| claims | status, decided_by, decided_at, decision_note | Claim detail, staff queue, My Reports claims list | Traceable |
| report_comments | body, user_id, created_at | Report detail comments thread | Traceable |
| report_status_history | from_status, to_status, changed_by, note, changed_at | Not yet surfaced on any screen — exists purely as an audit trail (NFR-08) | Traceable to purpose (audit), no UI reader yet — acceptable, this table's entire purpose is the trail itself, not display |
| bookmarks | user_id, report_id, created_at | My Reports bookmarks section | Traceable |
| counter_sequence | year, last_value | Internal to `lib/refs.js` only, never displayed | Traceable to purpose (reference number generation) |

**Flagged for review:** `users.email` is collected and stored but is not read by any current screen (email notifications are explicitly out of scope this term). We are **not** proposing to delete it, because it has a clear stated future purpose (Week 11+ notifications) documented on `/privacy`, and RA 10173's proportionality test is about collecting only what is needed for a *stated* purpose — not only what is *currently rendered*. If email notifications are dropped from the roadmap entirely, this column should be revisited.

### The three principles

- **Transparency** — every collected field, its screen, and its purpose is listed on [`/privacy`](/privacy).
- **Legitimate purpose** — as the table above shows, every column traces to at least one reader or a documented future purpose. Nothing is collected speculatively.
- **Proportionality** — confirmed: no gender, civil status, religion, birthday, marital status, or government ID number is collected anywhere in the schema or on any form. `/privacy` states this explicitly.

### Sensitive personal information

Confirmed: no sensitive personal information under RA 10173 (race, ethnic origin, marital status, age, colour, religion, health, education, genetic/sexual life, proceedings for any offense, government-issued IDs) is collected by this system.

### Retention rule

Reports are kept for one academic year, then archived and purged of personal data; the reference number and item description are retained afterward for statistical purposes only. This rule is documented in `schema.sql`'s top-of-file comments and in the custodian office's archive workflow described on `/privacy`. **Gap:** there is no automated purge job yet — the one-year purge is currently a manual custodian-office process, not a scheduled script. This is an honest limitation, not a claim of automation we haven't built.

### Cookie notice accuracy

Confirmed: `/cookies` accurately describes the only cookie this system sets — `whereitis_id`, used only on `/my-reports`, holding no personal data (see Section 3 below for full flag detail).

## 2. TERMS OF USE AUDIT

| Clause | Exists on /terms? | Readable by a first-year student? | Contradicts /privacy? |
|---|---|---|---|
| What WhereITis is for | Yes | Yes — one short paragraph, plain English | No |
| What it is not (no Registrar replacement, no guarantee) | Yes | Yes | No |
| Acceptable use (no false claims, no stalking, no scraping) | Yes | Yes — bulleted, concrete examples | No |
| Consequences of abuse | Yes | Yes | No — consistent with the claims-audit exception paths in Section 5 |
| No warranty / limitation of liability | Yes | Yes — one short paragraph | No |
| Dispute handling | Yes | Yes — points to Student Affairs' existing grievance procedure | No |
| Source code licence (MIT) | Yes | Yes | No |

**Verdict:** every clause required by the spec exists, reads at a first-year level (short paragraphs, no legal jargon), and none of them contradicts anything stated on `/privacy` — in particular, the "acceptable use" clause's ban on scraping is consistent with `/privacy`'s statement that reports are public but not intended for bulk automated collection.

## 3. COOKIE AUDIT

Exactly one cookie is set by this system: `whereitis_id`.

| Name | HttpOnly | SameSite | Secure | Path | Max-Age |
|---|---|---|---|---|---|
| `whereitis_id` | true | Lax | true in production only (`NODE_ENV === 'production'`), false in dev | `/` | 1800 seconds (30 minutes) |

**Confirmed:** the cookie's value (`<userId>.<studentNo>.<expiry>.<signature>`) contains no personal data beyond the student number the person themselves just typed in to sign in, and that value is meaningless to read without the server-held `PROCESS_SECRET` to verify it — it is not usable to derive anything about the user without also having server access.

**Confirmed:** `/cookies` accurately matches this reality — it names `whereitis_id` as the only cookie, states its scope (`/my-reports` only), and explicitly disclaims analytics, advertising, and third-party cookies, all of which is true of the current build.

**Flagged, with reasoning (not a bug):**
- `Secure` is true only in production. This is correct, not a gap: local development runs over plain HTTP, and browsers silently refuse to set a `Secure` cookie over HTTP — enabling it unconditionally would break sign-in for every developer running `npm run dev` locally.
- `SameSite=Lax`, not `Strict`. This is also intentional: `Strict` would strip the cookie on the top-level navigation that follows the sign-in POST's 303 redirect in some browser/flow combinations, breaking the very sign-in flow it's meant to protect. `Lax` still blocks the cookie being sent on cross-site POSTs (the main CSRF-adjacent risk) while allowing normal same-site redirect navigation to work.

## 4. ACCESSIBILITY AUDIT (WCAG 2.2 AA preview — Week 13)

### Four manual tests

**a. Unplug the mouse.** Every main task — reporting an item, searching, filing a claim, signing in, approving/rejecting a claim, bulk status update — was completed using only Tab, Shift+Tab, Enter, and Space. Result: **pass**. The only friction point noted was the bulk-update checkbox table: Tab order through many rows is long, though still correct and linear (no traps, no skipped rows).

**b. Tab and watch.** Focus is visible on every interactive element via the global `:focus-visible` rule, and in every page tested the tab order matches the visual/reading order (nav → hero/form → main content → footer). Result: **pass**.

**c. Zoom to 200%.** No content disappeared, overlapped, or forced the page to scroll sideways. Wide tables (monthly counts, bulk-update list, category distribution) scroll horizontally inside their own `.table-wrap` container rather than widening the page. Result: **pass**.

**d. Greyscale.** Desaturating every screenshot, every status pill and days-held badge remained distinguishable, because each one carries a text label (`open`, `claimed`, `90 days held`, etc.) in addition to its background colour. Result: **pass**.

### Label and input pairing

Every form control across `reports/new.ejs`, `reports/edit.ejs`, `claims/new.ejs`, `claims/detail.ejs` (reject-reason textarea), `myReports/signIn.ejs`, `admin/bulk.ejs`, and `admin/categories.ejs`/`admin/locations.ejs` has a `<label for="...">` bound to the matching input's `id`. Confirmed bindings include: `title`, `category_id`, `location_id`, `occurred_on`, `description`, `holding_location`, `photo_url`, `proof_text`, `distinguishing_features`, `student_no`, `pin`, `note` (reject reason), `to_status`, `name`, `slug`, `icon_key`, `sort_order`, `zone`. Every one of these was checked by hand against its rendered HTML.

### Contrast ratios checked

Ratios computed against WCAG 2.1/2.2's relative-luminance formula. Targets: ≥ 4.5:1 for body text, ≥ 3:1 for large text (≥ 18pt/24px or ≥ 14pt/18.66px bold) and UI component boundaries.

| Pair | Ratio | Pass |
|---|---|---|
| `--brand` (#10427a) text on white | 10.08:1 | Pass (body) |
| `--muted` (#5b6472) text on white | 5.98:1 | Pass (body) |
| `--ink` (#12161c) on `--card` (white) | 18.15:1 | Pass (body) |
| `--ink` on `--bg` (#f7f8fa) | 17.08:1 | Pass (body) |
| `.pill--open` text/background | 8.87:1 | Pass (body) |
| `.pill--matched` text/background | 5.45:1 | Pass (body) |
| `.pill--claimed` text/background | 5.03:1 | Pass (body) |
| `.pill--returned` text/background | 7.08:1 | Pass (body) |
| `.pill--archived` text/background | 6.62:1 | Pass (body) |
| `.pill--lost` / `.pill--found` text/background | 7.80:1 | Pass (body) |
| `.btn--primary` white text on `--brand` | 10.08:1 | Pass (body) |
| `.btn--danger` white text on `--danger` | 6.54:1 | Pass (body) |
| `.flash--ok` text/background | 7.08:1 | Pass (body) |
| `.flash--err` text/background | 7.80:1 | Pass (body) |
| `--accent` (#ffb703) on white (focus-ring colour, not text) | 1.75:1 | Not applicable as text — used only as a 3px outline against varied backgrounds, not as a text/background pair; outline width/contrast against adjacent surfaces was checked visually instead of via text-contrast math |

### Alt attributes

Every icon in `views/partials/icons.js` carries `aria-hidden="true"` because each is always paired with adjacent visible text (button labels, pill labels, headings) — the icon is decorative reinforcement, not the sole conveyor of information, so `aria-hidden` plus `alt=""` semantics is correct rather than requiring descriptive alt text. `public/img/placeholder.svg` carries a `<title>Placeholder image</title>` for the one case where it stands alone (a photo URL preview slot with no other caption).

### Colour-only signals fixed

- **Status pills** (`open`/`matched`/`claimed`/`returned`/`archived`, `lost`/`found`) — originally styled as colour blocks during early layout drafts; every pill now renders its status as lowercase text inside the coloured pill, confirmed under the greyscale test above.
- **Days-held badge** — the age-bracket colour (`fresh`/`warm`/`old`/`stale`) is always paired with the literal day count in text ("47 days held"), never colour alone.
- **Form validation errors** — never indicated only by a red border; every invalid field has an adjacent `<p class="field-error">` with the actual error text, plus `aria-invalid` and `aria-describedby`.
- **"Possible match" ribbon** — the accent-coloured ribbon always carries the text "Possible match · Score N" rather than relying on the highlight colour alone.

### Still incomplete

- No external WCAG 2.2 AA audit has been conducted — every result above is self-tested by the project team, not independently verified.
- No systematic screen-reader test matrix (NVDA, JAWS, VoiceOver, TalkBack) has been run; only ad hoc VoiceOver spot-checks were done on a few pages.
- The `--accent` focus ring's contrast against every possible background it can appear over (cards, hero gradient, form fields) has not been exhaustively measured — only visually spot-checked.
- Print stylesheet accessibility (screen-reader behaviour of the printed receipt) has not been tested at all.