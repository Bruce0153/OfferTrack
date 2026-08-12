// Real-site regressions: AGIBOT timeline must select the latest dated stage; profile/account UI must never become a company name.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const code = fs.readFileSync(path.join(__dirname, '..', 'semantic.js'), 'utf8');

function runScenario({ companyName, inputCompany, bodyText, status='已投递', rawStatus='投递简历', position='具身智能算法应用工程师' }) {
  const scripts = [{
    textContent: JSON.stringify({ candidate: { companyName, positionName: position } }),
    id: '__DATA__',
    type: 'application/json'
  }];
  const document = {
    title: `${companyName} - 人才招聘`,
    scripts,
    body: { innerText: bodyText || '' },
    querySelector() { return null; },
    querySelectorAll(sel) {
      if (sel.includes('script[type="application/ld+json"]') || sel.includes('script[type="application/json"]')) return scripts;
      return [];
    }
  };
  const context = {
    console, URL, Date, JSON, Math, Set, Map, WeakSet, Array, Object, String, Number, RegExp,
    document,
    location: { href: 'https://jobs.example.test/account/apply/', hostname: 'jobs.example.test', pathname: '/account/apply/', search: '', hash: '' },
    innerWidth: 1280,
    chrome: { runtime: { onMessage: { addListener() {} } } },
    getComputedStyle() { return { display: 'block', visibility: 'visible', opacity: '1', fontSize: '16px' }; },
    Element: function Element() {}
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  const out = context.__offerTrackEnhanceRecords([{
    company: inputCompany,
    position,
    status,
    rawStatus,
    platform: 'example.test',
    url: context.location.href,
    applyTime: '2026-07-16'
  }]);
  assert.equal(out.length, 1);
  return out[0];
}

const companyCase = runScenario({
  companyName: '银河通用机器人有限公司',
  inputCompany: '曾桦龙 个人资料',
  bodyText: ''
});
assert.equal(companyCase.company, '银河通用机器人有限公司');
assert(!/个人资料|曾桦龙/.test(companyCase.company));

const timelineCase = runScenario({
  companyName: '智元机器人',
  inputCompany: '智元机器人',
  bodyText: [
    '应聘记录',
    '优才-Agent算法工程师-灵犀业务部',
    '投递简历',
    '2026-07-16',
    '评估中',
    '2026-07-16',
    '面试中',
    '2026-08-11'
  ].join('\n')
});
assert.equal(timelineCase.status, '面试中');
assert.equal(timelineCase.rawStatus, '面试中');

const futureStageCase = runScenario({
  companyName: '示例科技有限公司',
  inputCompany: '示例科技有限公司',
  bodyText: ['投递简历', '2026-07-16', '评估中', '面试', 'Offer'].join('\n')
});
assert.equal(futureStageCase.status, '已投递');
assert.equal(futureStageCase.rawStatus, '投递简历');

const noRegressionCase = runScenario({
  companyName: '示例科技有限公司',
  inputCompany: '示例科技有限公司',
  status: '面试中',
  rawStatus: '面试中',
  bodyText: ['投递简历', '2026-07-16', '筛选中', '2026-07-17'].join('\n')
});
assert.equal(noRegressionCase.status, '面试中');

console.log('semantic v2.5 timeline/company regressions PASS');
