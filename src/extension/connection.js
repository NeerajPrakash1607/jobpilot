export const PUBLIC_ORIGIN='https://jobpilot-neeraj.bhanuprakash0024.chatgpt.site';
export function connectionAddress(value){const url=new URL(value);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.origin===PUBLIC_ORIGIN||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw new Error('Use the website address shown in JobPilot → Tools & backups.');return url.origin;}
export async function siteApi(connection,route,data){
  const origin=connectionAddress(connection.address);
  if(origin===PUBLIC_ORIGIN){
    const tabs=await chrome.tabs.query({url:PUBLIC_ORIGIN+'/*'});
    if(!tabs.length)throw new Error('Keep your JobPilot website tab open in this browser while using the companion.');
    const results=await chrome.scripting.executeScript({target:{tabId:tabs[0].id},world:'MAIN',func:async request=>{
      if(typeof globalThis.jobpilotCompanion!=='function')return {error:'Wait for JobPilot to finish loading, then try again.'};
      return globalThis.jobpilotCompanion(request);
    },args:[{token:connection.token,route,data,version:chrome.runtime.getManifest().version}]});
    const response=results[0]?.result;if(!response||response.error)throw new Error(response?.error||'JobPilot did not respond. Reload its website tab.');return response.result;
  }
  const response=await fetch(`${origin}/api${route}`,{method:data?'POST':'GET',headers:{Authorization:`Bearer ${connection.token}`,'X-JobPilot-Version':chrome.runtime.getManifest().version,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(10000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'JobPilot could not complete this action.');return result;
}
