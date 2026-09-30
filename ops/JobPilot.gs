/** Private, owner-run Google Apps Script. Do not deploy this as a public web app.
 * Script Properties: JOBPILOT_URL, JOBPILOT_RUNNER_SECRET.
 * The runner secret is provisioned separately in Sites, never checked into Git.
 */
function jobPilotRequest(path, body) {
  var props = PropertiesService.getScriptProperties();
  var base = props.getProperty('JOBPILOT_URL');
  var secret = props.getProperty('JOBPILOT_RUNNER_SECRET');
  if (!base || !/^https:\/\/[^/?#]+$/.test(base) || !secret) {
    throw new Error('Set JOBPILOT_URL (HTTPS origin, no trailing slash) and JOBPILOT_RUNNER_SECRET in Script Properties.');
  }
  var response = UrlFetchApp.fetch(base + '/watch-api/runner/' + path, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + secret },
    payload: JSON.stringify(body || {}), muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) throw new Error('JobPilot runner request failed: ' + path + ' (' + response.getResponseCode() + ').');
  return JSON.parse(response.getContentText());
}

function runJobPilot() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var started = Date.now();
    var props = PropertiesService.getScriptProperties();
    var day = Utilities.formatDate(new Date(), 'Europe/Dublin', 'yyyy-MM-dd');
    if (props.getProperty('CHECK_DAY') !== day) {
      props.setProperties({ CHECK_DAY: day, NEXT_SOURCE: '0', CHECKS_DONE: 'no' });
    }
    if (props.getProperty('CHECKS_DONE') !== 'yes') {
      var companies = jobPilotRequest('catalog').companies;
      var index = Number(props.getProperty('NEXT_SOURCE') || 0);
      while (index < companies.length && Date.now() - started < 210000) {
        jobPilotRequest('check', { company: companies[index].id });
        index++;
        props.setProperty('NEXT_SOURCE', String(index));
      }
      if (index < companies.length) return; // The next hourly run resumes safely.
      jobPilotRequest('complete');
      props.setProperty('CHECKS_DONE', 'yes');
    }
    var sent = 0;
    while (Date.now() - started < 280000 && sent < 50 && MailApp.getRemainingDailyQuota() > 10) {
      var delivery = jobPilotRequest('next').delivery;
      if (!delivery) break;
      if (!jobPilotRequest('authorize', { id: delivery.id }).authorized) continue;
      try {
        MailApp.sendEmail({ to: delivery.to, subject: delivery.subject, body: delivery.body, name: 'JobPilot' });
      } catch (error) {
        // A timeout may have happened after acceptance. Never guess and resend.
        jobPilotRequest('ack', { id: delivery.id, state: 'uncertain' });
        throw new Error('An email outcome is uncertain. Review JobPilot delivery diagnostics before retrying it.');
      }
      jobPilotRequest('ack', { id: delivery.id, state: 'accepted' });
      sent++;
    }
  } finally {
    lock.releaseLock();
  }
}

function installJobPilotTrigger() {
  // Preserve unrelated triggers; re-running replaces only this job's trigger.
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'runJobPilot') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('runJobPilot').timeBased().everyHours(1).create();
}

function stopJobPilotTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'runJobPilot') ScriptApp.deleteTrigger(trigger);
  });
}

function testJobPilotSender() {
  // The operator runs this manually and receives the test in their own inbox.
  var owner = Session.getEffectiveUser().getEmail();
  if (!owner) throw new Error('Could not identify the script owner.');
  MailApp.sendEmail({ to: owner, subject: 'JobPilot sender check', body: 'Your private JobPilot email sender is connected. This is a test sent only to the script owner.', name: 'JobPilot' });
}

function jobPilotDiagnostics() {
  // Counts and company health only; no recipients, tokens or résumé data.
  console.log(JSON.stringify(jobPilotRequest('status')));
}
