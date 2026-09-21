import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {watchStore} from '../src/lib/watch-store.mjs';
import {watchApi,unsubscribePage} from '../src/lib/watch-api.mjs';
import {parseWatchPreferences,matchWatchJobs,digestSelection,EMPTY_PREFERENCES,nextVacancyState,WATCH_SOURCES} from '../src/lib/watch-domain.mjs';
import {nextDigest,checkCompany,connectCompany} from '../src/lib/watch-service.mjs';
import {hashToken,unsubscribeToken} from '../src/lib/watch-auth.mjs';

function database(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const prepare=query=>({bind(...values){return {
  async all(){return {results:sql.prepare(query).all(...values)};},
  async first(){return sql.prepare(query).get(...values)||null;},
  async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};},
 };}});
 const db={prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return {db,store:watchStore(db),close:()=>sql.close()};
}
const now=Date.parse('2026-09-16T09:00:00Z');
const secret='test-secret-for-isolated-tests-only-123456789';
const vacancy={id:'stripe-1',providerId:'1',sourceId:'stripe',source:'Stripe',title:'Junior Support Engineer',company:'Stripe',location:'Dublin, Ireland · Hybrid',description:'Support customers using our platform.',url:'https://stripe.com/jobs/1',salary:'',remote:false,firstSeen:now,lastSeen:now,misses:0,open:true};
async function user(store,id='one'){return store.saveAccount({id:'google:'+id,email:id+'@example.test',name:'Example'},'unsubscribe-'+id,now);}
const req=(route,data={},session='')=>new Request('https://jobpilot.example/watch-api'+route,{method:'POST',headers:{Origin:'https://jobpilot.example','X-JobPilot':'1','Content-Type':'application/json',Cookie:session?'jp_watch_session='+session:''},body:JSON.stringify(data)});

test('Ireland matching excludes wrong Dublin and unknown details without guessing eligibility',()=>{
 const prefs=parseWatchPreferences({...EMPTY_PREFERENCES,companies:['stripe'],roles:'support',level:'entry',arrangement:'hybrid'});
 assert.equal(matchWatchJobs([vacancy],prefs).length,1);
 for(const location of ['Dublin, California','Belfast, Northern Ireland','Remote, United States only'])assert.equal(matchWatchJobs([{...vacancy,location}],EMPTY_PREFERENCES).length,0);
 assert.equal(matchWatchJobs([{...vacancy,location:'Dublin, Ireland'}],prefs).length,0);
 assert.equal(matchWatchJobs([{...vacancy,title:'Support Engineer'}],prefs)[0].group,'experience_unclear');
 assert.throws(()=>parseWatchPreferences({...EMPTY_PREFERENCES,companies:['untrusted-url']}));
 assert.equal(matchWatchJobs([{...vacancy,location:'Remote — Europe',remote:true}],EMPTY_PREFERENCES).length,1);
 assert.equal(matchWatchJobs([{...vacancy,location:'Remote — Europe excluding Ireland',remote:true}],EMPTY_PREFERENCES).length,0);
});

test('failed and partial snapshots preserve vacancies; two complete misses close them',()=>{
 assert.deepEqual(nextVacancyState([vacancy],{kind:'failed'},now+1),[vacancy]);
 assert.equal(nextVacancyState([vacancy],{kind:'success',complete:false,jobs:[]},now+1)[0].open,true);
 const once=nextVacancyState([vacancy],{kind:'success',complete:true,jobs:[]},now+1);
 assert.equal(once[0].open,true);
 const twice=nextVacancyState(once,{kind:'success',complete:true,jobs:[]},now+2);
 assert.equal(twice[0].open,false);
 const restored=nextVacancyState(twice,{kind:'success',complete:true,jobs:[vacancy]},now+3);
 assert.equal(restored[0].open,true);assert.equal(restored[0].firstSeen,now);
});

test('clearing a watchlist never subscribes an existing account to every company',()=>{
 assert.equal(matchWatchJobs([vacancy],EMPTY_PREFERENCES).length,1);
 assert.equal(digestSelection([vacancy],EMPTY_PREFERENCES,new Set()).length,0);
});

