export function listingKey(value) {
  try {
    const url=new URL(value);
    if(!['https:','http:'].includes(url.protocol))return null;
    const ghId=url.searchParams.get('gh_jid');
    if(['stripe.com','www.stripe.com'].includes(url.hostname)){
      const careerId=url.pathname.match(/^\/careers\/(?:listing|apply)\/[^/]+\/(\d+)\/?$/)?.[1];
      if(careerId)return ghId&&ghId!==careerId?null:`stripe-job:${careerId}`;
      if(/^\d+$/.test(ghId||'')&&/^\/jobs\/search\/?$/.test(url.pathname))return `stripe-job:${ghId}`;
    }
    if(['job-boards.greenhouse.io','boards.greenhouse.io'].includes(url.hostname)){
      const direct=url.pathname.match(/^\/([^/]+)\/jobs\/(\d+)\/?$/);
      const board=direct?.[1]||(url.pathname==='/embed/job_app'?url.searchParams.get('for'):null);
      const id=direct?.[2]||(url.pathname==='/embed/job_app'?url.searchParams.get('token'):null);
      if(board&&/^\d+$/.test(id||''))return board==='stripe'?`stripe-job:${id}`:`greenhouse-job:${board}:${id}`;
    }
    if(ghId)return `${url.origin}${url.pathname.replace(/\/$/,'')}?gh_jid=${ghId}`;
    for(const key of [...url.searchParams.keys()])if(/^(?:utm_|source$|src$|ref$|referrer$|lever-source$)/i.test(key))url.searchParams.delete(key);
    url.hash='';url.pathname=url.pathname.replace(/\/(?:apply|application)\/?$/,'').replace(/\/$/,'')||'/';url.searchParams.sort();
    return url.href;
  } catch {return null;}
}
export function availableRoles(state) {return state.jobs.filter(job=>job.preparation&&['prepared','in_progress'].includes(job.status)&&!job.evidence);}
export function savedRoleForPage(state,url) {const key=listingKey(url);return key?state.jobs.find(job=>listingKey(job.url)===key):undefined;}
export function roleForPage(state,url) {const key=listingKey(url);return key?availableRoles(state).find(job=>listingKey(job.url)===key):undefined;}
export function profileReadiness(state) {
  const missing=[];
  if(!state.profile.name)missing.push('Full name');
  if(!state.profile.firstName)missing.push('First / given name');
  if(!state.profile.lastName)missing.push('Last / family name');
  if(!state.profile.email)missing.push('Email');
  if(!state.resume)missing.push('Résumé PDF');
  return missing;
}
