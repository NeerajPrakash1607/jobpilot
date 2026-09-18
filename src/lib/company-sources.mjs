import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';

import { AppError, object, text, publicUrl } from './domain.mjs';

const ttl=30*60_000;
export const REQUESTED_COMPANIES=[
  {id:'amazon',name:'Amazon',type:'company',adapter:'amazon',home:'https://www.amazon.jobs/en/locations/dublin-ireland',scope:'Ireland',ttl},
  {id:'mastercard',name:'Mastercard',type:'company',adapter:'mastercard',home:'https://careers.mastercard.com/us/en/dublin-ireland',scope:'Ireland · official Workday board',ttl},
  {id:'anpost',name:'An Post',type:'company',adapter:'anpost',home:'https://www.anpost.com/Working-with-An-Post/Careers',scope:'Ireland',ttl},
  {id:'novartis',name:'Novartis',type:'company',adapter:'novartis',home:'https://www.novartis.com/ie-en/careers/career-search',scope:'Ireland',ttl},
  {id:'yahoo',name:'Yahoo',type:'company',adapter:'yahoo',home:'https://www.yahooinc.com/careers/search.html',scope:'Ireland · official Workday board',ttl},
  {id:'linkedin',name:'LinkedIn',type:'company',adapter:'linkedin',home:'https://careers.linkedin.com/',scope:'Ireland · LinkedIn employer vacancies',ttl},
].map(source=>({...source,url:source.home}));

export function companySource(input){
  object(input);
  const name=text(input.name,120,true),url=new URL(publicUrl(text(input.url,2048,true)));
  if(url.protocol!=='https:'||url.port||/^[\d.]+$/.test(url.hostname))throw new AppError('Use the company’s public HTTPS careers link.');
  if(url.hostname==='mastercard.wd1.myworkdayjobs.com')return {...REQUESTED_COMPANIES.find(s=>s.id==='mastercard')};
  if(url.hostname==='ouryahoo.wd5.myworkdayjobs.com')return {...REQUESTED_COMPANIES.find(s=>s.id==='yahoo')};
  const known=REQUESTED_COMPANIES.find(source=>new URL(source.home).hostname.replace(/^www\./,'')===url.hostname.replace(/^www\./,''));
  if(known)return {...known};
  const parts=url.pathname.split('/').filter(Boolean);
  if(['careers.smartrecruiters.com','jobs.smartrecruiters.com'].includes(url.hostname)&&parts[0]?.toLowerCase()==='linkedin3')return {...REQUESTED_COMPANIES.find(s=>s.id==='linkedin')};
  const greenhouse=['boards.greenhouse.io','job-boards.greenhouse.io'].includes(url.hostname);
  const board=greenhouse&&parts[0]==='embed'?url.searchParams.get('for'):parts[0];
  if(greenhouse&&/^[-a-zA-Z0-9_]{1,100}$/.test(board||''))return {id:`greenhouse-${board}`,name,type:'greenhouse',board,url:`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`,home:`https://job-boards.greenhouse.io/${board}`,ttl};
  if(/^[-a-zA-Z0-9_]{1,100}$/.test(parts[0]||'')){
    if(['jobs.lever.co','jobs.eu.lever.co'].includes(url.hostname)){
      const region=url.hostname==='jobs.eu.lever.co'?'eu':'global';
      return {id:`lever-${region}-${parts[0]}`,name,type:'company',adapter:'lever',board:parts[0],home:`https://${url.hostname}/${parts[0]}`,url:`https://${region==='eu'?'api.eu.lever.co':'api.lever.co'}/v0/postings/${parts[0]}?mode=json`,scope:'Lever public job board',ttl};
    }
    if(url.hostname==='jobs.ashbyhq.com')return {id:`ashby-${parts[0]}`,name,type:'company',adapter:'ashby',board:parts[0],home:`https://jobs.ashbyhq.com/${parts[0]}`,url:`https://api.ashbyhq.com/posting-api/job-board/${parts[0]}?includeCompensation=true`,scope:'Ashby public job board',ttl};
  }
  // Other official career pages can be kept in the company list without claiming an automatic feed.
  url.hash='';url.search='';
  return {id:`website-${bytesToHex(sha256(new TextEncoder().encode(url.href))).slice(0,16)}`,name,type:'website',home:url.href,url:url.href,ttl};
}

export function unsupportedSourceReason(source){
  const host=new URL(source.home).hostname;
  if(host==='linkedin.com'||host.endsWith('.linkedin.com'))return 'JobPilot does not import LinkedIn job-search pages. Add the employer’s own Greenhouse, Lever or Ashby board link instead, or browse this link on LinkedIn.';
  return source.note||'This careers site has no automatic connector in JobPilot. Use its Greenhouse, Lever or Ashby board link if available. Saving a link alone does not start syncing.';
}

export function unconnectedCompanyLinks(companies,requests=[],legacy=[]){
  const entries=new Map();
  const candidates=[...companies.filter(c=>!c.supported),...requests.filter(r=>!r.connected),...legacy.map(c=>({name:c.name,url:c.home}))];
  for(const item of candidates){
    const source=companySource(item);
    if(companies.some(c=>c.supported&&(c.id===source.id||c.url===source.home)))continue;
    const ready=source.type!=='website';
    entries.set(source.id,{name:source.name,url:source.home,ready,message:ready?'This board is supported. Check and connect it to start syncing.':unsupportedSourceReason(source)});
  }
  return [...entries.values()];
}

export function sourceCatalog(defaults,preferences={}){
  const seen=new Set();
  const unique=[...defaults,...(preferences.custom||[])].filter(source=>{if(seen.has(source.url))return false;seen.add(source.url);return true;});
  return unique.map(source=>({...source,enabled:!(preferences.disabled||[]).includes(source.id),custom:!defaults.some(item=>item.url===source.url)}));
}
export function validateSourcePreferences(input){
  object(input);
  if(!Array.isArray(input.custom)||input.custom.length>50||!Array.isArray(input.disabled)||input.disabled.length>100)throw new AppError('Invalid saved company sources.');
  const custom=input.custom.map(item=>{object(item);return companySource({name:item.name,url:item.home||item.url});});
  if(new Set(custom.map(item=>item.id)).size!==custom.length)throw new AppError('Duplicate company sources.');
  const disabled=input.disabled.map(id=>text(id,120,true));
  return {custom,disabled};
}
