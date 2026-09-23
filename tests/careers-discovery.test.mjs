import test from 'node:test';
import assert from 'node:assert/strict';
import {careersLinks,discoverCompany,getCareersPage,discoveryUrl,isPublicAddress} from '../src/lib/careers-discovery.mjs';
import {companySource} from '../src/lib/company-sources.mjs';
import {probeCompany} from '../src/lib/company-connections.mjs';
import {getPublicPage} from '../src/lib/public-fetch.mjs';
const html=(body)=>new Response(body,{headers:{'Content-Type':'text/html'}});
const dns=address=>new Response(JSON.stringify({Status:0,Answer:address?[{type:address.includes(':')?28:1,data:address}]:[]}));
const source=companySource({name:'Acme',url:'https://acme.com/careers'});

test('careers links discover embedded boards and discard private URLs and lookalike domains',()=>{
 const links=careersLinks(`<iframe src="https://boards.greenhouse.io/embed/job_board?for=acme&amp;gh_src=x"></iframe>
 <a href="https://jobs.lever.co.evil.com/acme">fake</a><a href="http://127.0.0.1/jobs">local</a>
 <script>{"board":"https:\\/\\/boards.greenhouse.io\\/acme"}</script>
 <a href="/careers/open-positions">Vacancies</a><a href="https://other.com/jobs">Other</a>`,source.home,'Acme');
 assert.deepEqual(links.boards.map(s=>s.id),['greenhouse-acme']);
 assert.deepEqual(links.pages,['https://acme.com/careers/open-positions']);
});

test('a careers page is followed to a public board and its feed must pass before connecting',async()=>{
 const pages=[],feeds=[];
 const result=await probeCompany({name:'Acme',url:source.home},[],async url=>{feeds.push(url);return JSON.stringify({jobs:[]});},async url=>{
  pages.push(url);return {url,html:url===source.home?'<a href="/jobs">View jobs</a>':'<a href="https://jobs.ashbyhq.com/acme">Open roles</a>'};
 });
 assert.equal(result.status,'connected');assert.equal(result.source.id,'ashby-acme');assert.equal(result.submitted.home,source.home);
 assert.deepEqual(pages,[source.home,'https://acme.com/jobs']);assert.deepEqual(feeds,['https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true']);
 await assert.rejects(probeCompany({name:'Acme',url:source.home},[],async()=>'<html>Access denied</html>',async url=>({url,html:'<a href="https://jobs.ashbyhq.com/acme">Jobs</a>'})),/could not be refreshed/);
});

test('ambiguous, blocked and unsupported pages never claim a connection and crawling is bounded',async()=>{
 const ambiguous=await discoverCompany(source,async url=>({url,html:'<a href="https://jobs.lever.co/one">One</a><a href="https://jobs.lever.co/two">Two</a>'}));
 assert.equal(ambiguous.kind,'ambiguous');
 const blocked=await discoverCompany(source,async()=>{throw Error('HTTP 403');});assert.equal(blocked.kind,'unavailable');assert.match(blocked.message,/limits automated/);
 const visited=[];
 const result=await discoverCompany(source,async url=>{visited.push(url);return {url,html:Array.from({length:20},(_,i)=>`<a href="/jobs/${i}">Jobs</a>`).join('')};});
 assert.equal(result.kind,'missing');assert.equal(visited.length,3);
 const linkedin=await discoverCompany(companySource({name:'LinkedIn',url:'https://www.linkedin.com/jobs/search/'}),async()=>{throw Error('should not run');});assert.equal(linkedin.kind,'missing');
});

test('discovery checks every redirect and both address families without forwarding credentials',async()=>{
 let pageCalls=0;
 const request=async(input,options)=>{
  const url=new URL(input);
  if(url.hostname==='cloudflare-dns.com')return dns(url.searchParams.get('type')==='A'?'93.184.216.34':null);
  pageCalls++;assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,undefined);
  return new Response('',{status:302,headers:{Location:'https://127.0.0.1/private'}});
 };
 await assert.rejects(getCareersPage(source.home,{request}),/public HTTPS/);assert.equal(pageCalls,1);
 pageCalls=0;
 await assert.rejects(getCareersPage(source.home,{request:async input=>{
  const url=new URL(input);if(url.hostname==='cloudflare-dns.com')return dns(url.searchParams.get('type')==='A'?'93.184.216.34':'fd00::1');
  pageCalls++;return html('no');
 }}),/Only public/);assert.equal(pageCalls,0);
 for(const url of ['https://localhost/jobs','https://169.254.169.254/jobs','https://[::1]/jobs','https://2130706433/jobs','https://acme.internal/jobs','https://acme.com:444/jobs','http://acme.com/jobs','https://user:password@acme.com/jobs'])assert.throws(()=>discoveryUrl(url));
 for(const ip of ['127.0.0.1','10.0.0.1','100.64.1.1','172.16.0.1','192.168.1.1','169.254.169.254','198.18.1.1','224.0.0.1','::1','::ffff:127.0.0.1','2001:db8::1','2002:7f00:1::'])assert.equal(isPublicAddress(ip),false,ip);
 for(const ip of ['93.184.216.34','1.1.1.1','2606:4700:4700::1111','2001:4860:4860::8888'])assert.equal(isPublicAddress(ip),true,ip);
});

