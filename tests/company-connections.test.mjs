import test from 'node:test';
import assert from 'node:assert/strict';
import {companySource,validateSourcePreferences,unconnectedCompanyLinks} from '../src/lib/company-sources.mjs';
import {probeCompany} from '../src/lib/company-connections.mjs';
import {loadCompanyFeed} from '../src/lib/company-feeds.mjs';
import {parseFeed,createDiscovery} from '../src/lib/discovery.mjs';
import {importJob} from '../src/lib/importer.mjs';
import {getPublicPage} from '../src/lib/public-fetch.mjs';

const ashby={title:'Support Engineer',location:'Dublin, Ireland',jobUrl:'https://jobs.ashbyhq.com/example/11111111-2222-3333-4444-555555555555',descriptionPlain:'Help customers use our software.',isListed:true};
const linkedInPosting=i=>({id:String(744000150000000+i),name:'Senior Software Engineer',company:{identifier:'LinkedIn3'},visibility:'PUBLIC',location:{city:'Dublin',region:'County Dublin',country:'ie',hybrid:true},releasedDate:'2026-09-17T13:56:35.890Z'});
test('Fidelity careers links resolve to one selectable Ireland feed and replace saved links',async()=>{
 const home='https://jobs.fidelity.com/ie/locations/dublin-ireland/';
 for(const url of [home,'https://jobs.fidelity.com/ie/jobs/?location=Dublin','https://wd1.myworkdaysite.com/en-US/recruiting/fmr/FidelityCareers','https://wd1.myworkdaysite.com/recruiting/fmr/FidelityCareers/job/Dublin-Ireland/Engineer_2135464-2']){
  const source=companySource({name:'Fidelity',url});assert.equal(source.id,'fidelity');assert.equal(source.type,'company');
 }
 for(const url of ['https://jobs.fidelity.com.evil.example/','https://wd1.myworkdaysite.com/en-US/recruiting/other/FidelityCareers','https://wd1.myworkdaysite.com/en-US/recruiting/fmr/OtherBoard'])assert.notEqual(companySource({name:'Fidelity',url}).id,'fidelity');
 assert.deepEqual(unconnectedCompanyLinks([{id:'fidelity',name:'Fidelity',url:home,supported:true}],[{name:'Fidelity',url:home,connected:false}]),[]);
 await assert.rejects(getPublicPage('https://wd1.myworkdaysite.com/wday/cxs/other/OtherBoard/private'),/not connected/);
});
test('Fidelity checks the official Ireland locations and preserves Workday application links',async()=>{
 const calls=[],source=companySource({name:'Fidelity',url:'https://jobs.fidelity.com/ie/locations/dublin-ireland/'});
 const posting=i=>({title:'Software Engineer',externalPath:`/job/Dublin-Ireland/Software-Engineer_${2135464+i}-2`,locationsText:i===20?'Galway, Ireland':'Dublin, Ireland',bulletFields:[String(2135464+i)]});
 const result=await probeCompany({name:source.name,url:source.home},[],async(url,_redirects,_bytes,options)=>{
  assert.equal(url,'https://wd1.myworkdaysite.com/wday/cxs/fmr/FidelityCareers/jobs');
  const body=JSON.parse(options.body);calls.push(body);
  if(!body.appliedFacets.locations)return JSON.stringify({total:825,jobPostings:[],facets:[{facetParameter:'locationMainGroup',values:[{facetParameter:'locations',values:[{descriptor:'Dublin, Ireland',id:'dublin'},{descriptor:'Galway, Ireland',id:'galway'},{descriptor:'Belfast, Northern Ireland',id:'belfast'}]}]}]});
  assert.deepEqual(body.appliedFacets,{locations:['dublin','galway']});
  return JSON.stringify({total:21,jobPostings:body.offset===0?Array.from({length:20},(_,i)=>posting(i)):[posting(20)]});
 });
 assert.equal(result.status,'connected');assert.equal(result.feed.jobs.length,21);assert.equal(calls.length,3);
 assert.equal(result.feed.jobs[0].id,'fidelity-2135464');assert.equal(result.feed.jobs[0].summaryOnly,true);
 assert.equal(result.feed.jobs[0].url,'https://wd1.myworkdaysite.com/en-US/recruiting/fmr/FidelityCareers/job/Dublin-Ireland/Software-Engineer_2135464-2');
 await assert.rejects(loadCompanyFeed(source,async()=>'{"total":825,"jobPostings":[]}'),/readable public jobs feed/);
});
test('LinkedIn employer careers links share a feed; general LinkedIn job search remains separate',()=>{
 for(const url of ['https://careers.linkedin.com/','https://careers.linkedin.com/locations/dublin','https://careers.smartrecruiters.com/LinkedIn3','https://jobs.smartrecruiters.com/linkedin3/744000150000000']){
  const source=companySource({name:'LinkedIn careers',url});assert.equal(source.id,'linkedin');assert.equal(source.name,'LinkedIn');
 }
 for(const url of ['https://www.linkedin.com/jobs/search/','https://www.linkedin.com/company/linkedin/jobs/','https://careers.linkedin.com.evil.example/'])assert.equal(companySource({name:'LinkedIn',url}).type,'website');
 assert.deepEqual(unconnectedCompanyLinks([{id:'linkedin',name:'LinkedIn',url:'https://careers.linkedin.com/',supported:true}],[{name:'LinkedIn careers',url:'https://careers.linkedin.com/',connected:false}],[{name:'Old LinkedIn board',home:'https://careers.smartrecruiters.com/LinkedIn3'}]),[]);
});
test('LinkedIn public Ireland feed paginates and preserves direct job links and advertised details',async()=>{
 const source=companySource({name:'LinkedIn',url:'https://careers.linkedin.com/'}),calls=[];
 const feed=await loadCompanyFeed(source,async input=>{
  const url=new URL(input);calls.push(url);
  assert.equal(url.origin+url.pathname,'https://api.smartrecruiters.com/v1/companies/LinkedIn3/postings');
  assert.equal(url.searchParams.get('country'),'ie');assert.equal(url.searchParams.get('destination'),'PUBLIC');assert.equal(url.searchParams.get('limit'),'100');
  return JSON.stringify({totalFound:101,content:url.searchParams.get('offset')==='0'?Array.from({length:100},(_,i)=>linkedInPosting(i)):[linkedInPosting(100)]});
 });
 const parsed=parseFeed(source,feed);assert.equal(parsed.jobs.length,101);assert.equal(parsed.partial,false);assert.equal(calls.length,2);assert.equal(calls[1].searchParams.get('offset'),'100');
 const first=parsed.jobs[0];assert.equal(first.id,'linkedin-744000150000000');assert.equal(first.url,'https://jobs.smartrecruiters.com/LinkedIn3/744000150000000');assert.match(first.location,/Ireland.*Hybrid/);assert.equal(first.listingDate,'2026-09-17T13:56:35.890Z');assert.equal(first.summaryOnly,true);
});
test('LinkedIn failures and invalid rows never become a successful empty Ireland snapshot',async()=>{
 const source=companySource({name:'LinkedIn',url:'https://careers.linkedin.com/'});
 const valid=linkedInPosting(0);
 const unexpected=[{...valid,id:'../secret'},{...valid,visibility:'INTERNAL'},{...valid,company:{identifier:'Other'}},{...valid,location:{city:'Dublin',country:'us'}},{...valid,location:{country:123}}];
 const partial=parseFeed(source,await loadCompanyFeed(source,async()=>JSON.stringify({totalFound:6,content:[valid,...unexpected]})));
 assert.equal(partial.jobs.length,1);assert.equal(partial.partial,true);
 await assert.rejects(loadCompanyFeed(source,async()=>JSON.stringify({totalFound:5,content:unexpected})),/readable public jobs feed/);
 await assert.rejects(loadCompanyFeed(source,async()=>'{"content":[]}'),/readable public jobs feed/);
 const interrupted=parseFeed(source,await loadCompanyFeed(source,async input=>{if(new URL(input).searchParams.get('offset')!=='0')throw Error('offline');return JSON.stringify({totalFound:101,content:Array.from({length:100},(_,i)=>linkedInPosting(i))});}));
 assert.equal(interrupted.jobs.length,100);assert.equal(interrupted.partial,true);
 const empty=parseFeed(source,await loadCompanyFeed(source,async()=>'{"totalFound":0,"content":[]}'));assert.equal(empty.jobs.length,0);assert.equal(empty.partial,false);
});
test('board links become canonical feeds; unknown HTML never enters the feed fetcher',async()=>{
 assert.equal(companySource({name:'Example',url:'https://jobs.eu.lever.co/example/123'}).url,'https://api.eu.lever.co/v0/postings/example?mode=json');
 assert.equal(companySource({name:'Example',url:ashby.jobUrl}).id,'ashby-example');
 assert.equal(companySource({name:'Example',url:'https://boards.greenhouse.io/embed/job_board?for=example'}).board,'example');
 let calls=0;
 for(const url of ['https://example.com/careers','https://jobs.ashbyhq.com.evil.example/example']){
  const r=await probeCompany({name:'Example',url},[],async()=>{calls++;throw Error('must not fetch');},async url=>({url,html:'<h1>Careers</h1>'}));assert.equal(r.status,'unsupported');
 }
 assert.equal(calls,0);
 for(const url of ['https://127.0.0.1/jobs','http://jobs.lever.co/example','https://api.lever.co:8443/jobs'])assert.throws(()=>companySource({name:'Example',url}));
 await assert.rejects(getPublicPage('https://api.lever.co:8443/jobs'));
 const restored=validateSourcePreferences({custom:[{name:'Example',home:'https://jobs.ashbyhq.com/example',url:'https://evil.example',adapter:'custom'}],disabled:[]});
 assert.equal(restored.custom[0].url,'https://api.ashbyhq.com/posting-api/job-board/example?includeCompensation=true');
});
test('Ashby excludes unlisted postings and reports unreadable listings as partial',async()=>{
 const source=companySource({name:'Example',url:'https://jobs.ashbyhq.com/example'});
 const body=await loadCompanyFeed(source,async()=>JSON.stringify({jobs:[ashby,{...ashby,jobUrl:ashby.jobUrl+'x',isListed:false},{...ashby,title:null}]}));
 const parsed=parseFeed(source,body);assert.equal(parsed.jobs.length,1);assert.equal(parsed.skipped,1);
 const probe=await probeCompany({name:'Example',url:source.home},[],async()=>JSON.stringify({jobs:[ashby,{...ashby,title:null}]}));
 assert.equal(probe.status,'partial');
 await assert.rejects(probeCompany({name:'Example',url:source.home},[],async()=>{throw new Error('The employer returned HTTP 403.');}),/blocks automated access/);
 const empty=await probeCompany({name:'Example',url:source.home},[],async()=>'{"jobs":[]}');assert.equal(empty.status,'connected');assert.equal(empty.feed.jobs.length,0);
});
test('Lever follows all pages, handles EU boards and keeps partial results on later failures',async()=>{
 const source=companySource({name:'Example',url:'https://jobs.eu.lever.co/example'}),calls=[];
 const posting=i=>({id:`job-${i}`,text:'Support Engineer',hostedUrl:`https://jobs.eu.lever.co/example/job-${i}`,descriptionPlain:'Help customers use our software.',categories:{location:'Dublin, Ireland'}});
 const parsed=parseFeed(source,await loadCompanyFeed(source,async url=>{
  const u=new URL(url);calls.push(u);return JSON.stringify(u.searchParams.get('skip')==='0'?Array.from({length:100},(_,i)=>posting(i)):[posting(100)]);
 }));
 assert.equal(parsed.jobs.length,101);assert.equal(parsed.partial,false);assert.equal(calls.length,2);assert.equal(calls[1].hostname,'api.eu.lever.co');assert.equal(calls[1].searchParams.get('skip'),'100');
 const partial=parseFeed(source,await loadCompanyFeed(source,async url=>{if(new URL(url).searchParams.get('skip')!=='0')throw Error('offline');return JSON.stringify(Array.from({length:100},(_,i)=>posting(i)));}));
 assert.equal(partial.partial,true);assert.equal(partial.jobs.length,100);
});
test('Mastercard uses official Ireland facets, paginates, preserves IDs and imports full descriptions',async()=>{
 const source=companySource({name:'Mastercard',url:'https://careers.mastercard.com/us/en/dublin-ireland'}),calls=[];
 const job=i=>({title:'Support Engineer',externalPath:`/job/Dublin-Ireland/Support-Engineer_R-${100+i}`,locationsText:i===20?'2 Locations':'Dublin, Ireland'});
 const feed=async(url,options)=>{
  assert.ok(url.startsWith('https://mastercard.wd1.myworkdayjobs.com/'));const body=JSON.parse(options.body);calls.push(body);
  if(!body.appliedFacets.locations)return JSON.stringify({total:1000,jobPostings:[],facets:[{facetParameter:'locationMainGroup',values:[{facetParameter:'locations',values:[{id:'irish',descriptor:'Dublin, Ireland'},{id:'uk',descriptor:'Belfast, Northern Ireland'}]}]}]});
  assert.deepEqual(body.appliedFacets,{locations:['irish']});
  return JSON.stringify({total:21,jobPostings:body.offset===0?Array.from({length:20},(_,i)=>job(i)):[job(20)]});
 };
 const result=await createDiscovery({sources:[source],fetchPage:feed}).search({query:'support',location:'Ireland',hideSenior:false,includeRemote:true},{},[]);
 assert.equal(result.sources[0].status,'live');assert.equal(result.scanned,21);assert.equal(result.total,21);assert.equal(result.sources[0].partial,false);
 assert.equal(result.jobs[0].id,'mastercard-R-100');assert.equal(calls.length,3);
 const detail=await importJob(result.jobs[0].url,async url=>{assert.match(url,/\/wday\/cxs\/mastercard\/CorporateCareers\/job\//);return JSON.stringify({jobPostingInfo:{title:'Support Engineer',location:'Dublin, Ireland',additionalLocations:['London, UK'],jobDescription:'<p>Help customers use our software.</p>'}});});
 assert.equal(detail.description,'Help customers use our software.');
 const broken=await createDiscovery({sources:[source],fetchPage:async()=>'{"total":1000,"jobPostings":[]}'}).search({query:'support',location:'Ireland',hideSenior:false,includeRemote:true},{},[]);
 assert.equal(broken.sources[0].status,'unavailable','a missing location facet is not a zero-vacancy result');
});

test('Yahoo careers links use its public Workday Ireland feed and preserve vacancy identity',async()=>{
 const source=companySource({name:'Yahoo',url:'https://www.yahooinc.com/careers/search.html'});
 assert.equal(source.type,'company');
 assert.equal(companySource({name:'Yahoo',url:'https://ouryahoo.wd5.myworkdayjobs.com/en-US/careers'}).id,source.id);
 const calls=[];
 const fetchPage=async(url,options)=>{
  assert.equal(url,'https://ouryahoo.wd5.myworkdayjobs.com/wday/cxs/ouryahoo/careers/jobs');
  const body=JSON.parse(options.body);calls.push(body);
  if(!body.appliedFacets.locations)return JSON.stringify({total:104,jobPostings:[],facets:[{facetParameter:'locationMainGroup',values:[{facetParameter:'locations',values:[{id:'ireland',descriptor:'Ireland'},{id:'uk',descriptor:'United Kingdom'}]}]}]});
  assert.deepEqual(body.appliedFacets,{locations:['ireland']});
  return JSON.stringify({total:1,jobPostings:[{title:'Software Engineer',externalPath:'/job/Ireland/Software-Engineer_JR0027435',locationsText:'Ireland',bulletFields:['JR0027435']}]});
 };
 const parsed=parseFeed(source,await loadCompanyFeed(source,fetchPage));
 assert.equal(parsed.jobs[0].id,'yahoo-JR0027435');assert.equal(parsed.partial,false);
 assert.equal(parsed.jobs[0].url,'https://ouryahoo.wd5.myworkdayjobs.com/en-US/careers/job/Ireland/Software-Engineer_JR0027435');
 assert.equal(calls.length,2);
 await assert.rejects(loadCompanyFeed(source,async()=>'{"total":104,"jobPostings":[]}'),/readable public jobs feed/);
});

test('unsupported connections explain the missing feed rather than promising a pending check',async()=>{
 const generic=await probeCompany({name:'Unknown',url:'https://example.org/careers'},[],undefined,async url=>({url,html:'<h1>Careers</h1>'}));
 assert.match(generic.message,/Greenhouse, Lever, Ashby, Workday or SmartRecruiters/);
 const linkedin=await probeCompany({name:'LinkedIn',url:'https://www.linkedin.com/jobs/search/'});
 assert.match(linkedin.message,/LinkedIn job-search/);
 assert.match(linkedin.message,/employer/);
});

test('saved links move out of the unconnected list when their canonical feed becomes supported',()=>{
 const companies=[{id:'yahoo',name:'Yahoo',url:'https://www.yahooinc.com/careers/search.html',supported:true}];
 const requests=[{name:'Yahoo',url:'https://www.yahooinc.com/careers/search.html',connected:true},{name:'LinkedIn',url:'https://www.linkedin.com/jobs/search/',connected:false}];
 const legacy=[{name:'Yahoo old board',home:'https://ouryahoo.wd5.myworkdayjobs.com/en-US/careers'},{name:'LinkedIn',home:'https://www.linkedin.com/jobs/search/'}];
 const result=unconnectedCompanyLinks(companies,requests,legacy);
 assert.equal(result.length,1);assert.equal(result[0].name,'LinkedIn');assert.equal(result[0].ready,false);
 assert.match(result[0].message,/LinkedIn job-search/);
 const supported=unconnectedCompanyLinks([],[],[{name:'New board',home:'https://jobs.lever.co/example'}]);
 assert.equal(supported[0].ready,true);
});
