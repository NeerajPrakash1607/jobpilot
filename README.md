# JobPilot

[Open the live website](https://jobpilot-neeraj.bhanuprakash0024.chatgpt.site/)

Ireland company watchlists, job discovery, application tracking, résumé rearranging and an optional browser companion. The shared employer catalogue is public. Every visitor's private résumé workspace starts empty; no personal profile, résumé, application database or pairing key is shipped with the app.

This repository contains the current web application (version 3). It replaces the earlier local-only Node server; that implementation remains available in Git history. The web app uses JavaScript, a Cloudflare Worker-compatible server, D1 with Drizzle migrations, IndexedDB for the private browser workspace, and a private Google Apps Script scheduler for daily checks and email delivery.

## Find jobs

Browse Ireland and eligible remote jobs without registering. One Find jobs page combines company search and the job catalogue in compact rows. Role, location and company are the primary filters; experience and working arrangement are under More filters. Save keeps a role in My applications on this browser. Apply opens the employer website without recording a submission. Click a role title for its description and coverage details.

The default palette uses dark wine and plum surfaces with muted gold accents. The on-screen résumé preview follows the dark theme; downloaded documents keep their existing formatting. Other colour themes remain available under More tools. On desktop, filters sit beside the results. Phones use a collapsible search panel, bottom navigation and a full-width job details sheet. A short paper-plane takeoff accompanies searching, and saving sends the plane toward My applications. Motion stops when the page is hidden and respects reduced-motion preferences; loading more jobs only animates the new rows.

**New since last visit** highlights and filters jobs first discovered after the previous visit in this browser. First visits establish a baseline; refreshes within 30 minutes keep the same highlights. Only successful searches update visit history. This browsing preference does not change email alerts.

Refreshing the page or clicking the desktop/mobile JobPilot logo starts a new search with empty filters and no selected company checkboxes (All companies). Saved applications, sign-in and email-alert preferences are retained. Use **Use my saved alert search** to restore alert filters explicitly. Company lists, selected-company chips and alert summaries display names alphabetically.

Open **Company**, search by name, then choose **Add its careers page** if it is missing. Sign in and use **Check and connect**. JobPilot inspects a public HTTPS careers page and up to two linked vacancies pages on the same origin, discovers supported boards, then verifies the feed before connecting. Greenhouse, Lever (global/EU), Ashby, Workday and SmartRecruiters boards are recognised automatically. Multiple candidate boards require a more specific link; login, anti-bot challenges, script-only pages and unsupported systems remain saved links with a **Retry connection** action. JobPilot does not bypass access controls or promise coverage of every employer. Workday and SmartRecruiters imports are Ireland listings with summary details; partial feeds are labelled. Verified connections appear in the searchable A–Z directory, with counts and company selection, and join the existing Apps Script daily checking cycle without script changes. The original careers link is linked to the verified source, so retrying a saved request does not leave a duplicate unconnected row. Connecting never subscribes someone to email: select the company and save the alert watchlist separately. This free pilot permits 50 added boards and 20 additions/requests per account.

Discovery is bounded to three HTML pages, three redirects per page, one megabyte per page and a shared 20-second timeout. Every fetched destination must be public HTTPS with public A/AAAA records, including redirects; discovery sends no account cookies or credentials. Feed downloads retain a separate provider allowlist. Only literal links/embeds and provider URLs are inspected—page scripts are not executed.

**Email me matching jobs** opens one review-and-confirm flow. Signing in preserves the search already chosen; the visitor reviews the actual companies and filters, explicitly opts in, then confirms. With no company filter, the review lists all currently connected companies. Existing subscribers use Save alert changes, pause, or unsubscribe. Adding a company alone does not change an existing email subscription. Active and waitlisted outcomes are distinct. Short motion accompanies actual saves and alert confirmations; reduced-motion preferences disable it.

Yahoo, Mastercard and Fidelity Investments use their official public Workday boards. Fidelity’s Ireland careers pages resolve to one shared connection, including existing saved requests. Its listings cover Dublin and Galway and retain the direct Workday application links; use the location filter to choose a city. Each connector filters by advertised Ireland location facets, and paginates up to 200 Ireland postings. It reports partial coverage when that limit or an interrupted page prevents a complete snapshot. Summaries link to the employer; Mastercard also supports full-description imports. Yahoo uses its public Ireland location facets and joins the existing daily runner automatically. LinkedIn’s own careers site connects to its official SmartRecruiters employer board (LinkedIn3), fetching public Ireland postings in pages of 100, up to 1,000. Its summaries include the employer’s location, working arrangement when supplied, release date and direct posting link. Invalid rows, interrupted pages or a page limit report partial coverage and preserve previous vacancies. Existing LinkedIn careers requests are recognised automatically and the daily runner includes the board without a script update. General LinkedIn job-search URLs remain saved links and are not imported. The older Mastercard careers frontend rejects requests from the hosted server.

Google sign-in, account watchlists, company requests, a 50-subscriber pilot cap, waitlisting and daily digest processing are implemented behind configuration gates. **A new deployment starts with alerts disabled and requires its own Google client, sender and scheduling setup.** Follow [Google and email setup](docs/GOOGLE-AND-EMAIL-SETUP.md) and verify login, delivery, unsubscribe and a scheduled cycle before enabling subscriptions. The private Apps Script runner in `ops/JobPilot.gs` must be installed and authorised separately; publishing the website does not install that runner.

## Early-career pilot

The **Early-career IT support** shortcut selects technical-support roles and 0–2 years of required experience. Higher preferred experience is disclosed; unclear or incomplete experience is separated on the website and excluded from early-career emails. Sponsorship uncertainty is labelled separately when sponsorship is needed. Internships and apprenticeships have separate opt-ins. Résumé skill gaps are explained only in the browser and never hide jobs.

Daily alerts contain only newly discovered matches after activation or a search change, excluding initial company imports. Quiet days produce no job email. Failed company checks retain visibly unverified listings on the website and exclude those jobs from emails; two failed daily checks produce one independent warning per outage. Verified added feeds are shared publicly, while account watchlists and requester identities remain private.

See [the two-week pilot guide](docs/PILOT.md) for the complete rules, launch checks and five-friend trial. The trial has not been run.

## Use the website

1. Open Find jobs and browse immediately. Search by role, location or company, then save roles or apply on the employer website.
2. When preparing an application, open More tools → Your profile and upload a text-based résumé PDF (up to 8 MB). Review the extracted text.
3. Save roles to Applications and prepare an introduction. Track applications, follow-ups and confirmed outcomes.
4. Paste a job description in Tailor résumé. Relevant source skills and experience bullets are moved forward without shortening your résumé or adding claims. Every section and bullet is retained; Education, Projects and Achievements keep their wording and order. Ambiguous or wrapped experience groups stay in place to preserve context. Review matches and missing requirements, then edit and download PDF, Word or plain text. There is no ATS score or selection guarantee.
5. Use Tools & backups to download a portable backup. Restore it when moving to another browser or computer.

Refreshing starts the résumé builder with an empty form. Your saved profile, source résumé and applications remain in that browser. Alert accounts save only identity, watchlists, company requests and delivery records on the server. Signing in does not upload or sync the résumé workspace. Clearing site data or using a temporary browser session can remove your local workspace. The site includes no third-party analytics.

## Browser companion

Download the extension ZIP in Tools & backups, extract it, and load its folder using Developer mode in Chrome or Edge. Pair it with the website address and the pairing key shown by the site. Keep JobPilot open in the same browser profile.

On an employer's application form, open the companion, choose the prepared role, check that it matches the page, and fill for review. Submit only after reviewing the completed form and approving the selected role. Missing answers, required agreements, verification and unsupported controls pause the operation. An uncertain submission is recorded as pending and cannot be retried until the visitor verifies the result.

The companion accesses employer forms when the visitor activates it. It sends their reviewed application details to the selected employer. It does not bulk-apply to search results. Browser installation is separate from opening the website; it is not installed automatically or listed in an extension store.

## Data boundary

Private résumé workspace data lives in IndexedDB under this website's origin. Browser-side code handles résumé reading, rearranging, file generation, backups and application records. Discovery requests contain job-search filters, company preferences or public posting URLs. Account requests contain a Google identity credential and alert preferences. The Worker verifies Google credentials and stores opaque, hashed sessions; account actions enforce ownership and same-origin requests. Employer fetching uses an HTTPS allowlist. A visitor's résumé and application profile are never uploaded by these workflows. Localhost's database is separate from the public site.

The public extension uses an exact-origin host permission and executes its token-checked bridge in the open JobPilot tab. The application runner and duplicate-attempt protection remain in the companion and browser workspace. Backup restoration validates records before atomically replacing the workspace and retains a recovery snapshot.

## Development

Requires Node.js 24 and pnpm 11.19.0. The Node version is recorded in `.nvmrc` and the package-manager version in `package.json`. Install [pnpm](https://pnpm.io/installation), or use `corepack pnpm` in place of `pnpm` if Corepack is available.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm db:migrate:local
pnpm exec wrangler dev --config ./wrangler.json --port 5183
```

`build.mjs` creates `dist/server/index.js`, static assets in `dist/client`, and the downloadable extension. Sites project registration is in `.openai/hosting.json`; use the Sites publishing workflow for this project.

The company-watch service uses the logical Sites D1 binding `DB`; generated Drizzle migrations are packaged with the build. Runtime settings are described in `.env.example` and the setup guide. Résumé tools require a modern browser with IndexedDB, Web Workers and local downloads. PDF extraction does not perform OCR on scanned résumés. PDF exports embed Charter; Word uses Charter with the reader's font fallback when unavailable.

## Changes through pull requests

Create a branch from the latest `main`, make one coherent change, and open a pull request back to `main`. Describe the user-visible behavior, validation and any limitations. The PR template provides a starting point. GitHub Actions runs the unit/service tests and production build for pull requests and updates to `main`; it uses no production credentials and sends no emails.

```sh
git switch main
git pull --ff-only
git switch -c codex/describe-your-change
# Make the change, then run the checks.
pnpm test
pnpm build
git add <changed-files>
git commit -m "Describe the change"
git push -u origin codex/describe-your-change
```

Open **Compare & pull request** on GitHub, review the diff and checks, and merge when ready. Merging a GitHub PR does not deploy the live website automatically; hosting still uses the separate Sites publishing workflow. Changes to the Google Apps Script runner also need to be copied into that private script separately.

## Current limitations

- Career sites connect automatically only when a supported feed can be verified. Other careers links remain visible but do not contribute jobs or alerts.
- Early-career experience and sponsorship extraction uses conservative text rules. Ambiguous requirements and summary-only descriptions stay explicitly uncertain.
- The two-week user trial has not started; automated tests do not demonstrate real-world matching quality or inbox delivery.
- Job-feed availability and summary completeness vary by employer. Review the full employer posting before applying.
- Résumé tailoring rearranges supplied content without inventing qualifications and does not promise an ATS score or hiring outcome.

## Checks

`pnpm test` covers source failures, incomplete snapshots, vacancy closure, Ireland matching, subscription capacity, FIFO promotion, digest reservation and uncertainty, unsubscribe, ownership and request boundaries, plus the existing workspace and résumé protections. Service integration tests execute the generated schema against SQLite. Browser checks cover filters, saving roles, mobile layout, résumé preservation and downloads. Google login and real email delivery require the separate launch checks; unit tests do not establish either connection. Live applications are never submitted as part of testing.

Run `pnpm build`, `pnpm exec playwright install chromium`, then `pnpm test:browser`. These tests use temporary local servers and in-memory accounts to verify anonymous search, pagination, filter persistence through sign-in, local saved jobs, employer Apply links, company connections, explicit email consent, pausing, mobile layout, reduced motion, and unsubscribe confirmation with token-free referrers and suppression of queued mail. Employer feeds and the Google identity provider are replaced with fixtures; account preferences and subscription changes use the real Worker with an isolated SQLite database. These tests do not send emails or verify live Google authentication. To use installed Chrome instead, run `JOBPILOT_TEST_BROWSER_CHANNEL=chrome pnpm test:browser`.

## Fonts

Charter is distributed under the Bitstream Charter licence included at `src/assets/fonts/Charter license.txt`, sourced from https://practicaltypography.com/charter.html. The licence notice remains in the deployed assets.
