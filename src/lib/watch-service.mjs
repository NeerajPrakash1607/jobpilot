import {AppError} from './domain.mjs';
import {parseFeed} from './discovery.mjs';
import {getPublicPage} from './importer.mjs';
import {loadCompanyFeed} from './company-feeds.mjs';
import {irelandReason,digestSelection,dublinDay} from './watch-domain.mjs';
import {unsubscribeToken} from './watch-auth.mjs';
import {probeCompany,connectionError} from './company-connections.mjs';

export async function checkCompany(store,id,now,fetchPage=getPublicPage){
 const source=(await store.sources()).find(s=>s.id===id);if(!source||source.type==='website')throw new AppError('This company is not connected for automatic listings.',422);
 const token=crypto.randomUUID();
 if(!await store.claimSource(id,token,now,30*60*1000))return {id,status:'recent-or-running'};
 let snapshot;
 try{
  const fetchSource=(url,options={})=>fetchPage(url,0,16000000,{cacheTtl:1800,...options});
  const raw=source.type==='company'?await loadCompanyFeed(source,fetchSource):await fetchSource(source.url);
  const parsed=parseFeed(source,raw);
  snapshot={kind:'success',jobs:parsed.jobs.filter(irelandReason),complete:!parsed.partial&&parsed.skipped===0,skipped:parsed.skipped};
 }catch(error){snapshot={kind:'failed',error:connectionError(error)};}
 await store.saveSnapshot(source,token,snapshot,now);
 return {id,status:snapshot.kind==='failed'?'failed':snapshot.complete?'complete':'partial',count:snapshot.jobs?.length||0};
}
export async function connectCompany(store,accountId,input,now,fetchPage=getPublicPage){
 const sources=await store.sources(),result=await probeCompany(input,sources,fetchPage);
 if(result.status==='unsupported'){
  await store.requestCompany(accountId,result.source.name,result.source.home,now);
  return {status:'unsupported',message:'Connection requested. No completion date is promised. '+result.message};
 }
 const {source,feed}=result;
 if(!sources.some(s=>s.id===source.id))await store.addSource(accountId,source,now);
 const token=crypto.randomUUID();
 if(await store.claimSource(source.id,token,now,0))await store.saveSnapshot(source,token,{kind:'success',jobs:feed.jobs.filter(irelandReason),complete:!feed.partial&&!feed.skipped,skipped:feed.skipped},now);
 return {id:source.id,name:source.name,status:result.status,count:feed.jobs.filter(irelandReason).length,message:'Connected for daily background checks. Select this company and save your watchlist to include it in your alerts.'};
}
const dateLabel=value=>new Date(value).toLocaleDateString('en-IE',{timeZone:'Europe/Dublin',day:'numeric',month:'short',year:'numeric'});
function jobLines(job){
 return [`${job.title} — ${job.company}`,job.location,job.reasons.join(' · '),
  ...(job.experience.higherPreferred.length?['Higher experience preferred: '+job.experience.higherPreferred.join(' ')]:[]),
  `First found ${dateLabel(job.firstSeen)}`+(job.listingDate?` · Employer ${(job.dateLabel||'date').toLowerCase()}: ${dateLabel(job.listingDate)}`:''),job.url,''];
}
export async function nextDigest(store,origin,secret,now,testEmail=null){
 await store.expireClaims(now);
 const catalog=await store.catalog(now);
 const usable=new Set(catalog.filter(s=>['fresh','partial'].includes(s.health)).map(s=>s.id));
 const jobs=(await store.jobs()).filter(job=>usable.has(job.sourceId));
 for(const account of await store.activeAccounts()){
  if(testEmail&&account.email.toLowerCase()!==testEmail.toLowerCase())continue;
  const selected=digestSelection(jobs,account.preferences,await store.delivered(account.id),account.alertsSince);
  const outages=await store.pendingOutages(account.id,catalog.filter(s=>account.preferences.companies.includes(s.id)));
  // A coverage warning is independent of finding a matching vacancy.
  if(!selected.length&&!outages.length)continue;
  const emailJobs=selected.slice(0,20),known=emailJobs.filter(j=>j.group!=='sponsorship_unknown'),unknown=emailJobs.filter(j=>j.group==='sponsorship_unknown');
  const token=await unsubscribeToken(secret,account);
  const lines=[
   ...(emailJobs.length?['Newly found matches from your JobPilot watchlist.','First found means when JobPilot discovered the vacancy, not when the employer posted it.','']:[]),
   ...(known.length?['MATCHING ROLES','',...known.flatMap(jobLines)]:[]),
   ...(unknown.length?['SPONSORSHIP NOT STATED','These otherwise matching roles do not confirm sponsorship. Check with the employer.','',...unknown.flatMap(jobLines)]:[]),
   ...(selected.length>20?['More newly found matches are available on JobPilot. Remaining roles can appear in your next digest.','']:[]),
   ...(outages.length?['COMPANY CHECKS NEED ATTENTION','Two consecutive daily checks failed. These companies are excluded from job emails until checking recovers. Their last-known jobs remain on the website as not recently verified.','',...outages.flatMap(s=>[s.name,`Last successful check: ${s.lastSuccess?dateLabel(s.lastSuccess):'None yet'}`,`Check vacancies directly: ${s.url}`,'']),'This is one notice for this outage; it will not repeat each day.','']:[]),
   `Browse and manage alerts: ${origin}/#watch`,`Unsubscribe: ${origin}/unsubscribe?token=${token}`,
  ];
  const payload={jobIds:emailJobs.map(j=>j.id),outages:outages.map(s=>({id:s.id,outageStarted:s.outageStarted})),to:account.email,subject:emailJobs.length?`JobPilot · ${emailJobs.length} newly found ${emailJobs.length===1?'role':'roles'}`:'JobPilot · Company checks need attention',body:lines.join('\n')};
  const id=await store.claimDelivery(account.id,dublinDay(now),payload,now);
  if(id)return {id,to:payload.to,subject:payload.subject,body:payload.body};
 }
 return null;
}
