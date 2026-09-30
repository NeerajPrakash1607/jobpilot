import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {chromium} from 'playwright';
import worker from '../../src/worker.mjs';
import {watchStore} from '../../src/lib/watch-store.mjs';
import {hashToken} from '../../src/lib/watch-auth.mjs';

test('email unsubscribe confirmation works in a browser without leaking its token in referrers',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../../drizzle/'+file,import.meta.url),'utf8'));
 const db={prepare(query){return {bind(...values){return {
  async first(){return sql.prepare(query).get(...values)||null;},
  async all(){return {results:sql.prepare(query).all(...values)};},
  async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};},
 };}};},async batch(statements){
  sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}
  catch(error){sql.exec('ROLLBACK');throw error;}
 }};
 const store=watchStore(db),now=Date.now(),token='a'.repeat(64);
 const account=await store.saveAccount({id:'google:browser-test',email:'browser@example.test',name:'Browser Test'},await hashToken(token),now);
 await store.subscribe(account.id,now);
 const delivery=await store.claimDelivery(account.id,'2026-09-16',{jobIds:['test-role'],to:account.email},now);
 const observed=[],serverErrors=[];
 let origin,browser;
 const server=createServer(async(req,res)=>{
  try{
   observed.push({method:req.method,path:new URL(req.url,origin).pathname,origin:req.headers.origin,referer:req.headers.referer});
   const response=await worker.fetch(new Request(new URL(req.url,origin),{method:req.method,headers:req.headers}),{
    DB:db,ASSETS:{fetch:async()=>new Response('',{headers:{'Content-Type':'text/css'}})},
   });
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){serverErrors.push(error.message);res.writeHead(500);res.end('Local test server error');}
 });
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.JOBPILOT_TEST_BROWSER_CHANNEL?{channel:process.env.JOBPILOT_TEST_BROWSER_CHANNEL}:{})});
  const page=await browser.newPage();
  await page.goto(`${origin}/unsubscribe?token=${token}`);
  await page.getByRole('heading',{name:'Stop JobPilot emails?'}).waitFor();
  assert.equal((await store.account(account.id)).status,'active','opening an email link must not unsubscribe');
  const confirmed=page.waitForResponse(r=>r.request().method()==='POST');
  await page.getByRole('button',{name:'Unsubscribe from job alerts'}).click();
  const result=await confirmed;
  assert.equal(result.status(),200,`Unsubscribe confirmation failed: ${await result.text()}`);
  await page.getByRole('heading',{name:'You’re unsubscribed.'}).waitFor();
  assert.equal((await store.account(account.id)).status,'unsubscribed');
  assert.equal(await store.authorizeDelivery(delivery),false,'unsubscribe must suppress a queued email');
  const post=observed.find(r=>r.method==='POST');
  assert.equal(post.origin,origin);
  for(const request of observed)if(request.referer)assert.equal(request.referer,origin+'/','referrers must not contain the email token');
  assert.deepEqual(serverErrors,[]);
 }finally{
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));sql.close();
 }
});
