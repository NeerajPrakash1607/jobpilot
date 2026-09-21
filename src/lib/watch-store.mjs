import {WATCH_SOURCES,EMPTY_PREFERENCES,PILOT_CAPACITY,readWatchPreferences,nextVacancyState,sourceHealth,dublinDay} from './watch-domain.mjs';
import {AppError} from './domain.mjs';
import {companySource} from './company-sources.mjs';

const asJob=row=>({...JSON.parse(row.payload),firstSeen:row.first_seen,lastSeen:row.last_seen,misses:row.misses,open:row.open===1});
const asAccount=row=>row?{id:row.id,email:row.email,name:row.name,status:row.status,preferences:readWatchPreferences(JSON.parse(row.preferences)),createdAt:row.created_at,alertsSince:row.alerts_since??row.opted_at??row.created_at}:null;
export function watchStore(db){
 const stmt=(sql,...values)=>db.prepare(sql).bind(...values);
 const all=async(sql,...values)=>(await stmt(sql,...values).all()).results;
 async function account(id){return asAccount(await stmt('SELECT * FROM watch_accounts WHERE id=?',id).first());}
 async function sources(){
  const custom=(await all('SELECT definition FROM watch_sources WHERE definition IS NOT NULL ORDER BY rowid')).map(r=>companySource(JSON.parse(r.definition)));
  return [...WATCH_SOURCES,...custom.filter(s=>!WATCH_SOURCES.some(d=>d.id===s.id||d.url===s.url))];
 }
 async function invalidateClaims(id,now){
  await db.batch([
   stmt("DELETE FROM watch_delivered_jobs WHERE delivery_id IN (SELECT id FROM watch_deliveries WHERE account_id=? AND state='claimed')",id),
   stmt("DELETE FROM watch_outage_notices WHERE delivery_id IN (SELECT id FROM watch_deliveries WHERE account_id=? AND state='claimed')",id),
   stmt("UPDATE watch_deliveries SET state='cancelled',updated_at=? WHERE account_id=? AND state='claimed'",now,id),
  ]);
 }
 return {
  account,sources,
  async addSource(accountId,source,now){
   const requested=await all('SELECT url FROM watch_requests WHERE account_id=?',accountId);
   if(requested.length>=20&&!requested.some(r=>r.url===source.home))throw new AppError('You can connect or request up to 20 companies.',409);
   const definition=JSON.stringify({name:source.name,url:source.home});
   await stmt('INSERT INTO watch_sources(id,definition) SELECT ?,? WHERE (SELECT COUNT(*) FROM watch_sources WHERE definition IS NOT NULL)<50 ON CONFLICT(id) DO NOTHING',source.id,definition).run();
   if(!await stmt('SELECT id FROM watch_sources WHERE id=?',source.id).first())throw new AppError('The free pilot’s company limit has been reached. Please request this company later.',409);
   await stmt('INSERT INTO watch_requests(id,account_id,name,url,created_at) VALUES(?,?,?,?,?) ON CONFLICT(account_id,url) DO NOTHING',crypto.randomUUID(),accountId,source.name,source.home,now).run();
  },
  async catalog(now){const rows=await all('SELECT * FROM watch_sources');const records=new Map(rows.map(r=>[r.id,r]));
   return (await sources()).map(source=>{const r=records.get(source.id);return {id:source.id,name:source.name,url:source.home,scope:source.scope||'Employer board',supported:source.type!=='website',health:sourceHealth(source,r,now),lastAttempt:r?.last_attempt||null,lastSuccess:r?.last_success||null,count:r?.count||0,skipped:r?.skipped||0,partial:!!r?.partial,failureDays:r?.failure_days||0,outageStarted:r?.outage_started||null,note:r?.error||source.note||''};});
  },
  async jobs(sourceId){return (await all(`SELECT * FROM watch_vacancies${sourceId?' WHERE source_id=?':' WHERE open=1'}`,...(sourceId?[sourceId]:[]))).map(asJob);},
  async claimSource(id,token,now,interval){
   await stmt('INSERT OR IGNORE INTO watch_sources(id) VALUES(?)',id).run();
   const result=await stmt('UPDATE watch_sources SET lock_token=?,locked_until=?,last_attempt=? WHERE id=? AND locked_until<? AND (last_attempt IS NULL OR last_attempt<=?)',token,now+120000,now,id,now,now-interval).run();
   return result.meta.changes===1;
  },
  async saveSnapshot(source,token,snapshot,now){
   const owns=await stmt('SELECT * FROM watch_sources WHERE id=? AND lock_token=?',source.id,token).first();if(!owns)return;
   if(snapshot.kind==='failed'){
    const day=dublinDay(now),yesterday=new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);
    const days=owns.last_failure_day===day?owns.failure_days:owns.last_failure_day===yesterday?owns.failure_days+1:1;
    await stmt("UPDATE watch_sources SET status='failed',error=?,failure_days=?,last_failure_day=?,outage_started=COALESCE(outage_started,?),locked_until=0,lock_token=NULL WHERE id=? AND lock_token=?",snapshot.error,days,day,now,source.id,token).run();return;
   }
   const previous=(await all('SELECT * FROM watch_vacancies WHERE source_id=?',source.id)).map(asJob);
   const next=nextVacancyState(previous,{...snapshot,baseline:!owns.last_success},now);
   // Source locks and a single transaction keep a completed snapshot coherent.
   const writes=next.map(job=>stmt('INSERT INTO watch_vacancies(id,source_id,payload,first_seen,last_seen,misses,open) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM watch_sources WHERE id=? AND lock_token=?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen,misses=excluded.misses,open=excluded.open',job.id,source.id,JSON.stringify(job),job.firstSeen,job.lastSeen,job.misses,Number(job.open),source.id,token));
   writes.push(stmt("UPDATE watch_sources SET last_success=?,status='ok',failure_days=0,last_failure_day=NULL,outage_started=NULL,partial=?,count=?,skipped=?,error=NULL,locked_until=0,lock_token=NULL WHERE id=? AND lock_token=?",now,Number(!snapshot.complete),snapshot.jobs.length,snapshot.skipped,source.id,token));
   await db.batch(writes);
  },
  async saveAccount(identity,unsubscribeHash,now){
   await stmt("INSERT INTO watch_accounts(id,email,name,created_at,preferences,unsubscribe_hash) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name",identity.id,identity.email,identity.name,now,JSON.stringify(EMPTY_PREFERENCES),unsubscribeHash).run();return account(identity.id);
  },
  async createSession(hash,id,expires){await stmt('INSERT INTO watch_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)',hash,id,expires).run();},
  async setUnsubscribeHash(id,hash){await stmt('UPDATE watch_accounts SET unsubscribe_hash=? WHERE id=?',hash,id).run();},
  async session(hash,now){const row=await stmt('SELECT a.* FROM watch_accounts a JOIN watch_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?',hash,now).first();return asAccount(row);},
  async logout(hash){await stmt('DELETE FROM watch_sessions WHERE token_hash=?',hash).run();},
  async preferences(id,prefs,now=Date.now()){
   const previous=await account(id),normalized=readWatchPreferences(prefs);
   const key=p=>JSON.stringify({...p,companies:[...p.companies].sort()});
   const changed=key(previous.preferences)!==key(normalized);
   await stmt("UPDATE watch_accounts SET preferences=?,alerts_since=CASE WHEN status='active' AND ? THEN ? ELSE alerts_since END WHERE id=?",JSON.stringify(normalized),Number(changed),now,id).run();
   if(changed)await invalidateClaims(id,now);
   return account(id);
  },
  async subscribe(id,now){
   await stmt("UPDATE watch_accounts SET alerts_since=CASE WHEN status='active' THEN alerts_since ELSE ? END,status=CASE WHEN status='active' THEN 'active' WHEN (SELECT COUNT(*) FROM watch_accounts WHERE status='active')<? THEN 'active' ELSE 'waitlisted' END,opted_at=COALESCE(opted_at,?) WHERE id=?",now,PILOT_CAPACITY,now,id).run();return account(id);
  },
  async pause(id){await stmt("UPDATE watch_accounts SET status='paused' WHERE id=?",id).run();await invalidateClaims(id,Date.now());return account(id);},
  async unsubscribe(hash){
   const row=await stmt('SELECT id FROM watch_accounts WHERE unsubscribe_hash=?',hash).first();if(!row)return false;
   await stmt("UPDATE watch_accounts SET status='unsubscribed' WHERE id=?",row.id).run();await invalidateClaims(row.id,Date.now());return true;
  },
  async deleteAccount(id){await stmt('DELETE FROM watch_accounts WHERE id=?',id).run();},
  async requestCompany(id,name,url,now){
   const result=await stmt('INSERT INTO watch_requests(id,account_id,name,url,created_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM watch_requests WHERE account_id=?)<20 ON CONFLICT(account_id,url) DO NOTHING',crypto.randomUUID(),id,name,url,now,id).run();
   if(!result.meta.changes&&!await stmt('SELECT id FROM watch_requests WHERE account_id=? AND url=?',id,url).first())throw new AppError('You have reached 20 company requests.',409);
  },
  async requests(id){const connected=await sources();return (await all('SELECT name,url,created_at FROM watch_requests WHERE account_id=? ORDER BY created_at DESC',id)).map(r=>({...r,connected:connected.some(s=>s.type!=='website'&&(s.home===r.url||s.url===companySource(r).url))}));},
  async activeAccounts(){return (await all("SELECT * FROM watch_accounts WHERE status='active' ORDER BY opted_at")).map(asAccount);},
  async delivered(id){return new Set((await all('SELECT job_id FROM watch_delivered_jobs WHERE account_id=?',id)).map(r=>r.job_id));},
  async pendingOutages(id,catalog){
   const sent=new Set((await all('SELECT source_id,outage_started FROM watch_outage_notices WHERE account_id=?',id)).map(r=>r.source_id+':'+r.outage_started));
   return catalog.filter(s=>s.failureDays>=2&&s.outageStarted&&!sent.has(s.id+':'+s.outageStarted));
  },
  async claimDelivery(id,day,payload,now){
   const deliveryId=crypto.randomUUID();
   const writes=[stmt("INSERT INTO watch_deliveries(id,account_id,day,state,created_at,updated_at,payload) SELECT ?,?,?,'claimed',?,?,? WHERE EXISTS(SELECT 1 FROM watch_accounts WHERE id=? AND status='active') ON CONFLICT(account_id,day) DO NOTHING",deliveryId,id,day,now,now,JSON.stringify(payload),id),...payload.jobIds.map(jobId=>stmt('INSERT OR IGNORE INTO watch_delivered_jobs(account_id,job_id,delivery_id) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM watch_deliveries WHERE id=?)',id,jobId,deliveryId,deliveryId))];
   for(const outage of payload.outages||[])writes.push(stmt('INSERT OR IGNORE INTO watch_outage_notices(account_id,source_id,outage_started,delivery_id) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM watch_deliveries WHERE id=?)',id,outage.id,outage.outageStarted,deliveryId,deliveryId));
   const results=await db.batch(writes);return results[0].meta.changes?deliveryId:null;
  },
  async finishDelivery(id,state,now){
   const row=await stmt("SELECT * FROM watch_deliveries WHERE id=? AND state IN ('claimed','uncertain')",id).first();if(!row)return;
   const writes=[stmt('UPDATE watch_deliveries SET state=?,updated_at=? WHERE id=?',state,now,id)];
   if(state==='accepted'){for(const jobId of JSON.parse(row.payload).jobIds)writes.push(stmt('INSERT OR IGNORE INTO watch_delivered_jobs(account_id,job_id,delivery_id) VALUES(?,?,?)',row.account_id,jobId,id));}
   if(['failed','cancelled'].includes(state))writes.push(stmt('DELETE FROM watch_delivered_jobs WHERE delivery_id=?',id),stmt('DELETE FROM watch_outage_notices WHERE delivery_id=?',id));
   await db.batch(writes);
  },
  async authorizeDelivery(id,email=null){return !!await stmt("SELECT d.id FROM watch_deliveries d JOIN watch_accounts a ON a.id=d.account_id WHERE d.id=? AND d.state='claimed' AND a.status='active' AND (? IS NULL OR lower(a.email)=lower(?))",id,email,email).first();},
  async expireClaims(now){await stmt("UPDATE watch_deliveries SET state='uncertain',updated_at=? WHERE state='claimed' AND updated_at<?",now,now-600000).run();},
  async value(key){return (await stmt('SELECT value FROM watch_system WHERE key=?',key).first())?.value||null;},
  async putValue(key,value){await stmt('INSERT INTO watch_system(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,String(value)).run();},
  async diagnostics(){return {subscriptions:await all('SELECT status,COUNT(*) count FROM watch_accounts GROUP BY status'),deliveries:await all('SELECT state,COUNT(*) count FROM watch_deliveries GROUP BY state'),requests:await all('SELECT name,url,COUNT(*) count FROM watch_requests GROUP BY url ORDER BY count DESC')};},
  async promote(now){await stmt("UPDATE watch_accounts SET status='active',alerts_since=? WHERE id IN (SELECT id FROM watch_accounts WHERE status='waitlisted' ORDER BY opted_at,id LIMIT MAX(0,?-(SELECT COUNT(*) FROM watch_accounts WHERE status='active')))",now,PILOT_CAPACITY).run();},
  async cleanup(now){await db.batch([
   stmt('DELETE FROM watch_sessions WHERE expires_at<=?',now),
   stmt("DELETE FROM watch_deliveries WHERE state IN ('accepted','failed','cancelled') AND updated_at<?",now-30*86400000),
   stmt('DELETE FROM watch_vacancies WHERE open=0 AND last_seen<?',now-30*86400000),
  ]);},
 };
}
