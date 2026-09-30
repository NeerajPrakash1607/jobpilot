import test from 'node:test';
import assert from 'node:assert/strict';
import {experienceEvidence,sponsorshipEvidence,trainingRole,resumeSkillEvidence,roleRelevance,matchesRole} from '../src/lib/job-matching.mjs';
import {EMPTY_PREFERENCES,readWatchPreferences,matchWatchJobs,digestSelection} from '../src/lib/watch-domain.mjs';

const job={id:'stripe-one',sourceId:'stripe',title:'IT Support Engineer',company:'Stripe',description:'Minimum qualifications\n1 year of technical support experience required.\nPreferred qualifications\n5 years of experience preferred.',location:'Dublin, Ireland',url:'https://stripe.com/jobs/one',firstSeen:100,open:true};
const prefs={...EMPTY_PREFERENCES,companies:['stripe'],level:'entry',roles:'IT support'};

test('early-career eligibility follows required years and discloses higher preferences',()=>{
 for(const description of [job.description,'Required experience: one year of experience.\nPreferred: three years of experience.','1 year of experience required, 5 years of experience preferred.','1 year of experience required; 3 years of experience preferred.','Required: 0–2 years of experience.','Required: 24 months of experience.','No previous experience required.']){
  assert.equal(experienceEvidence({...job,description}).kind,'clear',description);
 }
 assert.equal(experienceEvidence(job).minimum,1);
 assert.equal(experienceEvidence(job).higherPreferred.length,1);
 assert.equal(experienceEvidence({...job,description:'Requirements\n3 years of experience required.\nPreferred: 1 year of experience in Python.'}).kind,'above');
 assert.equal(matchWatchJobs([{...job,title:'Junior IT Support Engineer',description:'Minimum 5 years of experience required.'}],prefs).length,0);
 assert.equal(matchWatchJobs([job],prefs)[0].group,'matches');
 assert.equal(experienceEvidence({...job,description:'1 year of experience required and 5 years of experience preferred.'}).minimum,1);
 assert.equal(experienceEvidence({...job,description:'Requirements\n2 years’ experience.'}).minimum,2);
 assert.equal(experienceEvidence({...job,description:'Requirements\n1 year of experience.\n5 years building software.'}).kind,'above');
 assert.equal(experienceEvidence({...job,description:'3 years of experience is not required.'}).kind,'unclear');
 assert.equal(experienceEvidence({...job,description:'Requirements\n1 year of experience.\n5 years leading a team.'}).kind,'unclear');
});

test('ambiguous, partial and title-only experience stays website-only',()=>{
 for(const description of ['Join our junior team.','Preferred qualifications\n2 years of experience.','A four-year degree and enthusiasm.','We have 20 years of experience serving customers.','Bachelor’s degree and 3 years of experience or master’s and 1 year of experience.']){
  const result=matchWatchJobs([{...job,title:'Junior IT Support Engineer',description}],prefs);
  assert.equal(result.length,1,description);assert.equal(result[0].group,'experience_unclear',description);
  assert.deepEqual(digestSelection(result,prefs,new Set()),[],description);
 }
 assert.equal(experienceEvidence({...job,summaryOnly:true}).kind,'unclear');
});

test('technical support includes help desks without treating general customer service as IT',()=>{
 for(const title of ['Help Desk Analyst','Service Desk Engineer','Desktop Support Technician','IT Support Specialist'])assert.equal(matchesRole({...job,title},'IT support'),true,title);
 for(const title of ['Customer Support Specialist','Customer Service Representative','Retail Support Assistant'])assert.equal(matchesRole({...job,title,description:'Help customers with orders.'},'IT support'),false,title);
 assert.equal(matchesRole({...job,title:'Customer Support Specialist'},'customer support'),true);
 assert.ok(roleRelevance(job,'IT support')>roleRelevance({...job,title:'Help Desk Analyst'},'IT support'));
 const newer={...job,id:'stripe-two',url:'https://stripe.com/jobs/two',title:'Help Desk Analyst',firstSeen:200};
 assert.deepEqual(matchWatchJobs([newer,job],prefs).map(j=>j.id),[job.id,newer.id]);
});

test('sponsorship is evidence-based and unstated jobs remain a separate eligible email group',()=>{
 const needed={...prefs,sponsorship:'needed'};
 assert.equal(matchWatchJobs([job],needed)[0].group,'sponsorship_unknown');
 assert.equal(digestSelection([job],needed,new Set()).length,1);
 for(const text of ['Visa sponsorship is available.','We provide visa sponsorship.','We can sponsor your work visa.'])assert.equal(sponsorshipEvidence({...job,description:text}).kind,'offered',text);
 for(const text of ['We cannot provide visa sponsorship.','Visa sponsorship is not available.','You must have the right to work without sponsorship.'])assert.equal(sponsorshipEvidence({...job,description:text}).kind,'not_offered',text);
 for(const text of ['We may offer visa sponsorship.','Sponsorship considered case by case.','You must have the right to work in Ireland.'])assert.equal(sponsorshipEvidence({...job,description:text}).kind,'unknown',text);
 assert.equal(matchWatchJobs([{...job,description:job.description+'\nSponsorship is not available.'}],needed).length,0);
});

test('internships and apprenticeships require separate explicit opt-ins',()=>{
 const intern={...job,title:'IT Support Intern'},apprentice={...job,title:'IT Support Apprentice'};
 assert.equal(matchWatchJobs([intern],prefs).length,0);assert.equal(matchWatchJobs([apprentice],prefs).length,0);
 assert.equal(matchWatchJobs([intern],{...prefs,includeInternships:true}).length,1);
 assert.equal(matchWatchJobs([apprentice],{...prefs,includeInternships:true}).length,0);
 assert.equal(matchWatchJobs([apprentice],{...prefs,includeApprenticeships:true}).length,1);
 assert.equal(trainingRole({...job,title:'Graduate IT Support Engineer'}),'regular');
 assert.equal(trainingRole({...job,description:'Help our internal team and mentor interns.'}),'regular');
 assert.throws(()=>readWatchPreferences({...prefs,includeInternships:'false'}));
});

test('required skill gaps explain missing résumé mentions without rejecting the job',()=>{
 const vacancy={...job,description:'Required skills: JavaScript, SQL and troubleshooting.\nPreferred skills: Python.'};
 assert.deepEqual(resumeSkillEvidence(vacancy,{resumeText:'I troubleshoot and use JavaScript.'}).missing,['SQL']);
 assert.equal(resumeSkillEvidence(vacancy,{}).compared,false);
 assert.equal(matchWatchJobs([vacancy],prefs).length,1);
 const input={...prefs,resumeText:'PRIVATE RESUME',skills:'PRIVATE SKILLS'};
 assert.equal('resumeText' in readWatchPreferences(input),false);
 assert.equal('skills' in readWatchPreferences(input),false);
});

test('newly discovered means after activation; employer dates do not gate new finds',()=>{
 assert.equal(digestSelection([job],prefs,new Set(),100).length,0);
 assert.equal(digestSelection([{...job,listingDate:'2020-01-01'}],prefs,new Set(),99).length,1);
 assert.equal(digestSelection([{...job,alertEligible:false}],prefs,new Set(),0).length,0);
 assert.equal(digestSelection([job],prefs,new Set([job.id]),0).length,0);
});
