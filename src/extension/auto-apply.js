import { fillApplication } from './automation.js';
import { approvalStamp, inspectSubmission, waitForConfirmation } from './submission.js';

export function createAutoApply({browser,api,now=Date.now}) {
  let running=false;
  const read=async()=>(await browser.storage.local.get('applicationRun')).applicationRun;
  const write=async run=>{await browser.storage.local.set({applicationRun:run});return run;};
  const execute=async(tabId,func,args)=>(await browser.scripting.executeScript({target:{tabId},func,args:[args]}))[0]?.result;
  async function observe(run) {
    let confirmation;
    try { confirmation=await execute(run.tabId,waitForConfirmation,{previous:run.previousConfirmation,timeout:12000}); } catch { /* A navigation can unload the old document. The next load or a manual check can verify it. */ }
    if(confirmation) {
      await api(`/jobs/${run.jobId}/status`,{status:'submitted',evidence:{...confirmation,source:'browser_confirmation'}});
      return write({...run,phase:'confirmed',message:'Application submitted. A confirmation was detected and recorded.',confirmation:confirmation.note});
    }
    return write({...run,phase:'unconfirmed',message:'Submission was attempted, but confirmation is not yet verified. Check the page or email. JobPilot will not automatically submit this job again.'});
  }
  return {
    async start({jobId,tabId,expectedUrl,stamp,approved,customAnswersReviewed=false}) {
      if(running)throw new Error('An application is already running.');
      if(approved!==true||!Number.isInteger(tabId)||!/^https:\/\//.test(expectedUrl||''))throw new Error('Approve this selected role on its HTTPS application page first.');
      running=true;let run,attempt;
      try {
        const state=await api('/state');const job=state.jobs.find(item=>item.id===jobId);
        if(!job?.preparation||!['prepared','in_progress'].includes(job.status)||job.evidence)throw new Error('Choose a prepared, unsubmitted role.');
        if(job.submissionAttempt?.state==='pending')throw new Error('A previous submission may have been sent. Check its confirmation before retrying.');
        if(stamp!==await approvalStamp(state,job))throw new Error('Your profile or draft changed. Reopen the companion and review the details.');
        const tab=await browser.tabs.get(tabId);if(tab.url?.split('#')[0]!==expectedUrl.split('#')[0])throw new Error('The page changed. Confirm the role again.');
        run={jobId,tabId,expectedUrl,company:job.company,title:job.title,startedAt:now(),phase:'checking',message:'Checking this application form…'};await write(run);
        const initial=await execute(tabId,inspectSubmission,{expectedUrl,customAnswersReviewed});
        if(!Number.isInteger(initial?.formIndex)&&initial?.formKind!=='ashby')return write({...run,phase:'paused',message:initial?.blockers?.join('\n')||'This form is not supported.'});
        const existing=await execute(tabId,waitForConfirmation,{timeout:1});
        if(existing)return write({...run,phase:'paused',message:'This page already contains an application confirmation. Record or check it before applying again.'});
        const resume=await api('/resume?json=1');
        const report=await execute(tabId,fillApplication,{profile:state.profile,resume,opening:job.preparation.opening,formKind:initial.formKind,formIndex:initial.formIndex,expectedUrl});
        run={...run,report};
        if(report?.blocked)return write({...run,phase:'paused',message:report.untouched.join('\n')});
        const checked=await execute(tabId,inspectSubmission,{expectedUrl,customAnswersReviewed});
        if(!checked?.ready)return write({...run,phase:'paused',message:'Complete these items on the employer page, then approve and run again:\n'+(checked?.blockers?.join('\n')||'Review the form.')});
        // Check again after filling: an edit on the dashboard invalidates prior approval.
        const latest=await api('/state'),fresh=latest.jobs.find(item=>item.id===jobId);
        if(!fresh||stamp!==await approvalStamp(latest,fresh))throw new Error('Your application changed while filling. Review it before submitting.');
        attempt=await api(`/jobs/${jobId}/attempt`,{action:'start',expectedUpdatedAt:fresh.updatedAt});
        run={...run,attemptId:attempt.id,phase:'submitting',message:'Submitting the selected application…',previousConfirmation:''};await write(run);
        let submitted;
        try { submitted=await execute(tabId,inspectSubmission,{expectedUrl,customAnswersReviewed,commit:true}); } catch { /* Navigation may mean the submit succeeded. Never repeat the click. */ }
        if(submitted?.clicked===false) {
          await api(`/jobs/${jobId}/attempt`,{action:'not-sent',attemptId:attempt.id,confirmedNotSent:true});
          return write({...run,phase:'paused',message:'The form changed before submission. Nothing was sent.\n'+submitted.blockers.join('\n')});
        }
        run={...run,phase:'awaiting_confirmation',message:'Checking for the employer’s confirmation…'};await write(run);
        return await observe(run);
      } catch(error) {
        if(run)await write({...run,phase:attempt?'unconfirmed':'paused',message:attempt?'A submission may have been sent. Check the employer’s confirmation; automatic retries are blocked.':error.message});
        throw error;
      } finally { running=false; }
    },
    async check(tabId) {
      if(running)return;
      const run=await read();if(!run||run.tabId!==tabId||!['submitting','awaiting_confirmation','unconfirmed'].includes(run.phase))return;
      if(now()-run.startedAt>30*60_000)return run;
      running=true;try{return await observe(run);}finally{running=false;}
    },
  };
}
