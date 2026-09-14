// The approval changes when the selected job, draft, or candidate details change.
export async function approvalStamp(state, job) {
  const value=JSON.stringify({id:job.id,url:job.url,title:job.title,company:job.company,opening:job.preparation?.opening,profile:state.profile,resume:state.resume});
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

// Self-contained because Chrome serializes this function into the selected tab.
export function inspectSubmission({expectedUrl,commit=false,customAnswersReviewed=false}={}) {
  const blockers=[];
  if (!expectedUrl || window.location.href.split('#')[0]!==expectedUrl.split('#')[0]) return {ready:false,blockers:['The page changed. Confirm the application page again.']};
  const visible=el=>el.getClientRects().length>0 && !el.hidden && getComputedStyle(el).visibility!=='hidden' && !el.closest('[hidden],[aria-hidden="true"]');
  const label=el=>([...(el.labels||[])].map(n=>n.textContent).join(' ')||el.getAttribute('aria-label')||(el.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim()||el.closest('.ashby-application-form-field-entry')?.querySelector('label')?.textContent||el.name||el.id||'Question').replace(/[_*]/g,' ').replace(/\s+/g,' ').trim();
  const submitName=el=>(el.innerText||el.value||el.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim();
  // Ashby keeps the submit button beside its field container in one application tabpanel.
  // Keep input filling in the field container, and only associate actions in its owning panel.
  const submissionScope=form=>{
    if(form.tagName==='FORM')return form;
    const panel=form.closest('[role="tabpanel"]');
    return panel?.querySelectorAll('.ashby-application-form-container').length===1?panel:form;
  };
  const submitButtons=form=>[...submissionScope(form).querySelectorAll(form.tagName==='FORM'?'button[type="submit"],input[type="submit"],button:not([type])':'button.ashby-application-form-submit-button')].filter(el=>visible(el)&&/^(?:submit(?: (?:my |your )?application)?|apply(?: now)?|send application)$/i.test(submitName(el)));
  const candidates=[...document.forms,...document.querySelectorAll('.ashby-application-form-container:not(form)')].filter(form=>!form.closest('form')||form.tagName==='FORM');
  const forms=candidates.filter(form=>{
    const fields=[...form.querySelectorAll('input')].filter(visible);
    const email=fields.some(el=>el.type==='email'||/^(?:your )?e.?mail(?: address)?$/i.test(label(el)));
    const name=fields.some(el=>/^(?:(?:first|last|full|given|family|your|candidate) )?name$/i.test(label(el)));
    const resume=[...form.querySelectorAll('input[type=file]')].some(el=>/resume|résumé|\bcv\b/i.test(label(el)));
    return email&&(name||resume)&&submitButtons(form).length>0;
  });
  if(forms.length!==1)return {ready:false,blockers:[forms.length?'More than one application form was found. Submit manually.':'Open a supported application form first. Embedded forms may need their own tab.']};
  const form=forms[0],formKind=form.tagName==='FORM'?'html':'ashby',formIndex=formKind==='html'?[...document.forms].indexOf(form):undefined,buttons=submitButtons(form);
  const descriptor={formKind,...(formKind==='html'?{formIndex}:{})};
  const actionScope=submissionScope(form);
  const fields=form.elements?[...form.elements]:[...form.querySelectorAll('input,textarea,select')];
  if(buttons.length!==1)blockers.push('The submission button is ambiguous. Submit manually.');
  if(buttons[0]?.disabled || buttons[0]?.getAttribute('aria-disabled')==='true')blockers.push('The submit button is not ready. Finish any upload or verification.');
  // HTML validation plus explicit required fields (including forms using novalidate).
  for(const field of fields) {
    if(field.disabled || ['hidden','submit','button'].includes(field.type))continue;
    const entryLabel=field.closest('.ashby-application-form-field-entry')?.querySelector('label');
    const required=field.required||field.getAttribute('aria-required')==='true'||Boolean(entryLabel&&[...entryLabel.classList].some(name=>/^_required_/.test(name)));
    const entry=field.closest('.ashby-application-form-field-entry');
    const uploaded=formKind==='ashby'&&field.type==='file'&&Boolean(entry?.querySelector('.ashby-application-form-input-file-item-name')?.textContent.trim())&&Boolean(entry?.querySelector('.ashby-application-form-input-file-item-delete'));
    if(formKind==='ashby'&&field.type==='file'&&field.files?.length&&!uploaded)blockers.push(`${label(field)}: wait for the upload to finish, then check again.`);
    const missing=required&&!uploaded&&(field.type==='file'?!field.files.length:field.type==='checkbox'?!field.checked:field.type==='radio'?!fields.some(other=>other.type==='radio'&&other.name===field.name&&other.checked):!String(field.value||'').trim());
    if(missing || (!uploaded && field.willValidate && !field.validity.valid))blockers.push(label(field));
    if(required&&field.getAttribute('role')==='combobox'){
      const reviewedLocation=formKind==='ashby'&&entry?.dataset.fieldPath==='_systemfield_location'&&customAnswersReviewed===true&&String(field.value||'').trim()&&field.getAttribute('aria-expanded')==='false';
      if(!reviewedLocation)blockers.push(`${label(field)}: choose a suggestion on the employer page and confirm your review before auto-apply.`);
    }
  }
  if([...form.querySelectorAll('[role="combobox"][aria-required="true"], [role="listbox"][aria-required="true"]')].some(el=>!(formKind==='ashby'&&el.closest('[data-field-path="_systemfield_location"]')&&el.tagName==='INPUT')))blockers.push('This form uses a custom required control. Review and submit it manually.');
  const captcha=[...document.querySelectorAll('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],.g-recaptcha,.h-captcha,[data-sitekey]')].some(visible);
  const captchaAnswered=[...document.querySelectorAll('[name="g-recaptcha-response"],[name="h-captcha-response"]')].some(el=>el.value?.trim());
  if(captcha&&!captchaAnswered)blockers.push('Complete the CAPTCHA on the employer page.');
  if(/by (?:clicking|submitting|applying)[\s\S]{0,200}(?:agree|accept|consent)/i.test(actionScope.innerText))blockers.push('Submission includes an agreement. Review and submit this form yourself.');
  if(form.action && new URL(form.action,location.href).origin!==location.origin)blockers.push('This form submits to another website. Review and submit it manually.');
  if([...actionScope.querySelectorAll('[role="alert"],.field-error,[aria-invalid="true"]')].some(el=>visible(el)&&(el.textContent.trim()||el.getAttribute('aria-invalid')==='true')))blockers.push('The employer is showing a validation error.');
  const unique=[...new Set(blockers)];
  if(unique.length)return {ready:false,...descriptor,blockers:unique,clicked:false};
  if(commit) { buttons[0].click();return {ready:true,...descriptor,blockers:[],clicked:true}; }
  return {ready:true,...descriptor,blockers:[],clicked:false};
}

export async function waitForConfirmation({previous='',timeout=12000}={}) {
  function read() {
    const lines=document.body.innerText.split('\n').map(line=>line.trim()).filter(Boolean);
    const message=lines.filter(line=>/^(?:thank you for (?:applying|your application)|your application (?:has been |was )?(?:successfully )?(?:submitted|received)|application (?:has been |was )?(?:successfully )?(?:submitted|received)|we(?:’ve|'ve| have) received your application|you(?:’ve|'ve| have) successfully applied)/i.test(line)&&!/\b(?:not|failed|unable|example)\b/i.test(line)).slice(0,3).join('\n').slice(0,3000);
    return message&&message!==previous?{note:message,url:location.href}:null;
  }
  const immediate=read();if(immediate)return immediate;
  return new Promise(resolve=>{
    let timer;const observer=new MutationObserver(()=>{const found=read();if(found){clearTimeout(timer);observer.disconnect();resolve(found);}});
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    timer=setTimeout(()=>{observer.disconnect();resolve(null);},timeout);
  });
}
