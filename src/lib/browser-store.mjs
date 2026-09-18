import { validateSourcePreferences } from './company-sources.mjs';
import { validateResumeDraft } from './resume-tailor.mjs';
import { AppError, canonicalUrl, newJob, prepareApplication, validateJob, validateProfile, validateEvidence, validateFollowUp, statuses, text, object } from './domain.mjs';

const randomUUID=()=>crypto.randomUUID();
export const fromBase64=value=>Uint8Array.from(atob(value),char=>char.charCodeAt(0));
export function toBase64(bytes){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
export function emptyWorkspace(){return {settings:{profile:validateProfile({}),token:Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join(''),migrated:true},jobs:[],events:[],resume:null,backups:[]};}
export function createStore(data){
 const getSetting=key=>data.settings[key]??null;
 const setSetting=(key,value)=>{data.settings[key]=value;};
 const event=(message,jobId=null)=>{data.events.unshift({id:randomUUID(),message,jobId,at:new Date().toISOString()});data.events=data.events.slice(0,500);};
 const jobs=()=>data.jobs;
 const getJob=id=>{const job=data.jobs.find(job=>job.id===id);if(!job)throw new AppError('This role was not found.',404);return job;};
 const saveJob=job=>{if(data.jobs.some(other=>other.id!==job.id&&canonicalUrl(other.url)===canonicalUrl(job.url)))throw new AppError('This listing is already in your queue.',409);job.updatedAt=new Date(Math.max(Date.now(),Date.parse(job.updatedAt||0)+1||0)).toISOString();const index=data.jobs.findIndex(other=>other.id===job.id);if(index<0)data.jobs.unshift(job);else data.jobs[index]=job;return job;};
 const resume=()=>data.resume;
 const snapshot=()=>({version:2,exportedAt:new Date().toISOString(),profile:getSetting('profile'),resumeDraft:getSetting('resumeDraft'),companySources:getSetting('companySources')||{custom:[],disabled:[]},jobs:structuredClone(data.jobs),events:structuredClone(data.events),resume:data.resume?{name:data.resume.name,base64:toBase64(data.resume.content)}:null});
 const backup=reason=>{const file=new Date().toISOString()+'-'+reason+'.json';data.backups.unshift({file,snapshot:structuredClone(snapshot())});data.backups=data.backups.slice(0,3);return file;};
 return {getSetting,setSetting,event,jobs,getJob,saveJob,resume,snapshot,backup,
    state() { const profile = getSetting('profile'); return { version: 2, profile, jobs: jobs().map(job => ({ ...job, analysis: prepareApplication(profile, job) })), events: data.events.slice(0,100), resume: resume() ? { name: resume().name, bytes: resume().content.length } : null, migrated: !!getSetting('migrated') }; },
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
    putResume(name, bytes, resumeText) { data.resume={name,content:bytes}; const profile = getSetting('profile'); if (resumeText !== undefined) { profile.resumeText = resumeText; if (!profile.email || /@example\./.test(profile.email)) profile.email = resumeText.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] || ''; if (!profile.phone) profile.phone = resumeText.match(/\+\d[\d ()-]{7,20}\d/)?.[0] || ''; this.saveProfile(profile); } event(`Stored résumé: ${name}`); },
    restore(input) {
      object(input); if (input.version !== 2 || !Array.isArray(input.jobs) || input.jobs.length > 5000) throw new AppError('Choose a JobPilot v2 backup.');
      const profile = validateProfile(input.profile); const seen = new Set();
      const companySources=input.companySources===undefined ? getSetting('companySources')||{custom:[],disabled:[]} : validateSourcePreferences(input.companySources);
      const resumeDraft=input.resumeDraft ? validateResumeDraft(input.resumeDraft) : null;
      const records = input.jobs.map(raw => { object(raw); const fields = validateJob(raw); validateFollowUp(fields.followUp); const canonical = canonicalUrl(fields.url); if (seen.has(canonical)) throw new AppError('The backup contains duplicate listings.'); seen.add(canonical); if (!statuses.includes(raw.status)) throw new AppError('The backup contains an invalid status.'); const evidence = raw.evidence ? validateEvidence(raw.evidence) : null; if (['submitted','interview','offer','rejected'].includes(raw.status) && !evidence) throw new AppError('A recorded application is missing its confirmation.'); const preparation = raw.preparation ? { ...prepareApplication(profile, fields), opening: text(raw.preparation.opening,10000,true), generatedAt: validDate(raw.preparation.generatedAt) } : null; return { ...newJob(fields), id: text(raw.id, 100, true), status: ['prepared','in_progress'].includes(raw.status) && !preparation ? 'saved' : raw.status, preparation, submissionAttempt: raw.submissionAttempt ? validateAttempt(raw.submissionAttempt) : null, createdAt: validDate(raw.createdAt), submittedAt: raw.submittedAt ? validDate(raw.submittedAt) : undefined, evidence: evidence ? { ...evidence, recordedAt: validDate(raw.evidence.recordedAt) } : null }; });
      let restoredResume = null;
      if (input.resume) { object(input.resume); const name = text(input.resume.name, 200, true); const encoded = text(input.resume.base64, 11_000_000, true); const bytes = fromBase64(encoded); if (bytes.length > 8_000_000 || new TextDecoder().decode(bytes.subarray(0,5)) !== '%PDF-') throw new AppError('The backup résumé must be a PDF under 8 MB.'); restoredResume = { name, bytes }; }
      backup('before-restore');
      data.jobs=[];data.events=[];data.resume=null;
      setSetting('profile',profile);setSetting('companySources',companySources);setSetting('resumeDraft',resumeDraft);
      for(const record of records)saveJob(record);
      if(restoredResume)data.resume={name:restoredResume.name,content:restoredResume.bytes};
      event(`Restored ${records.length} roles from backup`);
    },
    migrate(input) {
      if (getSetting('migrated')) return;
      object(input); if (!Array.isArray(input.jobs) || input.jobs.length > 5000) throw new AppError('Invalid older JobPilot data.');
      backup('before-migration'); let imported = 0;
      const profile = getSetting('profile');
      if (input.profile) { const legacy = validateProfile(input.profile); for (const key of ['name','email','phone','role','location','portfolio','github','linkedin','summary']) if (legacy[key] && !/@example\./i.test(legacy[key])) profile[key] = legacy[key]; this.saveProfile(profile); }
      for (const job of input.jobs) { if (/^job-[1-4]$/.test(job.id)) continue; try { this.add({ ...job, description: job.description || 'Imported from the earlier tracker. Paste the complete job description before preparing.', notes: `Migrated from the old tracker. Previous status: ${text(job.status,30)}; submission was not verified.`, followUp: '' }); imported++; } catch(error) { if (!(error instanceof AppError)) throw error; } }
      setSetting('migrated', true); event(`Migrated ${imported} personal roles. Demo listings were excluded.`);
    },
 };
}
function validDate(input) { const value = text(input, 40, true); if (Number.isNaN(Date.parse(value))) throw new AppError('Invalid date in backup.'); return new Date(value).toISOString(); }

function validateAttempt(input) { object(input); if (!['pending','not_sent'].includes(input.state)) throw new AppError('Invalid submission attempt in backup.'); return {id:text(input.id,100,true),state:input.state,startedAt:validDate(input.startedAt),...(input.resolvedAt?{resolvedAt:validDate(input.resolvedAt)}:{})}; }
