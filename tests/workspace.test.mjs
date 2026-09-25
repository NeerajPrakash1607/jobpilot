import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {api} from '../src/lib/browser-api.mjs';
import {withWorkspace} from '../src/lib/workspace.mjs';
import {emptyWorkspace,createStore} from '../src/lib/browser-store.mjs';
import {getPublicPage} from '../src/lib/public-fetch.mjs';
import {connectionAddress,siteApi,PUBLIC_ORIGIN} from '../src/extension/connection.js';

export const source=`Alex Example
alex@jobpilot.test | Dublin, Ireland
Profile
Software engineer building React interfaces. Experienced in JavaScript and documentation.
Skills & Technologies
Frontend: React • JavaScript • HTML • CSS
Experience
Software Engineer, Example Ltd Jan 2023 – Present
• Built React interfaces using JavaScript and HTML.
• Wrote documentation and investigated browser issues.
Education
Example College, BSc Computer Science Sep 2018 – Jun 2022
Projects
Accessible interface
• Built an accessible React interface.
Achievements
• Won a college award in 2021.`;
const jd='Frontend engineer building React and JavaScript interfaces. Maintain documentation, investigate browser issues and deliver accessible HTML and CSS interfaces. AWS experience is preferred.';
test('new visitors have empty, independent profiles and separate pairing keys',()=>{
  const a=emptyWorkspace(),b=emptyWorkspace();createStore(a).saveProfile({name:'Private visitor'});
  assert.equal(createStore(b).state().profile.name,'');assert.equal(createStore(b).state().jobs.length,0);assert.equal(createStore(b).resume(),null);assert.notEqual(a.settings.token,b.settings.token);
});
test('browser workspace retains profile, guards attempts, and keeps protected résumé sections',async()=>{
  await api('/profile',{name:'Alex Example',firstName:'Alex',lastName:'Example',email:'alex@jobpilot.test',resumeText:source});
  await withWorkspace(store=>store.putResume('resume.pdf',new TextEncoder().encode('%PDF-fixture'),source));
  const job=await api('/jobs',{title:'Frontend engineer',company:'Example',url:'https://example.org/jobs/123',description:jd});
  await api(`/jobs/${job.id}/prepare`,{});const prepared=await api(`/jobs/${job.id}`);
  const attempts=await Promise.allSettled([api(`/jobs/${job.id}/attempt`,{action:'start',expectedUpdatedAt:prepared.updatedAt}),api(`/jobs/${job.id}/attempt`,{action:'start',expectedUpdatedAt:prepared.updatedAt})]);
  assert.equal(attempts.filter(item=>item.status==='fulfilled').length,1);
  const draft=await api('/tailor/generate',{sourceText:source,jobDescription:jd,length:'targeted'});
  assert(draft.resumeText.includes(source.slice(source.indexOf('Education')).replace(/\n{2,}/g,'\n').split('\nProjects')[0]));
  assert(!draft.resumeText.includes('AWS'));assert(draft.report.missing.includes('AWS'));
  assert.equal((await api('/state')).profile.name,'Alex Example');
  const snapshot=await api('/backup');
  await assert.rejects(api('/restore',{...snapshot,jobs:[{...snapshot.jobs[0],status:'submitted',evidence:null}]}));
  assert.equal((await api('/state')).jobs[0].submissionAttempt.state,'pending');
  await api('/restore',snapshot);assert.equal((await api('/state')).jobs[0].submissionAttempt.state,'pending');
  assert((await globalThis.jobpilotCompanion({token:'wrong',route:'/state'})).error);
  const {token}=await api('/connection');
  assert.equal((await globalThis.jobpilotCompanion({token,route:'/state',version:'3.0.0'})).result.profile.name,'Alex Example');
  assert((await globalThis.jobpilotCompanion({token,route:'/backup',version:'3.0.0'})).error);
});
test('search sends public search parameters without profile or résumé data',async()=>{
  const original=globalThis.fetch;let body;
  globalThis.fetch=async(_url,request)=>{body=JSON.parse(request.body);return Response.json({search:body.search,total:0,jobs:[],sources:[]});};
  try{await api('/discover',{query:'frontend',location:'Ireland',includeRemote:true,hideSenior:true});assert.deepEqual(Object.keys(body).sort(),['preferences','search']);assert(!JSON.stringify(body).includes('Alex'));assert(!JSON.stringify(body).includes('resumeText'));}finally{globalThis.fetch=original;}
});
test('online imports cannot proxy arbitrary or private addresses',async()=>{
  for(const url of ['https://127.0.0.1/private','https://169.254.169.254/latest','https://random.example.org/path','http://boards-api.greenhouse.io/path'])await assert.rejects(getPublicPage(url));
});
test('companion targets only the authorised JobPilot origin and passes through pause errors',async()=>{
  assert.equal(connectionAddress(PUBLIC_ORIGIN),PUBLIC_ORIGIN);
  assert.throws(()=>connectionAddress('https://attacker.example.org'));assert.throws(()=>connectionAddress(PUBLIC_ORIGIN+'/?next=elsewhere'));
  let target;globalThis.chrome={tabs:{query:async query=>{assert.equal(query.url,PUBLIC_ORIGIN+'/*');return [{id:23}];}},scripting:{executeScript:async request=>{target=request;return [{result:{error:'Previous submission needs verification'}}];}},runtime:{getManifest:()=>({version:'3.0.0'})}};
  await assert.rejects(siteApi({address:PUBLIC_ORIGIN,token:'pairing'},'/jobs/id/attempt',{action:'start'}),/verification/);
  assert.equal(target.target.tabId,23);assert.equal(target.world,'MAIN');assert.equal(target.args[0].token,'pairing');
});


test('PDF reading order keeps right-aligned dates after their entry',async()=>{
  const {textFromItems}=await import('../src/lib/browser-documents.mjs');
  assert.equal(textFromItems([{str:'Jan 2023 – Present',transform:[1,0,0,1,420,400]},{str:'Education',transform:[1,0,0,1,55,350]},{str:'Software Engineer, Example Ltd',transform:[1,0,0,1,55,400]}]),'Software Engineer, Example Ltd Jan 2023 – Present\nEducation');
});
