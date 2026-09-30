const $ = id=>document.getElementById(id);
const escape = value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const date = value=>new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
const time = value=>new Date(value).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});

export function createDiscoveryUI({api,getState,refresh,notify,openJob}) {
  let initialized=false, searching=false, result=null, visible=12, companies=[], companyBusy=false;
  function renderCompanies() {
    const connected=companies.filter(source=>source.enabled&&source.type!=='website').length;
    $('company-count').textContent=`${connected} search sources enabled`;
    $('company-list').innerHTML=companies.map(source=>{
      const report=result?.sources.find(item=>item.id===source.id);
      const mode=source.type==='website'?'Browser link':source.scope||'Automatic listings';
      const status=!source.enabled?'Paused':source.type==='website'?(source.note||'Saved link · automatic checking unavailable'):report?.status==='unavailable'?'Could not check listings · open the careers page':report?`${report.count} listings · ${report.partial?'partial coverage':report.status==='live'?'just checked':report.status==='cached'?'recent copy':'older copy'}`:'Connected · checked on search';
      return `<div class="company-item ${source.enabled?'':'is-paused'}"><div><a href="${escape(source.home)}" target="_blank" rel="noopener noreferrer">${escape(source.name)} ↗</a><p>${escape(mode)}</p><p>${escape(status)}</p></div><div class="company-actions"><button class="button button-secondary" data-company-id="${escape(source.id)}" data-company-action="${source.enabled?'disable':'enable'}" aria-label="${source.enabled?'Pause':'Enable'} ${escape(source.name)}">${source.enabled?'Pause':'Enable'}</button>${source.custom?`<button class="button button-secondary" data-company-id="${escape(source.id)}" data-company-action="remove" aria-label="Remove ${escape(source.name)}">Remove</button>`:''}</div></div>`;
    }).join('');
    $('company-manager').querySelectorAll('input,button').forEach(el=>el.disabled=searching||companyBusy);
  }
  async function loadCompanies(){companies=await api('/discover/sources');renderCompanies();}
  async function changeCompanies(route,data){
    if(searching||companyBusy)return;
    companyBusy=true;renderCompanies();$('company-message').textContent=route==='/discover/sources'?'Checking the careers connection…':'Saving companies…';
    try{
      const updated=await api(route,data);companies=updated.companies||updated;result=null;
      $('discovery-results').innerHTML='';$('discovery-source-list').innerHTML='';$('discovery-more').hidden=true;
      $('discovery-status').textContent='Companies updated. Click Find jobs to search your enabled sources.';
      $('discovery-error').hidden=true;
      $('company-message').textContent='Saved. Click Find jobs to update your results.';
      if(route==='/discover/sources'){
        $('company-form').reset();
        const c=updated.connection;
        if(c.status==='unsupported')$('company-message').textContent=c.message;
        else{
          $('company-message').textContent=`Search connected · ${c.count} listings checked${c.status==='partial'?' · partial coverage':''}. Sign in under Company Watch to enable daily background checking.`;
          try{
            const state=await (await fetch('/watch-api/state')).json();
            if(state.account){
              const response=await fetch('/watch-api/connect',{method:'POST',headers:{'Content-Type':'application/json','X-JobPilot':'1'},body:JSON.stringify({name:c.source.name,url:c.source.home})});
              const connected=await response.json();
              $('company-message').textContent=response.ok?connected.message:`Search connected. Daily checking: ${connected.error}`;
            }
          }catch{$('company-message').textContent='Search connected. Open Company Watch to connect daily background checking.';}
        }
      }
    }catch(error){$('company-message').textContent=error.message;}
    finally{companyBusy=false;renderCompanies();}
  }
  $('company-form').addEventListener('submit',event=>{event.preventDefault();changeCompanies('/discover/sources',Object.fromEntries(new FormData(event.target)));});
  $('company-list').addEventListener('click',event=>{const button=event.target.closest('[data-company-action]');if(button)changeCompanies(`/discover/sources/${encodeURIComponent(button.dataset.companyId)}`,{action:button.dataset.companyAction});});
  function fields(search) {
    $('discovery-query').value=search.query;
    $('discovery-location').value=search.location;
    $('discovery-remote').checked=search.includeRemote;
    $('discovery-senior').checked=search.hideSenior;
  }
  function currentSearch() { return {query:$('discovery-query').value,location:$('discovery-location').value,includeRemote:$('discovery-remote').checked,hideSenior:$('discovery-senior').checked}; }
  function render() {
    renderCompanies();
    if (!result) return;
    const available=result.sources.filter(s=>['live','cached'].includes(s.status));
    const feedCount=result.sources.filter(s=>s.status!=='external').length;
    const failed=result.sources.filter(s=>['stale','unavailable'].includes(s.status));
    $('discovery-status').innerHTML=`<div><strong>${result.total} ${result.total===1?'role':'roles'} found</strong><span>For “${escape(result.search.query)}” · ${escape(result.search.location || 'Anywhere')} · ${result.scanned.toLocaleString()} listings checked</span></div><span class="discovery-check">${available.length}/${result.sources.filter(s=>s.status!=='external').length} feeds up to date</span>`;
    $('discovery-error').hidden=!failed.length;
    $('discovery-error').textContent=failed.length ? `${failed.map(s=>s.name).join(', ')} could not refresh. ${failed.some(s=>s.status==='stale')?'Some results use an older copy, marked below. ':''}${available.length?'Other sources are available.':'Check your connection and try again in a few minutes.'}` : '';
    const savedJobs=getState().jobs;
    $('discovery-results').innerHTML=result.jobs.length ? result.jobs.slice(0,visible).map(job=>{
      const savedId=savedJobs.find(saved=>saved.id===job.savedId || saved.url===job.url)?.id;
      const source=result.sources.find(s=>s.name===job.source);
      return `<article class="panel discovery-card"><div class="discovery-card-top"><span class="discovery-company">${escape(job.company)}</span><span class="discovery-source-badge">${escape(job.sourceType==='remotive'?'Remotive':'Employer board')}</span></div><h2>${escape(job.title)}</h2><p class="discovery-location">${escape(job.location || 'Location not listed')}</p><div class="discovery-meta"><span>${escape(job.locationReason)}</span>${job.listingDate?`<span>${job.dateLabel} ${date(job.listingDate)}</span>`:''}${job.salary?`<span>${escape(job.salary)}</span>`:''}</div><div class="discovery-skills"><p>${job.matched.length?`<strong>${job.matched.length} skills in your résumé</strong>`:'No recognised skill overlap'} <span>· ${job.missing.length} not found</span></p><div class="skill-tags">${job.matched.slice(0,6).map(skill=>`<span class="skill-tag">${escape(skill)}</span>`).join('')}</div></div><details class="discovery-description"><summary>${job.summaryOnly?'Read listing summary':'Read job description'}</summary>${job.summaryOnly?'<p class="field-help">Summary only. Open the listing for full requirements; saving attempts to fetch the complete description.</p>':''}<p>${escape(job.description)}</p>${job.missing.length?`<p><strong>Not found in your résumé:</strong> ${escape(job.missing.join(', '))}</p>`:''}</details><div class="discovery-card-footer"><a href="${escape(job.url)}" target="_blank" rel="noopener noreferrer">${job.sourceType==='remotive'?'View on Remotive':'View listing'} ↗</a><button class="button ${savedId?'button-secondary':'button-primary'}" data-discovery-action="${savedId?'open':'save'}" data-id="${escape(savedId || job.id)}">${savedId?'Saved · open →':'Save role +'}</button></div>${source?.status==='stale'?`<p class="discovery-stale">Older copy · checked ${time(source.checkedAt)}</p>`:''}</article>`;
    }).join('') : `<div class="panel discovery-empty"><span aria-hidden="true">↗</span><h2>${!feedCount?'Choose companies to search.':available.length?'No roles match these filters yet.':'The job feeds are unavailable.'}</h2><p>${!feedCount?'Enable automatic sources in Manage companies, or open your saved careers links.':available.length?'Try “support” or “software engineer”, turn off the senior-title filter, or broaden your location. The sources panel shows exactly what was searched.':'Your saved applications are still here. Check your internet connection and try again in a few minutes.'}</p></div>`;
    $('discovery-more').hidden=visible>=result.jobs.length;
    $('discovery-more').textContent=`Show more roles (${Math.min(12,result.jobs.length-visible)} more) ↓`;
    const statusNames={live:'Just checked',cached:'Recent copy',stale:'Older copy',unavailable:'Unavailable',external:'Browser link'};
    $('discovery-source-list').innerHTML=result.sources.map(source=>`<div class="discovery-source-row"><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.name)} ↗</a><span>${source.status==='external'?'':source.count.toLocaleString()+' listings · '}${statusNames[source.status]}${source.partial?' · Partial coverage':''}${source.checkedAt?' · '+time(source.checkedAt):''}${source.skipped?` · ${source.skipped} unreadable listings skipped`:''}</span><span class="company-note">${escape(source.note)}</span></div>`).join('')+(result.total>100?'<p class="field-help">Showing the first 100 matches. Narrow your search to see more specific results.</p>':'');
  }
  async function search() {
    if (searching || companyBusy || !$('discovery-form').reportValidity()) return;
    searching=true; renderCompanies(); $('discovery-error').hidden=true;
    $('discovery-form').querySelectorAll('input,button').forEach(el=>el.disabled=true);
    $('discovery-submit').textContent='Finding jobs…';
    $('discovery-status').innerHTML='<div class="discovery-loading"><span class="search-spinner" aria-hidden="true"></span><div><strong>Checking live job boards…</strong><span>Finding roles and comparing skills with your résumé.</span></div></div>';
    $('discovery-results').setAttribute('aria-busy','true');
    $('discovery-results').classList.add('is-searching');
    try { result=await api('/discover',currentSearch());visible=12;render(); }
    catch(error) { $('discovery-error').hidden=false;$('discovery-error').textContent=error.message;$('discovery-status').textContent=result?'Search failed. Previous results are still shown below.':'Could not complete the search.'; }
    finally { searching=false;renderCompanies();$('discovery-form').querySelectorAll('input,button').forEach(el=>el.disabled=false);$('discovery-submit').textContent='Find jobs →';$('discovery-results').setAttribute('aria-busy','false');$('discovery-results').classList.remove('is-searching'); }
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
    await loadCompanies();
    if(!initialized) { fields(await api('/discover/preferences'));initialized=true;await search(); }
    else render();
  }};
}
