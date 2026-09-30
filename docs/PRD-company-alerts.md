# JobPilot — Ireland Company Watch and Job Alerts

**Status:** Implementation authorised. Company catalogue and watchlist service built; Google sign-in, private sender and offline scheduled-cycle verification remain launch dependencies.

**Owner:** Neeraj Prakash Vandana

**Date:** 16 September 2026

**Product:** JobPilot public website

## 1. Product promise

Follow the companies you want to work for in Ireland. Receive one daily email when they publish jobs matching your preferences.

JobPilot should save job seekers the effort of repeatedly visiting company career pages. Its first release should earn trust through relevant results, clear coverage and dependable checks. Application tracking, résumé rearranging and the browser companion remain supporting tools.

## 2. Problem and audience

People interested in particular employers must revisit multiple career pages, repeat searches and remember which vacancies they have already seen. They can miss openings or waste time on duplicates, closed listings and unsuitable locations.

The initial audience is people seeking work in Ireland who have a shortlist of employers. The first pilot should recruit ten people actively job hunting. This pilot size is a recommendation, not a user limit.

The hypothesis to test is that a focused company watchlist and relevant daily digest provide enough value for users to return. Demand, willingness to pay and an advantage over existing job platforms are not yet established.

## 3. Decisions and assumptions

### Agreed direction

- Launch for Ireland first.
- Start free, with a €0 incremental operating budget.
- Check supported company career sources automatically, even when the user's browser is closed.
- Deliver matching job alerts by email, initially as a daily digest.
- Allow browsing without an account; require an account to activate alerts.
- Use Google sign-in.
- Let users choose companies and role, location, experience-level and working-arrangement preferences. Optional filters can be left unset.
- Accept requests for additional company career pages; show unsupported sources as not monitored.
- Begin with a maximum of 50 active alert subscribers. Additional subscribers join a waitlist.
- The first digest can include existing matching jobs; later digests identify newly discovered matches.
- Résumé tailoring rearranges supplied content. It does not invent claims or promise an ATS score. Education, Projects and Achievements retain their wording and order.

### Proposed defaults requiring review

- Check each supported employer once daily, then prepare daily digests using Europe/Dublin time. Exact delivery time is not guaranteed.
- Begin with 20–30 dependable employer sources; the final list depends on coverage testing and pilot demand.
- Send no job-alert email when there are no new matches.
- Allow one daily digest per active subscriber, combining all followed companies.
- Show up to 20 roles in an email with a link to all remaining matches. Do not silently discard overflow.
- Admit waitlisted users in signup order when capacity is available. An operator controls promotion during the pilot.
- Pausing or unsubscribing releases an active slot. Resuming requires a capacity check and may return the user to the waitlist.
- Run a two-week pilot before increasing coverage or subscriber capacity.

These are draft product choices, not already-implemented behaviour.

## 4. Current product and delivery gap

| Area | Current product | Required for this release |
| --- | --- | --- |
| Job discovery | On-demand searches against selected public sources | Persistent shared catalogue refreshed independently of visitors |
| Company list | Browser-local preferences; supported sources and external links | Account-linked watchlists, monitoring status and requests |
| Coverage | Source-dependent; some feeds have partial coverage | Measured coverage and explicit limitations |
| Accounts | No account or automatic cloud sync | Google sign-in for alerts and cross-device alert preferences |
| Notifications | No scheduled matching email service | Scheduler, durable delivery records, opt-in and unsubscribe |
| Private workspace | Résumés, profile and applications stored in the browser | Preserve this behaviour; do not automatically upload them during sign-in |
| Résumé tool | Rearranges existing skills and bullets; preserves protected sections | Retain existing behaviour and downloads |
| Companion | Optional, manually installed extension for selected applications | Keep optional; monitoring and alerts must work without it |

Existing sources include Amazon, Mastercard, An Post, Novartis and several Greenhouse company boards. Yahoo is currently an external career-page link, not an automatic feed. Current connectivity must be checked again before promising scheduled coverage. A cached response or a partial feed does not establish complete monitoring.

## 5. MVP experience

### Browse and follow

