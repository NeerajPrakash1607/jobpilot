import {AppError,stripHtml} from './domain.mjs';

const plain=value=>stripHtml(typeof value==='string'?value:'');
const unreadable=()=>new AppError('The employer did not return a readable public jobs feed.',502);
const workdayOrigin='https://mastercard.wd1.myworkdayjobs.com';
const workdayApi=workdayOrigin+'/wday/cxs/mastercard/CorporateCareers';
const json=body=>{try{return JSON.parse(body);}catch{throw unreadable();}};
const date=value=>typeof value==='number'&&Number.isFinite(value)?new Date(value).toISOString():typeof value==='string'?value:undefined;
const country=value=>['IE','IRL'].includes(value)?'Ireland':value;
const locations=values=>[...new Set(values.filter(v=>typeof v==='string'&&v.trim()))].join(' / ');
const arrangement=value=>({remote:'Remote',hybrid:'Hybrid','on-site':'Onsite',OnSite:'Onsite',Remote:'Remote',Hybrid:'Hybrid'})[value]||'';

export async function loadLever(source,fetchPage){
 const jobs=[];let complete=false;
 for(let page=0;page<10;page++){
  const url=new URL(source.url);url.searchParams.set('skip',String(page*100));url.searchParams.set('limit','100');
  let batch;
  try{batch=json(await fetchPage(url.href));if(!Array.isArray(batch))throw unreadable();}
  catch(error){if(!page)throw error;break;}
  jobs.push(...batch.map(post=>({id:post?.id,title:post?.text,url:post?.hostedUrl,
   location:locations([post?.categories?.location,...(Array.isArray(post?.categories?.allLocations)?post.categories.allLocations:[]),post?.country==='IE'?'Ireland':'',arrangement(post?.workplaceType)]),
   description:[plain(post?.descriptionPlain||post?.description),...(Array.isArray(post?.lists)?post.lists.map(l=>`${plain(l?.text)}\n${plain(l?.content)}`):[]),plain(post?.additionalPlain||post?.additional)].filter(Boolean).join('\n\n'),
   listingDate:date(post?.createdAt),salary:plain(post?.salaryDescriptionPlain),summaryOnly:false,
  })));
  if(batch.length<100){complete=true;break;}
 }
 const unique=[...new Map(jobs.map(j=>[j.id,j])).values()];
 return JSON.stringify({jobs:unique,total:unique.length,partial:!complete});
}

export async function loadAshby(source,fetchPage){
 const data=json(await fetchPage(source.url));if(!Array.isArray(data?.jobs))throw unreadable();
 const jobs=data.jobs.filter(p=>p?.isListed!==false).map(post=>({
  id:typeof post?.jobUrl==='string'?post.jobUrl.split('/').filter(Boolean).at(-1):undefined,
  title:post?.title,url:post?.jobUrl,
  location:locations([post?.location,country(post?.address?.postalAddress?.addressCountry),...(Array.isArray(post?.secondaryLocations)?post.secondaryLocations.flatMap(l=>[l?.location,country(l?.address?.postalAddress?.addressCountry)]):[]),arrangement(post?.workplaceType)||(post?.isRemote?'Remote':'')]),
  description:plain(post?.descriptionPlain||post?.descriptionHtml),listingDate:post?.publishedAt,
  salary:plain(post?.compensation?.scrapeableCompensationSalarySummary),summaryOnly:false,
 }));
 return JSON.stringify({jobs,total:jobs.length,partial:false});
}

