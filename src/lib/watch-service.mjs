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
  return {status:'unsupported',message:'Link saved. '+result.message};
 }
 const {source,feed}=result;
 if(!sources.some(s=>s.id===source.id))await store.addSource(accountId,source,now);
 const token=crypto.randomUUID();
 if(await store.claimSource(source.id,token,now,0))await store.saveSnapshot(source,token,{kind:'success',jobs:feed.jobs.filter(irelandReason),complete:!feed.partial&&!feed.skipped,skipped:feed.skipped},now);
 return {id:source.id,name:source.name,status:result.status,count:feed.jobs.filter(irelandReason).length,message:'Connected for daily background checks. Select this company and save your watchlist to include it in your alerts.'};
}
export async function nextDigest(store,origin,secret,now,testEmail=null){
 await store.expireClaims(now);
 const catalog=await store.catalog(now);
 const usable=new Set(catalog.filter(s=>['fresh','partial'].includes(s.health)).map(s=>s.id));
 const jobs=(await store.jobs()).filter(job=>usable.has(job.sourceId));
 for(const account of await store.activeAccounts()){
  if(testEmail&&account.email.toLowerCase()!==testEmail.toLowerCase())continue;
  const selected=digestSelection(jobs,account.preferences,await store.delivered(account.id));
  if(!selected.length)continue;
  const emailJobs=selected.slice(0,20);
  const token=await unsubscribeToken(secret,account);
  const stale=catalog.filter(s=>account.preferences.companies.includes(s.id)&&!usable.has(s.id)).map(s=>s.name);
  const lines=['Here are matching roles from your JobPilot watchlist.','Existing roles may be included when you first subscribe or change your preferences.','',...emailJobs.flatMap(job=>[`${job.title} — ${job.company}`,job.location,job.reasons.join(' · '),job.url,'']),...(selected.length>20?[`More matching roles are available on JobPilot. Remaining roles can appear in your next digest.`,'']:[]),...(stale.length?[`Coverage notice: ${stale.join(', ')} could not be checked recently.`,'']:[]),`Browse and manage alerts: ${origin}/#watch`,`Unsubscribe: ${origin}/unsubscribe?token=${token}`];
  const payload={jobIds:emailJobs.map(j=>j.id),to:account.email,subject:`JobPilot · ${emailJobs.length} matching ${emailJobs.length===1?'role':'roles'} in your watchlist`,body:lines.join('\n')};
  const id=await store.claimDelivery(account.id,dublinDay(now),payload,now);
  if(id)return {id,...payload,jobIds:undefined};
 }
 return null;
}
