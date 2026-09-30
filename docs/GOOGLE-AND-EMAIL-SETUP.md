# Connect Google sign-in and daily alerts

The company-watch website works without these connections. Google sign-in and email subscriptions remain unavailable until configured. Do not tell users alerts are active until the launch checks below pass.

## 1. Create a Google OAuth web client

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview). Create or select a project named JobPilot.
2. Complete Branding with the JobPilot app name, your support email and developer contact email. Use the actual published homepage and privacy page.
3. Set the intended audience to External. During testing, add your own Google account as a test user. Do not treat Testing mode as a launch configuration for arbitrary public visitors.
4. Open Clients → Create client → Web application. Name it JobPilot Web.
5. Add this exact Authorized JavaScript origin, without a trailing slash or path:

   `https://jobpilot-neeraj.bhanuprakash0024.chatgpt.site`

6. For local testing, optionally add `http://localhost` and `http://localhost:5183`. Open the preview using localhost when testing that client configuration.
7. This integration uses a JavaScript credential callback. It does not require an Authorized redirect URI, and it does not use the platform's reserved `/callback` route.
8. Use only basic identity scopes: openid, email and profile. Do not request Gmail access for job seekers.
9. Copy the **Client ID** ending in `.apps.googleusercontent.com`. No Google client secret is needed for this sign-in flow.

Use the client ID as the hosted `GOOGLE_CLIENT_ID` setting through Sites. A public client ID is not a password; still check the exact origin and production access rules before enabling public signup.

Google may require domain ownership or branding verification for production. If the shared hosting domain cannot satisfy Google's requirements, record the exact rejection and resolve the supported hosting/authentication path before launch. Do not buy a domain, switch providers, substitute another login or bypass verification without the owner's decision. This integration has not been end-to-end verified until a real client is configured on the hosted origin.

Official reference: [Google Identity Services setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

## 2. Connect the private sender and scheduler

Use a dedicated Gmail account whose address you are comfortable showing as the sender. Job seekers do not grant this account access to their own inboxes.

1. Open [Google Apps Script](https://script.google.com/home) while signed in as the sender. Create a standalone project named JobPilot Runner.
2. Copy `ops/JobPilot.gs` into the script editor. Keep this project private. Do not deploy it as a public web app.
3. In Project Settings → Script Properties, add:
   - `JOBPILOT_URL`: `https://jobpilot-neeraj.bhanuprakash0024.chatgpt.site`
   - `JOBPILOT_RUNNER_SECRET`: the value from the private `.env.runner` file in this project (not the variable name).
4. The same secret must be configured as `WATCH_RUNNER_SECRET` in Sites. Never paste it into the website's public forms, a GitHub issue or committed source.
5. Run `testJobPilotSender` manually. Review and grant the requested permissions, then verify the test message in the sender's own inbox. This sends no email to job seekers.
6. Run `runJobPilot` manually. Inspect execution results and `jobPilotDiagnostics`. With `ALERTS_ENABLED=false` and no test email configured, the runner checks company sources but sends no subscriber digests.
7. Run `installJobPilotTrigger` once. It installs an hourly trigger. Company checks happen once per Dublin calendar day; interrupted work resumes on a later invocation. Digest identity limits sends to one per subscriber per Dublin day.
8. Verify a later trigger execution with the laptop closed. Trigger timing and delivery are approximate, not instantaneous.
9. Keep `ALERTS_ENABLED=false`. Set `ALERT_TEST_EMAIL` in Sites to your own verified Google email and deploy. Only that account can opt in and receive test digests while public subscriptions stay closed. Complete the opt-in, delivery and unsubscribe checks with your account. Never use somebody else's address for this test.
10. After those checks and a real offline cycle pass, remove `ALERT_TEST_EMAIL`, set `ALERTS_ENABLED=true` and deploy to open public subscriptions. Deploying is required to apply changed runtime settings.

The runner stops before the Apps Script execution time limit and leaves a ten-recipient daily quota reserve. Actual account quotas must be checked at setup. The 50-active-subscriber cap is enforced by JobPilot; it is not a promise of an email provider's capacity or inbox delivery.

Official references: [installable triggers](https://developers.google.com/apps-script/guides/triggers/installable), [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app), [current quotas](https://developers.google.com/apps-script/guides/services/quotas).

## 3. Operator checks before launch

- Sign in with a real Google account on the published site. Confirm wrong-origin and invalid credentials are rejected.
- Save a watchlist, sign out and sign back in; verify it remains available.
- Activate a consenting test account and confirm one real scheduled digest. Re-run the same cycle and confirm no duplicate.
- Open an unsubscribe link without confirming; subscription must remain active. Confirm unsubscribe and ensure queued mail is suppressed.
- Confirm source failures and partial coverage remain visible. Do not call an unsupported company monitored.
- Review provider quota, privacy/contact information and production OAuth readiness. Keep the pilot closed if an item is unresolved.

## Recovery and capacity

- Pause subscriber admission by setting `ALERTS_ENABLED=false` and deploying. The next runner request will stop claiming subscriber emails.
- Run `stopJobPilotTrigger` to stop future scheduled invocations.
- A source failure retains its previous snapshot. The next successful complete checks reconcile closures.
- An uncertain email outcome blocks its jobs from automatic repeat sending. The operator must verify the sender's outcome before changing that record. Never retry an uncertain send blindly.
- Waitlisted users are promoted only by an authenticated operator request to `/watch-api/runner/promote`; promotion respects the 50-active cap.
- Deleting an alert account removes its sessions, company requests and delivery records. It does not clear the separate browser-local résumé workspace.

## Runtime settings

| Key | Secret | Purpose |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | No | OAuth web client bound to the website origin |
| `WATCH_RUNNER_SECRET` | Yes | Private runner authentication and unsubscribe-link signing |
| `ALERTS_ENABLED` | No | Explicit launch gate; defaults to disabled |
| `ALERT_TEST_EMAIL` | Yes | Optional, consenting operator account for end-to-end testing while public subscriptions remain closed |

Do not rotate the runner secret casually: it also signs unsubscribe links. Coordinate a rotation with the sender and existing subscriptions.
