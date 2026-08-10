const assert = require('assert');
const registry = require('../provider-registry.js');
const core = require('../followup-core.js');

const samples = [
  ['https://xiaopeng.jobs.feishu.cn/398875/position/application', 'feishu_jobs'],
  ['https://arashivision.jobs.feishu.cn/campus/position/application?share_token=x', 'feishu_jobs'],
  ['https://agirobot.jobs.feishu.cn/campusrecruitment/position/application?share_token=x', 'feishu_jobs'],
  ['https://app.mokahr.com/campus-recruitment/acme/123#/candidateHome/applications', 'moka'],
  ['https://intsig.zhiye.com/personal/deliveryRecord', 'beisen_zhiye'],
  ['https://smics.zhiye.com/personal/deliveryRecord', 'beisen_zhiye'],
  ['https://campus.jd.com/api/wx/position/index#/myDeliver', 'self_hosted_spa'],
  ['https://campus.kuaishou.cn/#/campus/my-apply', 'self_hosted_spa'],
  ['https://talent.lenovo.com.cn/account/apply', 'self_hosted_spa'],
  ['https://jobs.example.com/candidate/applications', 'self_hosted_spa'],
  ['https://jobs.example.org/jobs/123', 'generic_web']
];
for (const [url, expected] of samples) {
  const got = registry.detect(url);
  assert.strictEqual(got.id, expected, `${url} expected ${expected}, got ${got.id}`);
}

const feishuGroup = {
  host: 'example.jobs.feishu.cn',
  records: [
    { url: 'https://example.jobs.feishu.cn/123/position/detail/888' },
    { url: 'https://example.jobs.feishu.cn/123/position/application?share_token=x' }
  ],
  url: 'https://example.jobs.feishu.cn/123/position/detail/888'
};
const enriched = registry.enrichGroup(feishuGroup, core);
assert.strictEqual(enriched.providerId, 'feishu_jobs');
assert(/position\/application/.test(enriched.url), 'Feishu Jobs should prefer application page');
assert.deepStrictEqual(enriched.strategies, ['structured_state', 'page_scan']);

const groups = registry.enrichGroups([
  feishuGroup,
  { host: 'app.mokahr.com', records: [{url:'https://app.mokahr.com/x#/candidateHome/applications'}], url:'https://app.mokahr.com/x#/candidateHome/applications' },
  { host: 'acme.zhiye.com', records: [{url:'https://acme.zhiye.com/personal/deliveryRecord'}], url:'https://acme.zhiye.com/personal/deliveryRecord' }
], core);
const summary = registry.summarize(groups);
assert.strictEqual(summary.length, 3);
assert(summary.every(x => x.sites === 1));
assert.strictEqual(summary.reduce((n, x) => n + x.records, 0), 4);

const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'provider-registry.js'), 'utf8');
for (const forbidden of ['京东','快手','小鹏','影石','合合信息','GALBOT']) {
  assert(!source.includes(forbidden), `Provider registry should not hard-code company name: ${forbidden}`);
}

console.log('OfferTrack provider registry tests: PASS');
console.log(samples.map(([url]) => ({ host: new URL(url).hostname, provider: registry.detect(url).name })));
