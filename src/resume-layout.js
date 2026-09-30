// One document structure for the on-screen preview, PDF and Word exports.
const headings = [
  ['summary', /^(?:profile|summary|professional (?:profile|summary)|career (?:profile|summary)|objective|about me)$/i, 'Profile'],
  ['skills', /^(?:(?:technical|core|key|professional|additional) )?(?:skills|competencies)(?:\s*(?:&|and)\s*(?:technologies|tools|abilities))?$|^technologies$/i, 'Skills & Technologies'],
  ['experience', /^(?:(?:professional|work|relevant|employment) )?(?:experience|employment history|work history)$/i, 'Experience'],
  ['education', /^(?:education|academic (?:background|qualifications)|education and qualifications)$/i],
  ['projects', /^(?:(?:selected|personal|academic|relevant) )?projects$/i],
  ['achievements', /^(?:achievements|awards|honors|honours|awards and achievements)$/i],
  ['other', /^(?:certifications?|licenses?|certifications and training|training|languages|volunteering|volunteer experience|publications|interests|hobbies|additional information)$/i],
];
const bullet = /^[•●▪◦*\-]\s+/;
const month = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const date = `(?:${month}\\.?\\s*)?(?:19|20)\\d{2}`;
const dates = new RegExp(`(?:\\s+|^)(${date}\\s*[-–—]\\s*(?:${date}|Present|Current))\\.?$`, 'i');
const tidy = value => value.replace(/\s+/g, ' ').trim();
const heading = line => headings.find(([, pattern]) => pattern.test(line.replace(/:$/, '')));

export function splitEntry(value) {
  const match = value.match(dates);
  const text = match ? value.slice(0, match.index).trim() : value;
  const comma = text.indexOf(',');
  return {text, date: match?.[1] || '', emphasis: comma < 0 ? text : text.slice(0, comma)};
}

const categories = [
  ['Languages', /^(?:javascript|typescript|python|java|c#|c\+\+|php|sql)\b/i],
  ['Frontend', /react|angular|vue|html|css|scss|sass|jquery|responsive|accessib|figma|next\.js/i],
  ['Backend & APIs', /api|node\.js|json|http|graphql|backend/i],
  ['Databases', /mysql|postgres|mongo|database/i],
  ['Testing', /test|jest|playwright|cypress|quality assurance/i],
  ['Cloud & DevOps', /azure|aws|google cloud|docker|kubernetes|linux|ci\/cd|deployment|devops/i],
  ['Version Control', /^(?:git|github)\b/i],
  ['Support', /support|success|troubleshoot|debug|saas|knowledge bas|onboard|screen sharing|application logs/i],
  ['Tools', /tools|zendesk|salesforce|jira|servicenow|postman|confluence/i],
  ['Data & Analytics', /data|analytics|machine learning|excel|power bi|tableau/i],
  ['Collaboration', /communication|collaborat|stakeholder|documentation|agile|scrum/i],
];

export function skillRows(lines) {
  // Supplied categories and qualifiers take precedence over automatic grouping.
  if (lines.some(line => /^[A-Za-z][A-Za-z &/()-]{1,45}:/.test(line))) {
    const rows = [];
    for (const line of lines) {
      if (/^[A-Za-z][A-Za-z &/()-]{1,45}:/.test(line) || !rows.length) rows.push(line);
      else rows[rows.length - 1] += ' ' + line;
    }
    return rows;
  }
  const groups = new Map();
  for (const item of lines.join(' ').replace(bullet, '').split(/[,•●▪;]\s*/).map(tidy).filter(Boolean)) {
    const label = categories.find(([, pattern]) => pattern.test(item))?.[0] || 'Additional Skills';
    if (!groups.has(label)) groups.set(label, []);
    if (!groups.get(label).includes(item)) groups.get(label).push(item);
  }
  return [...groups].map(([label, items]) => `${label}: ${items.join(' • ')}`);
}

function contacts(lines) {
  const parts = lines.flatMap(line => line.split('|')).map(tidy).filter(Boolean).map(text => {
    if (/^https?:\/\/\S+$/i.test(text)) {
      try {
        const url = new URL(text);
        if (url.username || url.password) return {text};
        const label = /(^|\.)linkedin\.com$/i.test(url.hostname) ? 'LinkedIn' : /(^|\.)github\.com$/i.test(url.hostname) ? 'GitHub' : 'Portfolio';
        return {text: label, href: url.href};
      } catch { return {text}; }
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return {text, href: 'mailto:' + text};
    return {text};
  });
  return parts.filter((part, index) => !parts.slice(0, index).some(other => (other.href || other.text) === (part.href || part.text)) &&
    (part.href || !parts.some(other => other.href && other.text === part.text)));
}

function sectionBlocks(section) {
  const result = [{kind: 'section', text: section.title}];
  if (section.kind === 'skills') return result.concat(skillRows(section.lines).map(text => ({kind: 'skill', text})));
  const lines = section.lines;
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (bullet.test(line)) {
      result.push({kind: 'bullet', text: line.replace(bullet, '')}); i++; continue;
    }
    let run = [];
    while (i < lines.length && !bullet.test(lines[i])) run.push(lines[i++]);
    const previous = result.at(-1);
    if (previous.kind === 'bullet' && run.length > 1) {
      const dateIndex = run.findIndex(line => dates.test(line));
      const start = dateIndex >= 0 ? (splitEntry(run[dateIndex]).text ? dateIndex : Math.max(0, dateIndex - 1)) :
        (i < lines.length && /^[A-Z0-9]/.test(run.at(-1)) && !/[.!?]$/.test(run.at(-1)) ? run.length - 1 : 0);
      if (start > 0) { previous.text += ' ' + run.slice(0, start).join(' '); run = run.slice(start); }
    }
    const text = run.join(' ');
    const dated = dates.test(text);
    const entrySection = ['experience', 'education', 'projects'].includes(section.kind);
    const newEntry = dated || (entrySection && (previous.kind === 'section' ||
      (i < lines.length && /^[A-Z0-9]/.test(text) && !/[.!?]$/.test(text))));
    if (newEntry) result.push({kind: 'entry', ...splitEntry(text)});
    else if (previous.kind === 'bullet') previous.text += ' ' + text;
    else result.push({kind: 'body', text});
  }
  return result;
}

export function resumeLayout(text) {
  const lines = text.replace(/\r/g, '').split('\n').map(tidy).filter(Boolean);
  const name = lines.shift() || '';
  const contact = [], sections = [];
  let section;
  for (const line of lines) {
    const match = heading(line);
    if (match) { section = {kind: match[0], title: match[2] || line, lines: []}; sections.push(section); }
    else if (section) section.lines.push(line);
    else contact.push(line);
  }
  const parts = contacts(contact);
  const rows = parts.length > 4 ? [parts.slice(0, 3), parts.slice(3)] : [parts];
  return [{kind: 'name', text: name}, {kind: 'contacts', parts, rows}, ...sections.flatMap(sectionBlocks)];
}
