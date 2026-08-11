const assert=require('assert');
const strategy=require('../followup-strategy.js');
const core=require('../followup-core.js');
const page='https://jobs.example.com/candidate/applications';
assert(strategy.isSafeGetCandidate('https://jobs.example.com/api/candidate/application/list?page=1',page));
assert(!strategy.isSafeGetCandidate('https://jobs.example.com/api/application/submit',page));
assert(!strategy.isSafeGetCandidate('https://api.example.com/api/application/list',page),'v2.2 must stay same-origin');
assert(!strategy.sanitizeCacheUrl('https://jobs.example.com/api/application/list?token=secret',page));
assert(strategy.sanitizeCacheUrl('https://jobs.example.com/api/application/list?page=1&t=123',page).includes('page=1'));
const ranked=strategy.rankApiCandidates([
  'https://jobs.example.com/assets/app.js',
  'https://jobs.example.com/api/application/status',
  'https://jobs.example.com/api/application/submit'
],[],page,3);
assert.strictEqual(ranked.length,1);
assert(ranked[0].url.includes('/api/application/status'));
const useful=strategy.isUseful([{position:'大模型算法工程师',url:page}],[{position:'大模型算法工程师',status:'面试中',url:page}],core,.8);
assert(useful.ok && useful.matched===1);
console.log('OfferTrack follow-up strategy safety/ranking: PASS');
