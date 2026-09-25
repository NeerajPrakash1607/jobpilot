import {readVisit,VISIT_KEY} from './lib/visit-history.mjs';
import {resumeSkillEvidence} from './lib/job-matching.mjs';
import {searchTakeoff, flyToApplications} from './motion.js';
import {unconnectedCompanyLinks} from './lib/company-sources.mjs';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const when = value => value ? new Date(value).toLocaleString('en-IE', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : 'Not checked yet';
const healthNames = {fresh:'Up to date',partial:'Partial coverage',stale:'Not recently verified',unchecked:'Not checked yet',unavailable:'Check failed',unsupported:'Automatic checking unavailable'};
const arrangementNames = {remote:'Remote',hybrid:'Hybrid',onsite:'Onsite'};
const levelNames = {any:'Any experience',entry:'Early career · 0–2 years required',mid:'Mid level',senior:'Senior / management'};
const emptySearch = {companies:[],roles:'',city:'',level:'any',arrangement:'any',sponsorship:'any',includeInternships:false,includeApprenticeships:false};
const companyOrder = (a,b) => a.name.localeCompare(b.name,'en',{sensitivity:'base',numeric:true});

export function createWatchUI({notify, saveJob, getSavedJobs, getLegacyCompanies, getProfile}) {
  let companies = [], selection = new Set(), jobs = [], visible = 20, state = null;
  let initialized = false, filterRevision = 0, totalMatches = 0, checking = false, saving = new Set();
  let alertDraft = null, authPurpose = 'alerts', alertBusy = false, legacy = [], previewJob = null;
  let requestedLinks = [], onlyNew = false, newCount = 0, visit = null;
  function startVisit() {
    if (visit) return;
    let raw = null; try { raw = localStorage.getItem(VISIT_KEY); } catch {}
    visit = readVisit(raw,Date.now());
  }
  function rememberVisit() {
    try { localStorage.setItem(VISIT_KEY,JSON.stringify({since:visit.since,lastSeen:Date.now()})); } catch {}
  }
  const dialogFocus = new Map();
  const mobileLayout = matchMedia('(max-width: 900px)');
  const desktopRail = matchMedia('(min-width: 1101px)');
  const filterPanel = $('search-filter-panel');
  function arrangeFilters() {
    filterPanel.open = !mobileLayout.matches;
    filterPanel.querySelector('summary').tabIndex = desktopRail.matches ? -1 : 0;
  }
  arrangeFilters();
  mobileLayout.addEventListener('change',arrangeFilters);
  desktopRail.addEventListener('change',arrangeFilters);
  filterPanel.querySelector('summary').addEventListener('click',e => { if (desktopRail.matches) e.preventDefault(); });
  async function api(route, data) {
    const response = await fetch('/watch-api' + route, {method:data ? 'POST':'GET',headers:{'X-JobPilot':'1',...(data ? {'Content-Type':'application/json'}:{})},...(data ? {body:JSON.stringify(data)}:{})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Please try again.');
    return result;
  }
  function showDialog(id) {
    const dialog = $(id);
    dialogFocus.set(id, document.activeElement);
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('flow-open');
  }
  function closeDialog(id) { $(id).close(); }
  for (const id of ['company-dialog','alert-dialog','job-dialog','guide-dialog']) {
    $(id).addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) document.body.classList.remove('flow-open');
      const el = dialogFocus.get(id); if (el?.isConnected && el.getClientRects().length) el.focus();
    });
    $(id).addEventListener('click', e => {
      if (e.target !== $(id)) return;
      const r = e.target.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(id);
    });
  }
  document.querySelectorAll('[data-close-dialog]').forEach(b => b.addEventListener('click', () => closeDialog(b.dataset.closeDialog)));
  function error(message, flow = false) { const el = $(flow ? 'watch-flow-error':'watch-error'); el.textContent = message || ''; el.hidden = !message; }
  function celebrate(element) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    element.classList.remove('happy-pop'); void element.offsetWidth; element.classList.add('happy-pop');
    const burst = document.createElement('span'); burst.className = 'success-burst'; burst.setAttribute('aria-hidden','true');
    for (let i = 0; i < 9; i++) { const dot = document.createElement('i'); dot.style.setProperty('--i',i); burst.append(dot); }
    element.append(burst); setTimeout(() => { burst.remove(); element.classList.remove('happy-pop'); },1000);
  }
  const preferences = () => ({...Object.fromEntries(new FormData($('watch-filter-form'))),companies:[...selection],includeInternships:$('watch-includeInternships').checked,includeApprenticeships:$('watch-includeApprenticeships').checked});
  function populate(prefs) {
    selection = new Set(prefs.companies.filter(id => companies.some(c => c.id === id && c.supported)));
    for (const key of ['roles','city','level','arrangement','sponsorship']) $('watch-' + key).value = prefs[key] || emptySearch[key];
    for (const key of ['includeInternships','includeApprenticeships']) $('watch-'+key).checked = prefs[key] === true;
    renderCompanies();
  }
  const isSaved = job => getSavedJobs().some(j => j.url === job.url);
  function renderCompanies() {
    const query = $('watch-company-filter').value.trim().toLowerCase();
    const connected = companies.filter(c => c.supported).sort(companyOrder);
    const picked = connected.filter(c => selection.has(c.id));
    $('watch-selected-count').textContent = !picked.length ? 'All companies' : picked.length === 1 ? picked[0].name : `${picked.length} companies`;
    const focusId = document.activeElement?.dataset.watchCompany, scroll = $('watch-companies').scrollTop;
    requestedLinks = unconnectedCompanyLinks(companies,state?.requests || [],legacy).sort(companyOrder);
    const directory = [...connected,...requestedLinks.map((c,index) => ({...c,reviewIndex:index,supported:false}))].sort(companyOrder);
    const matches = directory.filter(c => c.name.toLowerCase().includes(query));
    $('watch-companies').innerHTML = matches.length ? matches.map(c => c.supported
      ? `<div class="company-choice ${selection.has(c.id) ? 'selected':''}"><label><input type="checkbox" data-watch-company="${escape(c.id)}" ${selection.has(c.id) ? 'checked':''}><span class="company-avatar" aria-hidden="true">${escape(c.name.slice(0,2))}</span><span class="company-choice-name"><strong>${escape(c.name)}</strong><span>${c.lastSuccess ? `${c.count} Ireland / eligible remote jobs` : 'Count not available yet'} · ${healthNames[c.health]}</span></span></label><details class="company-coverage"><summary>Coverage</summary><p>Last successful check: ${when(c.lastSuccess)}${c.partial ? '. Some employer listings may be missing.':''}${c.note ? '. '+escape(c.note):''}</p><a href="${escape(c.url)}" target="_blank" rel="noopener noreferrer">Official careers page ↗</a></details></div>`
      : `<div class="company-choice company-link"><div class="company-link-header"><span class="company-avatar" aria-hidden="true">${escape(c.name.slice(0,2))}</span><span class="company-choice-name"><strong>${escape(c.name)}</strong><span>${c.checkedAt ? 'Saved link · Connection needs attention':c.ready ? 'Saved careers link · Ready to connect':'Saved link · Not connected'}</span></span></div><p class="connection-reason">${escape(c.message)}</p>${c.checkedAt?`<p class="connection-checked">Last connection attempt: ${when(c.checkedAt)}</p>`:''}<div class="company-link-actions"><a href="${escape(c.url)}" target="_blank" rel="noopener noreferrer">Open careers page ↗</a><button type="button" class="text-button" data-review-company="${c.reviewIndex}">${c.ready&&!c.checkedAt ? 'Review and connect':'Retry connection'}</button><button type="button" class="text-button" data-change-company="${c.reviewIndex}">Change link</button></div><details class="company-coverage"><summary>About this link</summary><p>This link stays in your list. It contributes no job counts or alerts until a public feed is verified. ${escape(c.message)}</p></details></div>`
    ).join('') : `<p class="company-no-match">${query ? `“${escape($('watch-company-filter').value)}” isn’t in your list yet. Add its careers page below.` : 'The company directory is loading.'}</p>`;
    $('watch-companies').scrollTop = scroll;
    if (focusId) [...$('watch-companies').querySelectorAll('input')].find(el => el.dataset.watchCompany === focusId)?.focus({preventScroll:true});
    $('watch-selection-chips').innerHTML = picked.map(c => `<button type="button" class="selection-chip" data-remove-company="${escape(c.id)}" aria-label="Remove ${escape(c.name)} filter">${escape(c.name)} <span aria-hidden="true">×</span></button>`).join('');
    const count = ['level','arrangement','sponsorship'].filter(k => $('watch-'+k).value !== 'any').length + ['includeInternships','includeApprenticeships'].filter(k => $('watch-'+k).checked).length;
    $('watch-filter-count').textContent = count ? `(${count})` : '';
    $('watch-filter-summary').textContent = [$('watch-roles').value.trim() || 'All roles', $('watch-city').value.trim() || 'Ireland', picked.length ? `${picked.length} ${picked.length === 1 ? 'company':'companies'}` : ''].filter(Boolean).join(' · ');
  }
  function renderJobs(animateFrom = 0) {
    $('watch-new-toggle').setAttribute('aria-pressed',String(onlyNew));
    $('watch-new-toggle').textContent = `New since last visit (${newCount})`;
    $('watch-visit-note').textContent = visit?.returning ? `Found since ${when(visit.since)} · This browser` : 'Your first visit: new jobs will be highlighted when you return in this browser.';
    $('watch-result-count').textContent = `${totalMatches.toLocaleString()} ${totalMatches === 1 ? 'job':'jobs'} ${onlyNew ? 'new since last visit':'to explore'}`;
    if (totalMatches > jobs.length) $('watch-result-count').textContent += ` · showing ${jobs.length}`;
    const sources = companies.filter(c => c.supported && (!selection.size || selection.has(c.id)));
    const missing = sources.filter(c => !['fresh','partial'].includes(c.health));
    const latest = Math.max(0,...sources.map(c => c.lastSuccess || 0));
    $('watch-freshness').textContent = missing.length ? `${missing.length} ${missing.length === 1 ? 'company needs':'companies need'} a fresh check · View coverage` : sources.some(c => c.partial) ? 'Partial coverage · See company details' : latest ? `Updated ${when(latest)} · View coverage` : 'Employer listings · View coverage';
    function row(job,index) {
      const saved = isSaved(job), source = companies.find(c => c.id === job.sourceId), fresh = ['fresh','partial'].includes(source?.health);
      const skills = resumeSkillEvidence(job,getProfile());
      return `<article class="job-result-row" style="--row:${Math.min(Math.max(0,index-animateFrom),6)};${index < animateFrom ? 'animation:none':''}"><div class="company-avatar job-avatar" aria-hidden="true">${escape(job.company.slice(0,2))}</div><div class="job-result-main"><span class="job-company-name">${escape(job.company)}</span>${visit&&job.firstSeen>visit.since?'<span class="new-job-badge">New since last visit</span>':''}<h3><button class="job-title-button" data-watch-detail="${escape(job.id)}">${escape(job.title)}</button></h3><div class="job-result-meta"><span>${escape(job.location)}</span>${arrangementNames[job.arrangement] ? `<span class="arrangement-tag">${arrangementNames[job.arrangement]}</span>`:''}${job.training!=='regular'?`<span class="arrangement-tag">${escape(job.training)}</span>`:''}${job.experience.kind==='clear'?`<span>${escape(job.experience.label)}</span>`:''}</div><p class="job-listing-dates">First found ${when(job.firstSeen)}${job.listingDate?` · Employer ${escape(job.dateLabel.toLowerCase())}: ${when(job.listingDate)}`:''}</p>${!fresh?`<p class="coverage-warning">Not recently verified · Last successful check: ${when(source?.lastSuccess)}</p>`:''}${job.group==='sponsorship_unknown'?'<p class="coverage-warning">Sponsorship not stated</p>':''}${job.experience.higherPreferred.length?`<p class="job-listing-dates">Higher experience preferred — see requirements.</p>`:''}${skills.compared&&skills.missing.length?`<p class="job-skill-gaps">Required skills not found in your résumé: ${escape(skills.missing.join(', '))}</p>`:''}</div><div class="job-row-actions"><button type="button" class="save-job ${saved ? 'is-saved':''}" data-watch-save="${escape(job.id)}" aria-label="${saved ? 'Saved':'Save'} ${escape(job.title)}" aria-pressed="${saved}" ${saved ? 'disabled':''}><span aria-hidden="true">${saved ? '✓':'+'}</span><span>${saved ? 'Saved':'Save'}</span></button><a class="apply-job" href="${escape(job.url)}" target="_blank" rel="noopener noreferrer" aria-label="Apply for ${escape(job.title)} on the employer website">Apply <span aria-hidden="true">↗</span></a></div></article>`;
    }
    const shown=jobs.slice(0,visible);
    const sections=[['matches','Matching roles','Closest role matches first, then most recently found.'],['sponsorship_unknown','Sponsorship not stated','These roles match your other filters. Ask the employer about sponsorship.'],['experience_unclear','Possible match — experience unclear','The available requirements do not confirm a 0–2-year match. These jobs stay on the website and are excluded from early-career emails.']];
    $('watch-results').innerHTML = onlyNew && !jobs.length ? '<div class="jobs-empty"><h3>No new matches since your last visit.</h3><p>Try different filters, or browse all matching jobs.</p><button type="button" class="button button-secondary" id="watch-show-all">Show all matching jobs</button></div>' : jobs.length ? sections.map(([group,title,help])=>{
      const items=shown.filter(j=>j.group===group);if(!items.length)return '';
      const showHeading=group!=='matches'||jobs.some(j=>j.group!=='matches');
      return `<section class="match-group" data-match-group="${group}" aria-label="${title}">${showHeading?`<div class="match-group-heading"><h3>${title} <span>(${jobs.filter(j=>j.group===group).length})</span></h3><p>${help}</p></div>`:''}${items.map((job)=>row(job,shown.indexOf(job))).join('')}</section>`;
    }).join('') : `<div class="jobs-empty"><img src="/assets/pilot.png" width="100" height="100" alt=""><h3>${sources.some(c => c.lastSuccess) ? 'No matches just yet.' : 'These companies haven’t been checked yet.'}</h3><p>${sources.some(c => c.lastSuccess) ? 'Try a broader role, another company or fewer filters.' : 'Open Company coverage to check listings. An unavailable count doesn’t mean there are no jobs.'}</p><button type="button" class="button button-secondary" id="watch-empty-reset">${sources.some(c => c.lastSuccess) ? 'Clear filters':'View company coverage'}</button></div>`;
    $('watch-more').hidden = visible >= jobs.length;
    $('watch-more').textContent = `Show ${Math.min(20,Math.max(0,jobs.length-visible))} more jobs`;
  }
  async function search() {
    startVisit();
    const revision = ++filterRevision, prefs = {...preferences(),since:visit.since,onlyNew};
    error(''); $('watch-search').disabled = true; $('watch-search').textContent = 'Searching'; $('watch-results').setAttribute('aria-busy','true');
    $('watch-filter-form').classList.add('motion-searching'); searchTakeoff();
    try {
      const r = await api('/jobs',prefs); if (revision !== filterRevision) return;
      rememberVisit(); newCount = r.newCount || 0; jobs = r.jobs; totalMatches = r.total; companies = r.companies; visible = 20; renderCompanies(); renderJobs();
    } catch(e) { if (revision === filterRevision) { error(e.message + (jobs.length ? ' Your previous results are still shown.':'')); if (!jobs.length) $('watch-results').innerHTML = '<div class="jobs-empty"><h3>Jobs couldn’t load.</h3><p>Please try Find jobs again shortly.</p></div>'; } }
    finally { if (revision === filterRevision) { $('watch-search').disabled = false; $('watch-search').innerHTML = 'Find jobs <span aria-hidden="true">↗</span>'; $('watch-filter-form').classList.remove('motion-searching'); $('watch-results').setAttribute('aria-busy','false'); } }
  }
  function resetFilters() { onlyNew = false; populate(emptySearch); search(); }
  function openCompanies() { renderCompanies(); showDialog('company-dialog'); $('watch-company-filter').focus(); }
  function showJob(job) {
    previewJob = job;
    const saved = isSaved(job), source = companies.find(c => c.id === job.sourceId);
    $('job-preview-content').innerHTML = `<p class="eyebrow">${escape(job.company)}</p><h2 id="job-preview-title">${escape(job.title)}</h2><p>${escape(job.location)}${arrangementNames[job.arrangement] ? ' · '+arrangementNames[job.arrangement]:''}</p><div class="job-preview-actions"><a class="button button-primary" href="${escape(job.url)}" target="_blank" rel="noopener noreferrer">Apply on company website ↗</a><button class="button button-secondary save-job ${saved ? 'is-saved':''}" data-watch-save="${escape(job.id)}" ${saved ? 'disabled':''}>${saved ? '✓ Saved':'Save job'}</button></div><p class="field-help">Applying opens the employer’s form. It doesn’t mark the job as applied.</p><div class="watch-reasons">${job.reasons.map(r => `<span>${escape(r)}</span>`).join('')}</div><h3>${job.summaryOnly ? 'Listing summary':'About the role'}</h3>${job.summaryOnly ? '<p class="field-help">The employer’s page has the full job description and requirements.</p>':''}<div class="job-description-text">${escape(job.description)}</div><p class="field-help">First found ${when(job.firstSeen)}${job.listingDate ? ` · Employer ${escape(job.dateLabel.toLowerCase())}: ${when(job.listingDate)}`:''} · Last successful company check: ${when(source?.lastSuccess)} · ${healthNames[source?.health] || 'Freshness unknown'}</p>`;
    const skills=resumeSkillEvidence(job,getProfile());
    const evidence=document.createElement('section');evidence.className='job-evidence';
    evidence.innerHTML=`<h3>Requirements at a glance</h3><p>${escape(job.experience.label)}</p>${[...new Set(job.experience.evidence)].map(line=>`<blockquote>${escape(line)}</blockquote>`).join('')}${job.experience.higherPreferred.map(line=>`<p><strong>Higher experience preferred:</strong> ${escape(line)}</p>`).join('')}<p><strong>${escape(job.sponsorship.label)}</strong>${job.sponsorship.evidence?` — ${escape(job.sponsorship.evidence)}`:''}</p><p class="field-help">Based on the available description. Check the employer’s full requirements before applying.</p>${skills.compared?`<h3>Résumé comparison · this browser only</h3><p>${skills.matched.length?`Required skills found: ${escape(skills.matched.join(', '))}`:'No required skill overlap recognised.'}</p>${skills.missing.length?`<p>Required skills not found in your résumé: ${escape(skills.missing.join(', '))}</p>`:''}<p class="field-help">This compares text, not your ability or hiring chances. It does not filter out jobs or personalise your emails.${skills.partial?' Only a listing summary was available.':''}</p>`:'<p class="field-help">Add your résumé in Your profile for a comparison kept only in this browser.</p>'}`;
    $('job-preview-content').append(evidence);
    showDialog('job-dialog');
  }
  async function handleJobAction(e) {
    const detail = e.target.closest('[data-watch-detail]');
    if (detail) return showJob(jobs.find(j => j.id === detail.dataset.watchDetail));
    const button = e.target.closest('[data-watch-save]'); if (!button) return;
    const job = jobs.find(j => j.id === button.dataset.watchSave) || previewJob;
    if (!job || saving.has(job.id) || isSaved(job)) return;
    saving.add(job.id); button.disabled = true; const originalLabel = button.innerHTML; button.textContent = 'Saving…';
    try { await saveJob(job); syncSaved(); celebrate(button); flyToApplications(button); }
    catch(err) { notify(err.message); button.disabled = false; button.innerHTML = originalLabel; }
    finally { saving.delete(job.id); }
  }
  function syncSaved() {
    document.querySelectorAll('[data-watch-save]').forEach(button => {
      const job = jobs.find(j => j.id === button.dataset.watchSave) || previewJob;
      if (job && isSaved(job)) { button.textContent = '✓ Saved'; button.classList.add('is-saved'); button.disabled = true; button.setAttribute('aria-pressed','true'); button.setAttribute('aria-label','Saved '+job.title); }
    });
  }
  function summary(prefs) {
    const names = companies.filter(c => prefs.companies.includes(c.id)).sort(companyOrder).map(c => c.name);
    return `<dl><div><dt>Companies</dt><dd>${escape(names.join(', ') || 'Choose a connected company')}</dd></div><div><dt>Role</dt><dd>${escape(prefs.roles || 'All roles')}</dd></div><div><dt>Location</dt><dd>${escape(prefs.city || 'Ireland & eligible remote')}</dd></div><div><dt>Preferences</dt><dd>${escape(levelNames[prefs.level])} · ${escape(arrangementNames[prefs.arrangement] || 'Any arrangement')} · ${prefs.sponsorship==='needed'?'Sponsorship needed; unstated shown separately':'Any sponsorship status'} · ${prefs.includeInternships?'Internships included':'No internships'} · ${prefs.includeApprenticeships?'Apprenticeships included':'No apprenticeships'}</dd></div></dl>`;
  }
  function reviewDraft() {
    const prefs = preferences();
    if (!prefs.companies.length) prefs.companies = companies.filter(c => c.supported).map(c => c.id);
    return prefs;
  }
  function accountUI() {
    if (!state) return;
    const a = state.account, existing = ['active','waitlisted'].includes(a?.status);
    $('watch-alert-open').innerHTML = a?.status === 'active' ? '<span aria-hidden="true">✉</span> Manage daily alerts' : a?.status === 'waitlisted' ? 'View alert waitlist' : '<span aria-hidden="true">✉</span> Email me matching jobs';
    $('watch-account-state').textContent = a ? `${a.name} · ${a.email} · ${a.status === 'active' ? 'Daily alerts active' : a.status === 'waitlisted' ? 'On the alert waitlist' : a.status === 'paused' ? 'Daily alerts paused' : 'Alerts not active'}` : 'Sign in with Google to keep this search and receive matching jobs by email. Browsing is always available.';
    $('watch-account-actions').innerHTML = a ? '' : `<button class="button button-primary" type="button" id="watch-signin" ${state.authReady ? '' : 'disabled'}>${state.authReady ? 'Continue with Google' : 'Google sign-in unavailable'}</button>`;
    $('watch-subscription-actions').hidden = !a || authPurpose === 'company';
    $('watch-alert-review').hidden = authPurpose === 'company';
    $('watch-alert-summary').innerHTML = summary(alertDraft || reviewDraft());
    $('watch-subscribe').textContent = existing ? (a.status === 'waitlisted' ? 'Save waitlist preferences':'Save alert changes') : 'Confirm daily alerts';
    $('watch-subscribe').disabled = alertBusy || (!existing && !state.alertsReady);
    $('watch-email-consent').closest('label').hidden = existing;
    $('watch-account-settings').hidden = !a;
    $('watch-pause').hidden = !existing;
    $('watch-pause').textContent = a?.status === 'waitlisted' ? 'Leave alert waitlist':'Pause daily alerts';
    $('watch-delete').disabled = !a;
    $('watch-company-signin').hidden = !!a;
    $('watch-request-form').querySelector('button').disabled = !a;
    $('watch-service-state').textContent = state.runnerHeartbeat ? `Background checker last ran ${when(state.runnerHeartbeat)}.` : 'Background checks have not completed yet.';
    $('watch-alert-message').textContent = authPurpose === 'company' ? 'Sign-in saves the company connection to your account. It does not activate email alerts.' : a?.status === 'waitlisted' ? `The free pilot has room for ${state.capacity} active subscribers. Your place is saved; emails haven’t started.` : a && !state.alertsReady && !existing ? 'New email subscriptions are not open yet. You can keep browsing jobs.' : '';
    renderCompanies();
  }
  async function loadState() { state = await api('/state'); accountUI(); }
  function openAlerts(purpose = 'alerts') {
    authPurpose = purpose; alertDraft = reviewDraft(); error('',true);
    $('watch-email-consent').checked = false; $('watch-alert-success').hidden = true;
    $('watch-alert-title').textContent = purpose === 'company' ? 'Save your company connection.' : 'Let the next role find you.';
    $('watch-alert-step').textContent = purpose === 'company' ? 'CONTINUE WITH YOUR ACCOUNT' : 'REVIEW & CONFIRM';
    accountUI(); showDialog('alert-dialog');
  }
  async function signIn() {
    const button = $('watch-signin'); if (button) button.disabled = true;
    try {
      const challenge = await api('/login-challenge',{});
      if (!window.google?.accounts?.id) await new Promise((resolve,reject) => {
        const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error('Google sign-in could not load. Try again.')); }; document.head.append(script);
      });
      window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,callback:async response => {
        try {
          await api('/google',{credential:response.credential}); await loadState(); $('watch-google-button').innerHTML = '';
          // Retain the exact search reviewed before sign-in; do not replace it with account defaults.
          if (authPurpose === 'company') { closeDialog('alert-dialog'); openCompanies(); $('watch-add-section').hidden = false; $('watch-request-message').textContent = 'Signed in. Check the careers link to continue.'; }
          else { accountUI(); notify('Signed in. Review your search and confirm daily emails.'); }
        } catch(e) { error(e.message,true); }
      }});
      window.google.accounts.id.renderButton($('watch-google-button'),{theme:'outline',size:'large',text:'continue_with'});
    } catch(e) { error(e.message,true); }
    finally { if ($('watch-signin')) $('watch-signin').disabled = !state.authReady; }
  }
  $('watch-account-actions').addEventListener('click',e => { if (e.target.closest('#watch-signin')) signIn(); });
  $('watch-subscribe').addEventListener('click',async () => {
    if (alertBusy) return;
    const existing = ['active','waitlisted'].includes(state.account?.status);
    if (!existing && !$('watch-email-consent').checked) return error('Please choose to receive daily emails before confirming.',true);
    if (!alertDraft?.companies.length) return error('Choose at least one connected company for alerts.',true);
    alertBusy = true; error('',true); $('watch-subscribe').disabled = true;
    try {
      await api('/preferences',alertDraft);
      if (!existing) await api('/subscribe',{consent:true});
      await loadState();
      $('watch-alert-review').hidden = true; $('watch-subscription-actions').hidden = true; $('watch-alert-success').hidden = false;
      const queued = state.account.status === 'waitlisted';
      $('watch-success-title').textContent = queued ? 'You’re on the waitlist.' : existing ? 'Your alerts are updated.' : 'Your daily alerts are ready!';
      $('watch-success-copy').textContent = queued ? 'Your search is saved. Emails will start when your place is activated.' : 'We’ll email newly found matching roles to '+state.account.email+'. Existing listings are not sent as an initial batch. Quiet days have no job email. You can change or pause alerts here any time.';
      celebrate($('watch-alert-success')); notify(queued ? 'Added to the alert waitlist.' : 'Daily alert preferences saved.');
    } catch(e) { error(e.message,true); }
    finally { alertBusy = false; $('watch-subscribe').disabled = !['active','waitlisted'].includes(state?.account?.status) && !state?.alertsReady; }
  });
  $('watch-alert-edit').addEventListener('click',() => { dialogFocus.delete('alert-dialog'); closeDialog('alert-dialog'); filterPanel.open = true; $('watch-roles').focus(); });
  $('watch-load-saved').addEventListener('click',() => { populate(state.account.preferences); alertDraft = reviewDraft(); accountUI(); search(); notify('Your saved alert search is selected.'); });
  $('watch-pause').addEventListener('click',async () => { if (alertBusy) return; alertBusy = true; $('watch-pause').disabled = true; try { await api('/pause',{}); await loadState(); $('watch-alert-success').hidden = true; notify('Daily alerts paused. You can still browse and save jobs.'); } catch(e) { error(e.message,true); } finally { alertBusy = false; $('watch-pause').disabled = false; accountUI(); } });
  $('watch-signout').addEventListener('click',async () => { try { await api('/logout',{}); await loadState(); $('watch-alert-success').hidden = true; $('watch-google-button').innerHTML = ''; notify('Signed out. Your local applications are still here.'); } catch(e) { error(e.message,true); } });
  $('watch-delete').addEventListener('click',async () => { if (!confirm('Delete your alert account, company requests and email history? Your résumé and applications in this browser will stay.')) return; try { await api('/delete',{}); await loadState(); $('watch-alert-success').hidden = true; notify('Alert account deleted.'); } catch(e) { error(e.message,true); } });
  $('watch-company-signin').addEventListener('click',() => { closeDialog('company-dialog'); openAlerts('company'); });
  $('watch-request-form').addEventListener('submit',async e => {
    e.preventDefault(); const button = e.target.querySelector('button'); if (button.disabled) return;
    button.disabled = true; button.textContent = 'Checking connection…'; e.target.setAttribute('aria-busy','true'); $('watch-request-message').textContent = 'Looking for a public job board and checking its jobs…';
    try {
      const input = Object.fromEntries(new FormData(e.target));
      const r = await api('/connect',input); state.requests = r.requests;
      if (r.id) { selection.add(r.id); await search(); }
      $('watch-company-filter').value = r.name || input.name; renderCompanies(); $('watch-companies').scrollTop = 0; e.target.reset();
      $('watch-request-message').textContent = r.id ? `${r.name} is connected and selected. ${r.count === 0 ? 'No Ireland / eligible remote jobs were found yet.' : `${r.count} Ireland / eligible remote jobs found.`}${r.status === 'partial' ? ' Coverage is partial; some listings may be missing.' : ''} Its jobs are checked daily. Use “Email me matching jobs” to include this search in your alerts.` : `${input.name} now appears in your company list. ${r.message}`;
      if (r.id) celebrate(button);
    } catch(err) { $('watch-request-message').textContent = err.message; try { await loadState(); renderCompanies(); } catch {} }
    finally { button.disabled = !state?.account; button.textContent = 'Check and connect'; e.target.setAttribute('aria-busy','false'); }
  });
  $('watch-companies').addEventListener('click',e => {
    const button = e.target.closest('[data-review-company],[data-change-company]'); if (!button) return;
    const entry = requestedLinks[Number(button.dataset.reviewCompany ?? button.dataset.changeCompany)], form = $('watch-request-form');
    $('watch-add-section').hidden = false;
    form.elements.name.value = entry.name; form.elements.url.value = entry.url;
    $('watch-request-message').textContent = entry.message;
    form.elements.url.focus(); form.elements.url.select();
    if (state?.account && button.hasAttribute('data-review-company')) form.requestSubmit();
  });
  $('watch-guide-open').addEventListener('click',()=>{
    const prefs=preferences();
    $('guide-roles').value=prefs.roles;
    $('guide-city').value=prefs.city;
    $('guide-level').value=prefs.level==='any'?'entry':prefs.level;
    showDialog('guide-dialog'); $('guide-roles').focus();
  });
  $('watch-guide-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const fields=Object.fromEntries(new FormData(e.target));
    if(!fields.roles.trim()) { $('guide-roles').setCustomValidity('Enter a role to start your search.'); $('guide-roles').reportValidity(); return; }
    onlyNew=false;
    populate({...emptySearch,...fields});
    closeDialog('guide-dialog');
    await search();
    $('watch-result-count').tabIndex=-1;
    $('watch-result-count').focus({preventScroll:true});
    $('watch-result-count').scrollIntoView({block:'start',behavior:'instant'});
  });
  $('guide-roles').addEventListener('input',()=> $('guide-roles').setCustomValidity(''));
  $('watch-new-toggle').addEventListener('click',()=>{onlyNew=!onlyNew;search();});
  $('watch-filter-form').addEventListener('submit',e => { e.preventDefault(); search(); });
  $('watch-company-filter').addEventListener('input',renderCompanies);
  $('watch-companies').addEventListener('change',e => { const id = e.target.dataset.watchCompany; if (!id) return; if (e.target.checked) selection.add(id); else selection.delete(id); renderCompanies(); search(); });
  $('watch-selection-chips').addEventListener('click',e => { const b = e.target.closest('[data-remove-company]'); if (b) { selection.delete(b.dataset.removeCompany); renderCompanies(); search(); } });
  $('watch-select-all').addEventListener('click',() => { selection = new Set(companies.filter(c => c.supported).map(c => c.id)); renderCompanies(); search(); });
  $('watch-clear').addEventListener('click',() => { selection.clear(); renderCompanies(); search(); });
  $('watch-early-career').addEventListener('click',()=>{ $('watch-roles').value='IT support, technical support, help desk'; $('watch-level').value='entry'; renderCompanies(); search(); });
  $('watch-reset').addEventListener('click',resetFilters);
  $('watch-results').addEventListener('click',e => { if(e.target.closest('#watch-show-all')) {onlyNew=false;search();} else if (e.target.closest('#watch-empty-reset')) { if (companies.some(c => c.supported && c.lastSuccess)) resetFilters(); else openCompanies(); } else handleJobAction(e); });
  $('job-preview-content').addEventListener('click',handleJobAction);
  $('watch-more').addEventListener('click',() => { const previous = visible; visible += 20; renderJobs(previous); });
  $('watch-company-open').addEventListener('click',openCompanies);
  $('watch-coverage-open').addEventListener('click',openCompanies);
  $('watch-freshness').addEventListener('click',openCompanies);
  $('watch-add-company').addEventListener('click',() => { $('watch-add-section').hidden = false; $('watch-request-form').elements.name.value = $('watch-company-filter').value.trim(); $('watch-request-form').elements.name.focus(); $('watch-request-message').textContent = state?.account ? '' : 'Sign in to save a company connection or request.'; });
  $('watch-alert-open').addEventListener('click',() => openAlerts());
  $('watch-account-open').addEventListener('click',() => openAlerts());
  $('watch-refresh').addEventListener('click',async () => {
    if (checking) return; checking = true; $('watch-refresh').disabled = true;
    const sources = companies.filter(c => c.supported && (!selection.size || selection.has(c.id))); let finished = 0, failed = 0;
    try { for (const source of sources) { $('watch-check-progress').textContent = `Checking ${source.name} · ${finished+1}/${sources.length}`; const r = await api('/check',{company:source.id}); if (r.status === 'failed') failed++; finished++; } await search(); $('watch-check-progress').textContent = failed ? `${failed} company checks failed. Previous listings are kept.` : 'Checks finished. Coverage details are updated.'; }
    catch(e) { $('watch-check-progress').textContent = e.message; await search(); }
    finally { checking = false; $('watch-refresh').disabled = false; }
  });
  return {
    syncSaved,
    async enter() {
      try {
        if (!initialized) {
          const [s,c,l] = await Promise.all([api('/state'),api('/catalog'),getLegacyCompanies().catch(() => [])]);
          state = s; companies = c.companies; legacy = l.filter(c => c.custom);
          // Browsing starts fresh; saved alert filters are loaded only by the explicit button.
          $('watch-company-filter').value = ''; populate(emptySearch); initialized = true;
        } else await loadState();
        accountUI(); renderCompanies(); await search();
      } catch(e) { error(e.message); $('watch-result-count').textContent = 'Jobs are temporarily unavailable'; $('watch-results').innerHTML = '<div class="jobs-empty"><h3>Let’s try again.</h3><p>Reload this page to reconnect to the job directory.</p></div>'; $('watch-results').setAttribute('aria-busy','false'); }
    }
  };
}
