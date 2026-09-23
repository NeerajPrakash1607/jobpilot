import { AppError, stripHtml } from './domain.mjs';
import {loadMastercard,loadYahoo,loadFidelity,loadLinkedIn,loadLever,loadAshby,loadSmartRecruiters,loadWorkdayIreland} from './ats-feeds.mjs';
const plain=value=>stripHtml(stripHtml(typeof value==='string'?value:''));
const fail=name=>new AppError(`${name} changed its careers page. Open the official site to check vacancies.`,502);
const root='https://fa-ewnd-saasfaprod1.fa.ocs.oraclecloud.com';

export function parseNovartis(html){
  const total=Number(html.match(/Showing\s+([\d,]+)\s+results/i)?.[1]?.replaceAll(',',''));
  if(!Number.isFinite(total)||!html.includes('views-field-field-job-title')){if(total===0)return {total,jobs:[]};throw fail('Novartis');}
  const jobs=[];
  for(const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);
    const link=cells[0]?.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if(!link)continue;
    const id=link[1].match(/\/(req-\d+)-/i)?.[1];if(!id)continue;
    jobs.push({id,title:plain(link[2]),company:'Novartis',url:new URL(link[1],'https://www.novartis.com').href,location:`${plain(cells[3])}, ${plain(cells[2])}`,description:plain(cells[1]),listingDate:plain(cells[4]),summaryOnly:true});
  }
  return {total,jobs};
}
export function parseAnPost(body){
  const data=JSON.parse(body).items?.[0];if(!data||!Array.isArray(data.requisitionList)||!Number.isFinite(data.TotalJobsCount))throw fail('An Post');
  return {total:data.TotalJobsCount,jobs:data.requisitionList.map(raw=>({id:raw.Id,title:raw.Title,company:'An Post',url:`${root}/hcmUI/CandidateExperience/en/sites/CX_2001/job/${raw.Id}`,location:raw.PrimaryLocation,description:[raw.ShortDescriptionStr,raw.ExternalResponsibilitiesStr,raw.ExternalQualificationsStr].map(plain).filter(Boolean).join('\n\n')||raw.Title,listingDate:raw.PostedDate,summaryOnly:true}))};
}
export function parseAmazon(body){
  const data=JSON.parse(body);
  if(!Array.isArray(data.searchHits)||!Number.isFinite(data.found))throw fail('Amazon');
  return {total:data.found,jobs:data.searchHits.map(({fields:f})=>({id:f.icimsJobId?.[0],title:f.title?.[0],company:'Amazon',url:`https://www.amazon.jobs/en/jobs/${f.icimsJobId?.[0]}`,location:f.normalizedLocation?.[0]?.replace(/\bIRL\b/g,'Ireland')||[f.city?.[0],f.region?.[0],f.countryIso3a?.[0]==='IRL'?'Ireland':f.countryIso3a?.[0]].filter(Boolean).join(', '),description:plain(f.description?.[0]),listingDate:f.updatedDate?.[0],summaryOnly:false}))};
}
export async function loadCompanyFeed(source,fetchPage){
  if(source.adapter==='smartrecruiters')return loadSmartRecruiters(source,fetchPage);
  if(source.adapter==='workday')return loadWorkdayIreland(source,fetchPage);
  if(source.adapter==='mastercard')return loadMastercard(fetchPage);
  if(source.adapter==='yahoo')return loadYahoo(fetchPage);
  if(source.adapter==='fidelity')return loadFidelity(fetchPage);
  if(source.adapter==='linkedin')return loadLinkedIn(fetchPage);
  if(source.adapter==='lever')return loadLever(source,fetchPage);
  if(source.adapter==='ashby')return loadAshby(source,fetchPage);
  let first,load,pageSize,maxPages=10;
  if(source.adapter==='anpost'){
    pageSize=25;load=async offset=>parseAnPost(await fetchPage(`${root}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=CX_2001,limit=${pageSize},offset=${offset}`));
  }else if(source.adapter==='novartis'){
    pageSize=10;load=async offset=>parseNovartis(await fetchPage(`https://www.novartis.com/ie-en/careers/career-search?country%5B0%5D=LOC_IE&sort=asc&order=Job%20Title&page=${offset/pageSize}`));
  }else if(source.adapter==='amazon'){
    pageSize=100;
    const html=await fetchPage(source.home);
    const serialized=html.match(/<script id="jobs-cms-next-data"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    const config=serialized?JSON.parse(serialized).props:null;
    if(!config?.searchKey||config.searchEndpoint!=='/api/jobs/search')throw fail('Amazon');
    load=async start=>{
      const body={accessLevel:'EXTERNAL',contentFilterFacets:[],excludeFacets:[{name:'isConfidential',values:[{name:'1'}]},{name:'businessCategory',values:[{name:'a-confidential-job'}]}],filterFacets:[],includeFacets:[],jobTypeFacets:[],locationFacets:[[{name:'country',requestedFacetCount:9999,values:[{name:'IE'}]},{name:'normalizedStateName',requestedFacetCount:9999},{name:'normalizedCityName',requestedFacetCount:9999}]],query:'',size:pageSize,start,treatment:'OM',cookieInfo:'',sort:{sortOrder:'DESCENDING',sortType:'CREATED_DATE'}};
      return parseAmazon(await fetchPage('https://www.amazon.jobs/api/jobs/search?is_als=true',{method:'POST',headers:{'Content-Type':'application/json','X-Api-Key':config.searchKey},body:JSON.stringify(body)}));
    };
  }else throw fail(source.name);
  first=await load(0);const jobs=[...first.jobs];
  for(let page=1;page<maxPages&&page*pageSize<first.total;page++){
    try{const next=await load(page*pageSize);if(!next.jobs.length)break;jobs.push(...next.jobs);}catch{break;}
  }
  const unique=[...new Map(jobs.map(job=>[job.id,job])).values()];
  return JSON.stringify({jobs:unique,total:first.total,partial:unique.length<first.total,scope:source.scope});
}