test('source checks are cached durably and failed checks keep the last successful catalogue',async()=>{
 const {store,close}=database();try{
  const feed=JSON.stringify({jobs:[{id:1,internal_job_id:2,title:vacancy.title,location:{name:vacancy.location},absolute_url:vacancy.url,content:vacancy.description}]});
  assert.equal((await checkCompany(store,'stripe',now,async()=>feed)).status,'complete');
  assert.equal((await checkCompany(store,'stripe',now+1,async()=>{throw Error('must not fetch');})).status,'recent-or-running');
  assert.equal((await store.jobs()).length,1);
  assert.equal((await checkCompany(store,'stripe',now+1800001,async()=>{throw Error('offline');})).status,'failed');
  const source=(await store.catalog(now+1800001)).find(s=>s.id==='stripe');
  assert.equal(source.health,'stale');assert.equal(source.lastSuccess,now);assert.equal(source.count,1);
  assert.equal((await store.jobs()).length,1);
 }finally{close();}
});

test('50-active cap, waitlist, pause and promotion are enforced by database transitions',async()=>{
 const {store,close}=database();try{
  for(let i=0;i<52;i++){const a=await user(store,String(i));await store.subscribe(a.id,now+i);}
  assert.equal((await store.activeAccounts()).length,50);
  assert.equal((await store.account('google:50')).status,'waitlisted');
  await store.pause('google:0');await store.promote(now);
  assert.equal((await store.account('google:50')).status,'active');assert.equal((await store.account('google:51')).status,'waitlisted');
  assert.equal((await store.activeAccounts()).length,50);
 }finally{close();}
});

test('daily digest reserves jobs and uncertain sends do not repeat next day',async()=>{
 const {store,close}=database();try{
  const a=await user(store);await store.preferences(a.id,{...EMPTY_PREFERENCES,companies:['stripe']});await store.subscribe(a.id,now);
  await store.claimSource('stripe','baseline',now,0);await store.saveSnapshot(WATCH_SOURCES.find(s=>s.id==='stripe'),'baseline',{kind:'success',jobs:[],complete:true,skipped:0},now);
  await store.claimSource('stripe','lock',now+1,0);await store.saveSnapshot(WATCH_SOURCES.find(s=>s.id==='stripe'),'lock',{kind:'success',jobs:[vacancy],complete:true,skipped:0},now+1);
  const first=await nextDigest(store,'https://jobpilot.example',secret,now);
  assert.ok(first);assert.equal(first.to,a.email);assert.ok(first.body.includes('/unsubscribe?token='));
  assert.equal(await nextDigest(store,'https://jobpilot.example',secret,now+1),null);
  await store.finishDelivery(first.id,'uncertain',now+2);
  assert.equal(await nextDigest(store,'https://jobpilot.example',secret,now+86400000),null);
  assert.equal(await store.authorizeDelivery(first.id),false);
 }finally{close();}
});

test('unsubscribe is not triggered by link scanning and cancels a queued send',async()=>{
 const {db,store,close}=database();try{
  const a=await user(store),token=await unsubscribeToken(secret,a);await store.setUnsubscribeHash(a.id,await hashToken(token));await store.subscribe(a.id,now);
  const id=await store.claimDelivery(a.id,'2026-09-16',{jobIds:['stripe-1'],to:a.email},now);
  const url='https://jobpilot.example/unsubscribe?token='+token;
  await unsubscribePage(new Request(url),{DB:db});assert.equal((await store.account(a.id)).status,'active');
  for(const origin of [null,'null','https://other.example']){
   const blocked=await unsubscribePage(new Request(url,{method:'POST',headers:origin?{Origin:origin}:{}}),{DB:db});
   assert.equal(blocked.status,403);assert.equal((await store.account(a.id)).status,'active');
  }
  const invalid=await unsubscribePage(new Request('https://jobpilot.example/unsubscribe?token='+'0'.repeat(64),{method:'POST',headers:{Origin:'https://jobpilot.example'}}),{DB:db});
  assert.equal(invalid.status,400);assert.equal((await store.account(a.id)).status,'active');
  const confirmed=await unsubscribePage(new Request(url,{method:'POST',headers:{Origin:'https://jobpilot.example'}}),{DB:db});
  assert.equal(confirmed.status,200);
  assert.equal((await store.account(a.id)).status,'unsubscribed');assert.equal(await store.authorizeDelivery(id),false);
  await store.subscribe(a.id,now+1);
  assert.equal(await store.authorizeDelivery(id),false,'Reactivating does not revive a cancelled email');
 }finally{close();}
});

