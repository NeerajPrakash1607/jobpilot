import test from 'node:test';
import assert from 'node:assert/strict';
import {listingKey,roleForPage,availableRoles,profileReadiness} from '../extension/context.js';
import {canonicalUrl} from '../lib/domain.mjs';
test('Ashby application route matches only its saved role and deduplicates',()=>{
 const url='https://jobs.ashbyhq.com/example/123';const job={id:'123',url,status:'prepared',preparation:{opening:'Draft'}};
 assert.equal(roleForPage({jobs:[job]},url+'/application?utm_source=foo')?.id,'123');
 assert.equal(roleForPage({jobs:[job]},url.replace('123','456')+'/application'),undefined);
 assert.equal(canonicalUrl(url+'/application'),canonicalUrl(url));
 assert.notEqual(listingKey('https://stripe.com/jobs/search?gh_jid=1'),listingKey('https://stripe.com/jobs/search?gh_jid=2'));
 assert.equal(listingKey('chrome://extensions'),null);
});
test('completed or unprepared roles cannot be selected, missing split names are explained',()=>{
 const base={id:'1',status:'prepared',preparation:{opening:'Draft'}};
 assert.deepEqual(availableRoles({jobs:[base,{...base,id:'2',status:'submitted'},{...base,id:'3',preparation:null},{...base,id:'4',evidence:{note:'Received'}}]}).map(j=>j.id),['1']);
 assert.deepEqual(profileReadiness({profile:{name:'Test Candidate',email:'test@example.org'},resume:{}}),['First / given name','Last / family name']);
});
