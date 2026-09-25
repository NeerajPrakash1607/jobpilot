import {createDiscovery,validateSearch,SOURCES} from './lib/discovery.mjs';
import {sourceCatalog,validateSourcePreferences} from './lib/company-sources.mjs';
import {importJob} from './lib/importer.mjs';
import {AppError,text,object} from './lib/domain.mjs';
import {watchApi,unsubscribePage} from './lib/watch-api.mjs';
import {probeCompany} from './lib/company-connections.mjs';
const finders=new Map();
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function finder(preferences){const key=JSON.stringify(preferences);if(!finders.has(key)){if(finders.size>=1)finders.delete(finders.keys().next().value);finders.set(key,createDiscovery({getSources:()=>sourceCatalog(SOURCES,preferences)}));}return finders.get(key);}
const policy="default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com/gsi/client; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' blob: https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/watch-api/'))return watchApi(request,env);
  if(url.pathname==='/unsubscribe')return unsubscribePage(request,env);
  if(!url.pathname.startsWith('/public-api/')){
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
    const response=await env.ASSETS.fetch(request),result=new Response(response.body,response);
    result.headers.set('Content-Security-Policy',policy);result.headers.set('Referrer-Policy','strict-origin-when-cross-origin');result.headers.set('Cross-Origin-Opener-Policy','same-origin-allow-popups');result.headers.set('X-Content-Type-Options','nosniff');return result;
  }
  try{
    if(request.method!=='POST'||request.headers.get('X-JobPilot')!=='1'||(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin))throw new AppError('Open JobPilot to search.',403);
    // Only public job queries and source preferences cross this boundary, never profiles or résumés.
    const reader=request.body?.getReader();let raw='',size=0;const decoder=new TextDecoder();
    if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw new AppError('Search request too large.',413);}raw+=decoder.decode(value,{stream:true});}
    raw+=decoder.decode();
    let data;try{data=object(JSON.parse(raw));}catch{throw new AppError('Invalid search request.');}
    const preferences=validateSourcePreferences(data.preferences||{custom:[],disabled:[]});
    let result;
    if(url.pathname==='/public-api/connect'){
      const connection=await probeCompany(data,SOURCES);
      result={source:connection.source,status:connection.status,count:connection.feed?.jobs.length||0,message:connection.message};
    }
    else if(url.pathname==='/public-api/discover')result=await finder(preferences).search(validateSearch(data.search),{},[]);
    else if(url.pathname==='/public-api/resolve')result=await finder(preferences).resolve(text(data.id,250,true));
    else if(url.pathname==='/public-api/import')result=await importJob(text(data.url,2048,true));
    else throw new AppError('Not found.',404);
    return new Response(JSON.stringify(result),{headers});
  }catch(error){return new Response(JSON.stringify({error:error instanceof AppError?error.message:'The job source is temporarily unavailable. Try again shortly.'}),{status:error instanceof AppError?error.status:503,headers});}
}};