test('API boundaries reject unverified identities, cross-origin requests and unconfigured signup',async()=>{
 const {db,store,close}=database();try{
  assert.equal((await watchApi(req('/preferences',EMPTY_PREFERENCES),{DB:db})).status,401);
  const cross=new Request('https://jobpilot.example/watch-api/check',{method:'POST',body:'{}',headers:{Origin:'https://evil.example','X-JobPilot':'1'}});
  assert.equal((await watchApi(cross,{DB:db})).status,403);
  assert.equal((await watchApi(req('/google',{credential:'made-up'}),{DB:db})).status,503);
  const forged=req('/google',{credential:'made-up'});forged.headers.set('Cookie','jp_watch_nonce='+'a'.repeat(64));
  assert.equal((await watchApi(forged,{DB:db,GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',WATCH_RUNNER_SECRET:secret})).status,401);
  assert.equal((await watchApi(req('/runner/status'),{DB:db,WATCH_RUNNER_SECRET:secret})).status,401);
  const a=await user(store);await store.createSession(await hashToken('session-a'),a.id,Date.now()+3600000);
  assert.equal((await watchApi(req('/subscribe',{consent:true},'session-a'),{DB:db})).status,503);
  const saved=await watchApi(req('/preferences',{...EMPTY_PREFERENCES,companies:['stripe']},'session-a'),{DB:db});assert.equal(saved.status,200);
  assert.deepEqual((await saved.json()).account.preferences.companies,['stripe']);
  await store.deleteAccount(a.id);assert.equal(await store.session(await hashToken('session-a'),Date.now()),null);
 }finally{close();}
});

test('private launch testing allows only the configured verified account',async()=>{
 const {db,store,close}=database();try{
  const owner=await user(store,'owner'),other=await user(store,'other');
  for(const a of [owner,other]){await store.preferences(a.id,{...EMPTY_PREFERENCES,companies:['stripe']});await store.createSession(await hashToken(a.id),a.id,Date.now()+3600000);}
  await store.putValue('runnerHeartbeat',Date.now());
  const env={DB:db,GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',WATCH_RUNNER_SECRET:secret,ALERTS_ENABLED:'false',ALERT_TEST_EMAIL:owner.email};
  assert.equal((await watchApi(req('/subscribe',{consent:true},other.id),env)).status,503);
  assert.equal((await watchApi(req('/subscribe',{consent:true},owner.id),env)).status,200);
  const id=await store.claimDelivery(owner.id,'2026-09-16',{jobIds:['stripe-1'],to:owner.email},now);
  assert.equal(await store.authorizeDelivery(id,other.email),false);
  assert.equal(await store.authorizeDelivery(id,owner.email),true);
  assert.equal(await nextDigest(store,'https://jobpilot.example',secret,now,other.email),null);
 }finally{close();}
});

test('new connected boards survive reload and participate in scheduled checks, preferences and digests',async()=>{
 const {db,store,close}=database();try{
  const a=await user(store),job={title:'Support Engineer',location:'Dublin, Ireland',jobUrl:'https://jobs.ashbyhq.com/example/11111111-2222-3333-4444-555555555555',descriptionPlain:'Help customers use our software.',isListed:true};
  let calls=0;const newJob={...job,jobUrl:'https://jobs.ashbyhq.com/example/22222222-2222-3333-4444-555555555555'};const fetchPage=async()=>{calls++;return JSON.stringify({jobs:calls===1?[job]:[job,newJob]});};
  const connected=await connectCompany(store,a.id,{name:'Example',url:'https://jobs.ashbyhq.com/example'},now,fetchPage);
  assert.equal(connected.status,'connected');assert.equal(connected.count,1);
  const reloaded=watchStore(db);assert.ok((await reloaded.sources()).some(s=>s.id===connected.id));
  assert.equal((await reloaded.catalog(now)).find(s=>s.id===connected.id).health,'fresh');
  assert.equal((await reloaded.requests(a.id))[0].connected,true);
  const runner=req('/runner/catalog');runner.headers.set('Authorization','Bearer '+secret);
  const catalog=await (await watchApi(runner,{DB:db,WATCH_RUNNER_SECRET:secret})).json();
  assert.ok(catalog.companies.some(s=>s.id===connected.id));
  await reloaded.createSession(await hashToken('new-board-session'),a.id,Date.now()+3600000);
  const saved=await watchApi(req('/preferences',{...EMPTY_PREFERENCES,companies:[connected.id],roles:'support'},'new-board-session'),{DB:db});
  assert.equal(saved.status,200);assert.deepEqual((await saved.json()).account.preferences.companies,[connected.id]);
  assert.equal((await checkCompany(reloaded,connected.id,now+86400000,fetchPage)).status,'complete');assert.equal(calls,2);
  await reloaded.subscribe(a.id,now);
  const digest=await nextDigest(reloaded,'https://jobpilot.example',secret,now+86400000);assert.ok(digest.body.includes(newJob.jobUrl));assert.ok(!digest.body.includes(job.jobUrl),'Initial imported jobs are never included');
  const repeat=await connectCompany(reloaded,a.id,{name:'Renamed',url:job.jobUrl},now+86400001,fetchPage);assert.equal(repeat.id,connected.id);
  assert.equal((await reloaded.sources()).filter(s=>s.id===connected.id).length,1);assert.equal((await reloaded.requests(a.id)).length,1);
 }finally{close();}
});

test('unsupported and failed connections never become scheduled feeds',async()=>{
 const {db,store,close}=database();try{
  const a=await user(store),before=(await store.sources()).length;
  const unsupported=await connectCompany(store,a.id,{name:'Unknown',url:'https://example.org/careers'},now,async()=>{throw Error('must not fetch arbitrary sites');});
  assert.equal(unsupported.status,'unsupported');assert.equal((await store.requests(a.id))[0].connected,false);
  assert.match(unsupported.message,/Greenhouse, Lever or Ashby/);
  const repeated=await connectCompany(store,a.id,{name:'Unknown',url:'https://example.org/careers'},now+1);
  assert.equal(repeated.status,'unsupported');assert.equal((await store.requests(a.id)).length,1);
  await assert.rejects(connectCompany(store,a.id,{name:'Offline',url:'https://jobs.ashbyhq.com/offline'},now,async()=>{throw Error('HTTP 403');}),/blocks automated access/);
  assert.equal((await store.sources()).length,before);
  assert.equal((await watchApi(req('/connect',{name:'No account',url:'https://jobs.lever.co/example'}),{DB:db})).status,401);
 }finally{close();}
});

test('Yahoo joins scheduled checks and existing Yahoo requests are recognised as connected',async()=>{
 const {store,close}=database();try{
  const a=await user(store);
  await store.requestCompany(a.id,'Yahoo','https://www.yahooinc.com/careers/search.html',now);
  const fetchPage=async(_url,_redirects,_maxBytes,options)=>JSON.stringify(JSON.parse(options.body).appliedFacets.locations
   ? {total:1,jobPostings:[{title:'Support Engineer',externalPath:'/job/Ireland/Support-Engineer_JR123',locationsText:'Ireland',bulletFields:['JR123']}]}
   : {total:10,jobPostings:[],facets:[{facetParameter:'locations',values:[{id:'irish',descriptor:'Ireland'}]}]});
  assert.equal((await checkCompany(store,'yahoo',now,fetchPage)).status,'complete');
  assert.equal((await store.catalog(now)).find(s=>s.id==='yahoo').count,1);
  assert.equal((await store.requests(a.id))[0].connected,true);
  assert.equal((await checkCompany(store,'yahoo',now+86400000,fetchPage)).status,'complete');
  assert.equal((await store.jobs()).length,1);
 }finally{close();}
});

test('LinkedIn employer vacancies join scheduled checks, matching and existing careers requests',async()=>{
 const {store,close}=database();try{
  const a=await user(store);
  await store.requestCompany(a.id,'LinkedIn careers','https://careers.linkedin.com/',now);
  const fetchPage=async()=>JSON.stringify({totalFound:1,content:[{id:'744000150116754',name:'Senior Support Engineer',company:{identifier:'LinkedIn3'},visibility:'PUBLIC',location:{city:'Dublin',country:'ie',hybrid:true},releasedDate:'2026-09-17T13:56:35.890Z'}]});
  assert.ok((await store.sources()).some(s=>s.id==='linkedin'));
  assert.equal((await checkCompany(store,'linkedin',now,fetchPage)).status,'complete');
  assert.equal((await store.catalog(now)).find(s=>s.id==='linkedin').count,1);
  assert.equal((await store.requests(a.id))[0].connected,true);
  const preferences=parseWatchPreferences({...EMPTY_PREFERENCES,companies:['linkedin'],roles:'support',arrangement:'hybrid'});
  assert.equal(matchWatchJobs(await store.jobs(),preferences).length,1);
  assert.equal((await checkCompany(store,'linkedin',now+86400000,fetchPage)).status,'complete');
  assert.equal((await store.jobs()).length,1,'Daily checks retain stable vacancy identity');
  await checkCompany(store,'linkedin',now+2*86400000,async()=>'{"content":[]}');
  assert.equal((await store.jobs()).length,1,'An unreadable feed preserves previous vacancies');
 }finally{close();}
});

test('initial imports and pre-activation jobs never form a welcome batch; preference changes reset the cutoff',async()=>{
 const {store,close}=database();try{
  const source=WATCH_SOURCES.find(s=>s.id==='stripe'),a=await user(store);
  const snapshot=async(time,jobs)=>{const token=String(time);await store.claimSource(source.id,token,time,0);await store.saveSnapshot(source,token,{kind:'success',jobs,complete:true,skipped:0},time);};
  await store.preferences(a.id,{...EMPTY_PREFERENCES,companies:['stripe']},now);
  await store.subscribe(a.id,now);
  await snapshot(now+1,[vacancy]);
  assert.equal(await nextDigest(store,'https://jobpilot.example',secret,now+2),null);
  const later={...vacancy,id:'stripe-later',url:'https://stripe.com/jobs/later',listingDate:'2020-01-01',dateLabel:'Published'};
  await snapshot(now+3,[vacancy,later]);
  const first=await nextDigest(store,'https://jobpilot.example',secret,now+4);
  assert.ok(first.body.includes(later.url));assert.ok(!first.body.includes(vacancy.url));assert.match(first.body,/First found/);assert.match(first.body,/2020/);
  await store.preferences(a.id,{...EMPTY_PREFERENCES,companies:['stripe'],city:'Dublin'},now+5);
  assert.equal(await store.authorizeDelivery(first.id),false,'Changing a search invalidates its queued email');
  assert.equal((await store.account(a.id)).alertsSince,now+5);
  assert.equal(await nextDigest(store,'https://jobpilot.example',secret,now+86400000),null);
  await store.pause(a.id);await store.subscribe(a.id,now+86400001);
  assert.equal((await store.account(a.id)).alertsSince,now+86400001,'Reactivation starts a new cutoff');
 }finally{close();}
});

test('two failed days send one independent warning per outage; retries and quiet days do not spam',async()=>{
 const {store,close}=database();try{
  const a=await user(store),source=WATCH_SOURCES.find(s=>s.id==='stripe');
  await store.preferences(a.id,{...EMPTY_PREFERENCES,companies:['stripe'],roles:'no matching job'},now);await store.subscribe(a.id,now);
  const save=async(time,kind)=>{const token=String(time);await store.claimSource(source.id,token,time,0);await store.saveSnapshot(source,token,kind==='failed'?{kind,error:'Could not check this company.'}:{kind:'success',jobs:[vacancy],complete:true,skipped:0},time);};
  await save(now,'success');await save(now+86400000,'failed');await save(now+86400001,'failed');
  assert.equal((await store.catalog(now+86400001)).find(s=>s.id==='stripe').failureDays,1);
  assert.equal(await nextDigest(store,'https://jobpilot.example',secret,now+86400002),null);
  await save(now+2*86400000,'failed');
  const warning=await nextDigest(store,'https://jobpilot.example',secret,now+2*86400000+1);
  assert.ok(warning);assert.match(warning.subject,/checks need attention/);assert.ok(warning.body.includes(source.home));assert.match(warning.body,/Unsubscribe:/);
  await store.finishDelivery(warning.id,'accepted',now+2*86400000+2);
  await save(now+3*86400000,'failed');
  assert.equal(await nextDigest(store,'https://jobpilot.example',secret,now+3*86400000+1),null);
  assert.equal((await store.jobs()).length,1,'Keep previous jobs visible');
  await save(now+4*86400000,'success');assert.equal((await store.catalog(now+4*86400000)).find(s=>s.id==='stripe').failureDays,0);
  await save(now+5*86400000,'failed');await save(now+6*86400000,'failed');
  assert.ok(await nextDigest(store,'https://jobpilot.example',secret,now+6*86400000+1),'A new outage gets a new warning');
  await store.deleteAccount(a.id);
  assert.equal((await store.pendingOutages(a.id,[])).length,0);
 }finally{close();}
});

test('sponsorship-unknown digest section requires clear early-career experience and respects training opt-ins',async()=>{
 const {store,close}=database();try{
  const a=await user(store),source=WATCH_SOURCES.find(s=>s.id==='stripe');
  await store.preferences(a.id,{...EMPTY_PREFERENCES,companies:['stripe'],roles:'IT support',level:'entry',sponsorship:'needed'},now);await store.subscribe(a.id,now);
  await store.claimSource('stripe','baseline',now,0);await store.saveSnapshot(source,'baseline',{kind:'success',jobs:[],complete:true,skipped:0},now);
  const jobs=['offered','unknown','unclear','senior','intern','denied'].map((kind,i)=>({...vacancy,id:'stripe-'+kind,url:'https://stripe.com/jobs/'+kind,title:kind==='intern'?'IT Support Intern':'IT Support Engineer',description:kind==='unclear'?'A junior position.':`Required: ${kind==='senior'?5:1} year of experience.\n${kind==='offered'?'Visa sponsorship is available.':kind==='denied'?'Sponsorship is not available.':''}`,listingDate:'2026-09-01T00:00:00Z',dateLabel:'Published'}));
  await store.claimSource('stripe','jobs',now+1,0);await store.saveSnapshot(source,'jobs',{kind:'success',jobs,complete:true,skipped:0},now+1);
  const digest=await nextDigest(store,'https://jobpilot.example',secret,now+2);
  assert.match(digest.subject,/2 newly found roles/);assert.match(digest.body,/SPONSORSHIP NOT STATED/);
  assert.ok(digest.body.includes('/offered'));assert.ok(digest.body.includes('/unknown'));
  for(const kind of ['unclear','senior','intern','denied'])assert.ok(!digest.body.includes('/'+kind),kind);
  assert.doesNotMatch(digest.body,/résumé|resume/);
 }finally{close();}
});

test('a verified connection is public but requester identity and watchlists remain private',async()=>{
 const {db,store,close}=database();try{
  const one=await user(store,'one'),two=await user(store,'two');
  const connected=await connectCompany(store,one.id,{name:'Shared Example',url:'https://jobs.ashbyhq.com/shared-example'},now,async()=>JSON.stringify({jobs:[]}));
  const response=await watchApi(new Request('https://jobpilot.example/watch-api/catalog'),{DB:db});const data=await response.json();
  assert.ok(data.companies.some(s=>s.id===connected.id));assert.ok(!JSON.stringify(data).includes(one.email));
  assert.deepEqual((await store.account(two.id)).preferences.companies,[]);
  assert.deepEqual(await store.requests(two.id),[]);
 }finally{close();}
});