1. A visitor browses Ireland jobs and the company directory without signing in.
2. Each company displays its monitoring status, coverage and last successful check.
3. The visitor selects companies and optionally adds role, city, experience and remote/hybrid/onsite preferences.
4. JobPilot previews example matches and explains why they match.
5. To enable email alerts, the visitor signs in with Google and explicitly opts in.
6. JobPilot confirms either active alerts or waitlist status. Signing in alone does not subscribe the user.

### Agreed UI refinement — 17 September 2026

- One Find jobs page replaces separate Company Watch and Explore more jobs screens. New visitors see Ireland jobs immediately.
- The primary navigation is Find jobs, My applications and Tailor résumé. Profile, progress and backups remain under More tools.
- Search prioritises Role, Location and Company. Experience and arrangement live in More filters.
- Compact job rows show title, company, location, arrangement when known, Save and Apply. Role details open in a dialog; Apply opens the employer website and never marks the role as submitted.
- Search a company name before adding its official careers URL. Unsupported and pending companies have a separate Requested companies list, with no invented job count.
- A single alert dialog keeps the chosen search through Google sign-in, shows its companies and filters, and requires explicit email consent. Active users update their search without a separate save-watchlist step.
- Use dark wine and plum surfaces with muted gold accents and the friendly paper-plane illustration. Short transitions and success feedback acknowledge real actions and respect reduced motion. No streak penalties, artificial urgency or repeated prompts.
- Preserve existing browser workspaces, résumé content, application records, extension pairing and the private email launch gates.

### Receive and manage alerts

1. Background checks update the shared catalogue while the user is offline.
2. An eligible daily digest lists the company, role, location, working arrangement when known, match reason and employer link.
3. The first digest labels existing roles as current matches. Later digests label new discoveries accurately.
4. The user can change preferences, pause alerts or unsubscribe.
5. Existing application tracking and résumé tools remain available from the website.

## 6. User stories

1. As a visitor, I want to browse without registering so I can judge whether JobPilot is useful.
2. As a job seeker, I want to follow selected employers so I do not have to check each career page manually.
3. As a job seeker, I want optional filters so I can receive either a broad company digest or a narrower search.
4. As a job seeker, I want the reason for a match so I can judge relevance quickly.
5. As a visitor, I want unsupported companies clearly labelled so I know they are not being checked.
6. As a job seeker, I want to request a career page so coverage can expand to employers I care about.
7. As a subscriber, I want checks to run while my device is off so alerts do not depend on my browser.
8. As a new subscriber, I want current matching vacancies in my first digest so I can start applying immediately.
9. As a returning subscriber, I want fresh discoveries without repeated listings so I can scan the email quickly.
10. As a subscriber, I want to know when a source is stale so silence does not mislead me.
11. As a waitlisted user, I want a clear status and continued browsing access so the capacity limit does not block my search.
12. As a subscriber, I want to pause or unsubscribe easily so I control email frequency.
13. As an account holder, I want to delete my alert account and understand which data remains only in my browser.
14. As a résumé user, I want relevant experience brought forward without changes to my factual history.
15. As the operator, I want failed checks, capacity and uncertain email attempts visible so I can run a small reliable pilot.

## 7. Functional requirements and acceptance criteria

### F1. Company directory and coverage

- Separate source support from current health. A supported source can temporarily fail; an unsupported source must never appear monitored.
- Display company name, official careers link, coverage scope, latest attempt and latest successful check.
- Distinguish a successful empty result, partial result, stale result and failed check.
- An unsupported URL creates a company request or bookmark. It does not start an arbitrary background crawler.
- A public directory may show approved company entries; requester identity remains private.

**Acceptance:** Adding an unsupported page displays “Not monitored yet.” A failed check preserves the previous successful timestamp and never becomes “No jobs available.”

### F2. Google sign-in, preferences and capacity

