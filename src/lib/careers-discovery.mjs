import {AppError,publicUrl} from './domain.mjs';
import {companySource} from './company-sources.mjs';

const blockedHost=/(^|\.)(localhost|local|internal|test|example|invalid|onion|home|lan|arpa)$/i;
export function discoveryUrl(input){
 const url=new URL(publicUrl(input));
 if(url.protocol!=='https:'||url.port||blockedHost.test(url.hostname)||!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname))throw new AppError('Use a public HTTPS careers page.',422);
 url.hash='';return url;
}
export function isPublicAddress(address){
 if(typeof address!=='string')return false;
 if(address.includes(':')){
  // Only global unicast IPv6; exclude transition and documentation ranges as well.
  return /^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:(?:0{0,3}[01]?[0-9a-f]{1,2}:|0?db8:)/i.test(address)&&!/^2002:|^3fff:/i.test(address)&&!address.includes('.');
 }
 const parts=address.split('.');if(parts.length!==4||parts.some(p=>!/^\d{1,3}$/.test(p)||Number(p)>255))return false;
 const [a,b,c]=parts.map(Number);
 return a>0&&a<224&&a!==10&&a!==127&&!(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0||b===88&&c===99))&&!(a===198&&(b===18||b===19||b===51&&c===100))&&!(a===203&&b===0&&c===113);
}
async function boundedText(response,maxBytes){
 const reader=response.body?.getReader();if(!reader)return '';
 const decoder=new TextDecoder();let bytes=0,result='';
 try{
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes)throw new AppError('This careers page is too large to inspect. Paste its direct vacancies-board link.',422);result+=decoder.decode(value,{stream:true});}
  return result+decoder.decode();
 }finally{await reader.cancel();}
}
async function publicDns(host,request,signal){
 const responses=await Promise.all(['A','AAAA'].map(async type=>{
  const r=await request(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,{headers:{Accept:'application/dns-json'},redirect:'error',signal});
  if(!r.ok)throw new AppError('Could not verify this careers-page address. Try again later.',422);
  const data=JSON.parse(await boundedText(r,64000));if(data.Status!==0)throw new AppError('This careers-page address could not be resolved.',422);
  return Array.isArray(data.Answer)?data.Answer:[];
 }));
 const answers=responses.flat(),addresses=answers.filter(r=>r.type===1||r.type===28);
 if(!addresses.length||addresses.some(r=>!isPublicAddress(r.data)))throw new AppError('Only public careers-page addresses can be checked.',422);
 for(const r of answers.filter(r=>r.type===5))discoveryUrl('https://'+String(r.data).replace(/\.$/,'')+'/');
}
// Separate from the feed fetcher: HTML discovery cannot widen the job-feed allowlist.
// This runs on Workers' public Internet egress, with no private-network bindings,
// cookies, authorization headers, JavaScript execution or forwarded user headers.
export async function getCareersPage(input,{request=fetch,signal=AbortSignal.timeout(20000)}={}){
 let url=discoveryUrl(input);
 for(let hop=0;hop<=3;hop++){
  await publicDns(url.hostname,request,signal);
  const response=await request(url.href,{method:'GET',headers:{Accept:'text/html,application/xhtml+xml'},redirect:'manual',credentials:'omit',signal});
  if(response.status>=300&&response.status<400){
   const next=response.headers.get('location');await response.body?.cancel();
   if(!next||hop===3)throw new AppError('This careers page redirects too many times. Paste the final vacancies-page link.',422);
   url=discoveryUrl(new URL(next,url).href);
   if(companySource({name:'Careers',url:url.href}).type!=='website')return {url:url.href,html:''};
   continue;
  }
  if(!response.ok){await response.body?.cancel();throw new AppError(`The careers page returned HTTP ${response.status}.`,422);}
  if(!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw new AppError('Paste an HTML careers page or a supported job-board link.',422);}
  return {url:url.href,html:await boundedText(response,1_000_000)};
 }
}
function decode(value){
 return value.replace(/\\\//g,'/').replace(/\\u0026/gi,'&').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,hex,decimal)=>{const n=parseInt(hex||decimal,hex?16:10);return n>0&&n<0x110000?String.fromCodePoint(n):'';});
}
export function careersLinks(html,pageUrl,name){
 const boards=new Map(),pages=new Set(),base=new URL(pageUrl);
 // Read links/embeds plus literal provider URLs in script configuration. Never execute page code.
 const values=[...html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]);
 const decoded=decode(html);
 values.push(...[...decoded.matchAll(/https:\/\/(?:[\w.-]+\.)?(?:greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|myworkdaysite\.com|smartrecruiters\.com)\/[^\s"'<>\\]+/gi)].map(m=>m[0]));
 for(const value of values.slice(0,1500)){
  let url,source;try{url=discoveryUrl(new URL(decode(value),base).href);source=companySource({name,url:url.href});}catch{continue;}
  if(source.type!=='website'){boards.set(source.id,source);continue;}
  if(url.origin===base.origin&&/\b(job|jobs|career|careers|vacancies|positions|opportunities)\b/i.test(url.pathname)&&!/(login|sign-?in|apply|privacy|cookie|terms)/i.test(url.pathname))pages.add(url.href);
 }
 return {boards:[...boards.values()],pages:[...pages]};
}
export async function discoverCompany(source,fetchPage=getCareersPage){
 if(/(^|\.)linkedin\.com$/.test(new URL(source.home).hostname))return {kind:'missing'};
 const queue=[source.home],seen=new Set(),boards=new Map(),signal=AbortSignal.timeout(20000);let failure;
 while(queue.length&&seen.size<3){
  const url=queue.shift();if(seen.has(url))continue;seen.add(url);
  try{
   const page=await fetchPage(url,{signal}),redirected=companySource({name:source.name,url:page.url});
   if(redirected.type!=='website')boards.set(redirected.id,redirected);
   const links=careersLinks(page.html,page.url,source.name);
   for(const board of links.boards)boards.set(board.id,board);
   if(boards.size)break;
   queue.push(...links.pages.filter(link=>!seen.has(link)).slice(0,2));
  }catch(error){failure=error;if(signal.aborted)break;}
 }
 if(boards.size>1)return {kind:'ambiguous',message:'This page links to several job boards. Open the vacancies page for the company you want and paste that board’s link.'};
 if(boards.size===1)return {kind:'found',source:[...boards.values()][0]};
 if(failure)return {kind:'unavailable',message:/HTTP (401|403|429)/.test(failure.message)?'This careers page requires access or limits automated requests. Paste its direct public job-board link, or open it in your browser.':'We could not inspect this careers page. Try again or paste its direct public job-board link.'};
 return {kind:'missing'};
}
