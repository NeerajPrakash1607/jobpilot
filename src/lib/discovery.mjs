import {matchesRole} from './job-matching.mjs';
export {matchesRole} from './job-matching.mjs';


import { AppError, object, text, validateJob, canonicalUrl, stripHtml, skillsIn } from './domain.mjs';
import { getPublicPage, importJob } from './importer.mjs';
import { REQUESTED_COMPANIES } from './company-sources.mjs';
import { loadCompanyFeed } from './company-feeds.mjs';

const MINUTE = 60_000;
export const SOURCES = [
  ...REQUESTED_COMPANIES,
  ...[['stripe','Stripe'],['intercom','Intercom'],['datadog','Datadog'],['squarespace','Squarespace'],['mongodb','MongoDB'],['toast','Toast'],['reddit','Reddit']].map(([id,name]) => ({
    id, name, type:'greenhouse', url:`https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=true`,
    home:`https://job-boards.greenhouse.io/${id}`, ttl:30*MINUTE,
  })),
  { id:'remotive', name:'Remotive', type:'remotive', url:'https://remotive.com/api/remote-jobs', home:'https://remotive.com', ttl:360*MINUTE },
];

export function validateSearch(input) {
  object(input);
  for (const key of ['includeRemote','hideSenior']) if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new AppError('Search options must be true or false.');
  const query = text(input.query,160,true);
  if (!/[\p{L}\p{N}]/u.test(query)) throw new AppError('Enter a job title or skill to search for.');
  return { query, location:text(input.location,120), includeRemote:input.includeRemote ?? true, hideSenior:input.hideSenior ?? true };
}
export function defaultSearch(profile) {
  const role = profile.role || '';
  const interests = [/front.?end|react/i.test(role) && 'frontend', /support/i.test(role) && 'support'].filter(Boolean);
  return { query:interests.join(', ') || role.slice(0,160) || 'support, frontend', location:(profile.location || 'Dublin, Ireland').slice(0,120), includeRemote:true, hideSenior:true };
}
const normalize = value => value.toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/front[ -]?end/g,'frontend').replace(/back[ -]?end/g,'backend').replace(/full[ -]?stack/g,'fullstack').replace(/[^\p{L}\p{N}+#.]+/gu,' ').trim();
const hasPhrase = (haystack,needle) => ` ${haystack} `.includes(` ${needle} `);
const senior = /\b(?:senior|sr\.?|staff|principal|lead|manager|director|head|vp|architect)\b/i;

// Location labels are evidence, not a work-authorisation check. Unknown remote ranges are excluded.
export function locationMatch(job, search) {
  const requested = normalize(search.location);
  if (!requested) return 'Location not filtered';
  const location = normalize(job.location);
  const parts = requested.split(' ').filter(Boolean);
  const ireland = /\b(?:ireland|irish|dublin|cork|galway|limerick|waterford)\b/.test(requested);
  const country = ireland ? 'ireland' : /\b(?:uk|united kingdom|london|manchester|edinburgh)\b/.test(requested) ? 'united kingdom' : null;
  const city = parts.find(part => !['ireland','irish','county','co','ie'].includes(part));
  const remote = job.remote || /\bremote\b/.test(location);
  // Dublin also exists in the US; don't mix it into an Irish search.
  const otherDublin = ireland && /\bdublin\b/.test(location) && /\b(?:ca|california|ohio|oh|usa|united states)\b/.test(location) && !/\bireland\b/.test(location);
  let local = ireland ? !otherDublin && (city ? hasPhrase(location,city) : /\b(?:ireland|dublin|cork|galway|limerick|waterford)\b/.test(location)) : hasPhrase(location,requested);
  if (!remote && local) return 'Listed in your location';
  if (!search.includeRemote || !remote) return null;
  const excluded = country && new RegExp(`\\b(?:excluding|except|not in) (?:the )?${country}\\b`).test(location);
  if (excluded || otherDublin) return null;
  if (local || (country && hasPhrase(location,country)) || (country === 'united kingdom' && /\buk\b/.test(location))) return 'Remote · location listed';
  if (/\b(?:worldwide|anywhere|global)\b/.test(location)) return 'Remote · advertised worldwide';
  if (ireland && /\b(?:europe|eu|eea|emea)\b/.test(location)) return 'Remote · advertised for Europe';
  return null;
}

function plain(value) { return stripHtml(stripHtml(typeof value === 'string' ? value : '')); }
export function parseFeed(source, body) {
  let parsed;
  try { parsed = JSON.parse(body); } catch { throw new AppError(`${source.name} returned an unreadable feed.`,502); }
  if (!Array.isArray(parsed?.jobs)) throw new AppError(`${source.name} did not return a jobs list.`,502);
  const jobs = []; let skipped = 0;
  for (const raw of parsed.jobs) {
    try {
      object(raw);
      if (source.type === 'greenhouse' && raw.internal_job_id === null) continue; // General talent pools aren't vacancies.
      const fields = source.type === 'greenhouse' ? {
        title:plain(raw.title), company:source.name, location:plain(raw.location?.name), url:raw.absolute_url,
        salary:'', description:plain(raw.content),
      } : source.type === 'company' ? {
        title:plain(raw.title),company:source.name,location:plain(raw.location),url:raw.url,
        salary:plain(raw.salary),description:plain(raw.description),
      } : {
        title:plain(raw.title), company:plain(raw.company_name), location:plain(raw.candidate_required_location) || 'Remote · location unspecified', url:raw.url,
        salary:plain(raw.salary), description:plain(raw.description),
      };
      const job = validateJob(fields);
      const providerId = String(raw.id);
      if (!(source.type === 'company' ? /^[\w-]{1,100}$/ : /^\d+$/).test(providerId)) throw new AppError('Invalid provider job ID.');
      const updated = source.type === 'greenhouse' ? raw.updated_at : source.type === 'company' ? raw.listingDate : raw.publication_date;
      jobs.push({ ...job, id:`${source.id}-${providerId}`, providerId, sourceId:source.id, source:source.name,
        sourceType:source.type, remote:source.type === 'remotive' || /\bremote\b/i.test(job.location),
        listingDate:typeof updated === 'string' && !Number.isNaN(Date.parse(updated)) ? new Date(updated).toISOString() : null,
        dateLabel:source.type === 'greenhouse' ? 'Updated' : 'Published',summaryOnly:raw.summaryOnly===true,
      });
    } catch { skipped++; }
  }
  if (parsed.jobs.length && !jobs.length && skipped === parsed.jobs.length) throw new AppError(`${source.name}'s listings could not be read.`,502);
  return { jobs, skipped, partial:parsed.partial===true, total:Number.isFinite(parsed.total)?parsed.total:jobs.length };
}

export function rankJobs(jobs, search, profile, savedJobs) {
  const ownSkills = new Set(skillsIn(`${profile.resumeText || ''} ${profile.skills || ''}`));
  const saved = new Map(savedJobs.map(job => [canonicalUrl(job.url),job.id]));
  const seen = new Set(); const results = [];
  for (const job of jobs) {
    if (search.hideSenior && senior.test(job.title)) continue;
    if (!matchesRole(job,search.query)) continue;
    const locationReason = locationMatch(job,search); if (!locationReason) continue;
    const key = canonicalUrl(job.url); if (seen.has(key)) continue; seen.add(key);
    const mentioned = skillsIn(job.description); const matched = mentioned.filter(skill => ownSkills.has(skill));
    const missing = mentioned.filter(skill => !ownSkills.has(skill));
    results.push({ ...job, matched, missing, locationReason, savedId:saved.get(key) || null });
  }
  return results.sort((a,b) => b.matched.length-a.matched.length || (Date.parse(b.listingDate)||0)-(Date.parse(a.listingDate)||0));
}

export function createDiscovery({ directory, sources=SOURCES, getSources=()=>sources, fetchPage=(url,options)=>getPublicPage(url,0,16_000_000,options), now=Date.now }={}) {
  const memory = new Map(); const pending = new Map();
  function remember(id,cache){memory.delete(id);memory.set(id,cache);while(memory.size>2)memory.delete(memory.keys().next().value);}
  async function readSource(source) {
    if(source.type==='website')return {jobs:[],status:'external',skipped:0,fetchedAt:0};
    if (pending.has(source.id)) return pending.get(source.id);
    const operation = (async () => {
      let cache = memory.get(source.id);
      if (cache && now()-cache.fetchedAt < source.ttl) { remember(source.id,cache); return { ...cache, status:'cached' }; }
      if (cache?.retryAt > now()) return { ...cache, status:cache.jobs.length ? 'stale' : 'unavailable' };
      try {
        const cachedFetch=(url,options={})=>fetchPage(url,{cacheTtl:source.ttl/1000,...options});
        const body = source.type==='company' ? await loadCompanyFeed(source,cachedFetch) : await cachedFetch(source.url); const parsed = parseFeed(source,body);
        cache = { ...parsed, fetchedAt:now() };
        remember(source.id,cache);
        return { ...cache, status:'live' };
      } catch {
        const usable = cache && now()-cache.fetchedAt < 24*60*MINUTE;
        cache = { ...(usable?cache:{}), jobs:usable ? cache.jobs : [], skipped:usable ? cache.skipped : 0, fetchedAt:usable ? cache.fetchedAt : 0, retryAt:now()+5*MINUTE };
        remember(source.id,cache);
        return { ...cache, status:usable ? 'stale' : 'unavailable' };
      }
    })();
    pending.set(source.id,operation);
    try { return await operation; } finally { pending.delete(source.id); }
  }
  return {
    async search(search,profile,savedJobs) {
      const sources=getSources().filter(source=>source.enabled!==false);
      const summaries=[];let scanned=0,total=0,results=[];const seen=new Set();
      // Release complete feeds between small batches; retain only the result window.
      for(let i=0;i<sources.length;i+=2){
        const batch=sources.slice(i,i+2),feeds=await Promise.all(batch.map(readSource));
        for(let j=0;j<batch.length;j++){
          const source=batch[j],feed=feeds[j];scanned+=feed.jobs.length;
          const matches=rankJobs(feed.jobs,search,profile,savedJobs).filter(job=>{const key=canonicalUrl(job.url);if(seen.has(key))return false;seen.add(key);return true;});
          total+=matches.length;results=rankJobs([...results,...matches],search,profile,savedJobs).slice(0,500);
          summaries.push({id:source.id,name:source.name,url:source.home,status:feed.status,count:feed.jobs.length,skipped:feed.skipped,partial:feed.partial,total:feed.total,
            checkedAt:feed.fetchedAt?new Date(feed.fetchedAt).toISOString():null,
            note:source.type==='website'?source.note||'Open this careers page in your browser; automatic listings are not connected.':source.type==='remotive'?'Public feed is delayed by 24 hours; cached for up to 6 hours.':`${source.scope?source.scope+'. ':''}Employer listings; cached for up to 30 minutes.${feed.partial?' Partial coverage: more listings are available on the careers site.':''}`});
        }
      }
      return {search,searchedAt:new Date(now()).toISOString(),scanned,total,jobs:results,sources:summaries};
    },
    async resolve(id) {
      text(id,250,true);
      const source = getSources().filter(source=>source.enabled!==false).sort((a,b)=>b.id.length-a.id.length).find(source=>id.startsWith(`${source.id}-`));
      if (!source) throw new AppError('Search again to load this job.',404);
      const feed = await readSource(source); const job = feed.jobs.find(job=>job.id===id);
      if (!job) throw new AppError('This role is no longer in the available results. Search again.',404);
      let fields = job;
      if (source.type === 'greenhouse') {
        // Recheck the specific vacancy when saving so a closed cached role isn't added silently.
        let fresh;
        try { fresh = JSON.parse(await fetchPage(`https://boards-api.greenhouse.io/v1/boards/${source.board||source.id}/jobs/${job.providerId}`)); }
        catch { throw new AppError('This posting could not be verified. It may have closed or the employer may be temporarily unavailable. Try searching again shortly.',422); }
        fields = validateJob({title:plain(fresh.title),company:source.name,location:plain(fresh.location?.name),url:fresh.absolute_url,description:plain(fresh.content)});
      } else if(job.summaryOnly) {
        try { const detail=await importJob(job.url,fetchPage); fields=validateJob({...job,...detail,company:source.name,url:job.url}); }
        catch { throw new AppError('Only a listing summary is available. Open the listing and use the companion’s Import this job option, or add its full description in Applications.',422); }
      }
      return validateJob({ ...fields, notes:`Found through ${source.name} on ${new Date(now()).toISOString().slice(0,10)}.\n${job.url}` });
    },
  };
}
