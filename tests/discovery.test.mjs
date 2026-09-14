import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDiscovery, parseFeed, validateSearch, matchesRole, locationMatch, rankJobs } from '../lib/discovery.mjs';
import { createApp } from '../server.mjs';

const source={id:'testboard',name:'Test Board',type:'greenhouse',url:'https://example.org/jobs',home:'https://example.org',ttl:30*60_000};
const raw={id:123,internal_job_id:456,title:'Front-End Developer',absolute_url:'https://example.org/jobs/123',location:{name:'Dublin, Ireland'},content:'&lt;p&gt;Build accessible React, CSS and TypeScript interfaces. Collaborate with colleagues on documentation and testing.&lt;/p&gt;',updated_at:'2026-09-14T10:00:00Z'};
const feed=JSON.stringify({jobs:[raw]});
const job=parseFeed(source,feed).jobs[0];
const search=validateSearch({query:'frontend, support',location:'Dublin, Ireland'});
const profile={resumeText:'React, HTML, CSS and JavaScript. Technical support, testing and documentation.'};
async function isolated(run) { const directory=await mkdtemp(path.join(os.tmpdir(),'jobpilot-discover-'));try { await run(directory); } finally { await rm(directory,{recursive:true,force:true}); } }

test('search rejects oversized and invalid filters, while allowing an unrestricted location',()=>{
  assert.throws(()=>validateSearch({query:'a'.repeat(161)}));
  assert.throws(()=>validateSearch({query:'support',includeRemote:'true'}));
  assert.throws(()=>validateSearch({query:', /'}));
  assert.equal(validateSearch({query:'React',location:''}).location,'');
});
test('role families match title variants without accepting unrelated description mentions',()=>{
  assert(matchesRole(job,'frontend developer'));
  assert(matchesRole({...job,title:'Customer Support Specialist'},'technical support'));
  assert(matchesRole({...job,title:'Software Engineer'},'React'));
  assert(!matchesRole({...job,title:'Account Executive'},'React'));
  assert(matchesRole({...job,title:'Junior Software Engineer'},'software developer'));
});
test('location filtering respects remote regions, exclusions and the two Dublins',()=>{
  assert(locationMatch(job,search));
  assert(!locationMatch({...job,location:'Dublin, CA'},search));
  assert(!locationMatch({...job,location:'Remote — United States',remote:true},search));
  assert(!locationMatch({...job,location:'Remote',remote:true},search));
  assert(locationMatch({...job,location:'Europe',remote:true},search));
  assert(locationMatch({...job,location:'Worldwide',remote:true},search));
  assert(!locationMatch({...job,location:'Europe excluding Ireland',remote:true},search));
  assert(!locationMatch({...job,location:'Remote, Ireland',remote:true},{...search,includeRemote:false}));
  assert(locationMatch({...job,location:'Ireland',remote:false},{...search,location:'Ireland'}));
  assert(!locationMatch({...job,location:'Cork, Ireland'},search));
});
test('feeds decode descriptions, skip unsafe entries and reject broken source schemas',()=>{
  assert.equal(job.description,'Build accessible React, CSS and TypeScript interfaces. Collaborate with colleagues on documentation and testing.');
  assert(!job.description.includes('<p>'));
  const parsed=parseFeed(source,JSON.stringify({jobs:[raw,{...raw,id:789,absolute_url:'javascript:alert(1)'},{...raw,id:987,internal_job_id:null}]}));
  assert.equal(parsed.jobs.length,1);assert.equal(parsed.skipped,1);
  assert.throws(()=>parseFeed(source,'{"error":"not jobs"}'),/jobs list/);
  assert.throws(()=>parseFeed(source,'not json'),/unreadable/);
  const remote=parseFeed({...source,type:'remotive'},JSON.stringify({jobs:[{id:3,title:'Developer',company_name:'Company',url:'https://remotive.com/job/3',description:'React',candidate_required_location:'Europe'}]})).jobs[0];
  assert.equal(remote.remote,true);assert.equal(remote.location,'Europe');
});
test('results deduplicate, mark already saved roles and compare actual skills',()=>{
  const results=rankJobs([job,{...job,id:'duplicate',url:job.url+'?utm_source=another'},{...job,id:'senior',url:'https://example.org/jobs/2',title:'Senior Frontend Engineer'}],search,profile,[{id:'saved-1',url:job.url}]);
  assert.equal(results.length,1);assert.equal(results[0].savedId,'saved-1');
  assert(results[0].matched.includes('React'));assert(results[0].missing.includes('TypeScript'));
});
test('concurrent searches share a fetch and the cache survives service restarts',()=>isolated(async directory=>{
  let count=0;const options={directory,sources:[source],fetchPage:async()=>{count++;return feed;}};
  const finder=createDiscovery(options);
  const [a,b]=await Promise.all([finder.search(search,profile,[]),finder.search(search,profile,[])]);
  assert.equal(count,1);assert.equal(a.total,1);assert.equal(b.total,1);
  const restarted=await createDiscovery(options).search(search,profile,[]);
  assert.equal(count,1);assert.equal(restarted.sources[0].status,'cached');
}));
test('failed sources retain usable results, retry with backoff, and expire stale copies',()=>isolated(async directory=>{
  let now=Date.parse('2026-09-14T10:00:00Z'),fail=false,count=0;
  const finder=createDiscovery({directory,sources:[source,{...source,id:'offline',name:'Offline',url:'https://example.org/offline'}],now:()=>now,fetchPage:async url=>{count++;if(fail||url.endsWith('offline'))throw new Error('offline');return feed;}});
  let result=await finder.search(search,profile,[]);assert.equal(result.total,1);assert.equal(result.sources[1].status,'unavailable');
  fail=true;now+=31*60_000;
  result=await finder.search(search,profile,[]);assert.equal(result.total,1);assert.equal(result.sources[0].status,'stale');
  const attempted=count;await finder.search(search,profile,[]);assert.equal(count,attempted);
  now+=25*60*60_000;result=await finder.search(search,profile,[]);assert.equal(result.total,0);assert(result.sources.every(s=>s.status==='unavailable'));
}));
test('saving a discovered employer role rechecks its posting and rejects unknown identifiers',()=>isolated(async directory=>{
  const requests=[];
  const finder=createDiscovery({directory,sources:[source],fetchPage:async url=>{requests.push(url);return url===source.url?feed:JSON.stringify({...raw,title:'Frontend Engineer, Updated'});}});
  await finder.search(search,profile,[]);
  const saved=await finder.resolve(job.id);assert.equal(saved.title,'Frontend Engineer, Updated');
  assert.match(requests.at(-1),/boards-api.greenhouse.io\/v1\/boards\/testboard\/jobs\/123$/);
  assert.match(saved.notes,/Found through Test Board/);
  await assert.rejects(finder.resolve('testboard-999'),/no longer/);
  await assert.rejects(finder.resolve('../../data'),/Search again/);
}));
test('discovery API saves preferences and a job once, with no supplied listing URL',()=>isolated(async directory=>{
  let received;
  const discovery={search:async(filters,profile,jobs)=>{received={filters,profile,jobs};return {jobs:[job],total:1};},resolve:async id=>{assert.equal(id,job.id);return job;}};
  const {server,store}=await createApp({directory,seed:false,discovery});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`,headers={'X-JobPilot':'1','Content-Type':'application/json'};
  const post=(route,data)=>fetch(base+route,{method:'POST',headers,body:JSON.stringify(data)});
  try {
    assert.equal((await post('/api/discover',search)).status,200);assert.deepEqual(received.filters,search);
    assert.equal((await (await fetch(base+'/api/discover/preferences',{headers})).json()).query,search.query);
    assert.equal((await post('/api/discover',{query:'support',hideSenior:'bad'})).status,400);
    const first=await post('/api/discover/save',{id:job.id});assert.equal(first.status,201);
    const again=await post('/api/discover/save',{id:job.id});assert.equal(again.status,200);assert.equal((await again.json()).alreadySaved,true);
    assert.equal(store.jobs().length,1);assert.equal(store.jobs()[0].status,'saved');
  } finally { await new Promise(resolve=>server.close(resolve));store.close(); }
}));
