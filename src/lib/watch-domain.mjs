import {matchesRole,roleRelevance,experienceEvidence,sponsorshipEvidence,trainingRole} from './job-matching.mjs';
import {AppError,object,text,canonicalUrl} from './domain.mjs';
import {SOURCES} from './discovery.mjs';

// These public employer feeds were checked for Ireland coverage before inclusion.
const additionalBoards=[['gitlab','GitLab'],['fivetran','Fivetran'],['workato','Workato'],['elastic','Elastic'],['databricks','Databricks'],['klaviyo','Klaviyo'],['dropbox','Dropbox'],['okta','Okta']];
export const WATCH_SOURCES=[...SOURCES.filter(source=>source.type!=='remotive'),...additionalBoards.map(([id,name])=>({id,name,type:'greenhouse',url:`https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=true`,home:`https://job-boards.greenhouse.io/${id}`,ttl:1800000}))];
export const EMPTY_PREFERENCES={companies:[],roles:'',city:'',level:'any',arrangement:'any',sponsorship:'any',includeInternships:false,includeApprenticeships:false};
export const PILOT_CAPACITY=50;
export function readWatchPreferences(input){
 object(input);
 if(!Array.isArray(input.companies)||input.companies.length>50)throw new AppError('Choose up to 50 companies.');
 const companies=[...new Set(input.companies.map(id=>text(id,120,true)))];
 const level=input.level||'any',arrangement=input.arrangement||'any';
 if(!['any','entry','mid','senior'].includes(level)||!['any','remote','hybrid','onsite'].includes(arrangement))throw new AppError('Choose a listed experience level and working arrangement.');
 const sponsorship=input.sponsorship||'any';
 if(!['any','needed'].includes(sponsorship))throw new AppError('Choose a listed sponsorship preference.');
 for(const key of ['includeInternships','includeApprenticeships'])if(input[key]!==undefined&&typeof input[key]!=='boolean')throw new AppError('Training options must be true or false.');
 return {companies,roles:text(input.roles,160),city:text(input.city,120),level,arrangement,sponsorship,includeInternships:input.includeInternships===true,includeApprenticeships:input.includeApprenticeships===true};
}
export function parseWatchPreferences(input,sources=WATCH_SOURCES){
 const preferences=readWatchPreferences(input),known=new Set(sources.map(s=>s.id));
 if(preferences.companies.some(id=>!known.has(id)))throw new AppError('One of these companies is no longer in the directory.');
 return preferences;
}
export function workingArrangement(job){
 const place=job.location.toLowerCase();
 if(/\bhybrid\b/.test(place))return 'hybrid';
 if(/\bremote\b/.test(place)||job.remote)return 'remote';
 if(/\bon[ -]?site\b|\bin[ -]office\b/.test(place))return 'onsite';
 return 'unknown';
}
export function experienceLevel(job){
 if(/\b(senior|sr\.?|staff|principal|lead|manager|director|head|vp|architect)\b/i.test(job.title))return 'senior';
 if(/\b(junior|jr\.?|graduate|intern|entry[ -]level|apprentice)\b/i.test(job.title))return 'entry';
 if(/\b(mid[ -]level|intermediate|engineer ii|developer ii)\b/i.test(job.title))return 'mid';
 return 'unknown';
}
export function irelandReason(job){
 const place=job.location.toLowerCase();
 if(/\b(except|excluding|not in)\b.*\b(ireland|eu|europe)\b/.test(place))return null;
 if(/\bdublin\b/.test(place)&&/\b(california|ohio|usa|united states|ca|oh)\b/.test(place)&&!/\bireland\b/.test(place))return null;
 if(/\b(northern ireland|belfast)\b/.test(place)&&!/republic of ireland/.test(place))return null;
 if(/\b(ireland|dublin|cork|galway|limerick|waterford|kilkenny|athlone|donegal|sligo|wexford|wicklow|kerry|kildare|meath|clare|tipperary|laois|offaly|westmeath|carlow|louth|mayo|roscommon|leitrim|cavan|monaghan|longford)\b/.test(place))return 'Listed in Ireland';
 if(workingArrangement(job)!=='remote')return null;
 if(/\b(worldwide|anywhere|global)\b/.test(place))return 'Remote · advertised worldwide';
 if(/\b(europe|eu|eea|emea)\b/.test(place)&&!/(only|residen|based in|must be in)/.test(place))return 'Remote · advertised for Europe';
 return null;
}
export function matchWatchJob(job,prefs){
 if(prefs.companies.length&&!prefs.companies.includes(job.sourceId))return null;
 const geography=irelandReason(job);if(!geography)return null;
 if(prefs.roles&&!matchesRole(job,prefs.roles))return null;
 if(prefs.city&&!job.location.toLowerCase().includes(prefs.city.toLowerCase()))return null;
 const arrangement=workingArrangement(job),level=experienceLevel(job),experience=experienceEvidence(job),sponsorship=sponsorshipEvidence(job),training=trainingRole(job);
 if(prefs.arrangement!=='any'&&arrangement!==prefs.arrangement)return null;
 if(training==='internship'&&!prefs.includeInternships||training==='apprenticeship'&&!prefs.includeApprenticeships)return null;
 if(prefs.level==='entry'&&experience.kind==='above')return null;
 if(!['any','entry'].includes(prefs.level)&&level!==prefs.level)return null;
 if(prefs.sponsorship==='needed'&&sponsorship.kind==='not_offered')return null;
 const group=prefs.level==='entry'&&experience.kind==='unclear'?'experience_unclear':prefs.sponsorship==='needed'&&sponsorship.kind==='unknown'?'sponsorship_unknown':'matches';
 return {...job,arrangement,level,experience,sponsorship,training,group,relevance:roleRelevance(job,prefs.roles),reasons:[geography,...(prefs.roles?['Role matches your search']:[]),...(prefs.level==='entry'?[experience.label]:[])]};
}
export function matchWatchJobs(jobs,prefs){
 const seen=new Set();return jobs.flatMap(job=>{
  const match=matchWatchJob(job,prefs),key=canonicalUrl(job.url);if(!match||seen.has(key))return [];
  seen.add(key);return [match];
 }).sort((a,b)=>b.relevance-a.relevance||b.firstSeen-a.firstSeen||a.company.localeCompare(b.company));
}

export function nextVacancyState(previous,snapshot,now){
 if(snapshot.kind==='failed')return previous;
 const seen=new Set(snapshot.jobs.map(job=>job.id));
 const old=new Map(previous.map(job=>[job.id,job]));
 const present=snapshot.jobs.map(job=>({...job,firstSeen:old.get(job.id)?.firstSeen||now,alertEligible:old.get(job.id)?.alertEligible??!snapshot.baseline,lastSeen:now,misses:0,open:true}));
 const absent=previous.filter(job=>!seen.has(job.id)).map(job=>snapshot.complete?{...job,misses:job.misses+1,open:job.open&&job.misses+1<2}:job);
 return [...present,...absent];
}
export function digestSelection(jobs,prefs,alreadySent,since=0){
 if(!prefs.companies.length)return [];
 return matchWatchJobs(jobs,prefs).filter(job=>job.open&&job.group!=='experience_unclear'&&job.alertEligible!==false&&job.firstSeen>since&&!alreadySent.has(job.id));
}
export function dublinDay(now){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
export function sourceHealth(source,record,now){
 if(source.type==='website')return 'unsupported';
 if(!record?.last_success)return record?.status==='failed'?'unavailable':'unchecked';
 if(record.status==='failed'||now-record.last_success>48*60*60*1000)return 'stale';
 return record.partial?'partial':'fresh';
}
