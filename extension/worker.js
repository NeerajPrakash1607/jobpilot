import { createAutoApply } from './auto-apply.js';
async function api(route,data) {
  const {connection}=await chrome.storage.local.get('connection');
  if(!connection)throw new Error('Pair the browser companion with JobPilot first.');
  const url=new URL(connection.address);
  if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Invalid local JobPilot address.');
  const response=await fetch(`${url.origin}/api${route}`,{method:data?'POST':'GET',headers:{'X-JobPilot-Version':chrome.runtime.getManifest().version,Authorization:`Bearer ${connection.token}`,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(10000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'JobPilot could not complete this action.');return result;
}
const runner=createAutoApply({browser:chrome,api});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html'))return;
  if(message?.type==='auto-apply') { runner.start(message).then(run=>reply({run}),error=>reply({error:error.message}));return true; }
  if(message?.type==='check-application') { runner.check(message.tabId).then(run=>reply({run}),error=>reply({error:error.message}));return true; }
});
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(change.status==='complete')runner.check(tabId).catch(()=>{});});
