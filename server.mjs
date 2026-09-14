import http from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { openStore } from './lib/store.mjs';
import { AppError, object, text, canonicalUrl } from './lib/domain.mjs';
import { importJob } from './lib/importer.mjs';
import { createDiscovery, defaultSearch, validateSearch } from './lib/discovery.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies');
async function pdfText(bytes) {
  const bundled = path.join(runtime, 'python/bin/python3');
  const python = process.env.JOBPILOT_PYTHON || await access(bundled).then(() => bundled).catch(() => 'python3');
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(ROOT, 'lib/read_resume.py')], { stdio: ['pipe','pipe','pipe'] });
    let output = ''; let failure = ''; const timer = setTimeout(() => { child.kill(); reject(new AppError('PDF reading timed out. Paste the résumé text in your profile.', 422)); }, 15000);
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { failure += chunk; });
    child.on('error', () => { clearTimeout(timer); reject(new AppError('PDF text extraction needs Python and pypdf. You can still paste your résumé text in Profile.', 422)); });
    child.on('close', code => { clearTimeout(timer); if (code !== 0) reject(new AppError(failure.includes('pypdf') ? 'Install pypdf, or paste your résumé text in Profile.' : 'This PDF could not be read. Try an unencrypted PDF with selectable text.', 422)); else resolve(output.trim()); });
    child.stdin.on('error', () => {}); child.stdin.end(bytes);
  });
}
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 16_000_000) throw new AppError('The upload is too large (maximum 16 MB).', 413); chunks.push(chunk); }
  try { return object(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch(error) { if (error instanceof AppError) throw error; throw new AppError('Invalid JSON request.'); }
}
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.zip': 'application/zip' };
const assets = new Set(['index.html','styles.css','app.js','discovery-ui.js','extension.zip','extension/manifest.json','extension/popup.html','extension/popup.js','extension/popup.css','extension/automation.js','extension/submission.js','extension/auto-apply.js','extension/worker.js','extension/context.js']);
export async function createApp({ directory = process.env.JOBPILOT_DATA_DIR || path.join(ROOT,'data'), importer = importJob, discovery } = {}) {
  const store = await openStore(directory);
  const finder = discovery || createDiscovery({directory:path.join(directory,'discovery-cache')});
  await store.backup('startup');
  let backupDay = new Date().toISOString().slice(0,10);
  const server = http.createServer(async (req, res) => {
    const send = (status, value, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }); res.end(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)); };
    try {
      const port = server.address().port;
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host)) throw new AppError('Invalid local hostname.', 403);
      const url = new URL(req.url, `http://${req.headers.host}`);
      const origin = req.headers.origin;
      const localOrigin = !origin || [`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin);
      const extensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/.test(origin || '');
      if (req.method === 'OPTIONS') {
        if (!extensionOrigin && !localOrigin) throw new AppError('Origin not permitted.', 403);
        return send(204, '', { ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}), 'Access-Control-Allow-Methods': 'GET,POST,PATCH', 'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-JobPilot,X-JobPilot-Version' });
      }
      let extension = false;
      if (req.headers.authorization) { const supplied = Buffer.from(req.headers.authorization.replace(/^Bearer /,'')); const expected = Buffer.from(store.getSetting('token')); extension = supplied.length === expected.length && timingSafeEqual(supplied, expected); if (!extension) throw new AppError('Pair the extension again from JobPilot Settings.', 401); }
      if (origin && !localOrigin && !(extensionOrigin && extension)) throw new AppError('Origin not permitted.', 403);
      if (extensionOrigin && extension) res.setHeader('Access-Control-Allow-Origin', origin);
      if(extension && extensionOrigin)store.setSetting('companion',{lastSeenAt:new Date().toISOString(),version:text(req.headers['x-jobpilot-version'],30)||'2.2.0'});
      if (url.pathname.startsWith('/api/')) {
        const directResume = url.pathname === '/api/resume' && req.method === 'GET' && ['same-origin','same-site'].includes(req.headers['sec-fetch-site']);
        if (!extension && (!localOrigin || req.headers['sec-fetch-site'] === 'cross-site' || (req.headers['x-jobpilot'] !== '1' && !directResume))) throw new AppError('Open JobPilot locally to access your data.', 403);
        if (extension && ['/api/connection','/api/restore','/api/migrate'].includes(url.pathname)) throw new AppError('Use the JobPilot dashboard for this action.', 403);
        if (!['GET','POST','PATCH'].includes(req.method)) throw new AppError('Method not supported.', 405);
        if (req.method !== 'GET') { const today = new Date().toISOString().slice(0,10); if (backupDay !== today) { await store.backup('daily'); backupDay = today; } }
        const data = req.method === 'GET' ? null : await body(req);
        if (url.pathname === '/api/health' && req.method === 'GET') return send(200, { ok: true, version: 2 });
        if (url.pathname === '/api/state' && req.method === 'GET') return send(200, store.state());
        if (url.pathname === '/api/companion' && req.method === 'GET') return send(200,{lastConnection:store.getSetting('companion')});
        if (url.pathname === '/api/profile' && req.method === 'POST') return send(200, store.saveProfile(data));
        if (url.pathname === '/api/discover/preferences' && req.method === 'GET') return send(200,store.getSetting('search') || defaultSearch(store.getSetting('profile')));
        if (url.pathname === '/api/discover' && req.method === 'POST') {
          const search = validateSearch(data);
          store.setSetting('search',search);
          return send(200,await finder.search(search,store.getSetting('profile'),store.jobs()));
        }
        if (url.pathname === '/api/discover/save' && req.method === 'POST') {
          const fields = await finder.resolve(text(data.id,100,true));
          const existing = store.jobs().find(job=>canonicalUrl(job.url) === canonicalUrl(fields.url));
          return send(existing ? 200 : 201,{job:existing || store.add(fields),alreadySaved:!!existing});
        }
        if (url.pathname === '/api/import' && req.method === 'POST') return send(200, await importer(text(data.url, 2048, true)));
        if (url.pathname === '/api/jobs' && req.method === 'POST') return send(201, store.add(data));
        const jobRoute = url.pathname.match(/^\/api\/jobs\/([\w-]+)(?:\/(prepare|status|draft|attempt))?$/);
        if (jobRoute) {
          const [,id,action] = jobRoute;
          if (req.method === 'GET' && !action) return send(200, store.getJob(id));
          if (req.method === 'PATCH' && !action) return send(200, store.update(id,data));
          if (req.method === 'POST' && action === 'prepare') return send(200, store.prepare(id));
          if (req.method === 'POST' && action === 'status') return send(200, store.changeStatus(id,data));
          if (req.method === 'POST' && action === 'attempt') return send(200,store.submissionAttempt(id,data));
          if (req.method === 'POST' && action === 'draft') { const job = store.getJob(id); if (!job.preparation) throw new AppError('Prepare the application first.'); job.preparation.opening = text(data.opening,10000,true); return send(200,store.saveJob(job)); }
        }
        if (url.pathname === '/api/migrate' && req.method === 'POST') { await store.migrate(data); return send(200,store.state()); }
        if (url.pathname === '/api/backup' && req.method === 'GET') return send(200,store.snapshot());
        if (url.pathname === '/api/backup' && req.method === 'POST') return send(200,{ file: await store.backup('manual') });
        if (url.pathname === '/api/restore' && req.method === 'POST') { await store.restore(data); return send(200,store.state()); }
        if (url.pathname === '/api/connection' && req.method === 'GET') return send(200,{ token: store.getSetting('token') });
        if (url.pathname === '/api/resume' && req.method === 'GET') { const resume = store.resume(); if (!resume) throw new AppError('Upload your résumé first.',404); if (url.searchParams.has('json')) return send(200,{ name:resume.name,base64:Buffer.from(resume.content).toString('base64') }); return send(200,Buffer.from(resume.content),{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${resume.name.replace(/[^\w .-]/g,'_')}"`}); }
        if (url.pathname === '/api/resume' && req.method === 'POST') {
          const name = text(data.name,200,true).replace(/[^\w .-]/g,'_'); const bytes = Buffer.from(text(data.base64,11_000_000,true),'base64');
          if (bytes.length > 8_000_000 || bytes.subarray(0,5).toString() !== '%PDF-') throw new AppError('Upload a PDF résumé under 8 MB.');
          const extracted = await pdfText(bytes); store.putResume(name,bytes,extracted);
          return send(200,{ characters:extracted.length, warning:extracted.length < 80 ? 'This PDF has little selectable text. Paste the résumé text in Profile before preparing.' : null });
        }
        throw new AppError('This action was not found.',404);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new AppError('Method not supported.',405);
      let filename = decodeURIComponent(url.pathname).replace(/^\//,'') || 'index.html';
      if (filename === 'job-apply-assistant/' || filename === 'job-apply-assistant') filename = 'index.html';
      if (!assets.has(filename) && !(process.env.JOBPILOT_TEST_UI === '1' && ['tests/browser.html','tests/browser-harness.js','tests/ashby.html','tests/ashby-harness.js','tests/popup-harness.js','tests/popup.html'].includes(filename))) throw new AppError('Not found.',404);
      const content = await readFile(path.join(ROOT,filename)).catch(() => { throw new AppError('Not found.',404); });
      send(200, req.method === 'HEAD' ? '' : content, { 'Content-Type':types[path.extname(filename)] || 'application/octet-stream', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'Referrer-Policy':'no-referrer' });
    } catch(error) { const status = error instanceof AppError ? error.status : 500; if (status === 500) console.error(error); send(status,{ error: status === 500 ? 'The local service could not complete this action. Your saved data is unchanged; try again.' : error.message }); }
  });
  return { server, store };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.JOBPILOT_PORT || 5181);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('JOBPILOT_PORT must be a port between 1024 and 65535.');
  const {server,store} = await createApp();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the old preview or choose JOBPILOT_PORT.` : error.message); process.exit(1); });
  server.listen(port,'127.0.0.1',() => console.log(`JobPilot ready at http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
}
