import {jobSegments} from './resume-relevance.mjs';
import {skillPatterns,skillsIn} from './domain.mjs';

const normalize = value => value.toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/front[ -]?end/g,'frontend').replace(/back[ -]?end/g,'backend').replace(/full[ -]?stack/g,'fullstack').replace(/[^\p{L}\p{N}+#.]+/gu,' ').trim();
const phraseIn = (text,phrase) => ` ${text} `.includes(` ${phrase} `);

// This orders role matches, not applicants. Résumé contents never affect eligibility.
export function roleRelevance(job,query) {
 const title=normalize(job.title),description=normalize(job.description);
 return Math.max(0,...query.split(/[,/;]+/).map(normalize).filter(Boolean).map(phrase=>{
  if(phraseIn(title,phrase))return 3;
  if(/^(?:frontend|react)(?: (?:developer|engineer))?$/.test(phrase))return /\b(?:frontend|react|ui)\b/.test(title)?2:(/\b(?:software|fullstack|web)\b/.test(title)&&/\b(?:engineer|developer)\b/.test(title)&&/\b(?:frontend|react)\b/.test(description)?1:0);
  if(/^(?:it|technical|software|application|desktop) support(?: (?:specialist|engineer|analyst))?$|^(?:help|service) desk(?: (?:specialist|engineer|analyst))?$/.test(phrase)){
   return /\b(?:it|technical|software|application|desktop|product) support\b|\b(?:help ?desk|service desk|desktop technician)\b/.test(title)?2:
    /\bsupport (?:engineer|analyst)\b/.test(title)&&/\b(?:software|hardware|network|linux|windows|sql|api|technical)\b/.test(description)?1:0;
  }
  if(/^(?:customer|product)? ?support(?: (?:specialist|engineer|analyst))?$/.test(phrase))return /\bsupport\b/.test(title)?1:0;
  return phrase.split(' ').every(word=>['engineer','developer'].includes(word)?/\b(?:engineer|developer)\b/.test(title):phraseIn(title,word))?2:0;
 }));
}
export const matchesRole=(job,query)=>roleRelevance(job,query)>0;

function numeric(text){
 const numbers={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
 return text.toLowerCase().replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/g,word=>String(numbers[word]));
}

// Deliberately conservative extraction: an entry-level title is never proof of years required.
export function experienceEvidence(job){
 const required=[],preferred=[];
 let alternative=false,unparsedRequirement=false;
 for(const segment of jobSegments(job.description)){
  const line=numeric(segment.text).replace(/(years?|months?)['’]/g,'$1');
  if(/\b(?:no|without)(?: prior| previous| professional| work)? experience (?:is )?(?:required|necessary|needed)\b/.test(line))required.push({years:0,text:segment.text});
  const amounts=[...line.matchAll(/\b(\d{1,2})(?:\s*[-–—]\s*|\s+to\s+)?(\d{1,2})?\s*\+?\s*(years?|months?)\b/g)];
  for(const amount of amounts){
   // A four-year degree is not four years of employment experience.
   const after=line.slice(amount.index+amount[0].length),before=line.slice(0,amount.index);
   const separators=[...line.matchAll(/[;,]|\s+(?:and|but)\s+(?=(?:(?:at least|minimum(?: of)?)\s+)?\d)/g)];
   const left=separators.filter(s=>s.index<amount.index).at(-1),right=separators.find(s=>s.index>amount.index);
   const clause=line.slice(left?left.index+left[0].length:0,right?.index??line.length);
   if(/\bnot (?:required|necessary|needed)\b/.test(clause))continue;
   const experienceAmount=/^(?:\s+(?:of|relevant|professional|practical|prior|previous|industry|work|working|commercial|hands[- ]on|related|technical|it|support|engineering|software|development|customer|service|equivalent))*\s+experience\b/.test(after)||/experience\s*[:=]?\s*(?:of\s+|at least\s+|minimum\s+(?:of\s+)?)?$/.test(before)||/^\s+(?:of\s+)?(?:building|managing|developing|supporting|working|troubleshooting|programming|designing)\b/.test(after);
   if(!experienceAmount){
    if(segment.priority==='required'&&!/^\s*[- ]?\s*(?:degree|contract|course|program|programme)\b/.test(after))unparsedRequirement=true;
    continue;
   }
   const preference=/\b(?:preferred|preferably|desirable|desired|nice to have|a plus|bonus)\b/.test(clause);
   const explicit=/\b(?:required|must|minimum|at least|need|essential)\b/.test(clause);
   const kind=preference?'preferred':explicit?'required':segment.priority;
   const unmarkedRequirement=/^\s*(?:you (?:have|bring|need)\s+|minimum\s+(?:of\s+)?|at least\s+)?\d/.test(line)||/^experience\s*[:=]/.test(line);
   if(kind!=='required'&&kind!=='preferred'&&!unmarkedRequirement)continue;
   const years=Number(amount[1])/(amount[3].startsWith('month')?12:1);
   (kind==='preferred'?preferred:required).push({years,text:segment.text});
   if(/\bor\b|equivalent/.test(line)&&(amounts.length>1||/degree|bachelor|master|phd/.test(line)))alternative=true;
  }
 }
 const minimum=required.length?Math.max(...required.map(r=>r.years)):null;
 const higherPreferred=preferred.filter(p=>p.years>2).map(p=>p.text);
 if(job.summaryOnly||alternative||unparsedRequirement||minimum===null)return {kind:'unclear',minimum:null,label:'Possible match — experience unclear',evidence:required.map(r=>r.text),higherPreferred};
 if(minimum>2)return {kind:'above',minimum,label:`${minimum}+ years required`,evidence:required.map(r=>r.text),higherPreferred};
 return {kind:'clear',minimum,label:minimum===0?'No experience required':`${minimum} year${minimum===1?'':'s'} required`,evidence:required.map(r=>r.text),higherPreferred};
}

export function sponsorshipEvidence(job){
 const statements=job.description.split(/\n|(?<=[.!?])\s+/).filter(line=>/sponsor|work permit|work visa/i.test(line));
 const negative=statements.find(line=>/\b(?:no|without)\s+(?:visa\s+|immigration\s+|work permit\s+)?sponsorship\b|\b(?:cannot|can't|unable to|will not|do not|does not|not able to)\b.{0,60}\bsponsor|\bsponsorship\b.{0,35}\b(?:not (?:available|provided|offered|supported)|unavailable)\b/i.test(line));
 if(negative)return {kind:'not_offered',label:'Sponsorship not offered',evidence:negative};
 const positive=statements.find(line=>!(/\b(?:may|might|could|consider|case.by.case|depending|subject to|not|no)\b/i.test(line))&&/\b(?:offer|provide|support|available|provided|offered)\b.{0,40}\b(?:visa |immigration |work permit )?sponsorship\b|\b(?:visa |immigration |work permit )?sponsorship\b.{0,40}\b(?:available|provided|offered|supported)\b|\bwe (?:will|can) sponsor\b/i.test(line));
 return positive?{kind:'offered',label:'Sponsorship stated by employer',evidence:positive}:{kind:'unknown',label:'Sponsorship not stated',evidence:null};
}
export function trainingRole(job){
 const value=`${job.title}\n${job.employmentType||''}`;
 if(/\b(?:intern|internship|internships)\b/i.test(value)||/\b(?:this (?:role|position) is (?:an? )?|employment type:\s*)internship\b/i.test(job.description))return 'internship';
 if(/\b(?:apprentice|apprenticeship)\b/i.test(value)||/\b(?:this (?:role|position) is (?:an? )?|employment type:\s*)apprenticeship\b/i.test(job.description))return 'apprenticeship';
 return 'regular';
}

// Called in the browser only. Missing mentions do not mean the person lacks a skill.
export function resumeSkillEvidence(job,profile){
 const own=new Set(skillsIn(`${profile.resumeText||''}\n${profile.skills||''}`));
 const segments=jobSegments(job.description).filter(s=>s.priority==='required');
 const required=Object.entries(skillPatterns).filter(([,pattern])=>segments.some(s=>pattern.test(s.text))).map(([skill])=>skill);
 return {compared:!!(profile.resumeText||profile.skills),matched:required.filter(s=>own.has(s)),missing:required.filter(s=>!own.has(s)),partial:!!job.summaryOnly};
}
