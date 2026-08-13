const assert=require('assert');
const store={};
global.chrome={storage:{local:{
  async get(keys){const o={};for(const k of keys)if(k in store)o[k]=store[k];return o;},
  async set(o){Object.assign(store,o);},
  async remove(keys){for(const k of keys)delete store[k];}
}}};
const Decision=require('../followup-decision.js');
const Review=require('../followup-review.js');
(async()=>{
  await Review.clear();
  const target={recordId:'r1',company:'测试科技',position:'大模型算法工程师',status:'筛选中',platform:'jobs.example.com',url:'https://jobs.example.com/applications'};
  const ambiguous=await Decision.matchScanned([target],[
    {company:'测试科技',position:'大模型算法工程师',status:'面试中',url:'https://jobs.example.com/a'},
    {company:'测试科技',position:'大模型算法工程师',status:'面试中',url:'https://jobs.example.com/b'}
  ]);
  assert.strictEqual(ambiguous[0].scanned,null);
  assert.strictEqual(ambiguous[0].ambiguous,true);
  assert((await Review.read()).some(x=>x.reasonCode==='AMBIGUOUS_MATCH'));

  await Review.clear();
  const scanned={position:'大模型算法工程师',status:'已结束',rawStatus:'流程中',url:'https://jobs.example.com/applications',_offerTrackMatch:{confidence:.95,method:'position_date'}};
  const d=await Decision.evaluateStatus(target,scanned);
  assert.strictEqual(d.allowed,false,'weak terminal evidence must remain blocked');
  assert((await Review.read()).some(x=>x.reasonCode==='TERMINAL_REVIEW'));

  const confirmed=Decision.statusDecision(target,{status:'已结束',rawStatus:'流程中'},{confidence:1,userConfirmed:true});
  assert.strictEqual(confirmed.allowed,true,'explicit human review may resolve terminal evidence');
  console.log('explicit follow-up decision service: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
