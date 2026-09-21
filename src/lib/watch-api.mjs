import {AppError,object,text,publicUrl} from './domain.mjs';
import {watchStore} from './watch-store.mjs';
import {parseWatchPreferences,matchWatchJobs,PILOT_CAPACITY} from './watch-domain.mjs';
import {cookie,setCookie,randomToken,hashToken,googleIdentity,requireRunner,unsubscribeToken} from './watch-auth.mjs';
import {checkCompany,nextDigest,connectCompany} from './watch-service.mjs';

const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
async function input(request){
 const reader=request.body?.getReader();let bytes=0,parts=[];
 if(reader)while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>16384){await reader.cancel();throw new AppError('Request is too large.',413);}parts.push(value);}
 let result;try{result=JSON.parse(await new Blob(parts).text()||'{}');}catch{throw new AppError('Invalid request.');}return object(result);
}
function sameOrigin(request){const u=new URL(request.url);if(request.headers.get('Origin')!==u.origin||request.headers.get('X-JobPilot')!=='1')throw new AppError('Open JobPilot to continue.',403);}
export async function watchApi(request,env){
 const url=new URL(request.url),route=url.pathname.slice('/watch-api'.length),now=Date.now();
 try{
  if(!env.DB)throw new AppError('The company catalogue is temporarily unavailable.',503);
  const store=watchStore(env.DB);
  if(route.startsWith('/runner/')){
   await requireRunner(request,env.WATCH_RUNNER_SECRET);
   if(request.method!=='POST')throw new AppError('Method not allowed.',405);
   const data=await input(request);
   if(route==='/runner/check')return json(await checkCompany(store,text(data.company,120,true),now));
   if(route==='/runner/catalog')return json({companies:(await store.sources()).filter(s=>s.type!=='website').map(s=>({id:s.id,name:s.name})),capacity:PILOT_CAPACITY});
   if(route==='/runner/complete'){
    await store.putValue('runnerHeartbeat',now);await store.cleanup(now);
    return json({ok:true});
   }
   if(route==='/runner/next')return json({delivery:env.ALERTS_ENABLED==='true'||env.ALERT_TEST_EMAIL?await nextDigest(store,url.origin,env.WATCH_RUNNER_SECRET,now,env.ALERTS_ENABLED==='true'?null:env.ALERT_TEST_EMAIL):null});
   if(route==='/runner/authorize'){
    const id=text(data.id,60,true),authorized=!!(env.ALERTS_ENABLED==='true'||env.ALERT_TEST_EMAIL)&&await store.authorizeDelivery(id,env.ALERTS_ENABLED==='true'?null:env.ALERT_TEST_EMAIL);
    if(!authorized)await store.finishDelivery(id,'cancelled',now);
    return json({authorized});
   }
   if(route==='/runner/ack'){
    if(!['accepted','failed','uncertain'].includes(data.state))throw new AppError('Unknown delivery state.');
    await store.finishDelivery(text(data.id,60,true),data.state,now);return json({ok:true});
   }
   if(route==='/runner/status')return json({catalog:await store.catalog(now),...await store.diagnostics(),heartbeat:await store.value('runnerHeartbeat')});
   if(route==='/runner/promote'){await store.promote(now);return json({ok:true});}
   throw new AppError('Not found.',404);
  }
  if(route==='/catalog'&&request.method==='GET')return json({companies:await store.catalog(now)});
  if(request.method==='POST')sameOrigin(request);
  const runnerHeartbeat=Number(await store.value('runnerHeartbeat')||0);
  const authReady=!!env.GOOGLE_CLIENT_ID&&!!env.WATCH_RUNNER_SECRET;
  const session=cookie(request,'jp_watch_session');
  const account=session?await store.session(await hashToken(session),now):null;
  const testAccount=!!account&&!!env.ALERT_TEST_EMAIL&&account.email.toLowerCase()===env.ALERT_TEST_EMAIL.toLowerCase();
  const alertsReady=authReady&&(env.ALERTS_ENABLED==='true'||testAccount)&&runnerHeartbeat>now-36*60*60*1000;
  if(route==='/state'&&request.method==='GET')return json({account,authReady,alertsReady,runnerHeartbeat:runnerHeartbeat||null,clientId:authReady?env.GOOGLE_CLIENT_ID:null,capacity:PILOT_CAPACITY,requests:account?await store.requests(account.id):[]});
  if(request.method!=='POST')throw new AppError('Method not allowed.',405);
  const data=await input(request);
  if(route==='/jobs'){
   const preferences=parseWatchPreferences(data,await store.sources()),jobs=matchWatchJobs(await store.jobs(),preferences);
   return json({jobs:jobs.slice(0,500),total:jobs.length,companies:await store.catalog(now)});
  }
  if(route==='/check')return json(await checkCompany(store,text(data.company,120,true),now));
  if(route==='/login-challenge'){
   if(!authReady)throw new AppError('Google sign-in is still being connected. You can browse jobs now.',503);
   const nonce=randomToken();return json({nonce,clientId:env.GOOGLE_CLIENT_ID},200,{'Set-Cookie':setCookie(request,'jp_watch_nonce',nonce,300)});
  }
  if(route==='/google'){
   if(!authReady)throw new AppError('Google sign-in is still being connected.',503);
   const identity=await googleIdentity(text(data.credential,10000,true),env.GOOGLE_CLIENT_ID,cookie(request,'jp_watch_nonce'));
   const user=await store.saveAccount(identity,await hashToken(randomToken()),now);
   await store.setUnsubscribeHash(user.id,await hashToken(await unsubscribeToken(env.WATCH_RUNNER_SECRET,user)));
   const token=randomToken();await store.createSession(await hashToken(token),user.id,now+7*86400000);
   const response=json({account:user});response.headers.append('Set-Cookie',setCookie(request,'jp_watch_session',token,7*86400));response.headers.append('Set-Cookie',setCookie(request,'jp_watch_nonce','',0));return response;
  }
  if(route==='/logout'){if(session)await store.logout(await hashToken(session));return json({ok:true},200,{'Set-Cookie':setCookie(request,'jp_watch_session','',0)});}
  if(!account)throw new AppError('Sign in with Google to save your watchlist or manage alerts.',401);
  if(route==='/connect')return json({...await connectCompany(store,account.id,data,now),requests:await store.requests(account.id)});
  if(route==='/preferences')return json({account:await store.preferences(account.id,parseWatchPreferences(data,await store.sources()),now)});
  if(route==='/subscribe'){
   if(!alertsReady)throw new AppError('Email alerts are not accepting subscriptions yet. Your watchlist can still be saved.',503);
   if(data.consent!==true)throw new AppError('Please choose to receive daily job-alert emails.');
   const sources=await store.sources();
   if(!account.preferences.companies.some(id=>sources.some(s=>s.id===id&&s.type!=='website')))throw new AppError('Choose at least one connected company first.');
   return json({account:await store.subscribe(account.id,now)});
  }
  if(route==='/pause')return json({account:await store.pause(account.id)});
  if(route==='/delete'){await store.deleteAccount(account.id);return json({ok:true},200,{'Set-Cookie':setCookie(request,'jp_watch_session','',0)});}
  if(route==='/request'){
   const name=text(data.name,120,true),careerUrl=new URL(publicUrl(text(data.url,2048,true)));
   if(careerUrl.protocol!=='https:')throw new AppError('Use the official HTTPS careers page.');
   careerUrl.hash='';await store.requestCompany(account.id,name,careerUrl.href,now);return json({requests:await store.requests(account.id)});
  }
  throw new AppError('Not found.',404);
 }catch(error){return json({error:error instanceof AppError?error.message:'JobPilot could not complete that request. Please try again.'},error instanceof AppError?error.status:503);}
}
export async function unsubscribePage(request,env){
 try{
 if(!env.DB)return new Response('Email preferences are temporarily unavailable. Please try again shortly.',{status:503});
 const token=new URL(request.url).searchParams.get('token')||'';
 if(!/^[a-f0-9]{64}$/.test(token))return new Response('This unsubscribe link is invalid.',{status:400});
 let done=false;
 if(request.method==='POST'){
  if(request.headers.get('Origin')!==new URL(request.url).origin)return new Response('Open the unsubscribe page again.',{status:403});
  done=await watchStore(env.DB).unsubscribe(await hashToken(token));
  if(!done)return new Response('This unsubscribe link is no longer valid. Sign in to JobPilot to manage your email preferences.',{status:400});
 }else if(request.method!=='GET')return new Response('Method not allowed.',{status:405});
 // Keep the token out of Referer without forcing this HTML form's Origin to null.
 return new Response(`<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>JobPilot · Email preferences</title><link rel="stylesheet" href="/styles.css"><main class="unsubscribe-page panel"><h1>${done?'You’re unsubscribed.':'Stop JobPilot emails?'}</h1><p>${done?'You can keep browsing jobs. Sign in to manage your watchlist.':'Confirm below to stop daily job-alert emails. Opening this link does not change your subscription.'}</p>${done?'':`<form method="post"><button class="button button-primary">Unsubscribe from job alerts</button></form>`}<p><a href="/#watch">Return to JobPilot</a></p></main></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'strict-origin','Content-Security-Policy':"default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
 }catch{return new Response('Email preferences could not be updated. Please try again shortly.',{status:503});}
}
