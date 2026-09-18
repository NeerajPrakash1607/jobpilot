import {AppError} from './domain.mjs';
import {companySource,unsupportedSourceReason} from './company-sources.mjs';
import {parseFeed} from './discovery.mjs';
import {loadCompanyFeed} from './company-feeds.mjs';
import {getPublicPage} from './public-fetch.mjs';

export function connectionError(error){
 if(/HTTP (403|401)/.test(error?.message||''))return 'The employer blocks automated access. Open its careers page; automatic checks are unavailable.';
 if(/HTTP 404/.test(error?.message||''))return 'This job board could not be found. Check the company’s board link.';
 return 'The employer feed could not be refreshed. Try again later or open its careers page.';
}
export async function probeCompany(input,catalog=[],fetchPage=getPublicPage){
 const candidate=companySource(input),source=catalog.find(s=>s.id===candidate.id||s.url===candidate.url)||candidate;
 if(source.type==='website')return {source,status:'unsupported',message:unsupportedSourceReason(source)};
 try{
  const fetchSource=(url,options={})=>fetchPage(url,0,16000000,{cacheTtl:1800,...options});
  const raw=source.type==='company'?await loadCompanyFeed(source,fetchSource):await fetchSource(source.url);
  const feed=parseFeed(source,raw);
  return {source,feed,status:feed.partial||feed.skipped?'partial':'connected'};
 }catch(error){throw new AppError(connectionError(error),422);}
}