function workdayPage(body){
 const data=json(body);
 if(!Array.isArray(data?.jobPostings)||!Number.isInteger(data.total)||data.total<0)throw unreadable();
 return data;
}
// LinkedIn's employer board, not the LinkedIn job-search platform.
export async function loadLinkedIn(fetchPage){
 return loadSmartRecruiters({board:'LinkedIn3',name:'LinkedIn'},fetchPage);
}
export async function loadSmartRecruiters({board,name},fetchPage){
 const jobs=new Map();let total,partial=false;
 for(let offset=0;offset<1000;offset+=100){
  let page;
  try{
   page=json(await fetchPage(`https://api.smartrecruiters.com/v1/companies/${board}/postings?country=ie&destination=PUBLIC&limit=100&offset=${offset}`));
   if(!Array.isArray(page?.content)||page.content.length>100||!Number.isInteger(page.totalFound)||page.totalFound<0)throw unreadable();
  }catch(error){if(!offset)throw error;partial=true;break;}
  if(total===undefined)total=page.totalFound;
  else if(total!==page.totalFound)partial=true;
  for(const post of page.content){
   // Unexpected company, visibility or country must never be relabelled as an Irish public vacancy.
   if(typeof post?.id!=='string'||!/^\d{1,30}$/.test(post.id)||typeof post.company?.identifier!=='string'||post.company.identifier.toLowerCase()!==board.toLowerCase()||post.visibility!=='PUBLIC'||typeof post.location?.country!=='string'||post.location.country.toLowerCase()!=='ie'){
    partial=true;continue;
   }
   jobs.set(post.id,{id:post.id,title:post.name,url:`https://jobs.smartrecruiters.com/${board}/${post.id}`,
    location:locations([plain(post.location.city),plain(post.location.region),'Ireland',post.location.remote===true?'Remote':post.location.hybrid===true?'Hybrid':'']),
    description:`Listing from ${name}’s public Ireland careers board. Open the employer listing for the full requirements.`,
    listingDate:post.releasedDate,summaryOnly:true});
  }
  if(offset+page.content.length>=total||page.content.length<100)break;
 }
 if(total>0&&!jobs.size)throw unreadable();
 return JSON.stringify({jobs:[...jobs.values()],total,partial:partial||jobs.size!==total});
}
function locationFacets(facets,parameter='locations'){
 if(!Array.isArray(facets))throw unreadable();
 for(const facet of facets){
  if(facet?.facetParameter===parameter&&Array.isArray(facet.values))return facet.values;
  if(Array.isArray(facet?.values)){const found=locationFacets(facet.values,parameter);if(found)return found;}
 }
 return null;
}
export async function loadMastercard(fetchPage){
 return loadWorkdayIreland({origin:workdayOrigin,tenant:'mastercard',board:'CorporateCareers',name:'Mastercard',idPattern:/^R-\d+(?:-\d+)*$/},fetchPage);
}
export async function loadYahoo(fetchPage){
 return loadWorkdayIreland({origin:'https://ouryahoo.wd5.myworkdayjobs.com',tenant:'ouryahoo',board:'careers',name:'Yahoo',idPattern:/^JR\d+$/},fetchPage);
}
export async function loadFidelity(fetchPage){
 return loadWorkdayIreland({origin:'https://wd1.myworkdaysite.com',tenant:'fmr',board:'FidelityCareers',name:'Fidelity',idPattern:/^\d+(?:-\d+)*$/,postingPath:'/en-US/recruiting/fmr/FidelityCareers'},fetchPage);
}
export async function loadWorkdayIreland({origin,tenant,board,name,idPattern,postingPath=`/en-US/${board}`},fetchPage){
 const request=async(offset,appliedFacets={})=>workdayPage(await fetchPage(`${origin}/wday/cxs/${tenant}/${board}/jobs`,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appliedFacets,limit:20,offset,searchText:''}),
 }));
 const index=await request(0);
 if(index.total===0)return JSON.stringify({jobs:[],total:0,partial:false});
 const countryValues=locationFacets(index.facets,'locationCountry');
 const parameter=countryValues?'locationCountry':'locations';
 const available=countryValues||locationFacets(index.facets);
 if(!available)throw unreadable();
 const ireland=available.filter(f=>/\bIreland\b/i.test(f.descriptor||'')&&!/Northern Ireland/i.test(f.descriptor)).map(f=>f.id);
 if(ireland.some(id=>typeof id!=='string'||!/^\w+$/.test(id)))throw unreadable();
 if(!ireland.length)return JSON.stringify({jobs:[],total:0,partial:false});
 const facets={[parameter]:ireland},first=await request(0,facets),raw=[...first.jobPostings];
 for(let offset=20;offset<first.total&&offset<200;offset+=20){
  try{const page=await request(offset,facets);if(!page.jobPostings.length)break;raw.push(...page.jobPostings);}catch{break;}
 }
 const jobs=raw.map(post=>{
  const path=post?.externalPath;
  if(typeof path!=='string'||!/^\/job\/[\w/-]+$/.test(path))throw unreadable();
  // Generic boards use the stable requisition in the URL, not arbitrary bullet labels.
  const id=(idPattern&&Array.isArray(post.bulletFields)?post.bulletFields.find(v=>typeof v==='string'&&idPattern.test(v)):null)||path.split('_').at(-1);
  if(!(idPattern||/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/).test(id))throw unreadable();
  const place=plain(post.locationsText);
  return {id,title:post.title,company:name,url:`${origin}${postingPath}${path}`,
   // The applied location facets establish Ireland even for multi-location postings.
   location:/\bIreland\b/i.test(place)?place:`Ireland · ${place||'location listed on employer page'}`,
   description:`Listing from ${name}’s official Ireland job board. Open the employer listing for the full requirements.`,summaryOnly:true};
 });
 const unique=[...new Map(jobs.map(j=>[j.id,j])).values()];
 return JSON.stringify({jobs:unique,total:first.total,partial:unique.length<first.total});
}

export async function importMastercardJob(input,fetchPage){
 const url=new URL(input),match=url.pathname.match(/^\/(?:en-US\/)?CorporateCareers(\/job\/[\w/-]+)$/);
 if(url.origin!==workdayOrigin||!match)throw new AppError('Open the official Mastercard posting to import it.',422);
 const info=json(await fetchPage(workdayApi+match[1])).jobPostingInfo;
 if(!info?.title||!info?.jobDescription)throw unreadable();
 return {title:info.title,company:'Mastercard',url:url.href,location:locations([info.location,...(info.additionalLocations||[])]),description:plain(info.jobDescription),salary:'',source:'Mastercard Workday public posting'};
}
