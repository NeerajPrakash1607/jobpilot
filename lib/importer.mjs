import https from 'node:https';
import http from 'node:http';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError, publicUrl, stripHtml, structuredJob } from './domain.mjs';

export function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0,168].includes(b)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18,19].includes(b)));
  }
  if (isIP(address) === 6) return /^2[0-9a-f]{3}:/i.test(address) && !/^2001:(?:0:|db8:)/i.test(address) && !/^2002:/i.test(address);
  return false;
}
export async function getPublicPage(input, redirects = 0, maxBytes = 2_000_000) {
  const url = new URL(publicUrl(input));
  const addresses = await lookup(url.hostname, { all: true }).catch(() => { throw new AppError('The job website could not be reached. Check the URL or use the browser extension.', 422); });
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new AppError('This URL does not resolve to a public website.');
  const selected = addresses[0];
  const result = await new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      headers: { 'User-Agent': 'JobPilot/2.0 (personal job application assistant)', Accept: 'application/json,text/html' },
      lookup: (_host, options, callback) => options.all ? callback(null, [selected]) : callback(null, selected.address, selected.family),
    }, response => {
      let bytes = 0; const chunks = [];
      response.on('data', chunk => { bytes += chunk.length; if (bytes > maxBytes) { request.destroy(new AppError('This page is too large. Use the extension to import the job text.', 422)); } else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, location: response.headers.location, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.setTimeout(12000, () => request.destroy(new AppError('The website timed out. Import the open page with the extension instead.', 422)));
    request.on('error', reject);
  }).catch(error => { if (error instanceof AppError) throw error; throw new AppError('The website could not be imported. Open it in your browser and use the extension, or paste its description.', 422); });
  if (result.status >= 300 && result.status < 400 && result.location) {
    if (redirects >= 3) throw new AppError('The page redirected too many times.', 422);
    return getPublicPage(new URL(result.location, url).href, redirects + 1, maxBytes);
  }
  if (result.status < 200 || result.status >= 300) throw new AppError(`The website returned HTTP ${result.status}. Use the extension or paste the job description.`, 422);
  return result.body;
}
export function boardIdentity(input) {
  const url = new URL(publicUrl(input));
  const parts = url.pathname.split('/').filter(Boolean);
  if (['boards.greenhouse.io', 'job-boards.greenhouse.io'].includes(url.hostname) && parts.length >= 3 && parts[1] === 'jobs' && /^\d+$/.test(parts[2])) return { type: 'greenhouse', company: parts[0], id: parts[2], endpoint: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(parts[0])}/jobs/${parts[2]}` };
  if (['jobs.lever.co', 'jobs.eu.lever.co'].includes(url.hostname) && parts.length >= 2 && /^[\da-f-]{20,}$/i.test(parts[1])) return { type: 'lever', company: parts[0], id: parts[1], endpoint: `https://${url.hostname === 'jobs.eu.lever.co' ? 'api.eu.lever.co' : 'api.lever.co'}/v0/postings/${encodeURIComponent(parts[0])}/${parts[1]}?mode=json` };
  return null;
}
export async function importJob(url, fetchPage = getPublicPage) {
  url = publicUrl(url);
  const board = boardIdentity(url);
  if (!board) return structuredJob(await fetchPage(url), url);
  let post;
  try { post = JSON.parse(await fetchPage(board.endpoint)); } catch (error) { if (error instanceof AppError) throw error; throw new AppError('The job board returned an unreadable posting.', 422); }
  if (board.type === 'greenhouse') return { title: post.title || '', company: post.company_name || board.company, location: post.location?.name || '', salary: '', url, description: stripHtml(post.content || ''), source: 'Greenhouse public Job Board API' };
  const description = [post.descriptionPlain || stripHtml(post.description || ''), ...(post.lists || []).map(list => `${list.text}\n${stripHtml(list.content)}`), post.additionalPlain || stripHtml(post.additional || '')].join('\n\n');
  return { title: post.text || '', company: board.company, location: post.categories?.location || '', salary: post.salaryRange ? [post.salaryRange.currency, post.salaryRange.min, '–', post.salaryRange.max, post.salaryRange.interval].filter(Boolean).join(' ') : '', url, description, source: 'Lever public Postings API' };
}
