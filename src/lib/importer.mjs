import { AppError, publicUrl, stripHtml, structuredJob } from './domain.mjs';
import { getPublicPage } from './public-fetch.mjs';
import {importMastercardJob} from './ats-feeds.mjs';
export { getPublicPage };
export function boardIdentity(input) {
  const url = new URL(publicUrl(input));
  const parts = url.pathname.split('/').filter(Boolean);
  if (['boards.greenhouse.io', 'job-boards.greenhouse.io'].includes(url.hostname) && parts.length >= 3 && parts[1] === 'jobs' && /^\d+$/.test(parts[2])) return { type: 'greenhouse', company: parts[0], id: parts[2], endpoint: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(parts[0])}/jobs/${parts[2]}` };
  if (['jobs.lever.co', 'jobs.eu.lever.co'].includes(url.hostname) && parts.length >= 2 && /^[\da-f-]{20,}$/i.test(parts[1])) return { type: 'lever', company: parts[0], id: parts[1], endpoint: `https://${url.hostname === 'jobs.eu.lever.co' ? 'api.eu.lever.co' : 'api.lever.co'}/v0/postings/${encodeURIComponent(parts[0])}/${parts[1]}?mode=json` };
  return null;
}
export async function importJob(url, fetchPage = getPublicPage) {
  url = publicUrl(url);
  if(new URL(url).hostname==='mastercard.wd1.myworkdayjobs.com')return importMastercardJob(url,fetchPage);
  const board = boardIdentity(url);
  if (!board) return structuredJob(await fetchPage(url), url);
  let post;
  try { post = JSON.parse(await fetchPage(board.endpoint)); } catch (error) { if (error instanceof AppError) throw error; throw new AppError('The job board returned an unreadable posting.', 422); }
  if (board.type === 'greenhouse') return { title: post.title || '', company: post.company_name || board.company, location: post.location?.name || '', salary: '', url, description: stripHtml(post.content || ''), source: 'Greenhouse public Job Board API' };
  const description = [post.descriptionPlain || stripHtml(post.description || ''), ...(post.lists || []).map(list => `${list.text}\n${stripHtml(list.content)}`), post.additionalPlain || stripHtml(post.additional || '')].join('\n\n');
  return { title: post.text || '', company: board.company, location: post.categories?.location || '', salary: post.salaryRange ? [post.salaryRange.currency, post.salaryRange.min, '–', post.salaryRange.max, post.salaryRange.interval].filter(Boolean).join(' ') : '', url, description, source: 'Lever public Postings API' };
}
