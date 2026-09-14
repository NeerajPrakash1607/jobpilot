// Isolated popup harness; no real extension state, pairing key or employer is used.
const results=[];const check=(label,value)=>results.push(`${value?'PASS':'FAIL'}: ${label}`);
const url='https://jobs.ashbyhq.com/example/123/application';
let state={profile:{name:'Test Candidate',firstName:'Test',lastName:'Candidate',email:'test@example.org'},resume:{name:'test.pdf'},jobs:[{id:'1',url:url.replace('/application',''),company:'Example',title:'Engineer',status:'prepared',preparation:{opening:'Reviewed draft'}},{id:'2',url:'https://example.org/2',company:'Other',title:'Old role',status:'submitted',evidence:{note:'Received'},preparation:{opening:'Old draft'}}]};
const storage={connection:{address:location.origin,token:'0'.repeat(64)}};const scripts=[];
window.chrome={storage:{local:{get:async key=>({[key]:storage[key]}),set:async value=>Object.assign(storage,value),remove:async key=>delete storage[key]},onChanged:{addListener(){}}},tabs:{query:async()=>[{id:100,url}]},runtime:{getManifest:()=>({version:'2.3.0'}),sendMessage:async()=>{throw new Error('Submission must not run in this UI check');}},scripting:{executeScript:async({func,args})=>{scripts.push({func:func.name,args});return [{result:func.name==='inspectSubmission'?{formKind:'ashby',ready:false,blockers:['Choose location suggestion']}:{filled:['Name','Email'],untouched:['Location']}}];}}};
window.fetch=async(path,options)=>{const route=new URL(path).pathname;let result;if(route==='/api/health')result={ok:true};else if(route==='/api/state')result=structuredClone(state);else if(route==='/api/resume')result={name:'test.pdf',base64:'JVBERi0='};else if(route==='/api/jobs/1/status'){state.jobs[0].status='in_progress';result=state.jobs[0];}else throw new Error('Unexpected test API route');return {ok:true,json:async()=>result};};
await import('/extension/popup.js');
const $=id=>document.getElementById(id);
check('Existing pairing opens the connected panel',!$('connected').hidden&&$('pairing').hidden);
check('The exact saved Ashby role is selected',$('job').value==='1');
check('Submitted applications are absent from the selector',$('job').options.length===2);
check('Page check explains the remaining location choice',$('page-report').textContent.includes('Choose location suggestion'));
check('Fill and submit initially require role approval',$('fill').disabled&&$('auto-apply').disabled);
$('confirm-role').click();check('Role approval enables fill, but not submission',!$('fill').disabled&&$('auto-apply').disabled);
$('approve-submit').click();check('Both approvals enable auto-apply',!$('auto-apply').disabled);
$('fill').click();
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Autofill UI did not finish'));},3000);const observer=new MutationObserver(()=>{if($('status').textContent.includes('Autofill finished')){clearTimeout(timer);observer.disconnect();resolve();}});observer.observe($('status'),{childList:true,subtree:true});});
check('Fill uses only the recognised application container',scripts.find(x=>x.func==='fillApplication')?.args[0].formKind==='ashby');
check('Fill resets submission approval for review',!$('confirm-role').checked&&!$('approve-submit').checked&&$('auto-apply').disabled);
check('Fill reports that nothing was submitted',$('status').textContent.includes('Nothing was submitted'));
state.jobs[0].submissionAttempt={state:'pending'};
// Reload through the actual connect action to exercise persisted attempt state.
$('disconnect').click();
await new Promise(resolve=>setTimeout(resolve,0));
$('address').value=location.origin;$('token').value='0'.repeat(64);$('connect').click();
await new Promise(resolve=>setTimeout(resolve,50));
$('confirm-role').click();$('approve-submit').click();check('Pending submission keeps fill and submit disabled',$('fill').disabled&&$('auto-apply').disabled);
$('test-results').textContent=results.join('\n');
