import {withWorkspace} from './workspace.mjs';
import {AppError,text,object,canonicalUrl} from './domain.mjs';
import {fromBase64,toBase64} from './browser-store.mjs';
import {validateTailorRequest,generateResume,validateResumeDraft,analyzeResume,resumeFilename} from './resume-tailor.mjs';
import {companySource,sourceCatalog} from './company-sources.mjs';
import {SOURCES,defaultSearch,validateSearch,rankJobs} from './discovery.mjs';
const preferences=store=>store.getSetting('companySources')||{custom:[],disabled:[]};
const companies=store=>sourceCatalog(SOURCES,preferences(store));
async function remote(route,data){const response=await fetch('/public-api'+route,{method:'POST',headers:{'Content-Type':'application/json','X-JobPilot':'1'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new AppError(result.error,response.status);return result;}
export async function api(route,data,method=data?'POST':'GET'){
  if(route==='/discover/sources'&&method==='POST'){
    const candidate=companySource(data);
    await withWorkspace(store=>{if(companies(store).some(s=>s.id===candidate.id||s.url===candidate.url))throw new AppError('This company is already listed.',409);});
    const connection=await remote('/connect',data);
    return withWorkspace(store=>{
      const prefs=preferences(store);
      if(prefs.custom.length>=50)throw new AppError('You can add up to 50 custom companies.');
      if(!companies(store).some(s=>s.id===connection.source.id||s.url===connection.source.url))prefs.custom.push(connection.source);
      store.setSetting('companySources',prefs);return {companies:companies(store),connection};
    });
  }
  if(route==='/discover'&&method==='POST'){
    const search=validateSearch(data),own=await withWorkspace(store=>{store.setSetting('search',search);return {preferences:preferences(store),profile:store.getSetting('profile'),jobs:store.jobs()};});
    const result=await remote('/discover',{search,preferences:own.preferences});return {...result,jobs:rankJobs(result.jobs,search,own.profile,own.jobs).slice(0,100)};
  }
  if(route==='/discover/save'){
    const fields=await remote('/resolve',{id:text(data.id,250,true),preferences:await withWorkspace(preferences)});
    return withWorkspace(store=>{const existing=store.jobs().find(job=>canonicalUrl(job.url)===canonicalUrl(fields.url));return {job:existing||store.add(fields),alreadySaved:!!existing};});
  }
  if(route==='/watch/save'&&method==='POST')return withWorkspace(store=>store.jobs().find(job=>canonicalUrl(job.url)===canonicalUrl(data.url))||store.add(data));
  if(route==='/import')return remote('/import',{url:text(data.url,2048,true)});
  if(route==='/resume'&&method==='POST'){
    const bytes=fromBase64(text(data.base64,11_000_000,true)),name=text(data.name,200,true).replace(/[^\w .-]/g,'_');
    if(bytes.length>8_000_000||new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw new AppError('Choose a PDF under 8 MB.');
    const {readResume}=await import('./browser-documents.mjs');const extracted=await readResume(bytes.slice());
    return withWorkspace(store=>{store.putResume(name,bytes,extracted);return {characters:extracted.length,warning:extracted.length<80?'Little selectable text was found. Paste the résumé text in Your profile.':null};});
  }
  if(route==='/tailor/export'){
    const draft=await withWorkspace(store=>checkedDraft(store,data));
    const {exportResume}=await import('./browser-documents.mjs');return {blob:await exportResume(draft.resumeText,data.format),name:resumeFilename(draft,data.format)};
  }
  return withWorkspace(store=>{
    if(route==='/health')return {ok:true,version:3};
    if(route==='/state')return store.state();
    if(route==='/companion')return {lastConnection:store.getSetting('companion')};
    if(route==='/profile'&&method==='POST')return store.saveProfile(data);
    if(route==='/connection')return {token:store.getSetting('token')};
    if(route==='/resume'||route==='/resume?json=1'){const resume=store.resume();if(!resume)throw new AppError('Upload your résumé first.',404);return {name:resume.name,base64:toBase64(resume.content)};}
    if(route==='/backup')return method==='GET'?store.snapshot():{file:store.backup('manual')};
    if(route==='/restore'){store.restore(data);return store.state();}
    if(route==='/migrate'){store.migrate(data);return store.state();}
    if(route==='/tailor'){const draft=store.getSetting('resumeDraft');return {draft:draft?{...draft,report:analyzeResume(draft.resumeText,draft.jobDescription,draft.sourceText+'\n'+(draft.additionalSkills||''))}:null};}
    if(route==='/tailor/generate'){const profile=store.getSetting('profile'),draft=validateResumeDraft(generateResume(validateTailorRequest(data,profile),profile));store.setSetting('resumeDraft',draft);return draft;}
    if(route==='/tailor/save'){const saved=checkedDraft(store,data),draft=validateResumeDraft({...saved,resumeText:data.resumeText});store.setSetting('resumeDraft',draft);return draft;}
    if(route==='/discover/preferences')return store.getSetting('search')||defaultSearch(store.getSetting('profile'));
    if(route==='/discover/sources'){
      return companies(store);
    }
    if(route.startsWith('/discover/sources/')){
      const id=decodeURIComponent(route.slice('/discover/sources/'.length)),source=companies(store).find(item=>item.id===id),prefs=preferences(store);
      if(!source)throw new AppError('Company not found.',404);
      if(!['enable','disable','remove'].includes(data.action))throw new AppError('Choose enable, disable or remove.');
      if(data.action==='remove'&&!source.custom)throw new AppError('Pause built-in companies instead of removing them.');
      prefs.disabled=prefs.disabled.filter(item=>item!==id);if(data.action==='disable')prefs.disabled.push(id);if(data.action==='remove')prefs.custom=prefs.custom.filter(item=>item.id!==id);store.setSetting('companySources',prefs);return companies(store);
    }
    if(route==='/jobs'&&method==='POST')return store.add(data);
    const match=route.match(/^\/jobs\/([\w-]+)(?:\/(prepare|status|draft|attempt))?$/);
    if(match){const [,id,action]=match;
      if(method==='GET'&&!action)return store.getJob(id);
      if(method==='PATCH'&&!action)return store.update(id,data);
      if(method==='POST'&&action==='prepare')return store.prepare(id);
      if(method==='POST'&&action==='status')return store.changeStatus(id,data);
      if(method==='POST'&&action==='attempt')return store.submissionAttempt(id,data);
      if(method==='POST'&&action==='draft'){const job=store.getJob(id);if(!job.preparation)throw new AppError('Prepare this application first.');job.preparation.opening=text(data.opening,10000,true);return store.saveJob(job);}
    }
    throw new AppError('This action was not found.',404);
  });
}
function checkedDraft(store,data){const draft=store.getSetting('resumeDraft');if(!draft||draft.id!==data.id||draft.updatedAt!==data.expectedUpdatedAt)throw new AppError('This draft changed in another tab. Copy your edits and generate a fresh draft.',409);return draft;}
export async function browserFetch(input,options={}){
  const route=input.replace(/^\/api/,''),data=options.body?JSON.parse(options.body):undefined;
  try{
    const result=await api(route,data,options.method||'GET');
    if(route==='/tailor/export')return new Response(result.blob,{headers:{'Content-Type':result.blob.type,'Content-Disposition':`attachment; filename="${result.name}"`}});
    if(route==='/resume'&&!data)return new Response(fromBase64(result.base64),{headers:{'Content-Type':'application/pdf'}});
    return Response.json(result);
  }catch(error){return Response.json({error:error.message},{status:error.status||500});}
}
const companionRoutes=/^\/(?:health|state|resume\?json=1|jobs(?:\/[\w-]+(?:\/(?:status|attempt))?)?)$/;
// Callable only from a companion script injected into this exact website origin.
globalThis.jobpilotCompanion=async({token,route,data,version})=>{
  try{
    if(!companionRoutes.test(route))throw new AppError('Use the JobPilot website for this action.',403);
    await withWorkspace(store=>{if(token!==store.getSetting('token'))throw new AppError('Copy the pairing key from this browser’s JobPilot workspace.',401);store.setSetting('companion',{lastSeenAt:new Date().toISOString(),version:text(version,30)});});
    return {result:await api(route,data)};
  }catch(error){return {error:error.message};}
};