- Browse anonymously; authenticate only for account-linked alert settings.
- Use the stable verified Google account identity, not an untrusted email field, to identify the account.
- Send alerts only to the account's verified address. Alternate delivery addresses are outside this release.
- Require a separate explicit email-alert opt-in. Do not request access to a job seeker's Gmail inbox.
- Require at least one monitored company for activation; requesting unsupported companies alone cannot activate a working digest.
- Enforce the 50-active-subscriber cap atomically, including concurrent signups and resumes.
- Persist watchlists, preferences and subscription status across devices. Local résumés and applications remain local.
- A waitlisted account receives no recurring job digest. Show its status without promising an activation date.

**Acceptance:** With 49 active subscribers, simultaneous eligible signups produce at most one additional active subscription. The others remain waitlisted. Unauthenticated users can still browse.

### F3. Matching and geography

- Unset filters mean no additional restriction within the Ireland launch scope.
- Multiple selected role phrases use OR; different filter categories use AND.
- Keep matching deterministic and explainable. Use explicit role aliases where needed; do not show an eligibility or ATS score.
- Distinguish onsite, hybrid, remote and unknown working arrangements. Unknown must not be silently treated as remote.
- Remote roles need advertised geographic coverage compatible with Ireland and no stated exclusion. Show the employer's advertised region; do not infer work authorisation or sponsorship.
- When an experience or arrangement filter requires information the listing does not provide, exclude uncertain results from the digest and make them available separately for review in browsing.
- Distinguish Dublin, Ireland from similarly named places elsewhere.

**Acceptance:** A Dublin, California listing does not match Dublin, Ireland. An Ireland-eligible remote role can match a remote preference, with an explanation grounded in the listing.

### F4. Scheduled checks and vacancy lifecycle

- Run checks in hosted infrastructure without an open browser, extension or running laptop.
- Fetch each employer once per scheduled cycle and share its results across subscribers.
- Store stable employer vacancy identity, canonical URL, first-seen time, last-seen time and source-provided dates separately.
- Do not treat an edited posting or a changed tracking parameter as a new vacancy.
- Complete all supported pagination or mark coverage partial. Never claim complete coverage for a truncated feed.
- Apply bounded retries and provider-appropriate backoff. A failed or partial fetch cannot prove that an absent job has closed.
- Proposed closure rule: explicit employer closure or absence from two consecutive complete successful snapshots. Restore an open state if the vacancy returns.
- Do not close saved application records when a vacancy closes; retain the user's application history.

**Acceptance:** Two executions of the same cycle do not duplicate vacancies. A source timeout does not erase its catalogue or close its vacancies. Restarting a worker does not erase history.

### F5. Digest contents and duplicate protection

- First digest: current matching roles from usable successful checks, labelled as current matches.
- Later digests: newly discovered matching roles not already delivered to that subscriber.
- “New” refers to discovery by JobPilot unless a reliable employer publication date is supplied. It must not imply JobPilot saw the role immediately after publication.
- Preference changes or newly followed companies may introduce existing matches once, labelled as newly matching the watchlist. Do not resend already delivered roles.
- Exclude closed jobs and avoid producing new alerts from old cached snapshots.
- Track pending, provider-accepted, failed and uncertain delivery attempts. Provider acceptance is not proof of inbox delivery.
- Claim each digest atomically. Retry confirmed failures within budget; quarantine uncertain sends for reconciliation instead of blindly resending.
- Use provider idempotency when available. Do not promise exactly-once email delivery where the provider cannot guarantee it.
- Recheck subscription status before sending so pending mail is suppressed after unsubscribe.

**Acceptance:** Retrying a scheduler event does not create a second digest for the same subscriber and daily window. A crash after an ambiguous email response creates an operator-visible uncertain state.

### F6. Controls, trust and operator view

- Include a working unsubscribe link and a link to alert settings in every digest.
- Unsubscribe must work without Google sign-in, using an opaque token and an explicit confirmation action that email-link scanners cannot accidentally trigger.
- Show active, paused, waitlisted and unsubscribed states clearly.
- Keep monitoring failures distinct from ordinary empty results. Display stale sources in the website and a brief coverage notice in any affected digest.
- Alert the operator to prolonged failures, missed schedules, capacity exhaustion and delivery uncertainty. Do not repeatedly notify for the same unchanged issue.
- Provide a privacy notice, account deletion and an explanation of local browser storage before public alerts launch.
- Restrict operator actions and sender credentials to the operator. Keep personal data and tokens out of diagnostic logs.