test('discovery limits response size and redirects, and uses a board redirect without scraping it',async()=>{
 const requestWith=handler=>async(input,options)=>new URL(input).hostname==='cloudflare-dns.com'?dns(new URL(input).searchParams.get('type')==='A'?'93.184.216.34':null):handler(input,options);
 await assert.rejects(getCareersPage(source.home,{request:requestWith(()=>html('x'.repeat(1_000_001)))}),/too large/);
 let calls=0;
 await assert.rejects(getCareersPage(source.home,{request:requestWith(()=>{calls++;return new Response('',{status:302,headers:{Location:'/jobs/'+calls}});})}),/redirects too many/);assert.equal(calls,4);
 const page=await getCareersPage(source.home,{request:requestWith(()=>new Response('',{status:302,headers:{Location:'https://careers.smartrecruiters.com/Acme'}}))});
 assert.equal(page.url,'https://careers.smartrecruiters.com/Acme');assert.equal(page.html,'');
});

test('generic Workday boards use public Ireland facets, preserve ids and reload from the board URL',async()=>{
 const board=companySource({name:'Example',url:'https://example.wd3.myworkdayjobs.com/External'});
 assert.equal(board.adapter,'workday');assert.deepEqual(companySource({name:'Example',url:board.home}),board);
 const result=await probeCompany({name:'Example',url:board.home},[],async(url,_r,_b,options)=>{
  assert.equal(url,'https://example.wd3.myworkdayjobs.com/wday/cxs/example/External/jobs');
  const body=JSON.parse(options.body);
  if(!body.appliedFacets.locationCountry)return JSON.stringify({total:1,jobPostings:[],facets:[{facetParameter:'locationCountry',values:[{id:'ie',descriptor:'Ireland'}]}]});
  return JSON.stringify({total:1,jobPostings:[{title:'Junior Engineer',externalPath:'/job/Dublin/Junior-Engineer_R12345',locationsText:'Dublin',bulletFields:['Full_Time']}]});
 });
 assert.equal(result.feed.jobs[0].providerId,'R12345');assert.match(result.feed.jobs[0].location,/Ireland/);
 const shared=companySource({name:'Another',url:'https://wd3.myworkdaysite.com/recruiting/example/External'});assert.equal(shared.adapter,'workday');assert.match(shared.home,/en-US\/recruiting\/example\/External/);
 for(const url of ['https://example.wd3.myworkdayjobs.com/admin','https://example.wd3.myworkdayjobs.com/wday/cxs/other/External/jobs','https://wd3.myworkdaysite.com/private','https://example.wd3.myworkdayjobs.com.evil.com/wday/cxs/example/External/jobs'])await assert.rejects(getPublicPage(url),/not connected/);
});

test('generic SmartRecruiters verifies public employer and country instead of guessing',async()=>{
 const source=companySource({name:'Acme',url:'https://careers.smartrecruiters.com/Acme'});
 assert.equal(source.adapter,'smartrecruiters');
 const result=await probeCompany({name:'Acme',url:source.home},[],async url=>{
  assert.match(url,/companies\/Acme\/postings\?country=ie&destination=PUBLIC/);
  const post={id:'123',name:'Junior Engineer',company:{identifier:'Acme'},visibility:'PUBLIC',location:{city:'Dublin',country:'ie'}};
  return JSON.stringify({totalFound:2,content:[post,{...post,id:'124',visibility:'INTERNAL'}]});
 });
 assert.equal(result.status,'partial');assert.equal(result.feed.jobs.length,1);assert.equal(result.feed.jobs[0].url,'https://jobs.smartrecruiters.com/Acme/123');
});
