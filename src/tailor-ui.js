import {browserFetch} from './lib/browser-api.mjs';
import { resumeLayout } from './resume-layout.js';
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
export function createTailorUI({api,getState,notify}){
  let draft=null,initialized=false,busy=false,dirty=false,sourceChanged=false,selectedTab='preview';
  const inputIds=['tailor-job-title','tailor-company','tailor-description','tailor-source'];
  function currentInput(){return {jobTitle:$('tailor-job-title').value,company:$('tailor-company').value,jobDescription:$('tailor-description').value,sourceText:$('tailor-source').value};}
  function fillInput(value){for(const [id,key] of [['tailor-job-title','jobTitle'],['tailor-company','company'],['tailor-description','jobDescription'],['tailor-source','sourceText']])$(id).value=value[key]||'';}
  function error(message){$('tailor-error').textContent=message||'';$('tailor-error').hidden=!message;}
  function buttons(){
    $('tailor-form').querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=busy);
    $('tailor-editor').disabled=!draft||busy;
    $('tailor-save').disabled=!draft||busy||sourceChanged||!dirty;
    document.querySelectorAll('[data-tailor-download]').forEach(el=>el.disabled=!draft||busy||sourceChanged);
    $('tailor-generate').textContent=busy?'Working…':'Rearrange my résumé →';
  }
  function status(){
    $('tailor-save-state').textContent=sourceChanged?'Job details or source changed. Generate a new draft to use them.':dirty?'Unsaved edits. Save or download to update the keyword check.':draft?`Saved on this computer · ${new Date(draft.updatedAt).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`:'Your tailored résumé will appear here.';
    buttons();
  }
  function preview(){
    $('tailor-preview').innerHTML=resumeLayout($('tailor-editor').value).map(block=>{
      if(block.kind==='name')return `<h3 class="resume-name">${escape(block.text)}</h3>`;
      if(block.kind==='contacts')return `<p class="resume-contacts">${block.rows.map(row=>row.map(part=>part.href?`<a href="${escape(part.href)}" target="_blank" rel="noopener noreferrer">${escape(part.text)}</a>`:escape(part.text)).join(' <span aria-hidden="true">|</span> ')).join('<br>')}</p>`;
      if(block.kind==='section')return `<h4 class="resume-section">${escape(block.text)}</h4>`;
      if(block.kind==='entry'){
        const text=block.emphasis?`<strong>${escape(block.emphasis)}</strong>${escape(block.text.slice(block.emphasis.length))}`:escape(block.text);
        return `<p class="resume-entry${block.date?' resume-dated-entry':''}"><span>${text}</span>${block.date?`<span class="resume-date">${escape(block.date)}</span>`:''}</p>`;
      }
      return `<p class="resume-${block.kind}">${escape(block.text)}</p>`;
    }).join('');
  }
  function report(){
    $('tailor-analysis').hidden=!draft;if(!draft)return;
    const r=draft.report;
    const tags=items=>items.map(item=>`<span class="skill-tag">${escape(item)}</span>`).join('');
    const included=r.matched.filter(item=>item.included),omitted=r.matched.filter(item=>!item.included);
    const priorityLabel=priority=>({required:'Required wording',preferred:'Preferred wording',mentioned:'Review requirement'})[priority];
    $('tailor-report').innerHTML=`
      <p class="field-help">Compare the job requirements with your existing experience. Matching wording does not verify proficiency, years of experience or eligibility.</p>
      ${dirty?'<p class="confirmation">This report describes the saved draft. Save your edits to refresh it.</p>':''}
      <h3>Included with source evidence</h3>
      <div class="skill-tags">${tags(included.map(item=>item.keyword))||'<span class="quiet">No recognised matches. Review your experience against the full listing.</span>'}</div>
      ${omitted.length?`<h3>In your source, missing from this draft</h3><div class="skill-tags missing-skills">${tags(omitted.map(item=>item.keyword))}</div><p class="field-help">Restore the relevant source sentence if you removed it while editing, keeping its context and qualifications.</p>`:''}
      <h3>Not found in your source</h3>
      <div class="skill-tags missing-skills">${tags(r.missing)||'<span class="quiet">No gaps among recognised terms. Other requirements still need review.</span>'}</div>
      ${r.missingRequired.length?`<p class="confirmation"><strong>Required wording to check:</strong> ${escape(r.missingRequired.join(', '))}.</p>`:''}
      <p class="field-help">If you have this experience, add a specific, accurate example to your source and regenerate. Otherwise leave the gap visible.</p>
      ${r.added.length?`<p class="confirmation">Your draft includes terms not found in its source: ${escape(r.added.join(', '))}. Check those claims before applying.</p>`:''}
      <details class="tailor-evidence" ${r.requirements.length?'open':''}><summary>Requirements to review · ${r.requirementsTotal}</summary>
        <p>These excerpts are identified from JD wording. No requirement is marked as met automatically. Check duration, proficiency, qualifications, location and work authorisation yourself.</p>
        <ul>${r.requirements.map(item=>`<li><strong>${priorityLabel(item.priority)}</strong><br>${escape(item.text)}</li>`).join('')||'<li>No explicit requirements identified. Read the full listing to check for other conditions.</li>'}</ul>
        ${r.requirementsTotal>r.requirements.length?`<p>Showing ${r.requirements.length} of ${r.requirementsTotal} excerpts. Check the full job description for the rest.</p>`:''}
      </details>
      <details class="tailor-evidence"><summary>See the source evidence</summary>${r.matched.map(item=>`<p><strong>${escape(item.keyword)}</strong> · ${priorityLabel(item.priority)}<br>${escape(item.evidence)}</p>`).join('')||'<p>No recognised keyword evidence.</p>'}</details>
      <details class="tailor-evidence"><summary>What changed</summary><ul>${draft.changes.map(change=>`<li>${escape(change)}</li>`).join('')}</ul></details>
      <div class="tailor-checks">${r.checks.map(check=>`<p>${check.ok?'✓':'○'} ${escape(check.label)}</p>`).join('')}</div>`;
  }
  function setDraft(value){draft=value;$('tailor-editor').value=value.resumeText;dirty=false;sourceChanged=false;preview();report();status();}
  function jobs(){const previous=$('tailor-saved-role').value;$('tailor-saved-role').innerHTML='<option value="">Paste a new job description</option>'+getState().jobs.map(job=>`<option value="${escape(job.id)}">${escape(job.company)} · ${escape(job.title)}</option>`).join('');$('tailor-saved-role').value=previous;}
  function sourceEdited(){sourceChanged=!!draft;status();}
  for(const id of inputIds)$(id).addEventListener('input',sourceEdited);
  $('tailor-use-profile').addEventListener('click',()=>{$('tailor-source').value=getState().profile.resumeText||'';sourceEdited();if(!$('tailor-source').value)error('Upload your résumé in Your profile, or paste its text here.');});
  $('tailor-saved-role').addEventListener('change',()=>{const job=getState().jobs.find(job=>job.id===$('tailor-saved-role').value);if(job){$('tailor-job-title').value=job.title;$('tailor-company').value=job.company;$('tailor-description').value=job.description;sourceEdited();}});
  $('tailor-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    if(!$('tailor-source').checkValidity())$('tailor-source-details').open=true;
    if(!$('tailor-form').reportValidity())return;
    busy=true;error('');buttons();
    try{setDraft(await api('/tailor/generate',currentInput()));notify('Résumé rearranged and saved. Review it before downloading.');}
    catch(e){error(e.message);}
    finally{busy=false;status();}
  });
  $('tailor-source').addEventListener('invalid',()=>{$('tailor-source-details').open=true;});
  $('tailor-editor').addEventListener('input',()=>{dirty=true;preview();report();status();});
  async function save(){
    if(!dirty)return;
    draft=await api('/tailor/save',{id:draft.id,expectedUpdatedAt:draft.updatedAt,resumeText:$('tailor-editor').value});dirty=false;report();status();
  }
  $('tailor-save').addEventListener('click',async()=>{if(busy||!draft||sourceChanged)return;busy=true;error('');buttons();try{await save();notify('Résumé edits saved.');}catch(e){error(e.message);}finally{busy=false;status();}});
  document.querySelectorAll('[data-tailor-tab]').forEach(button=>button.addEventListener('click',()=>{selectedTab=button.dataset.tailorTab;$('tailor-preview').hidden=selectedTab!=='preview';$('tailor-editor-wrap').hidden=selectedTab!=='edit';document.querySelectorAll('[data-tailor-tab]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));}));
  document.querySelectorAll('[data-tailor-download]').forEach(button=>button.addEventListener('click',async()=>{
    if(busy||!draft||sourceChanged)return;busy=true;buttons();error('');
    try{
      await save();
      const response=await browserFetch('/api/tailor/export',{method:'POST',headers:{'X-JobPilot':'1','Content-Type':'application/json'},body:JSON.stringify({id:draft.id,expectedUpdatedAt:draft.updatedAt,format:button.dataset.tailorDownload})});
      if(!response.ok){const result=await response.json();throw new Error(result.error||'Export failed.');}
      const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]||`Resume.${button.dataset.tailorDownload}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);notify('Your résumé download is ready.');
    }catch(e){error(e.message);}finally{busy=false;status();}
  }));
  return {async enter(){
    jobs();
    if(!initialized){
      // A page load starts a new workspace; ordinary sidebar navigation keeps this session.
      $('tailor-form').reset();
      fillInput({sourceText:getState().profile.resumeText||''});
      $('tailor-saved-role').value='';
      $('tailor-editor').value='';
      $('tailor-preview').hidden=false;
      $('tailor-editor-wrap').hidden=true;
      $('tailor-source-details').open=!$('tailor-source').value;
      $('tailor-report').innerHTML='';
      document.querySelectorAll('[data-tailor-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tailorTab==='preview')));
      error('');report();initialized=true;
    }
    else if(draft&&!dirty&&!sourceChanged){const saved=await api('/tailor');if(saved.draft&&(saved.draft.updatedAt!==draft.updatedAt||saved.draft.report.version!==draft.report.version)){fillInput(saved.draft);setDraft(saved.draft);}else if(!saved.draft){draft=null;fillInput({sourceText:getState().profile.resumeText||''});$('tailor-editor').value='';$('tailor-preview').innerHTML='<div class="tailor-empty"><h3>Create your next résumé.</h3><p>Add a job description to generate a draft.</p></div>';report();}}
    status();
  }};
}
