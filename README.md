# JobPilot

A working local application assistant: find live job openings, compare them with your résumé, prepare an editable introduction, fill and submit supported application forms you explicitly approve in Chrome or Edge, and record detected confirmations.

## Run locally

Requires Node.js **22.16+**. Clone this repository, then run:

```sh
npm start
```

Open [JobPilot at localhost:5181](http://127.0.0.1:5181). Keep the terminal running. No npm dependencies or build step are required. macOS users can also run `./launch.command`.

A fresh checkout starts with an empty profile and no résumé. Open **Your profile**, enter your details, and upload your own PDF. PDF text extraction requires Python 3 and `pypdf`:

```sh
python3 -m pip install pypdf
```

The app detects a bundled Codex Python runtime when available. Otherwise it uses `python3`; `JOBPILOT_PYTHON` can select another executable. Enter or correct résumé text in Profile before preparing applications.

Use `JOBPILOT_PORT` to change the port and `JOBPILOT_DATA_DIR` for a different data directory. The server binds only to `127.0.0.1`. It is a local application, not a hosted multi-user service.

Your résumé, profile, pairing key, applications and backups are created locally and are not included in this repository. The `.gitignore` excludes local databases, PDFs, environment files and backups.

## Application workflow

1. **Your profile:** Review your contact details, résumé text, and additional skills. Upload your own PDF and review the extracted text. PDF extraction happens locally; no résumé is sent to an AI provider.
2. **Find jobs:** Open Find jobs or click Find jobs for me. The first search uses your profile’s target role and location. Edit the keywords, separate alternatives with commas, include eligible-region remote listings, and optionally hide senior/management titles. Results show full descriptions, source links, and résumé skill overlap. Click Save role to add a listing directly to Applications, then open it to prepare. Your last search is remembered. Import a role remains available for a specific listing found elsewhere.
3. **Prepare:** JobPilot compares recognised skills in the description against your résumé and skills. It reports actual keyword overlap and gaps. The number is not a hiring probability. The introduction uses your supplied information; it is a deterministic draft, not an AI-generated claim about your qualifications. Edit and save it. Download an application text pack when useful.
4. **Choose:** Open the employer’s HTTPS application form in Chrome or Edge. In the companion, select the prepared role, verify the form belongs to it, and review your contact details, résumé filename and saved introduction.
5. **Auto-apply:** Tick the submission approval and click **Auto-apply this role**. The companion fills recognised empty fields and the cover-letter field, attaches your résumé, validates the form, and clicks its recognised submit button once when complete. It pauses for missing answers, unsupported controls, CAPTCHA and agreements. Complete those yourself; reapprove only when ready. **Fill application for review** remains available for autofill without automatic submission.
6. **Confirm:** A newly detected confirmation is recorded with browser-confirmation provenance. If no confirmation is verified, the job is marked as an attempt needing verification, not applied. Check the page/email before retrying. You can record a confirmation manually or explicitly confirm an attempt was not sent inside the application workspace.

## Finding jobs

The app reads seven public employer boards via Greenhouse (Stripe, Intercom, Datadog, Squarespace, MongoDB, Toast, Reddit) and the Remotive public remote jobs feed. No API key or job URL is needed. It searches this defined selection, not all of LinkedIn, Indeed, or the internet.

- Search runs when you first open Find jobs and when you click Find jobs or a preset. It is not a background scheduler.
- Common frontend/React and support queries include related job-title variants; comma-separated alternatives are OR searches. General keywords match titles. Results are sorted by the number of recognised résumé skills in common, then listing date. This is a keyword comparison, not an eligibility assessment or hiring probability.
- Location matches the posting’s advertised label. Dublin/Ireland searches exclude US-only remote listings and unknown remote ranges; European and worldwide remote labels can match Ireland. Read each posting’s residency, experience, language and work-authorisation requirements. The senior filter checks titles, so it does not establish experience eligibility.
- Employer feeds are cached for 30 minutes. Remotive is fetched at most once every 6 hours when healthy; its public feed is delayed by 24 hours. Links and source attribution are preserved. Cache files survive restarts and contain public job data only; your résumé stays local.
- Sources refresh only when a search needs them. An unavailable source is identified on screen. A cached copy less than 24 hours old can be shown with an explicit stale label, otherwise that source contributes no results. Failures back off for 5 minutes. Searches share concurrent fetches.
- At most 100 ranked matches are returned, displayed 12 at a time. Narrow the filters for more specific results. The source panel lists counts and check times; it does not claim those source-wide counts all match your filters.
- Saving a Greenhouse result rechecks that individual posting before adding it. Repeated saves return the existing application. No job is applied to or message sent as a result of searching or saving.
- URL import is still available from Applications. Greenhouse/Lever APIs and other sites with JobPosting structured data are supported. For blocked pages, the extension can capture visible text.

## Chrome / Edge extension

The dashboard's **Tools & backups** page includes a downloadable extension ZIP and installation instructions. You can also load the local `extension` directory directly:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode, click **Load unpacked**, and select this project's `extension` folder.
3. Open JobPilot's **Tools & backups**, copy the pairing key, and paste it into the extension with the local service address.
4. Click the extension on the listing or form you want to work on.

The extension uses a service worker so an approved run can continue when its popup closes. It requests `activeTab`, `scripting`, local extension storage, clipboard write, and loopback host access. It runs on the tab you activate it on. It uses a bearer key to connect to the local service; that key is not included in exported backups or the extension ZIP. It does not read browser cookies or credentials.

### Supported automation

- Visible job text / structured job capture with an editable preview.
- Empty, labelled first name, last name, full name, email, phone, portfolio, LinkedIn, and GitHub fields.
- PDF attachment to recognised résumé/CV file inputs that accept PDFs.
- Framework-compatible input and change events.
- User-approved submission of a single, recognised standard HTML or Ashby application form.
- Ashby location suggestions require an explicit selection on the employer page and applicant review; the companion does not infer a selected location from typed text.
- Ashby résumé uploads must show their completed attachment before submission.
- The popup automatically matches a prepared role by its listing/application URL and explains remaining form blockers.
- Tools & backups reports the last authenticated companion connection and version; it does not claim the browser is still connected.
- Saved-profile and draft checks before submission; changes require fresh approval.
- Persistent submission-attempt markers to stop duplicate retries after uncertain results.
- Detection and recording of new confirmation messages; manual recording remains available.

Auto-apply runs only on the active HTTPS page you approve; it does not open a batch of roles or apply to search results automatically. The companion must be installed/reloaded and paired first. It preserves answers already on the form and does not invent answers from missing profile data.

The supported form must have a recognisable name/résumé and email field and one clear Submit application / Apply / Submit button. Custom required controls other than the reviewed Ashby location field, ambiguous or cross-origin forms, login, CAPTCHA, unknown required answers and submission agreements pause the run. Complete unsupported steps and submit manually where required. Compatibility varies by employer; a fixture passing is not a claim that every production site is supported.

If a submit click may have happened, the persistent attempt remains pending across browser restarts, application edits and backup restore. The extension checks the original tab for a confirmation for up to 30 minutes; **Check latest submission confirmation** can recheck it. Only use **I verified it was not sent** after checking the employer page and email. This clears the retry block; it does not retract an application.

## Persistence and recovery

- `data/jobpilot.sqlite`: SQLite database containing profiles, jobs, drafts, confirmation notes, activity, and the résumé PDF.
- `data/discovery-cache/`: replaceable public job-feed caches, excluded from exports and distribution ZIPs.
- `data/backups/`: snapshots at startup, before the first write each day, before restore/migration, and on request. The latest 14 snapshots are retained.
- **Download complete backup** exports your profile, résumé, drafts, jobs, and recent activity as JSON. Treat it as a personal file.
- Restore validates the archive before replacing data, uses a transaction, and saves a recovery snapshot first. Current activity is replaced with a restore event; prior events remain in the exported archive.
- Archived roles remain searchable and duplicate-protected. Canonical URLs remove common tracking parameters and keep job identity.
- Old browser data stays in localStorage and can be exported. Migration excludes the original four sample jobs. Old “submitted” markers on personal roles become unverified notes, not recorded submissions.
- There is no cloud account or cross-computer sync. Multiple browsers on this computer use the same local database.

## Validation

```sh
npm test
```

Tests cover discovery filters and source parsing, remote-region restrictions, deduplication, persistent caches, partial-source failure and expiry, saving discovered roles, evidence-based matching, invalid URLs/private network rejection, Greenhouse/Lever/JSON-LD parsing, duplicate detection, draft preservation, confirmation requirements, persistence, restore validation, migration, and local API access controls.

For the local DOM autofill and submission fixtures only, start a separate instance with `JOBPILOT_TEST_UI=1` and an isolated data directory; open `/tests/browser.html`, `/tests/ashby.html`, and `/tests/popup.html`. It tests contact fields, PDF attachment, preserving existing answers, leaving sensitive/unsupported answers alone, idempotence, and retaining manual-only autofill behaviour. The separate submission checks exercise a complete form, missing answers, scoped filling, changed pages, CAPTCHA, agreements, one submit click and confirmation detection. The fixture intercepts submission locally and never contacts an employer. Fixture routes are disabled normally.

A live Stripe posting was imported successfully during development. This verifies import, not application submission. No applications were sent during testing. Version 2.3.1 recognises Ashby’s submit button beside the field container, within the same unique application panel. Filling remains scoped to application fields; adjacent agreements and validation errors still block submission. The regression fixture mirrors Jiga’s live layout. All 31 service/runner tests, 23 Ashby browser checks and 24 standard-form browser checks passed for this fix. A read-only inspection of Jiga verified that the corrected boundary finds exactly one submit button. Production compatibility varies by employer; local fixture results do not guarantee support for every live application form. Reload version 2.3.1 in Chrome after updating the extension files.

## Implementation references

- [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Chrome service-worker events](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events)
- [Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Greenhouse public Job Board API](https://docs.greenhouse.io/job-board.html)
- [Remotive public API and attribution/caching requirements](https://github.com/remotive-com/remote-jobs-api)
- [Lever public Postings API](https://github.com/lever/postings-api)
- [Node SQLite](https://nodejs.org/api/sqlite.html)
