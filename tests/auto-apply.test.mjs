import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAutoApply} from '../extension/auto-apply.js';
import {approvalStamp} from '../extension/submission.js';
import {openStore} from '../lib/store.mjs';
const job={id:'job-123',title:'Developer',company:'Example',url:'https://example.org/job/123',status:'prepared',updatedAt:'2026-09-14T10:00:00Z',preparation:{opening:'My real introduction.'}};
const state={profile:{name:'Test Candidate',email:'test@example.org'},resume:{name:'test.pdf',bytes:30},jobs:[job]};
async function harness({blocked=false,confirmation=true,navigate=false,changed=false,commitBlocked=false,ashby=false}={}) {
  const storage={},calls=[],actions=[];let inspections=0;
  const browser={storage:{local:{get:async key=>({[key]:storage[key]}),set:async value=>Object.assign(storage,value)}},tabs:{get:async()=>({url:job.url})},scripting:{executeScript:async({func,args})=>{
    actions.push({function:func.name,args});
    if(func.name==='inspectSubmission') {
      if(args[0].commit) {if(navigate)throw new Error('Document navigated');return [{result:commitBlocked?{ready:false,clicked:false,blockers:['Required answer changed']}:{ready:true,clicked:true}}];}
      inspections++;return [{result:{...(ashby?{formKind:'ashby'}:{formIndex:0}),ready:!(blocked&&inspections>1),blockers:blocked?['Work authorization']:[]}}];
    }
    if(func.name==='fillApplication')return [{result:{filled:['Email','Résumé'],untouched:[]}}];
    if(func.name==='waitForConfirmation')return [{result:args[0].timeout===1?null:confirmation?{note:'Thank you for applying. Your application was received.',url:job.url}:null}];
  }}};
  let snapshots=0;
  const api=async(route,data)=>{calls.push({route,data});if(route==='/state'){snapshots++;return changed&&snapshots>1?{...state,profile:{...state.profile,email:'changed@example.org'}}:structuredClone(state);}if(route==='/resume?json=1')return {name:'test.pdf',base64:'JVBERi0='};if(route.endsWith('/attempt'))return {id:'attempt-1',state:'pending'};return {};};
  const runner=createAutoApply({browser,api});
  const request={jobId:job.id,tabId:10,expectedUrl:job.url,stamp:await approvalStamp(state,job),approved:true};
  return {runner,request,storage,calls,actions};
}
test('auto-apply requires selection approval and unchanged candidate details',async()=>{
  const h=await harness();await assert.rejects(h.runner.start({...h.request,approved:false}),/Approve/);assert.equal(h.actions.length,0);
  await assert.rejects(h.runner.start({...h.request,stamp:'wrong'}),/changed/);assert.equal(h.actions.length,0);
});
test('missing required answers pause without a submission attempt or click',async()=>{
  const h=await harness({blocked:true});const run=await h.runner.start(h.request);assert.equal(run.phase,'paused');assert.match(run.message,/Work authorization/);
  assert(!h.calls.some(call=>call.route.endsWith('/attempt')));assert(!h.actions.some(action=>action.args[0]?.commit));
});
test('supported complete forms are submitted once and only a confirmation records applied',async()=>{
  const h=await harness();const run=await h.runner.start(h.request);assert.equal(run.phase,'confirmed');
  assert.equal(h.actions.filter(action=>action.args[0]?.commit).length,1);
  const evidence=h.calls.find(call=>call.route.endsWith('/status')).data.evidence;assert.equal(evidence.source,'browser_confirmation');
  assert(h.calls.some(call=>call.route.endsWith('/attempt')&&call.data.action==='start'));
});
test('uncertain navigation keeps the attempt pending and never retries the submit click',async()=>{
  const h=await harness({confirmation:false,navigate:true});const run=await h.runner.start(h.request);assert.equal(run.phase,'unconfirmed');
  await h.runner.check(10);assert.equal(h.actions.filter(action=>action.args[0]?.commit).length,1);assert(!h.calls.some(call=>call.route.endsWith('/status')));assert(!h.calls.some(call=>call.data?.action==='not-sent'));
});
test('a changed form that definitely was not clicked releases its attempt',async()=>{
  const h=await harness({commitBlocked:true});const run=await h.runner.start(h.request);assert.equal(run.phase,'paused');assert(h.calls.some(call=>call.data?.action==='not-sent'));assert(!h.calls.some(call=>call.route.endsWith('/status')));
});
test('profile changes after autofill prevent automatic submission',async()=>{
  const h=await harness({changed:true});await assert.rejects(h.runner.start(h.request),/changed while filling/);assert(!h.actions.some(action=>action.args[0]?.commit));
});
test('submission attempts persist, block duplicates and survive backup restore',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'jobpilot-attempt-'));const store=await openStore(directory);
  try {
    store.saveProfile({name:'Test Candidate',email:'test@jobpilot.test',resumeText:'React developer with experience building accessible web applications and documenting software. I work with JavaScript, CSS and HTML.'});
    store.putResume('test.pdf',Buffer.from('%PDF-test'));
    let saved=store.add({title:'Developer',company:'Example',url:job.url,description:'Develop React and JavaScript interfaces for customers, collaborating on documentation, testing, accessibility and troubleshooting in a software team.'});
    saved=store.prepare(saved.id);const attempt=store.submissionAttempt(saved.id,{action:'start',expectedUpdatedAt:saved.updatedAt});
    assert.throws(()=>store.submissionAttempt(saved.id,{action:'start',expectedUpdatedAt:store.getJob(saved.id).updatedAt}),/previous submission/);
    await store.restore(store.snapshot());assert.equal(store.getJob(saved.id).submissionAttempt.id,attempt.id);
    assert.throws(()=>store.submissionAttempt(saved.id,{action:'not-sent',attemptId:attempt.id}),/Confirm/);
    store.submissionAttempt(saved.id,{action:'not-sent',attemptId:attempt.id,confirmedNotSent:true});
    assert.equal(store.getJob(saved.id).submissionAttempt.state,'not_sent');
    store.changeStatus(saved.id,{status:'submitted',evidence:{note:'Thank you for applying. Your application was received.',source:'browser_confirmation',url:job.url}});
    await store.restore(store.snapshot());assert.equal(store.getJob(saved.id).evidence.source,'browser_confirmation');
    assert.throws(()=>store.submissionAttempt(saved.id,{action:'start'}),/unsubmitted/);
  } finally {store.close();await rm(directory,{recursive:true,force:true});}
});

test('Ashby scope and explicit custom-answer review survive every submission check',async()=>{const h=await harness({ashby:true});const run=await h.runner.start({...h.request,customAnswersReviewed:true});assert.equal(run.phase,'confirmed');assert.equal(h.actions.find(x=>x.function==='fillApplication').args[0].formKind,'ashby');assert(h.actions.filter(x=>x.function==='inspectSubmission').every(x=>x.args[0].customAnswersReviewed===true));});
