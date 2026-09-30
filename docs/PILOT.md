# JobPilot: two-week pilot

Status: the product rules below are implemented. The user trial has not started. Automated checks use isolated accounts and employer fixtures; they do not demonstrate real-world matching quality or inbox delivery.

## Who and what

Neeraj and five friends looking for work in Ireland. Focus first on IT support, technical support and help-desk roles requiring 0–2 years. Other roles remain browsable. Use the **Early-career IT support** shortcut to start the focused search; there are no preselected employers.

Keep Amazon, Mastercard, An Post, Novartis and Yahoo, plus the other current employers. A working connector does not guarantee any suitable vacancies. Summary-only or ambiguous descriptions cannot establish early-career eligibility.

## Rules to verify

| Situation | Website | Email |
| --- | --- | --- |
| 1 year required, 3–5 preferred | Include and disclose the higher preference | Include when newly found and otherwise eligible |
| More than 2 years required | Exclude from early-career results | Exclude from early-career alerts |
| Experience unclear or description incomplete | Separate “Possible match — experience unclear” group | Exclude from early-career alerts |
| Sponsorship needed, employer says no | Exclude | Exclude |
| Sponsorship needed, employer does not say | Separate “Sponsorship not stated” group | Separate section, if experience is otherwise eligible |
| Internship or apprenticeship | Include only with its separate opt-in | Follow the same opt-in |
| Required skills absent from résumé text | Explain missing mentions; keep the job | No résumé analysis or résumé-based filtering |
| First imported company listings | Browse existing vacancies | No initial backlog email |
| Vacancy first found after alert activation/search change | Show first-found and employer dates separately | Include once; relevance first, then recency |
| No new matches | Keep browsing available | Skip job email |
| Company check fails | Retain last-known vacancies as “Not recently verified,” with last successful check and careers link | Exclude its jobs while unhealthy |
| Two consecutive daily checks fail | Keep the visible coverage warning | One warning per outage, even without matching jobs; recovery resets the outage |
| Unsupported careers link | “Connection requested,” direct link, no completion deadline | No jobs or alerts until connected |

Verified new connections join the public catalogue. Requester identity, watchlists and subscription settings stay private. Adding a company does not silently change a saved alert subscription. Résumé comparisons happen only in the browser. A missing skill mention is not a claim that the applicant lacks that skill.

## Before inviting friends

- Browse a focused search on phone and desktop; open several employer pages and compare the requirements manually.
- Verify Google sign-in, save an explicit alert search, and confirm the existing Apps Script trigger is still running while the laptop is closed.
- Check the background-check time and the Apps Script execution history. A quiet inbox alone is not proof that the checker ran.
- Confirm a newly discovered eligible vacancy reaches the operator's opted-in account and unsubscribe stops later sends. Do not manufacture a real job or send to unconsenting recipients just to test delivery.
- Explain incomplete coverage and summary-only listings to testers. There is no “every company” promise.

## Trial schedule

Start Day 1 when the five friends have opted in. Record that date; do not count development time as trial time.

1. Day 1: each person chooses their own employers, roles, location, sponsorship preference and training opt-ins. Confirm the saved search and consent.
2. End of week 1: have a short conversation with each friend. Ask what they found, what they ignored, and where the labels or filters confused them.
3. End of week 2: repeat the conversation and ask whether they want the alerts to continue.

Use a private note per participant: a pseudonym, whether they found a worthwhile role to apply for, whether they want alerts to continue, and one reason/example. Do not put friends' emails, résumés or feedback in the public repository.

Success: at least **3 of the 5 friends** find a worthwhile application opportunity and want to keep the alerts. Record actual answers; account creation, email counts and page visits are not substitutes. Neeraj's own use is useful feedback but is not part of that five-person threshold.

## Operator routine

Reserve two 30-minute maintenance sessions each week. Review failed checks and delivery errors, compare a small sample of employer listings against the website, prioritise company requests, and note recurring relevance mistakes. This document does not schedule reminders or contact anyone.

If matching fails the trial, first fix the repeated mistake or narrow coverage. Add more employers when there is evidence that missing employers are the main reason useful roles are being missed.

## Practical limits

Experience and sponsorship extraction uses conservative text rules, not a guarantee about eligibility. Ambiguous or summary-only information stays explicitly uncertain. Feed limits, changing employer pages, source failures and the sender's quotas can reduce coverage. “First found” is the time JobPilot discovered a role, not its publication date. A source is removed from job emails as soon as it is unhealthy; the standalone warning waits for two failed daily checks. The service reserves at most one email per account per Dublin calendar day and at most 20 roles per email; remaining unsent roles can appear in a later digest.

Alerts use the existing private Apps Script runner and the website's stored preferences. No new script installation is required for these rules. Keep real sender checks and trial outcomes distinct from automated tests.
