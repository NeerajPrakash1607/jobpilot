import { randomUUID } from 'node:crypto';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const statuses = ['saved', 'prepared', 'in_progress', 'submitted', 'interview', 'offer', 'rejected', 'archived'];
export const profileFields = ['name', 'firstName', 'lastName', 'email', 'phone', 'role', 'location', 'portfolio', 'github', 'linkedin', 'summary', 'skills', 'resumeText'];
export function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('Expected an object.');
  return value;
}
export function text(value, max = 500, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' || value.length > max) throw new AppError(`Text must be at most ${max} characters.`);
  const result = value.trim();
  if (required && !result) throw new AppError('Please complete the required fields.');
  return result;
}
export function publicUrl(value, optional = false) {
  const input = text(value, 2048, !optional);
  if (!input && optional) return '';
  let url;
  try { url = new URL(input); } catch { throw new AppError('Enter a complete https:// job or profile link.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new AppError('Only ordinary HTTP or HTTPS links are supported.');
  if (url.port && !['80', '443'].includes(url.port)) throw new AppError('Custom network ports are not supported for job links.');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) throw new AppError('Use a public job listing URL.');
  url.hash = '';
  return url.href;
}
export function canonicalUrl(value) {
  const url = new URL(publicUrl(value));
  const ghId = url.searchParams.get('gh_jid');
  if (ghId) return `${url.origin}${url.pathname.replace(/\/$/, '')}?gh_jid=${encodeURIComponent(ghId)}`;
  if (url.hostname.endsWith('indeed.com') && (url.searchParams.has('jk') || url.searchParams.has('vjk'))) return `https://www.indeed.com/viewjob?jk=${encodeURIComponent(url.searchParams.get('jk') || url.searchParams.get('vjk'))}`;
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|source$|src$|ref$|referrer$|lever-source$)/i.test(key)) url.searchParams.delete(key);
  url.pathname = url.pathname.replace(/\/(?:apply|application)\/?$/, '').replace(/\/$/, '') || '/';
  url.searchParams.sort();
  return url.href;
}
export function validateProfile(input) {
  object(input);
  const result = Object.fromEntries(profileFields.map(key => [key, text(input[key], key === 'resumeText' ? 100000 : key === 'summary' ? 4000 : 2000)]));
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new AppError('Enter a valid email address.');
  for (const key of ['portfolio', 'github', 'linkedin']) result[key] = publicUrl(result[key], true);
  return result;
}
export function validateJob(input) {
  object(input);
  return {
    title: text(input.title, 300, true), company: text(input.company, 200, true),
    location: text(input.location, 300), salary: text(input.salary, 300),
    url: publicUrl(input.url), description: text(input.description, 100000, true),
    notes: text(input.notes, 10000), followUp: text(input.followUp, 10),
  };
}
export function validateFollowUp(value) {
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) throw new AppError('Choose a valid follow-up date.');
  return value;
}
export const skillPatterns = {
  'HTML': /\bhtml(?:5)?\b/i, 'CSS': /\bcss(?:3)?\b/i, 'JavaScript': /\bjavascript\b|\bjs\b/i,
  'TypeScript': /\btypescript\b/i, 'React': /\breact(?:\.js|js)?\b/i, 'Vue': /\bvue(?:\.js|js)?\b/i,
  'Angular': /\bangular\b/i, 'Node.js': /\bnode(?:\.js|js)\b/i, 'Python': /\bpython\b/i,
  'SQL': /\bsql\b/i, 'PostgreSQL': /\bpostgres(?:ql)?\b/i, 'MongoDB': /\bmongodb\b/i,
  'Git': /\bgit\b/i, 'REST APIs': /\brest(?:ful)?\b|\bapis?\b/i, 'GraphQL': /\bgraphql\b/i,
  'Testing': /\btesting\b|\bjest\b|\bplaywright\b|\bcypress\b/i, 'Accessibility': /\baccessibility\b|\bwcag\b|\ba11y\b/i,
  'Sass': /\bs[ac]ss\b/i, 'jQuery': /\bjquery\b/i, 'PHP': /\bphp\b/i, 'Java': /\bjava\b/i,
  'Docker': /\bdocker\b/i, 'Kubernetes': /\bkubernetes\b|\bk8s\b/i, 'AWS': /\baws\b|amazon web services/i,
  'Azure': /\bazure\b/i, 'Figma': /\bfigma\b/i, 'Next.js': /\bnext(?:\.js|js)\b/i,
  'Technical support': /technical support|software support|application support/i, 'Troubleshooting': /troubleshoot|debugg/i,
  'Customer support': /customer (?:support|success|service)|support customers/i, 'SaaS': /\bsaas\b/i,
  'Documentation': /\bdocumentation\b|knowledge base/i, 'Onboarding': /\bonboarding\b/i,
  'Communication': /\bcommunication\b/i, 'Data analytics': /data analytics|data analysis/i,
};
export function skillsIn(value) { return Object.entries(skillPatterns).filter(([, pattern]) => pattern.test(value)).map(([skill]) => skill); }
export function prepareApplication(profile, job) {
  const evidence = `${profile.resumeText}\n${profile.skills}`;
  const candidate = skillsIn(evidence);
  const mentioned = skillsIn(job.description);
  const matched = mentioned.filter(skill => candidate.includes(skill));
  const missing = mentioned.filter(skill => !candidate.includes(skill));
  const blockers = [];
  if (!profile.name) blockers.push('Add your full name.');
  if (!profile.email || /@example\./i.test(profile.email)) blockers.push('Add your real email address.');
  if (!profile.resumeText || profile.resumeText.length < 80) blockers.push('Upload a résumé with selectable text, or paste its text.');
  if (job.description.length < 120) blockers.push('Add the full job description for useful preparation.');
  const name = profile.name || '[Your name]';
  const supported = matched.length ? `My résumé includes experience with ${matched.slice(0, 5).join(', ')}.` : profile.summary;
  const opening = `Dear ${job.company} hiring team,\n\nI’m ${name}, and I’m applying for the ${job.title} position.${supported ? ` ${supported}` : ''}\n\n${profile.portfolio ? `You can see my work at ${profile.portfolio}.\n\n` : ''}I would welcome the opportunity to discuss how my background could contribute to your team.\n\nKind regards,\n${name}`;
  return { matched, missing, mentioned, coverage: mentioned.length ? Math.round(100 * matched.length / mentioned.length) : null, blockers, opening, generatedAt: new Date().toISOString(), method: 'Keyword coverage of the job description, using only résumé text and skills you supplied. It is not a hiring probability.' };
}
export function newJob(fields) { return { ...fields, id: randomUUID(), status: 'saved', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), followUp: validateFollowUp(fields.followUp), evidence: null, preparation: null }; }
export function validateEvidence(input) {
  object(input);
  const note = text(input.note, 3000, true);
  if (note.length < 12) throw new AppError('Record a confirmation message, reference number, or a short note describing the completed submission.');
  if (input.source !== undefined && !['user_confirmed','browser_confirmation'].includes(input.source)) throw new AppError('Unknown confirmation source.');
  return { note, url: publicUrl(input.url, true), recordedAt: new Date().toISOString(), source: input.source || 'user_confirmed' };
}
export function stripHtml(html) {
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(?:p|div|li|h[1-6])\s*>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, entity => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[entity])
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => { const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n); return code <= 0x10ffff ? String.fromCodePoint(code) : ''; })
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}
export function structuredJob(html, url) {
  const walk = value => {
    if (Array.isArray(value)) return value.map(walk).find(Boolean);
    if (!value || typeof value !== 'object') return null;
    if ([value['@type']].flat().includes('JobPosting')) return value;
    return Object.values(value).map(walk).find(Boolean);
  };
  let posting;
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { posting = walk(JSON.parse(match[1])); } catch { /* Other schema blocks need not be valid job postings. */ }
    if (posting) break;
  }
  if (!posting) throw new AppError('This page does not expose a readable job posting. Import the open page with the extension, or paste the description below.', 422);
  const locations = [posting.jobLocation].flat().filter(Boolean).map(item => item.address || {}).map(item => [item.addressLocality, item.addressRegion, typeof item.addressCountry === 'string' ? item.addressCountry : item.addressCountry?.name].filter(Boolean).join(', '));
  return { title: posting.title || '', company: posting.hiringOrganization?.name || '', location: locations.join(' / ') || (posting.jobLocationType === 'TELECOMMUTE' ? 'Remote' : ''), salary: '', description: stripHtml(posting.description || ''), url, source: 'Structured job posting' };
}
