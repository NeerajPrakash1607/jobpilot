import {AppError,publicUrl} from './domain.mjs';
const hosts=new Set(['api.smartrecruiters.com','boards-api.greenhouse.io','boards.greenhouse.io','job-boards.greenhouse.io','jobs.lever.co','jobs.eu.lever.co','api.lever.co','api.eu.lever.co','jobs.ashbyhq.com','api.ashbyhq.com','stripe.com','www.stripe.com','www.amazon.jobs','amazon.jobs','careers.mastercard.com','mastercard.wd1.myworkdayjobs.com','ouryahoo.wd5.myworkdayjobs.com','www.anpost.com','www.anpost.ie','www.novartis.com','remotive.com','fa-ewnd-saasfaprod1.fa.ocs.oraclecloud.com']);
export async function getPublicPage(input,redirects=0,maxBytes=2_000_000,{method='GET',body,headers={},cacheTtl=0}={}){
  const url=new URL(publicUrl(input));
  if(url.protocol!=='https:'||url.port||!hosts.has(url.hostname))throw new AppError('Use the browser companion to import this careers page, or paste its job description. This site is not connected to online imports.',422);
  const response=await fetch(url,{method,body,headers:{Accept:'application/json,text/html',...headers},redirect:'manual',signal:AbortSignal.timeout(15000),...(method==='GET'&&cacheTtl>0?{cf:{cacheEverything:true,cacheTtlByStatus:{'200-299':cacheTtl,'300-599':0}}}:{})});
  if(response.status>=300&&response.status<400&&response.headers.get('location')){
    if(redirects>=3||method!=='GET')throw new AppError('Open the careers page in your browser to import this listing.',422);
    return getPublicPage(new URL(response.headers.get('location'),url).href,redirects+1,maxBytes,{cacheTtl});
  }
  if(!response.ok)throw new AppError(`The employer returned HTTP ${response.status}. Try later or import the page with the companion.`,422);
  const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,output='';
  while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>maxBytes){await reader.cancel();throw new AppError('This listing feed is too large. Narrow your search on the employer website.',422);}output+=decoder.decode(value,{stream:true});}
  return output+decoder.decode();
}
