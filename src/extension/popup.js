import {siteApi,connectionAddress} from './connection.js';
import {captureListing,fillApplication,readConfirmation} from './automation.js';
import {approvalStamp,inspectSubmission} from './submission.js';
import {availableRoles,roleForPage,savedRoleForPage,listingKey,profileReadiness} from './context.js';
const $=id=>document.getElementById(id);
let connection,state,listing,currentTab,pageCheck,checkedPageUrl,busy=false,latestRun,selectionPageKey;
const say=message=>{$('status').textContent=message;$('status').scrollIntoView({block:'nearest'});};
const chosen=()=>state?.jobs.find(job=>job.id===$('job').value);
function controls(){
  document.querySelectorAll('button').forEach(button=>button.disabled=busy);
  const job=chosen(),supported=pageCheck&&(Number.isInteger(pageCheck.formIndex)||pageCheck.formKind==='ashby');
  const pending=job?.submissionAttempt?.state==='pending';
  for(const id of ['fill','auto-apply'])$(id).disabled=busy||!job||!supported||pending||!$('confirm-role').checked;
  $('auto-apply').disabled ||= !$('approve-submit').checked;
  for(const id of ['copy','record'])$(id).disabled=busy||!job;
  $('check-auto').hidden=!latestRun;
}
async function api(route,data){return siteApi(connection,route,data);}
async function tab(){const [result]=await chrome.tabs.query({active:true,currentWindow:true});if(!/^https?:\/\//.test(result?.url||''))throw new Error('Open the employer’s job listing or application page first.');return result;}
async function execute(func,args=[]){currentTab=await tab();const result=await chrome.scripting.executeScript({target:{tabId:currentTab.id},func,args});if(!result[0]?.result)throw new Error('This page could not be read. Open the application directly in its own tab.');return result[0].result;}
const localAddress=connectionAddress;
function selected(){const job=chosen();if(!job)throw new Error('Choose a prepared role first. Prepare one in JobPilot if the list is empty.');if(job.evidence)throw new Error('This application is already recorded.');return job;}
function previewApproval(){
  $('approve-submit').checked=false;$('confirm-role').checked=false;
  const job=chosen();
  $('approval-preview').textContent=job?`${job.title} at ${job.company}\n${state.profile.name} · ${state.profile.email}\nRésumé: ${state.resume?.name||'Missing'}`:'Choose the application that belongs to the employer page you have open.';
  $('approval-draft').textContent=job?`About you: ${state.profile.summary||'Not provided'}\n\nApplication introduction:\n${job.preparation?.opening||'Not prepared'}`:'No prepared role selected.';
  const missing=profileReadiness(state);
  $('profile-readiness').textContent=missing.length?`Add in Your profile: ${missing.join(', ')}. Those fields will stay blank until you provide them.`:'Contact details and résumé are ready.';
  if(job?.submissionAttempt?.state==='pending')$('profile-readiness').textContent='A previous submission needs verification. Check the confirmation in JobPilot before trying again.';
  controls();
}
async function showRun(){latestRun=(await chrome.storage.local.get('applicationRun')).applicationRun;$('auto-report').textContent=latestRun?`${latestRun.title} · ${latestRun.company}\n${latestRun.message}${latestRun.report?.filled?.length?'\nFilled: '+latestRun.report.filled.join(', '):''}`:'';controls();}
async function checkPage(){
  pageCheck=null;checkedPageUrl=null;$('confirm-role').checked=false;$('approve-submit').checked=false;$('open-embedded').hidden=true;$('open-embedded').removeAttribute('href');
  try{
    const current=await tab();checkedPageUrl=current.url;
    pageCheck=await execute(inspectSubmission,[{expectedUrl:checkedPageUrl}]);
    const supported=Number.isInteger(pageCheck.formIndex)||pageCheck.formKind==='ashby';
    $('page-report').textContent=supported?`${pageCheck.formKind==='ashby'?'Ashby':'Application'} form recognised. ${pageCheck.ready?'Ready for your submission approval.':'Autofill is available. Items to review:\n'+pageCheck.blockers.map(item=>'• '+item).join('\n')}`:pageCheck.blockers.join('\n');
    if(pageCheck.embeddedApplicationUrl){$('open-embedded').href=pageCheck.embeddedApplicationUrl;$('open-embedded').hidden=false;}
  }catch(error){$('page-report').textContent=error.message;}
  controls();
}
async function load(){
  connection=(await chrome.storage.local.get('connection')).connection;
  if(!connection){$('pairing').hidden=false;$('connected').hidden=true;say('Connect once, then open the employer’s application page.');return;}
  try{
    state=await api('/state');$('pairing').hidden=true;$('connected').hidden=false;$('dashboard').href=connection.address;$('role-dashboard').href=connection.address+'/#queue';
    const previous=$('job').value;let page;
    try{page=await tab();}catch{}
    const matches=page?roleForPage(state,page.url):null;
    const roles=availableRoles(state);$('job').replaceChildren();
    $('job').append(new Option(roles.length?'Choose the role for this page':'No prepared roles — open JobPilot',''));
    for(const job of roles)$('job').append(new Option(`${job.company} · ${job.title}`,job.id));
    const pageKey=page?listingKey(page.url):null;
    $('job').value=matches?.id||(pageKey&&pageKey===selectionPageKey&&roles.some(job=>job.id===previous)?previous:'');
    if($('job').value!==previous||pageKey!==selectionPageKey){$('report').textContent='';$('confirmation').value='';$('confirm-submitted').checked=false;}
    selectionPageKey=pageKey;
    const saved=page?savedRoleForPage(state,page.url):null;
    let guidance='This page does not match a saved role. Save the job below, prepare its application in JobPilot, then click Refresh roles. Browsing a listing does not add it automatically.';
    if(matches)guidance='This prepared application matches the current page.';
    else if(saved?.status==='saved')guidance=`“${saved.title}” is saved but has no current draft. Open Applications in JobPilot, prepare it, then click Refresh roles.`;
    else if(saved)guidance=`“${saved.title}” is already recorded or archived and is not available for another application.`;
    $('role-help').textContent=guidance;
    previewApproval();await checkPage();await showRun();
    say(matches?'Connected. The saved role matches this page. Review the page check below.':saved?'Connected. See the saved-role instructions below.':'Connected. This page does not match a saved role. See the steps below.');
  }catch(error){$('pairing').hidden=false;$('connected').hidden=true;$('address').value=connection.address;say(`Start JobPilot locally, or pair again. ${error.message}`);}
}
const actions={
  connect:async()=>{connection={address:localAddress($('address').value),token:$('token').value.trim()};if(!/^[a-f0-9]{64}$/.test(connection.token))throw new Error('Paste the pairing key from JobPilot → Tools & backups.');await api('/health');await chrome.storage.local.set({connection});$('token').value='';await load();},
  'check-page':load,
  'refresh-roles':load,
  capture:async()=>{listing=await execute(captureListing);for(const key of ['title','company','location','description'])$(key).value=listing[key]||'';$('import-tools').open=true;$('import-form').hidden=false;say('Review the imported details before saving.');},
  'save-job':async()=>{if(!listing)throw new Error('Read a listing first.');const fields={...listing};for(const key of ['title','company','location','description'])fields[key]=$(key).value;await api('/jobs',fields);$('import-form').hidden=true;await load();say('Role saved. Open Applications in JobPilot, prepare it, then click Refresh roles here.');},
  fill:async()=>{
    if(!$('confirm-role').checked)throw new Error('Confirm that this form belongs to the selected role.');
    const job=selected(),latest=await api('/state'),fresh=latest.jobs.find(item=>item.id===job.id);
    if(!fresh?.preparation||!['prepared','in_progress'].includes(fresh.status)||fresh.evidence)throw new Error('The application changed. Prepare and review it again in JobPilot.');
    if(fresh.submissionAttempt?.state==='pending')throw new Error('Verify the previous submission before filling this role again.');
    const inspection=await execute(inspectSubmission,[{expectedUrl:checkedPageUrl}]);
    if(!Number.isInteger(inspection.formIndex)&&inspection.formKind!=='ashby')throw new Error(inspection.blockers.join('\n'));
    const resume=await api('/resume?json=1');
    const report=await execute(fillApplication,[{profile:latest.profile,resume,opening:fresh.preparation.opening,formKind:inspection.formKind,formIndex:inspection.formIndex,expectedUrl:checkedPageUrl}]);
    $('report').textContent=`Filled: ${report.filled.join(', ')||'No empty recognised fields'}\n${report.untouched.length?'Complete yourself: '+report.untouched.join('; '):'Review the completed answers before submitting.'}`;
    if(report.filled.length)await api(`/jobs/${job.id}/status`,{status:'in_progress'});
    await load();say('Autofill finished. Review your answers and any remaining items on the employer page. Nothing was submitted.');
  },
  'auto-apply':async()=>{
    if(!$('confirm-role').checked||!$('approve-submit').checked)throw new Error('Confirm the role and approve sending the saved details first.');
    const job=selected(),current=await tab();
    if(current.url!==checkedPageUrl)throw new Error('The page changed. Check it again and review the role.');
    const stamp=await approvalStamp(state,job);say('Running this selected application. You can close the popup; the companion keeps working.');
    const result=await chrome.runtime.sendMessage({type:'auto-apply',jobId:job.id,tabId:current.id,expectedUrl:checkedPageUrl,stamp,approved:true,customAnswersReviewed:true});
    $('approve-submit').checked=false;await showRun();if(result?.error)throw new Error(result.error);await load();
  },
  'check-auto':async()=>{if(!latestRun)throw new Error('No automatic submission has been started.');const result=await chrome.runtime.sendMessage({type:'check-application',tabId:latestRun.tabId});if(result?.error)throw new Error(result.error);await showRun();},
  copy:async()=>{const job=selected(),latest=await api(`/jobs/${job.id}`);if(!latest.preparation?.opening)throw new Error('Prepare this application first.');await navigator.clipboard.writeText(latest.preparation.opening);say('Saved introduction copied.');},
  'read-confirmation':async()=>{const result=await execute(readConfirmation);$('confirmation').value=result.note;say(result.note?'Review the detected message before recording it.':'No confirmation recognised. Enter the confirmation you received.');},
  record:async()=>{if(!$('confirm-submitted').checked)throw new Error('Confirm you completed the submission first.');const job=selected();currentTab=await tab();await api(`/jobs/${job.id}/status`,{status:'submitted',evidence:{note:$('confirmation').value,url:currentTab.url}});await load();say('Completed application recorded in JobPilot.');},
  disconnect:async()=>{await chrome.storage.local.remove('connection');await load();}
};
for(const [id,action]of Object.entries(actions))$(id).addEventListener('click',async()=>{if(busy)return;busy=true;controls();try{await action();}catch(error){say(error.message);}finally{busy=false;controls();}});
$('job').addEventListener('change',()=>{$('confirm-submitted').checked=false;$('confirmation').value='';$('report').textContent='';previewApproval();});
for(const id of ['confirm-role','approve-submit'])$(id).addEventListener('change',controls);
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.applicationRun)showRun();});
await load();
