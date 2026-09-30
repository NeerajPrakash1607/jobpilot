import test from 'node:test';
import assert from 'node:assert/strict';
import {generateResume,parseResume,validateTailorRequest} from '../src/lib/resume-tailor.mjs';

const jobDescription=`Required skills: Python and SQL.
Build Python services, investigate SQL queries and document technical issues.
Preferred skills: Docker. Work with colleagues to maintain reliable services.`;
const source=`Alex Example
alex@example.test | Dublin, Ireland
Profile
Software engineer working on web applications. I enjoy collaborating with colleagues. I write documentation. I maintain internal tools.
Skills
JavaScript, Python (learning), SQL basics, HTML, CSS
Experience
Engineer, Recent Company Jan 2023 – Present
• Built HTML pages.
• Reviewed CSS styles.
• Updated JavaScript components.
• Wrote team documentation.
• Supported internal users.
• Maintained a Python reporting script.
• Investigated SQL queries.
Developer, Earlier Company Jan 2020 – Dec 2022
• Built CSS components.
• Wrote Python scripts for internal reports.
Education
Example College, BSc Sep 2016 – Jun 2019
Projects
Website – personal project
• Built HTML pages.
Achievements
• Received a team award in 2021.
Interests
Painting and hiking.
Languages
English`;
const section=(text,kind)=>parseResume(text).sections.find(item=>item.kind===kind);

test('rearranging retains every source line except reordered skill separators, even with legacy shortening options',()=>{
  for(const length of ['focused','targeted','complete',undefined]){
    const draft=generateResume(validateTailorRequest({sourceText:source,jobDescription,length}));
    const result=parseResume(draft.resumeText),original=parseResume(source);
    assert.deepEqual(result.contact,original.contact);
    assert.deepEqual(result.sections.map(s=>s.kind),original.sections.map(s=>s.kind));
    for(const old of original.sections){
      const next=section(draft.resumeText,old.kind);
      assert.equal(next.sourceTitle,old.sourceTitle);
      if(old.kind==='skills'){
        assert.deepEqual(next.sourceLines.join(', ').split(', ').sort(),old.sourceLines.join(', ').split(', ').sort());
      }else{
        assert.deepEqual([...next.sourceLines].sort(),[...old.sourceLines].sort());
      }
    }
    for(const kind of ['education','projects','achievements','summary','interests']){
      assert.deepEqual(section(draft.resumeText,kind),section(source,kind));
    }
    assert.equal(draft.length,'complete');
  }
});

test('relevant bullets move up inside their original role without changing employer chronology',()=>{
  const draft=generateResume({sourceText:source,jobDescription});
  const lines=section(draft.resumeText,'experience').sourceLines;
  assert.equal(lines[0],'Engineer, Recent Company Jan 2023 – Present');
  assert.match(lines[1],/Python|SQL/);
  const older=lines.indexOf('Developer, Earlier Company Jan 2020 – Dec 2022');
  assert.equal(older,8);
  assert.equal(lines[older+1],'• Wrote Python scripts for internal reports.');
  assert.deepEqual(lines.slice(1,older).sort(),section(source,'experience').sourceLines.slice(1,older).sort());
});

test('only source skills are reordered and qualifiers are retained',()=>{
  const draft=generateResume({sourceText:source,jobDescription},{name:'Different Name',skills:'Docker, Kubernetes',email:'different@example.test'});
  const skills=section(draft.resumeText,'skills').sourceLines.join('\n');
  assert.match(skills,/^(Python \(learning\)|SQL basics)/);
  assert.ok(skills.includes('Python (learning)'));
  assert.ok(skills.includes('SQL basics'));
  assert.ok(!draft.resumeText.includes('Docker'));
  assert.ok(!draft.resumeText.includes('Different Name'));
  assert.ok(draft.report.missing.includes('Docker'));
  assert.deepEqual(draft.report.added,[]);
  const withoutSkills=source.replace(/Skills\n[^\n]+\n/,'');
  const noSkillsDraft=generateResume({sourceText:withoutSkills,jobDescription},{skills:'Python, Docker'});
  assert.equal(section(noSkillsDraft.resumeText,'skills'),undefined);
});

test('wrapped or ambiguous experience lines stay beside their original bullet',()=>{
  const wrapped=`Alex Example
Experience
Developer, Example Ltd Jan 2020 – Present
• Built HTML pages.
• Wrote Python scripts
for an internal reporting tool.
• Updated team documentation.
Other responsibilities
• Reviewed CSS components.
Education
Example College`;
  const draft=generateResume({sourceText:wrapped,jobDescription});
  assert.deepEqual(section(draft.resumeText,'experience'),section(wrapped,'experience'));
});

test('skill categories retain wrapped context when moved',()=>{
  const grouped=source.replace('JavaScript, Python (learning), SQL basics, HTML, CSS','Frontend: JavaScript, HTML, CSS\nData: Python (learning), SQL basics\nUsed for coursework only.');
  const draft=generateResume({sourceText:grouped,jobDescription});
  assert.deepEqual(section(draft.resumeText,'skills').sourceLines,[
    'Data: Python (learning), SQL basics',
    'Used for coursework only.',
    'Frontend: JavaScript, HTML, CSS',
  ]);
});
