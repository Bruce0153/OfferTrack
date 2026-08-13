const assert = require('assert');
const data = require('../application-data.js');
const State = require('../status-state-machine.js');

const cases = [
  {
    target: '【27届校招】基座模型/多模态模型算法工程师',
    payload: { data:{ applications:[{ positionName:'【27届校招】基座模型/多模态模型算法工程师', applicationStatus:'待测评', cityName:'广州', applyTime:'2026-08-10 10:20:00', applicationId:'a1' }] } },
    status: '笔试/测评'
  },
  {
    target: '具身智能算法应用工程师',
    payload: { applications:[{ job:{ title:'具身智能算法应用工程师' }, process:{ statusName:'面试中' }, location:{ name:'深圳' }, appliedAt:'2026-08-01' }] },
    status: '面试中'
  },
  {
    target: '27届校招-大模型算法工程师(J14380)',
    payload: { data:{ rows:[{ position:{ name:'27届校招-大模型算法工程师(J14380)' }, processStatus:'评估中', workCity:'上海', createTime:'2026-07-16' }] } },
    status: '筛选中'
  }
];
for (const c of cases) {
  const out = data.extractRecords([c.payload],[{position:c.target}],{});
  assert(out.length >= 1, `should extract ${c.target}`);
  assert.strictEqual(out[0].position,c.target);
  assert.strictEqual(out[0].status,c.status);
}

for (const raw of ['已投递','待筛选','评估中','待测评','AI面试','offer已发放','流程结束','撤回成功','未知状态']) {
  assert.strictEqual(data.normalizeStatus(raw), State.normalize(raw), `structured status normalization must follow State Machine: ${raw}`);
}

const noise = data.extractRecords([{ card:{ title:'跟进应聘进度，查询暂存投递记录', status:'处理中' } }],[{position:'27届校招-大模型算法工程师(J14380)'}],{});
assert.strictEqual(noise.length,0,'instruction text must not become a job');

console.log('OfferTrack structured application data extraction: PASS');
