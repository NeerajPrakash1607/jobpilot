import {siteApi} from './connection.js';
import { createAutoApply } from './auto-apply.js';
async function api(route,data){const {connection}=await chrome.storage.local.get('connection');if(!connection)throw new Error('Pair the browser companion with JobPilot first.');return siteApi(connection,route,data);}
const runner=createAutoApply({browser:chrome,api});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html'))return;
  if(message?.type==='auto-apply') { runner.start(message).then(run=>reply({run}),error=>reply({error:error.message}));return true; }
  if(message?.type==='check-application') { runner.check(message.tabId).then(run=>reply({run}),error=>reply({error:error.message}));return true; }
});
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(change.status==='complete')runner.check(tabId).catch(()=>{});});
