import {fillApplication} from '/extension/automation.js';
let submissions=0;document.getElementById('fixture').addEventListener('submit',event=>{event.preventDefault();submissions++;});
document.getElementById('run-tests').addEventListener('click',()=>{const results=[];const check=(label,condition)=>results.push(`${condition?'PASS':'FAIL'}: ${label}`);const profile={name:'Test Candidate',firstName:'Test',lastName:'Candidate',email:'test@example.org',phone:'+353123456789',location:'Dublin',portfolio:'https://example.org',github:'https://github.com/example',linkedin:'https://www.linkedin.com/in/example'};const report=fillApplication({formIndex:0,profile,resume:{name:'test-resume.pdf',base64:btoa('%PDF-test fixture')}});check('Fills first name',document.querySelector('[name=first_name]').value==='Test');check('Fills last name',document.querySelector('[name=last_name]').value==='Candidate');check('Fills email',document.querySelector('[type=email]').value===profile.email);check('Attaches PDF',document.querySelector('[type=file]').files[0]?.name==='test-resume.pdf');check('Preserves existing answers',document.querySelector('[name=current_company]').value==='Keep existing answer');check('Leaves eligibility unanswered',document.querySelector('[name=work_authorization]').value==='');check('Leaves salary unanswered',document.querySelector('[name=salary]').value==='');check('Leaves consent unchecked',!document.querySelector('[type=checkbox]').checked);check('Reports unsupported required questions',report.untouched.some(item=>item.includes('authorization')));check('Does not submit',submissions===0);const second=fillApplication({formIndex:0,profile:{...profile,email:'changed@example.org'}});check('Does not overwrite completed fields',document.querySelector('[type=email]').value===profile.email);check('Second fill is idempotent',second.filled.length===0);document.getElementById('results').textContent=results.join('\n');});

import {inspectSubmission,waitForConfirmation} from '/extension/submission.js';
document.getElementById('run-submission-tests').addEventListener('click',async()=>{
  const results=[];const check=(label,value)=>results.push(`${value?'PASS':'FAIL'}: ${label}`);
  const form=document.getElementById('fixture');form.reset();submissions=0;
  const expectedUrl=location.href;
  const initial=inspectSubmission({expectedUrl});check('Identifies application form, excludes newsletter',initial.formIndex===0);
  check('Incomplete form is blocked',!initial.ready);
  fillApplication({profile:{firstName:'Test',lastName:'Candidate',email:'test@example.org'},resume:{name:'test.pdf',base64:btoa('%PDF-test')},opening:'My approved introduction.',formIndex:0,expectedUrl});
  check('Fills the approved introduction',form.elements.cover_letter.value==='My approved introduction.');
  check('Leaves newsletter untouched',document.querySelector('[name=newsletter_email]').value==='');
  let report=inspectSubmission({expectedUrl,commit:true});check('Does not submit unanswered questions',submissions===0&&!report.clicked);
  form.elements.work_authorization.value='Test fixture answer';form.elements.salary.value='Test fixture answer';form.querySelector('[type=checkbox]').checked=true;
  report=inspectSubmission({expectedUrl});check('Completed standard form is ready',report.ready);
  report=inspectSubmission({expectedUrl:expectedUrl+'?changed=1',commit:true});check('Changed page is blocked',!report.ready&&submissions===0);
  const captcha=document.createElement('div');captcha.className='g-recaptcha';captcha.textContent='CAPTCHA fixture';form.append(captcha);
  check('Unsolved CAPTCHA blocks submission',!inspectSubmission({expectedUrl}).ready);captcha.remove();
  const terms=document.createElement('p');terms.textContent='By submitting you agree to our terms.';form.append(terms);
  check('Submission agreements require manual action',!inspectSubmission({expectedUrl}).ready);terms.remove();
  report=inspectSubmission({expectedUrl,commit:true});check('Approved complete form is submitted exactly once',report.clicked&&submissions===1);
  const notice=document.createElement('p');notice.textContent='Your application was not received.';document.body.append(notice);
  check('Negative message is not confirmation',!(await waitForConfirmation({timeout:1})));
  notice.textContent='Thank you for applying. Your application was received.';
  check('Positive confirmation is detected',!!(await waitForConfirmation({timeout:1})));
  notice.remove();document.getElementById('submission-results').textContent=results.join('\n');
});
