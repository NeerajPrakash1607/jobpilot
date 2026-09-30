import test from 'node:test';
import assert from 'node:assert/strict';
import {readVisit, visitResults} from '../src/lib/visit-history.mjs';

test('first visits, invalid storage and future clocks never label the whole catalogue new', () => {
  for (const raw of [null, 'broken', '{}', JSON.stringify({since:10,lastSeen:1001})]) {
    assert.deepEqual(readVisit(raw, 1000), {since:1000,returning:false});
  }
  assert.equal(visitResults([{firstSeen:999}],1000).newCount,0);
});
test('refreshes keep highlights; returning after 30 minutes compares with the previous check', () => {
  const raw=JSON.stringify({since:1000,lastSeen:2000});
  assert.equal(readVisit(raw,3000).since,1000);
  assert.equal(readVisit(raw,2000+1800000).since,2000);
});
test('new-only filtering happens before the response limit and never includes old or undated jobs', () => {
  const jobs=[...Array.from({length:501},()=>({firstSeen:1000})),{id:'new',firstSeen:2000},{}];
  assert.deepEqual(visitResults(jobs,1000,true),{jobs:[{id:'new',firstSeen:2000}],newCount:1});
  assert.equal(visitResults(jobs,null).newCount,0);
});