**Acceptance:** An unsubscribe confirmed while an email is queued prevents that email from being sent. One subscriber cannot read or change another subscriber's settings.

### F7. Existing résumé and application tools

- Retain truthful résumé rearranging and the current readable download layout.
- Preserve every source section and bullet; never fabricate missing qualifications. Keep Education, Projects and Achievements unchanged.
- Preserve the requested refresh behaviour: a fresh résumé form after page refresh, with the saved profile and applications still available in that browser.
- Keep the browser companion optional and its existing selected-role review and submission controls intact.
- A before-and-after résumé comparison is a later improvement, not a launch dependency for company alerts.

## 8. Data and technical boundaries

Apply the explicitly requested Boundary Discipline skill: validate external input once at the boundary, convert it into domain values and keep business decisions independent of framework code.

### Domain records

The service needs accounts, company sources, watchlists, alert preferences, subscriptions, company requests, source snapshots, vacancies, digest records and per-recipient delivery history. Persist facts needed for deduplication and recovery; do not use process memory as the only record of a completed check or sent digest.

Source capability, snapshot completeness and source health are separate concepts. A valid empty snapshot differs from failure. A partial snapshot cannot be used to infer closure.

### Boundary responsibilities

| Boundary | Responsibility |
| --- | --- |
| Browser requests | Validate shape and limits; authenticate and authorise account operations; parse into domain values |
| Google identity | Verify token/session properties through the chosen supported integration; expose account identity internally, not raw provider tokens |
| Employer responses | Validate provider payloads, pagination and URLs; convert to a normalized snapshot with completeness and skipped-record information |
| Requested career URLs | Enforce HTTPS and public destinations, validate redirects, restrict fetching to approved sources and bound response size/time |
| Scheduler | Authenticate invocation, parse schedule time and claim work; pass explicit time and existing state to application logic |
| Storage | Enforce uniqueness, ownership and atomic claims; validate persisted records at read/migration boundaries |
| Email provider | Handle quotas, timeouts and provider responses; expose accepted, failed or uncertain outcomes without leaking provider wire types |
| Configuration | Validate required values and capacity settings at startup; keep secrets in the chosen platform's secret storage |

Matching, vacancy reconciliation and digest selection should be pure functions of validated inputs, prior state and explicit time. They must not perform network calls or access framework request objects. Thin adapters handle I/O and error translation. Keep authorisation, subscription eligibility and capacity rules enforced; these are business invariants, not redundant raw-input validation.

Reuse the existing discovery and company-adapter logic where suitable, while adding durable history and background orchestration. The existing résumé profile is not required for alert matching and must not be sent to the alert backend automatically.

## 9. Hosting, identity and budget dependencies

The current website is publicly hosted through Sites. This PRD does not establish that its current deployment supports the proposed scheduler, durable account store or Google sign-in flow.

Before implementation choices are finalized, verify:

1. A supported Google OAuth production flow on the selected public origin, including the required ownership/branding setup.
2. Durable storage and an independent scheduler within the zero-cost pilot budget.
3. A sender that can deliver opt-in mail to pilot subscribers, with working unsubscribe and enough capacity for initial digests, routine alerts and retries.
4. A private operator-controlled Gmail/Apps Script sender, discussed as a candidate for the domainless pilot, is operationally suitable. It is not assumed provisioned or production-ready.
5. Current provider limits, delivery behaviour and account requirements. The 50-subscriber cap is a product pilot limit, not a provider quota or guarantee.

Do not silently replace Google sign-in, move the website to another host, buy a domain or enable paid services. If no supported configuration meets the agreed constraints, present the specific trade-off before launch. Limit capacity or pause admissions before exceeding a free allowance.

## 10. Quality and validation

Test observable behaviour at the highest useful seam: given normalized employer snapshots, account preferences, prior history and a fixed time, assert catalogue transitions and the exact digest recipients and contents. Use fake storage and email adapters for orchestration tests; test each real provider adapter separately with representative fixtures.

Required scenarios include:

- Healthy empty, malformed, partially paginated, stale and failed sources.
- Duplicated roles, tracking-URL changes, revised descriptions, closure and reopening.
- Ireland geography, unknown remote eligibility, role aliases and unset filters.
- Initial digest, no-match day, overflow, preference changes and concurrent scheduler retries.
- Signup/resume races at the 50-user cap, waitlist promotion and repeated unsubscribe.
- A crash before send, after provider acceptance and with an ambiguous response.
- Cross-account access attempts, unsafe career URLs and secret-free logs.
- Regression checks for résumé content preservation, exports, local workspace isolation and selected-application controls.

Run one real scheduled cycle with test accounts while all user devices are offline, and complete an end-to-end opt-in, delivery and unsubscribe check before admitting pilot subscribers. Do not send test emails to uninvolved people or submit job applications as part of validation.

Proposed operational targets for the pilot: initiate at least 95% of scheduled checks within their daily window; flag supported sources without a successful check for 48 hours; keep duplicate digests caused by our scheduling logic at zero. These are acceptance targets to measure, not current guarantees.

## 11. Success measures

Primary outcome: users discover relevant jobs at their chosen companies with less repeated searching.

For the proposed ten-person, two-week pilot:

- At least six participants use a digest or return to their watchlist in week two.
- At least five report finding a relevant role they had not already found elsewhere.
- Record reasons for irrelevant matches and missing-company requests to guide improvements.
- Measure source freshness, failure rate, duplicate suppression and delivery outcomes separately from product engagement.
- Do not treat signups, email opens or positive feedback alone as evidence of value. Email opens are not required to be tracked.

These thresholds are proposed learning goals. Use a short consent-based feedback form or interviews; avoid adding third-party tracking simply to run the pilot. Decide any click-event collection and retention explicitly before implementing it.

## 12. Delivery sequence and launch gate

1. **Feasibility:** prove the identity, storage, scheduler and sender path within the agreed budget.
2. **Catalogue reliability:** add durable snapshots, stable vacancy identity, completeness, closure handling and coverage status.
3. **Accounts and watchlists:** implement Google sign-in, saved preferences, opt-in, capacity and waitlist states.
4. **Scheduled alerts:** implement shared checks, digest selection, delivery history, retry handling and unsubscribe.
5. **Pilot readiness:** exercise failure recovery, review privacy information, run the offline-device delivery check and invite the initial group.

Use reviewable pull requests for these slices once the implementation repository and workflow are confirmed. This document creates no GitHub issues, PRs, deployments or scheduled jobs.

Launch only when supported companies have demonstrated reliable checks, the subscription states are truthful, no cap can be exceeded under concurrency, and the full alert/unsubscribe flow works. A public directory must not advertise automatic monitoring before that service is operating.

## 13. Out of scope

- All-country coverage, all-employer coverage or instant-alert guarantees.
- Unrestricted crawling of arbitrary submitted URLs or bypassing employer access controls.
- New bulk auto-apply functionality, guaranteed interviews or perfect ATS scores.
- Paid plans, payments, purchased domains or paid infrastructure in this release.
- Automatic cloud upload/sync of existing résumés and application records.
- Extension-store publication, native mobile apps, SMS and WhatsApp alerts.
- Rebuilding existing résumé, tracking or companion features solely for this launch.

## 14. Open decisions

| Decision | Recommended next action |
| --- | --- |
| Identity and hosting compatibility | Prove Google sign-in on the supported production route before committing to an auth stack |
| Scheduler, database and sender | Validate a complete zero-cost path, including recovery and quota behaviour |
| Employer list | Ask pilot users for priorities; select sources that pass coverage checks |
| Proposed defaults | Review check cadence, digest size, pause/capacity handling and closure policy |
| Data retention and deletion | Set explicit retention periods for accounts, delivery records and logs before collecting production alert data |
| Repository and PR workflow | Confirm the public-site implementation repo and GitHub destination; do not overwrite the older local-app repo |
| Pilot recruitment and metrics | Confirm ten participants, the two-week evaluation and consent-based feedback method |

The PRD is ready for review. Open dependencies do not prevent documenting the intended experience, but they must be resolved before promising the public alert service.
