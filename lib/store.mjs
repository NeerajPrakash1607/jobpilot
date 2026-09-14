import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { AppError, canonicalUrl, newJob, prepareApplication, validateJob, validateProfile, validateEvidence, validateFollowUp, statuses, text, object } from './domain.mjs';

export async function openStore(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(directory, 'jobpilot.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, canonical TEXT UNIQUE NOT NULL, document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS resume (id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL, content BLOB NOT NULL);`);
  const getSetting = key => { const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key); return row ? JSON.parse(row.value) : null; };
  const setSetting = (key, value) => db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(key, JSON.stringify(value));
  if (!getSetting('profile')) setSetting('profile', validateProfile({}));
  if (!getSetting('token')) setSetting('token', randomBytes(32).toString('hex'));
  const event = (message, jobId = null) => { const item = { id: randomUUID(), message, jobId, at: new Date().toISOString() }; db.prepare('INSERT INTO events VALUES(?,?,?)').run(item.id, item.at, JSON.stringify(item)); };
  const jobs = () => db.prepare('SELECT document FROM jobs ORDER BY rowid DESC').all().map(row => JSON.parse(row.document));
  const getJob = id => { const row = db.prepare('SELECT document FROM jobs WHERE id=?').get(id); if (!row) throw new AppError('This role was not found.', 404); return JSON.parse(row.document); };
  const saveJob = job => { job.updatedAt = new Date().toISOString(); try { db.prepare('INSERT INTO jobs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET canonical=excluded.canonical, document=excluded.document').run(job.id, canonicalUrl(job.url), JSON.stringify(job)); } catch(error) { if (String(error).includes('UNIQUE')) throw new AppError('This listing is already in your queue. Open the existing role instead.', 409); throw error; } return job; };
  const resume = () => db.prepare('SELECT name, content FROM resume WHERE id=1').get();
  const snapshot = () => ({ version: 2, exportedAt: new Date().toISOString(), profile: getSetting('profile'), jobs: jobs(), events: db.prepare('SELECT document FROM events ORDER BY created_at DESC LIMIT 500').all().map(row => JSON.parse(row.document)), resume: resume() ? { name: resume().name, base64: Buffer.from(resume().content).toString('base64') } : null });
  const backup = async reason => {
    const folder = path.join(directory, 'backups'); await mkdir(folder, { recursive: true, mode: 0o700 });
    const file = `${new Date().toISOString().replace(/[:.]/g, '-')}-${reason}.json`;
    await writeFile(path.join(folder, file), JSON.stringify(snapshot()), { mode: 0o600 });
    const old = (await readdir(folder)).filter(file => file.endsWith('.json')).sort().slice(0, -14);
    await Promise.all(old.map(file => unlink(path.join(folder, file))));
    return file;
  };
  return {
    db, getSetting, setSetting, event, jobs, getJob, saveJob, resume, snapshot, backup,
    state() { const profile = getSetting('profile'); return { version: 2, profile, jobs: jobs().map(job => ({ ...job, analysis: prepareApplication(profile, job) })), events: db.prepare('SELECT document FROM events ORDER BY created_at DESC LIMIT 100').all().map(row => JSON.parse(row.document)), resume: resume() ? { name: resume().name, bytes: resume().content.length } : null, migrated: !!getSetting('migrated') }; },
    add(input) { const fields = validateJob(input); const job = saveJob(newJob(fields)); event(`Added ${job.title} at ${job.company}`, job.id); return job; },
    update(id, input) { const job = getJob(id); const fields = validateJob({ ...job, ...object(input) }); validateFollowUp(fields.followUp); const contentChanged = ['title','company','url','description'].some(key => fields[key] !== job[key]); Object.assign(job, fields); if (contentChanged) { job.preparation = null; if (['prepared','in_progress'].includes(job.status)) job.status = 'saved'; } saveJob(job); event(`Updated ${job.company}`, id); return job; },
    prepare(id) { const job = getJob(id); if (['submitted','interview','offer','rejected','archived'].includes(job.status)) throw new AppError('This application is already recorded or archived.'); const preparation = prepareApplication(getSetting('profile'), job); if (!resume()) preparation.blockers.push('Upload your résumé PDF.'); if (preparation.blockers.length) throw new AppError(preparation.blockers.join(' '), 422); job.preparation = preparation; job.status = 'prepared'; saveJob(job); event(`Prepared an application draft for ${job.company}`, id); return job; },
    changeStatus(id, input) {
      object(input); const job = getJob(id); const status = text(input.status, 30, true);
      if (!statuses.includes(status) || status === 'prepared') throw new AppError('Choose a supported status.');
      if (job.status === status) return job;
      if (status === 'submitted') { job.evidence = validateEvidence(input.evidence); job.submittedAt = job.evidence.recordedAt; }
      if (['interview','offer','rejected'].includes(status) && !job.evidence) throw new AppError('Record the application confirmation before tracking its outcome.');
      if (status === 'in_progress' && !job.preparation) throw new AppError('Prepare this application first.');
      if (['saved','in_progress'].includes(status) && job.evidence) throw new AppError('A confirmed application cannot be reset for another submission. Archive it if needed.');
      job.status = status; saveJob(job); event(`${job.company}: ${status.replaceAll('_',' ')}`, id); return job;
    },
    submissionAttempt(id, input) {
      object(input); const job = getJob(id);
      if (input.action === 'start') {
        if (job.evidence || !['prepared','in_progress'].includes(job.status) || !job.preparation) throw new AppError('Prepare an unsubmitted application before auto-applying.',409);
        if (job.submissionAttempt?.state === 'pending') throw new AppError('A previous submission may have been sent. Check the employer page or confirmation email before attempting again.',409);
        if (input.expectedUpdatedAt !== job.updatedAt) throw new AppError('The saved application changed. Review it and start again.',409);
        job.submissionAttempt = {id:randomUUID(),state:'pending',startedAt:new Date().toISOString()};
        job.status='in_progress'; saveJob(job); event(`Started an approved submission attempt at ${job.company}`,id); return job.submissionAttempt;
      }
      if (input.action === 'not-sent') {
        if (job.evidence) throw new AppError('This application is already recorded.',409);
        if (!job.submissionAttempt || job.submissionAttempt.id !== input.attemptId) throw new AppError('This submission attempt was not found.',409);
        if (input.confirmedNotSent !== true) throw new AppError('Confirm the form was not submitted before allowing another attempt.');
        job.submissionAttempt.state='not_sent'; job.submissionAttempt.resolvedAt=new Date().toISOString();
        saveJob(job); event(`Confirmed that the previous attempt at ${job.company} was not sent`,id); return job;
      }
      throw new AppError('Unknown submission action.');
    },
    saveProfile(input) { const profile = validateProfile(input); setSetting('profile', profile); for (const job of jobs()) { if (['prepared','in_progress'].includes(job.status)) { job.status = 'saved'; job.preparation = null; saveJob(job); } } event('Updated profile; queued drafts will use the new details'); return profile; },
    putResume(name, bytes, resumeText) { db.prepare('INSERT OR REPLACE INTO resume VALUES(1,?,?)').run(name, bytes); const profile = getSetting('profile'); if (resumeText !== undefined) { profile.resumeText = resumeText; if (!profile.email || /@example\./.test(profile.email)) profile.email = resumeText.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] || ''; if (!profile.phone) profile.phone = resumeText.match(/\+\d[\d ()-]{7,20}\d/)?.[0] || ''; this.saveProfile(profile); } event(`Stored résumé: ${name}`); },
    async restore(input) {
      object(input); if (input.version !== 2 || !Array.isArray(input.jobs) || input.jobs.length > 5000) throw new AppError('Choose a JobPilot v2 backup.');
      const profile = validateProfile(input.profile); const seen = new Set();
      const records = input.jobs.map(raw => { object(raw); const fields = validateJob(raw); validateFollowUp(fields.followUp); const canonical = canonicalUrl(fields.url); if (seen.has(canonical)) throw new AppError('The backup contains duplicate listings.'); seen.add(canonical); if (!statuses.includes(raw.status)) throw new AppError('The backup contains an invalid status.'); const evidence = raw.evidence ? validateEvidence(raw.evidence) : null; if (['submitted','interview','offer','rejected'].includes(raw.status) && !evidence) throw new AppError('A recorded application is missing its confirmation.'); const preparation = raw.preparation ? { ...prepareApplication(profile, fields), opening: text(raw.preparation.opening,10000,true), generatedAt: validDate(raw.preparation.generatedAt) } : null; return { ...newJob(fields), id: text(raw.id, 100, true), status: ['prepared','in_progress'].includes(raw.status) && !preparation ? 'saved' : raw.status, preparation, submissionAttempt: raw.submissionAttempt ? validateAttempt(raw.submissionAttempt) : null, createdAt: validDate(raw.createdAt), submittedAt: raw.submittedAt ? validDate(raw.submittedAt) : undefined, evidence: evidence ? { ...evidence, recordedAt: validDate(raw.evidence.recordedAt) } : null }; });
      let restoredResume = null;
      if (input.resume) { object(input.resume); const name = text(input.resume.name, 200, true); const encoded = text(input.resume.base64, 11_000_000, true); const bytes = Buffer.from(encoded, 'base64'); if (bytes.length > 8_000_000 || bytes.subarray(0,5).toString() !== '%PDF-') throw new AppError('The backup résumé must be a PDF under 8 MB.'); restoredResume = { name, bytes }; }
      await backup('before-restore');
      db.exec('BEGIN');
      try { db.exec('DELETE FROM jobs; DELETE FROM events; DELETE FROM resume;'); setSetting('profile', profile); for (const record of records) saveJob(record); if (restoredResume) db.prepare('INSERT INTO resume VALUES(1,?,?)').run(restoredResume.name, restoredResume.bytes); event(`Restored ${records.length} roles from backup`); db.exec('COMMIT'); } catch(error) { db.exec('ROLLBACK'); throw error; }
    },
    async migrate(input) {
      if (getSetting('migrated')) return;
      object(input); if (!Array.isArray(input.jobs) || input.jobs.length > 5000) throw new AppError('Invalid older JobPilot data.');
      await backup('before-migration'); let imported = 0;
      const profile = getSetting('profile');
      if (input.profile) { const legacy = validateProfile(input.profile); for (const key of ['name','email','phone','role','location','portfolio','github','linkedin','summary']) if (legacy[key] && !/@example\./i.test(legacy[key])) profile[key] = legacy[key]; this.saveProfile(profile); }
      for (const job of input.jobs) { if (/^job-[1-4]$/.test(job.id)) continue; try { this.add({ ...job, description: job.description || 'Imported from the earlier tracker. Paste the complete job description before preparing.', notes: `Migrated from the old tracker. Previous status: ${text(job.status,30)}; submission was not verified.`, followUp: '' }); imported++; } catch(error) { if (!(error instanceof AppError)) throw error; } }
      setSetting('migrated', true); event(`Migrated ${imported} personal roles. Demo listings were excluded.`);
    },
    close() { db.close(); },
  };
}
function validDate(input) { const value = text(input, 40, true); if (Number.isNaN(Date.parse(value))) throw new AppError('Invalid date in backup.'); return new Date(value).toISOString(); }

function validateAttempt(input) { object(input); if (!['pending','not_sent'].includes(input.state)) throw new AppError('Invalid submission attempt in backup.'); return {id:text(input.id,100,true),state:input.state,startedAt:validDate(input.startedAt),...(input.resolvedAt?{resolvedAt:validDate(input.resolvedAt)}:{})}; }
