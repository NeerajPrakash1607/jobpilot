const $ = id=>document.getElementById(id);
const escape = value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const date = value=>new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
const time = value=>new Date(value).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});

export function createDiscoveryUI({api,getState,refresh,notify,openJob}) {
  let initialized=false, searching=false, result=null, visible=12;
  function fields(search) {
    $('discovery-query').value=search.query;
    $('discovery-location').value=search.location;
    $('discovery-remote').checked=search.includeRemote;
    $('discovery-senior').checked=search.hideSenior;
  }
  function currentSearch() { return {query:$('discovery-query').value,location:$('discovery-location').value,includeRemote:$('discovery-remote').checked,hideSenior:$('discovery-senior').checked}; }
  function render() {
    if (!result) return;
    const available=result.sources.filter(s=>['live','cached'].includes(s.status));
    const failed=result.sources.filter(s=>['stale','unavailable'].includes(s.status));
    $('discovery-status').innerHTML=`<div><strong>${result.total} ${result.total===1?'role':'roles'} found</strong><span>For “${escape(result.search.query)}” · ${escape(result.search.location || 'Anywhere')} · ${result.scanned.toLocaleString()} listings checked</span></div><span class="discovery-check">${available.length}/${result.sources.length} sources up to date</span>`;
    $('discovery-error').hidden=!failed.length;
    $('discovery-error').textContent=failed.length ? `${failed.map(s=>s.name).join(', ')} could not refresh. ${failed.some(s=>s.status==='stale')?'Some results use an older copy, marked below. ':''}${available.length?'Other sources are available.':'Check your connection and try again in a few minutes.'}` : '';
    const savedJobs=getState().jobs;
    $('discovery-results').innerHTML=result.jobs.length ? result.jobs.slice(0,visible).map(job=>{
      const savedId=savedJobs.find(saved=>saved.id===job.savedId || saved.url===job.url)?.id;
      const source=result.sources.find(s=>s.name===job.source);
      return `<article class="panel discovery-card"><div class="discovery-card-top"><span class="discovery-company">${escape(job.company)}</span><span class="discovery-source-badge">${escape(job.sourceType==='remotive'?'Remotive':'Employer board')}</span></div><h2>${escape(job.title)}</h2><p class="discovery-location">${escape(job.location || 'Location not listed')}</p><div class="discovery-meta"><span>${escape(job.locationReason)}</span>${job.listingDate?`<span>${job.dateLabel} ${date(job.listingDate)}</span>`:''}${job.salary?`<span>${escape(job.salary)}</span>`:''}</div><div class="discovery-skills"><p>${job.matched.length?`<strong>${job.matched.length} skills in your résumé</strong>`:'No recognised skill overlap'} <span>· ${job.missing.length} not found</span></p><div class="skill-tags">${job.matched.slice(0,6).map(skill=>`<span class="skill-tag">${escape(skill)}</span>`).join('')}</div></div><details class="discovery-description"><summary>Read job description</summary><p>${escape(job.description)}</p>${job.missing.length?`<p><strong>Not found in your résumé:</strong> ${escape(job.missing.join(', '))}</p>`:''}</details><div class="discovery-card-footer"><a href="${escape(job.url)}" target="_blank" rel="noopener noreferrer">${job.sourceType==='remotive'?'View on Remotive':'View listing'} ↗</a><button class="button ${savedId?'button-secondary':'button-primary'}" data-discovery-action="${savedId?'open':'save'}" data-id="${escape(savedId || job.id)}">${savedId?'Saved · open →':'Save role +'}</button></div>${source?.status==='stale'?`<p class="discovery-stale">Older copy · checked ${time(source.checkedAt)}</p>`:''}</article>`;
    }).join('') : `<div class="panel discovery-empty"><span aria-hidden="true">↗</span><h2>${available.length?'No roles match these filters yet.':'The job feeds are unavailable.'}</h2><p>${available.length?'Try “support” or “software engineer”, turn off the senior-title filter, or broaden your location. The sources panel shows exactly what was searched.':'Your saved applications are still here. Check your internet connection and try again in a few minutes.'}</p></div>`;
    $('discovery-more').hidden=visible>=result.jobs.length;
    $('discovery-more').textContent=`Show more roles (${Math.min(12,result.jobs.length-visible)} more) ↓`;
    const statusNames={live:'Just checked',cached:'Recent copy',stale:'Older copy',unavailable:'Unavailable'};
    $('discovery-source-list').innerHTML=result.sources.map(source=>`<div class="discovery-source-row"><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.name)} ↗</a><span>${source.count.toLocaleString()} listings · ${statusNames[source.status]}${source.checkedAt?' · '+time(source.checkedAt):''}${source.skipped?` · ${source.skipped} unreadable listings skipped`:''}</span></div>`).join('')+(result.total>100?'<p class="field-help">Showing the first 100 matches. Narrow your search to see more specific results.</p>':'');
  }
  async function search() {
    if (searching || !$('discovery-form').reportValidity()) return;
    searching=true; $('discovery-error').hidden=true;
    $('discovery-form').querySelectorAll('input,button').forEach(el=>el.disabled=true);
    $('discovery-submit').textContent='Finding jobs…';
    $('discovery-status').innerHTML='<div class="discovery-loading"><span class="search-spinner" aria-hidden="true"></span><div><strong>Checking live job boards…</strong><span>Finding roles and comparing skills with your résumé.</span></div></div>';
    $('discovery-results').setAttribute('aria-busy','true');
    $('discovery-results').classList.add('is-searching');
    try { result=await api('/discover',currentSearch());visible=12;render(); }
    catch(error) { $('discovery-error').hidden=false;$('discovery-error').textContent=error.message;$('discovery-status').textContent=result?'Search failed. Previous results are still shown below.':'Could not complete the search.'; }
    finally { searching=false;$('discovery-form').querySelectorAll('input,button').forEach(el=>el.disabled=false);$('discovery-submit').textContent='Find jobs →';$('discovery-results').setAttribute('aria-busy','false');$('discovery-results').classList.remove('is-searching'); }
  }
  $('discovery-form').addEventListener('submit',event=>{event.preventDefault();search();});
  $('discovery-form').addEventListener('click',async event=>{
    const button=event.target.closest('[data-discovery-preset]');if(!button || searching)return;
    if(button.dataset.discoveryPreset==='profile') {
      const profile=getState().profile;
      const interests=[/front.?end|react/i.test(profile.role)&&'frontend',/support/i.test(profile.role)&&'support'].filter(Boolean);
      fields({query:interests.join(', ')||profile.role||'support, frontend',location:profile.location||'Dublin, Ireland',includeRemote:true,hideSenior:true});
    } else $('discovery-query').value=button.dataset.discoveryPreset;
    await search();
  });
  $('discovery-results').addEventListener('click',async event=>{
    const button=event.target.closest('[data-discovery-action]');if(!button)return;
    if(button.dataset.discoveryAction==='open')return openJob(button.dataset.id);
    button.disabled=true;button.textContent='Saving…';
    try {
      const saved=await api('/discover/save',{id:button.dataset.id});
      const job=result.jobs.find(job=>job.id===button.dataset.id);if(job)job.savedId=saved.job.id;
      await refresh(); render(); notify(saved.alreadySaved?'This role is already in your applications.':'Role saved. Open it to prepare your application.');
    } catch(error) { notify(error.message);button.disabled=false;button.textContent='Save role +'; }
  });
  $('discovery-more').addEventListener('click',()=>{visible+=12;render();});
  return { render, async enter() {
    if(!initialized) { fields(await api('/discover/preferences'));initialized=true;await search(); }
    else render();
  }};
}
