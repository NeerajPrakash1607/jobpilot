// A visit continues across refreshes and tabs until 30 minutes without a successful search.
export const VISIT_KEY = 'jobpilot.visit.v1';
export function readVisit(raw, now) {
  try {
    const value = JSON.parse(raw);
    if (Number.isSafeInteger(value.since) && value.since > 0 && value.since <= value.lastSeen && Number.isSafeInteger(value.lastSeen) && value.lastSeen <= now) {
      return {since: now - value.lastSeen < 30 * 60 * 1000 ? value.since : value.lastSeen, returning: true};
    }
  } catch { /* Missing or invalid browser storage starts a first visit. */ }
  return {since: now, returning: false};
}
export function visitResults(jobs, since, onlyNew = false) {
  const recent = since === null ? [] : jobs.filter(job => job.firstSeen > since);
  return {jobs: onlyNew ? recent : jobs, newCount: recent.length};
}
