const randomUUID = () => crypto.randomUUID();
import { AppError, object, text } from './domain.mjs';
import { createRelevance } from './resume-relevance.mjs';

// Literal skill aliases only: broader technologies do not imply narrower expertise.
const keywords = [
  ['JavaScript',/\bjavascript\b|\bjs\b/i],['TypeScript',/\btypescript\b/i],['React',/\breact(?:\.js|js)?\b/i],
  ['Node.js',/\bnode(?:\.js|js)\b/i],['Next.js',/\bnext(?:\.js|js)\b/i],['Vue',/\bvue(?:\.js|js)?\b/i],['Angular',/\bangular\b/i],
  ['Python',/\bpython\b/i],['Java',/\bjava\b/i],['C#',/\bc#(?!\w)|\bc sharp\b/i],['C++',/\bc\+\+(?!\w)/i],['PHP',/\bphp\b/i],
  ['HTML',/\bhtml5?\b/i],['CSS',/\bcss3?\b/i],['SCSS',/\bscss\b/i],['Sass',/\bsass\b/i],['jQuery',/\bjquery\b/i],
  ['SQL',/\bsql\b/i],['PostgreSQL',/\bpostgres(?:ql)?\b/i],['MySQL',/\bmysql\b/i],['MongoDB',/\bmongodb\b/i],
  ['AWS',/\baws\b|amazon web services/i],['Azure',/\bazure\b/i],['Google Cloud',/google cloud/i],
  ['Docker',/\bdocker\b/i],['Kubernetes',/\bkubernetes\b|\bk8s\b/i],['Linux',/\blinux\b/i],['Git',/\bgit\b/i],
  ['REST APIs',/\brest(?:ful)?\b/i],['APIs',/\bapis?\b/i],['GraphQL',/\bgraphql\b/i],['CI/CD',/\bci\s*\/\s*cd\b|continuous integration/i],
  ['Testing',/\btesting\b/i],['Jest',/\bjest\b/i],['Playwright',/\bplaywright\b/i],['Cypress',/\bcypress\b/i],
  ['Accessibility',/\baccessibility\b|\bwcag\b|\ba11y\b/i],['Figma',/\bfigma\b/i],['Responsive design',/responsive (?:design|websites?|web design)/i],
  ['Technical support',/technical support|software support|application support/i],['Customer support',/customer (?:support|service)|support customers/i],
  ['Customer success',/customer success/i],['Troubleshooting',/troubleshoot\w*/i],['Debugging',/\bdebug\w*/i],['SaaS',/\bsaas\b/i],
  ['Documentation',/\bdocumentation\b|\bdocumenting\b/i],['Knowledge bases',/knowledge bases?/i],['Onboarding',/\bonboarding\b/i],
  ['Communication',/\bcommunication\b/i],['Stakeholder collaboration',/stakeholder\w*[\s\S]{0,50}collaborat|collaborat\w*[\s\S]{0,50}stakeholder/i],
  ['Live chat support',/live chat|chat support/i],['Email support',/email support/i],['Screen sharing',/screen sharing/i],['Application logs',/application logs/i],
  ['Browser developer tools',/browser (?:developer tools|devtools)|browser dev\s*tools/i],['Zendesk',/\bzendesk\b/i],['Salesforce',/\bsalesforce\b/i],['Jira',/\bjira\b/i],['ServiceNow',/\bservicenow\b/i],
  ['Data analytics',/data (?:analytics|analysis)/i],['Power BI',/\bpower\s?bi\b/i],['Tableau',/\btableau\b/i],['Excel',/\bexcel\b/i],['Machine learning',/machine learning/i],['Agile',/\bagile\b/i],['Scrum',/\bscrum\b/i],
  ['Incident management',/incident management/i],['ITIL',/\bitil\b/i],['TCP/IP',/\btcp\s*\/\s*ip\b/i],['DNS',/\bdns\b/i],['Windows',/\bwindows\b/i],['Microsoft 365',/\b(?:microsoft|office) 365\b/i],
  ['Project management',/project management/i],['Process improvement',/process improvement/i],['Quality assurance',/quality assurance/i],['Risk management',/risk management/i],['Business analysis',/business analysis/i],
  ['SAP',/\bsap\b/i],['ERP',/\berp\b/i],['Procurement',/\bprocurement\b/i],['Inventory management',/inventory management/i],['Supply chain',/supply chain/i],['Logistics',/\blogistics\b/i],
  ['Accounting',/\baccounting\b/i],['Bookkeeping',/\bbookkeeping\b/i],['Reconciliation',/\breconciliations?\b/i],['Payroll',/\bpayroll\b/i],['Financial reporting',/financial reporting/i],['Budgeting',/\bbudgeting\b/i],
  ['GMP',/\bgmp\b|good manufacturing practice/i],['GCP (clinical)',/good clinical practice/i],['Pharmacovigilance',/\bpharmacovigilance\b/i],['Clinical trials',/clinical trials?/i],['Regulatory affairs',/regulatory affairs/i],
  ['SEO',/\bseo\b|search engine optimi[sz]ation/i],['Content marketing',/content marketing/i],['Recruitment',/\brecruitment\b/i],['Account management',/account management/i],
];
const headings = [
  ['summary',/^(?:profile|summary|professional (?:profile|summary)|career (?:profile|summary)|objective|about me)$/i,'Professional Summary'],
  ['skills',/^(?:(?:technical|core|key|professional|additional) )?(?:skills|competencies)(?:\s*(?:&|and)\s*(?:technologies|tools|abilities))?$|^technologies$/i,'Skills'],
  ['experience',/^(?:(?:professional|work|relevant|employment) )?(?:experience|employment history|work history)$/i,'Professional Experience'],
  ['education',/^(?:education|academic (?:background|qualifications)|education and qualifications)$/i,'Education'],
  ['projects',/^(?:(?:selected|personal|academic|relevant) )?projects$/i,'Projects'],
  ['certifications',/^(?:certifications?|licenses?|certifications and training|training)$/i,'Certifications'],
  ['achievements',/^(?:achievements|awards|honors|honours|awards and achievements)$/i,'Achievements'],
  ['languages',/^languages$/i,'Languages'],['volunteering',/^(?:volunteering|volunteer experience)$/i,'Volunteering'],
  ['publications',/^publications$/i,'Publications'],['interests',/^(?:interests|hobbies)$/i,'Interests'],
];
const clean = value => value.replace(/\r/g,'').replace(/[\u2010-\u2015]/g,'-').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\s+([,.;:])/g,'$1').trim();
const heading = line => headings.find(([,pattern])=>pattern.test(line.replace(/:$/,'')));
const bullet = /^[•●▪◦*\-]\s*/;
const preservedSections = new Set(['education','projects','achievements']);
const dateLine = /\b(?:19|20)\d{2}\b.*(?:\b(?:19|20)\d{2}\b|\bpresent\b|\bcurrent\b)|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(?:19|20)\d{2}\b/i;
const positiveLines = value => value.split(/\n|(?<=[.!?])\s+/).filter(line=>!/(?:\bno\b|\bwithout\b|\black(?:s|ing)?\b|\bnot\b)[^.!?\n]{0,50}(?:experience|knowledge|familiar|used|proficien)|(?:haven['’]t|never)\s+(?:used|worked)/i.test(line));
const found = value => keywords.filter(([,pattern])=>positiveLines(value).some(line=>pattern.test(line))).map(([label])=>label);

export function parseResume(source) {
  const sections=[];const contact=[];let section;
  for(const raw of source.replace(/\r/g,'').split('\n')){
    const line=clean(raw);if(!line)continue;
    const match=heading(line);
    if(match){section={kind:match[0],title:match[2],sourceTitle:raw.trim(),lines:[],sourceLines:[]};sections.push(section);continue;}
    if(!section)contact.push(raw.trim());else {section.lines.push(line);section.sourceLines.push(raw.trim());}
  }
  return {contact,sections};
}
function reorderExperience(lines,relevance) {
  const output=[];
  for(let index=0;index<lines.length;){
    if(!bullet.test(lines[index])){output.push(lines[index++]);continue;}
    const start=index;
    while(index<lines.length&&bullet.test(lines[index]))index++;
    const run=lines.slice(start,index);
    // An unmarked line may continue the last bullet. Leave ambiguous groups in
    // place rather than moving a bullet away from its context or its employer.
    const clearEnd=index===lines.length||dateLine.test(lines[index]);
    output.push(...(clearEnd?relevance.rank(run):run));
  }
  return output;
}
function skillPhrases(line) {
  const parts=[];let current='',depth=0;
  for(const char of line){
    if('(['.includes(char))depth++;
    if(')]'.includes(char))depth=Math.max(0,depth-1);
    if(/[,•|]/.test(char)&&depth===0){if(current.trim())parts.push(current.trim());current='';}
    else current+=char;
  }
  if(current.trim())parts.push(current.trim());
  return parts;
}
export function validateTailorRequest(input,profile={}) {
  object(input);
  const sourceText=text(input.sourceText===undefined?profile.resumeText:input.sourceText,100000,true);
  const jobDescription=text(input.jobDescription,50000,true);
  if(sourceText.length<80)throw new AppError('Add your work history, education and skills in the source résumé.',422);
  if(jobDescription.length<120)throw new AppError('Paste the full job description (at least 120 characters).',422);
  // Older saved drafts may contain a shortening preference. New drafts always
  // retain all supplied content, including requests from an older open tab.
  return {jobTitle:text(input.jobTitle,200),company:text(input.company,200),jobDescription,sourceText,length:'complete'};
}
export function analyzeResume(draftText,jobDescription,sourceText) {
  const relevance=createRelevance(jobDescription,keywords);
  const targets=relevance.targets.map(target=>target.keyword),supported=found(sourceText),included=found(draftText);
  const lines=positiveLines(sourceText);
  const matched=relevance.targets.filter(target=>supported.includes(target.keyword)).map(target=>({keyword:target.keyword,priority:target.priority,included:included.includes(target.keyword),evidence:lines.find(line=>target.pattern.test(line))?.slice(0,260)||''}));
  const reviewSegments=relevance.segments.filter(segment=>segment.priority!=='mentioned'||/\b\d+(?:[-–]\d+)?\+?\s+years?\b[^.!?\n]{0,65}\b(?:experience|building|developing|working|managing|engineering|supporting|designing)\b|\b(?:degree|diploma|certifi\w*|sponsorship|authori[sz]ation|relocat\w*|residen\w*|eligible|eligibility|fluent|fluency)\b/i.test(segment.text));
  const requirements=[...new Map(reviewSegments.map(segment=>[segment.text,segment])).values()];
  return {
    version:2,
    matched,
    missing:targets.filter(key=>!supported.includes(key)),
    missingRequired:relevance.targets.filter(target=>target.priority==='required'&&!supported.includes(target.keyword)).map(target=>target.keyword),
    added:included.filter(key=>!supported.includes(key)),
    detected:targets.length,
    included:matched.filter(item=>item.included).length,
    sourceOnly:matched.filter(item=>!item.included).map(item=>item.keyword),
    requirements:requirements.slice(0,30).map(({text,priority})=>({text,priority})),
    requirementsTotal:requirements.length,
    checks:[{label:'Contact email present',ok:/[^\s@]+@[^\s@]+\.[^\s@]+/.test(draftText)},{label:'Experience section present',ok:/^Professional Experience$|^Experience$/im.test(draftText)},{label:'Education section present',ok:/^Education$/im.test(draftText)}],
  };
}
export function generateResume(input,profile={}) {
  const parsed=parseResume(input.sourceText);
  if(!parsed.sections.length)throw new AppError('Add clear section headings to the source résumé, such as Summary, Skills, Experience and Education. Your text is preserved for editing.',422);
  const relevance=createRelevance(input.jobDescription,keywords);
  const candidateName=parsed.contact[0]||profile.name;
  if(!candidateName)throw new AppError('Add your name in Your profile first.',422);
  const output=parsed.contact.length?[...parsed.contact]:[candidateName];
  const changes=[
    'Kept every source section and bullet. No experience or qualifications were added.',
    'Kept Education, Projects and Achievements in full, with their original wording and order.',
    'Kept your summary, contact details, employers, job titles and dates as supplied.',
  ];
  for(const section of parsed.sections){
    output.push('',section.sourceTitle);
    if(preservedSections.has(section.kind)){
      output.push(...section.sourceLines);
      continue;
    }
    if(section.kind==='skills'){
      const category=/^[A-Za-z][A-Za-z &/()-]{1,45}:/;
      if(section.sourceLines.some(line=>category.test(line))){
        const groups=[];
        for(const line of section.sourceLines){
          if(category.test(line)||!groups.length)groups.push(line);
          else groups[groups.length-1]+='\n'+line;
        }
        output.push(...relevance.rank(groups));
      }else{
        const phrases=section.sourceLines.flatMap(skillPhrases);
        output.push(relevance.rank(phrases).join(', '));
      }
      changes.push('Prioritised relevant source skills, retaining every skill and its proficiency wording.');
    }else if(section.kind==='experience'){
      output.push(...reorderExperience(section.sourceLines,relevance));
      changes.push('Prioritised relevant bullets within clear groups. Kept ambiguous or wrapped groups in their original order.');
    }else{
      output.push(...section.sourceLines);
    }
  }
  const resumeText=output.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  const now=new Date().toISOString();
  return {id:randomUUID(),...input,length:'complete',additionalSkills:'',resumeText,changes:[...new Set(changes)],report:analyzeResume(resumeText,input.jobDescription,input.sourceText),createdAt:now,updatedAt:now};
}
export function validateResumeDraft(input) {
  object(input);const request=validateTailorRequest(input);
  const id=text(input.id,50,true);if(!/^[\da-f-]{36}$/i.test(id))throw new AppError('Invalid résumé draft identifier.');
  const resumeText=text(input.resumeText,60000,true);if(resumeText.length<80)throw new AppError('The résumé is too short to export.',422);
  const createdAt=text(input.createdAt,40,true);if(Number.isNaN(Date.parse(createdAt)))throw new AppError('Invalid draft date.');
  const additionalSkills=text(input.additionalSkills,2000);
  const changes=Array.isArray(input.changes)?input.changes.slice(0,30).map(line=>text(line,1000)):[];
  return {id,...request,additionalSkills,resumeText,changes,createdAt,updatedAt:new Date().toISOString(),report:analyzeResume(resumeText,request.jobDescription,request.sourceText+'\n'+additionalSkills)};
}
export function resumeFilename(draft,format){return [draft.resumeText.split('\n')[0],draft.company,draft.jobTitle,'Resume'].filter(Boolean).join('-').replace(/[^a-z\d-]/gi,'-').replace(/-+/g,'-').slice(0,160)+'.'+format;}
