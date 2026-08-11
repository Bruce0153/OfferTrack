const assert = require('assert');
const store = {};
global.chrome = {
  storage: { local: {
    async get(keys) { const out={}; for (const k of keys) out[k]=store[k]; return out; },
    async set(obj) { Object.assign(store,obj); }
  }},
  runtime: { onMessage: { addListener(){} } }
};
const S = require('../session-manager.js');

(async () => {
  assert.equal(S.deriveState({status:'ok'}), 'healthy');
  assert.equal(S.deriveState({status:'login'}), 'login_required');
  assert.equal(S.deriveState({status:'challenge'}), 'challenge');
  assert.equal(S.deriveState({status:'rate_limited'}), 'rate_limited');
  assert(S.cooldownFor('login_required') >= 12*3600*1000);

  const group={host:'jobs.example.com',providerId:'feishu_jobs',providerName:'Feishu Jobs',url:'https://jobs.example.com/campus/application'};
  let ev=await S.record(group,{status:'login',error:'需要登录',page:{url:'https://jobs.example.com/login?token=secret'}},'alarm');
  assert(ev.issue && ev.transition);
  let state=await S.state();
  assert.equal(state.summary.loginRequired,1);
  assert.equal(state.entries[0].lastUrl,'https://jobs.example.com/login');
  assert(!JSON.stringify(state).includes('secret'));

  let d=await S.shouldSkip(group,{source:'alarm',hasOpenTab:false});
  assert(d.skip);
  d=await S.shouldSkip(group,{source:'manual',hasOpenTab:false});
  assert(!d.skip);
  d=await S.shouldSkip(group,{source:'alarm',hasOpenTab:true});
  assert(!d.skip);

  ev=await S.record(group,{status:'ok',strategy:'page_scan',page:{url:'https://jobs.example.com/campus/application'}},'manual');
  assert(ev.recovered && ev.transition);
  state=await S.state();
  assert.equal(state.summary.healthy,1);
  assert.equal(state.entries[0].consecutiveFailures,0);
  assert.equal(state.entries[0].cooldownUntil,0);

  const bad={host:'bad.example.com',providerId:'generic',providerName:'Generic Web',url:'https://bad.example.com/applications'};
  let e1=await S.record(bad,{status:'error',error:'network'},'alarm');
  let e2=await S.record(bad,{status:'error',error:'network'},'alarm');
  let e3=await S.record(bad,{status:'error',error:'network'},'alarm');
  assert(!e1.issue && !e2.issue && e3.issue);
  const paused=await S.shouldSkip(bad,{source:'alarm',hasOpenTab:false});
  assert(paused.skip);

  console.log('Session Manager state/cooldown/recovery: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
