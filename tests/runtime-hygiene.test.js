const fs = require('fs');
const assert = require('assert');
const read = name => fs.readFileSync(name, 'utf8');
const worker = read('service-worker.js');
const background = read('background.js');
const followup = read('followup-background.js');
const actions = read('followup-actions.js');
const orchestrator = read('followup-orchestrator.js');
const semantic = read('semantic.js');
const applicationData = read('application-data.js');
const followupCore = read('followup-core.js');
const decision = read('followup-decision.js');
const Contract = require('../application-contract.js');
const Queue = require('../followup-queue.js');
const Review = require('../followup-review.js');

assert(!fs.existsSync('v25-orchestrator.js'));
assert(!fs.existsSync('v26-lite.js'));
assert(worker.includes("'followup-orchestrator.js'") && worker.includes("'followup-actions.js'"));
assert(worker.includes("'followup-decision.js'") && worker.includes("'application-contract.js'"));
assert(!/["']v\d[^"']*\.js["']/i.test(worker));
assert(!orchestrator.includes('GET_FOLLOWUP_QUEUE_V2'));
assert(orchestrator.includes('GET_FOLLOWUP_QUEUE') && orchestrator.includes('CLEAR_FOLLOWUP_QUEUE'));
assert(!actions.includes('__offerTrackV26Wrapped'));
assert(!actions.includes('__offerTrackReviewGuardWrapped'), 'legacy runtime wrapper marker must stay removed');
assert(!orchestrator.includes('Core.matchScanned =') && !orchestrator.includes('Core.statusChanged ='), 'runtime monkey patch must stay removed');
assert(decision.includes('Matcher.matchScanned') && decision.includes('StateMachine.decide'), 'explicit decision service must own matcher/state coordination');

assert(semantic.includes('__offerTrackSemanticSnapshot'), 'read-only semantic regression hook must remain testable');
assert(!background.includes('function normalizeCompanyComparable'));
assert(applicationData.includes('StatusState?.normalize'), 'ApplicationData must delegate status normalization');
assert(!applicationData.includes('STATUS_VALUE_RE'), 'duplicate structured-status regex must stay removed');
assert(followupCore.includes('canonicalStatus') && followupCore.includes('FIELDS = Contract?.FEISHU_FIELDS'), 'follow-up core must consume centralized status/field contracts');

assert.strictEqual(Object.keys(Contract.FEISHU_FIELDS).length, 11, 'only 11 business Feishu fields may be maintained');
for (const field of ['下一步行动','面试时间','优先级','备注','最近错误','招聘系统','检查方式','最后检查时间','状态更新时间','检查状态','登录状态']) {
  assert(!Object.values(Contract.FEISHU_FIELDS).includes(field), `${field} must not be an active Feishu business field`);
  assert(!followup.includes(`'${field}'`), `${field} must not be written by automatic follow-up`);
}
assert(followup.includes('Strategy?.sameOrigin?.(url, pageUrl)'));

assert.strictEqual(Queue.STORAGE_KEY, 'followUpJobQueue');
assert.strictEqual(Queue.QUEUE_ALARM, 'offertrack-follow-up-queue');
assert.strictEqual(Review.STORAGE_KEY, 'followUpReview');

async function migrate() {
  const store = {
    followUpJobQueueV2: [{ host:'jobs.example.com', reason:'retry', retryCount:2, nextRunAt:1 }],
    followUpReviewV26: [{ id:'r1', recordId:'rec1', key:'rec1|LOW_CONFIDENCE', confidence:.9, reasonCode:'LOW_CONFIDENCE', createdAt:Date.now(), updatedAt:Date.now() }]
  };
  const cleared=[];
  global.chrome={storage:{local:{async get(keys){const o={};for(const k of keys)if(k in store)o[k]=store[k];return o;},async set(o){Object.assign(store,o);},async remove(keys){for(const k of keys)delete store[k];}}},alarms:{async clear(n){cleared.push(n);return true;},async create(){}}};
  delete require.cache[require.resolve('../followup-queue.js')];
  delete require.cache[require.resolve('../followup-review.js')];
  const Q=require('../followup-queue.js');
  const R=require('../followup-review.js');
  const jobs=await Q.read();
  assert.strictEqual(jobs.length,1); assert.strictEqual(jobs[0].retryCount,2);
  assert(!('followUpJobQueueV2' in store)); assert(Array.isArray(store.followUpJobQueue));
  assert(cleared.includes('offertrack-follow-up-queue-v2'));
  const reviews=await R.read(); assert.strictEqual(reviews.length,1);
  assert(!('followUpReviewV26' in store)); assert(Array.isArray(store.followUpReview));
}

migrate().then(()=>console.log('runtime hygiene and storage migration: PASS')).catch(e=>{console.error(e);process.exit(1);});
