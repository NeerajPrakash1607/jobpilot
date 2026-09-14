// These self-contained functions also run in Chrome's isolated page world.
export function captureListing() {
  const walk=value=>{if(Array.isArray(value))return value.map(walk).find(Boolean);if(!value||typeof value!=='object')return null;if([value['@type']].flat().includes('JobPosting'))return value;return Object.values(value).map(walk).find(Boolean);};
  let schema;
  for(const node of document.querySelectorAll('script[type="application/ld+json"]')){try{schema=walk(JSON.parse(node.textContent));}catch{}if(schema)break;}
  const plain=html=>{const node=document.createElement('div');node.innerHTML=html;return node.textContent.trim();};
  const location=schema?.jobLocation?.address;
  const content=document.querySelector('#jobDescriptionText, #content .content, .section-wrapper, [data-testid="job-description"], .job-description, main, [role="main"]');
  return {url:window.location.href,title:schema?.title||document.querySelector('h1')?.innerText||'',company:schema?.hiringOrganization?.name||document.querySelector('[data-testid="inlineHeader-companyName"], .company-name')?.innerText||'',location:location?[location.addressLocality,location.addressRegion,location.addressCountry].filter(Boolean).join(', '):'',description:(schema?.description?plain(schema.description):content?.innerText||'').slice(0,100000),salary:''};
}
export function fillApplication(payload) {
  const {profile,resume}=payload;const filled=[];const untouched=[];
  if(payload.expectedUrl && window.location.href.split('#')[0] !== payload.expectedUrl.split('#')[0]) return {filled,untouched:['The page changed. Confirm the application page again.'],blocked:true};
  const ashby=[...document.querySelectorAll('.ashby-application-form-container:not(form)')];
  const scope=payload.formKind==='ashby'?(ashby.length===1?ashby[0]:null):Number.isInteger(payload.formIndex)?document.forms[payload.formIndex]:null;
  if(!scope)return {filled,untouched:['The application form changed. Start again.'],blocked:true};
  const sensitive=/password|captcha|social.security|passport|birth|gender|ethnic|race\b|disabil|veteran|citizenship|nationality|sponsor|visa|work.authori|right.to.work|salary|compensation|criminal|consent|agree|signature|legal|age\b/i;
  const values={'given-name':profile.firstName,'family-name':profile.lastName,'name':profile.name,'email':profile.email,'tel':profile.phone,'address-level2':profile.location};
  function visible(el){return !el.disabled&&!el.readOnly&&el.type!=='hidden'&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[hidden],[aria-hidden="true"]');}
  function describe(el){const label=[...(el.labels||[])].map(node=>node.textContent).join(' ');const aria=el.getAttribute('aria-label')||(el.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim();const ashbyLabel=el.closest('.ashby-application-form-field-entry')?.querySelector('label')?.textContent;return (label||aria||ashbyLabel||el.name||el.id||el.placeholder||'').replace(/[_\-*]/g,' ').replace(/\s+/g,' ').trim();}
  function match(el,label){const normalized=label.toLowerCase();const autocomplete=el.autocomplete?.split(' ').at(-1);if(values[autocomplete])return values[autocomplete];if(/^(?:first|given) name(?:\b|$)/.test(normalized))return values['given-name'];if(/^(?:last|family|sur)name(?:\b|$)|^(?:last|family) name/.test(normalized))return values['family-name'];if(/^(?:full |your |candidate |legal )?name(?:\s*\([^)]*\))?$/.test(normalized))return profile.name;if(/^(?:your |contact )?e ?mail(?: address)?(?:\s*\([^)]*\))?$/.test(normalized)||el.type==='email')return profile.email;if(/^(?:your |contact |mobile )?(?:phone|telephone|mobile)(?: number)?(?:\s*\([^)]*\))?$/.test(normalized)||el.type==='tel')return profile.phone;if(el.tagName==='TEXTAREA' && /^(?:tell us (?:a bit|a little|something) about yourself|about (?:you|yourself)|introduce yourself)[?.!]?$/.test(normalized))return profile.summary || payload.opening;if(payload.opening && /^(?:cover letter|covering letter|cover letter text|application introduction)(?:\s*\([^)]*\))?$/.test(normalized) && el.tagName==='TEXTAREA')return payload.opening;if(/linkedin/.test(normalized))return profile.linkedin;if(/github/.test(normalized))return profile.github;if(/^(?:personal |your )?(?:portfolio|website)(?: url| link)?(?:\s*\([^)]*\))?$/.test(normalized))return profile.portfolio;return null;}
  for(const field of scope.querySelectorAll('input,textarea,select')){
    if(!visible(field))continue;const label=describe(field);if(field.getAttribute('role')==='combobox'){untouched.push(`${label}: choose a suggestion on the employer page`);continue;}if(sensitive.test(label)||['password','checkbox','radio','submit','button','hidden'].includes(field.type)){if(field.required)untouched.push(label||'Required question');continue;}
    if(field.type==='file'){
      if(payload.formKind==='ashby'&&field.closest('.ashby-application-form-field-entry')?.querySelector('.ashby-application-form-input-file-item-name'))continue;
      if(!resume||field.files.length||!/resume|résumé|\bcv\b/i.test(label)){if(field.required)untouched.push(label||'Required upload');continue;}
      if(field.accept&&!/pdf|\.pdf|\*/i.test(field.accept)){untouched.push(`${label}: PDF not accepted`);continue;}
      try{const bytes=Uint8Array.from(atob(resume.base64),c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes],resume.name,{type:'application/pdf'}));field.files=transfer.files;field.dispatchEvent(new Event('change',{bubbles:true}));filled.push(label||'Résumé');}catch{untouched.push(`${label}: attach the PDF manually`);}continue;
    }
    if(field.value?.trim())continue;
    const value=match(field,label);if(!value){if(field.required)untouched.push(label||'Required question');continue;}
    if(field.tagName==='SELECT'){const option=[...field.options].find(option=>option.value.toLowerCase()===value.toLowerCase()||option.text.toLowerCase()===value.toLowerCase());if(!option){untouched.push(label);continue;}field.value=option.value;}else{const proto=field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;if(setter)setter.call(field,value);else field.value=value;}
    field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));filled.push(label);
  }
  return {filled,untouched,iframes:document.querySelectorAll('iframe').length};
}
export function readConfirmation(){const text=document.body.innerText;const lines=text.split('\n').map(line=>line.trim()).filter(Boolean);const matches=lines.filter(line=>/thank you for (?:applying|your application)|application (?:has been |was )?(?:submitted|received|successfully)|successfully (?:submitted|applied)|we(?:’|'| a)?ve received your application/i.test(line)).slice(0,4);return {url:window.location.href,note:matches.join('\n').slice(0,3000)};}
