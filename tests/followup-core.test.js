const assert = require('assert');
const core = require('../followup-core.js');
const Matcher = require('../application-matcher.js');
const Decision = require('../followup-decision.js');

function feishu(record_id, fields) { return { record_id, fields }; }

(async () => {
  const rows = [
    feishu('r1', {
      '公司': '小鹏汽车', '岗位名称': '【27届校招】基座模型/多模态模型算法工程师', '当前状态': '筛选中',
      '招聘平台': 'xiaopeng.jobs.feishu.cn', '岗位链接': 'https://xiaopeng.jobs.feishu.cn/398875/position/application', '唯一记录ID': 'x1'
    }),
    feishu('r2', {
      '公司': '影石Insta360', '岗位名称': '大模型算法工程师-2027校招', '当前状态': '已投递',
      '招聘平台': 'arashivision.jobs.feishu.cn', '岗位链接': 'https://arashivision.jobs.feishu.cn/campus/position/application?share_token=abc', '唯一记录ID': 'a1'
    }),
    feishu('r3', {
      '公司': '京东', '岗位名称': '算法工程师-AI Infra', '当前状态': '筛选中',
      '招聘平台': 'campus.jd.com', '岗位链接': 'https://campus.jd.com/api/wx/position/index#/myDeliver', '唯一记录ID': 'j1'
    }),
    feishu('r4', {
      '公司': '合合信息', '岗位名称': '27届校招-大模型算法工程师(J14380)', '当前状态': '筛选中',
      '招聘平台': 'intsig.zhiye.com', '岗位链接': 'https://intsig.zhiye.com/personal/deliveryRecord', '唯一记录ID': 'i1'
    }),
    feishu('r5', {
      '公司': 'GALBOT', '岗位名称': '具身智能算法应用工程师', '当前状态': '已投递',
      '招聘平台': 'app.mokahr.com', '岗位链接': 'https://app.mokahr.com/campus-recruitment/yinhetongyong/165930#/candidateHome/applications', '唯一记录ID': 'm1'
    }),
    feishu('r6', {
      '公司': '快手', '岗位名称': '算法研究员', '当前状态': '已结束',
      '招聘平台': 'campus.kuaishou.cn', '岗位链接': 'https://campus.kuaishou.cn/#/campus/my-apply', '唯一记录ID': 'k1'
    }),
    feishu('r7', {
      '公司': '测试', '岗位名称': '算法工程师', '当前状态': '已投递', '自动跟进': '关闭',
      '招聘平台': 'jobs.example.com', '岗位链接': 'https://jobs.example.com/application', '唯一记录ID': 'e1'
    })
  ];

  const targets = core.selectTargets(rows, { followUpIncludeTerminal: false });
  assert.strictEqual(targets.length, 5, '应跳过终态和显式关闭自动跟进的记录');
  const groups = core.groupTargets(targets);
  assert.strictEqual(groups.length, 5, '不同招聘系统应形成独立检查组');

  const jd = targets.find(x => x.company === '京东');
  assert(jd && /myDeliver/i.test(core.chooseCheckUrl([jd])), '京东 SPA 投递页应被优先作为检查 URL');

  const intsig = targets.find(x => x.company === '合合信息');
  const intsigMatch = await Decision.matchScanned([intsig], [{
    company: 'INTSIG 合合信息', position: '27届校招-大模型算法工程师(J14380)', status: '笔试/测评', rawStatus: '初筛进行中',
    platform: 'intsig.zhiye.com', url: 'https://intsig.zhiye.com/personal/deliveryRecord'
  }]);
  assert(intsigMatch[0].scanned, '北森/智业页面相同岗位代码应高置信匹配');
  const intsigDecision = Decision.statusDecision(intsig, intsigMatch[0].scanned);
  assert(intsigDecision.changed && intsigDecision.allowed, '状态变化应由显式 Decision service 检测并通过状态机');

  const jdMatch = Matcher.matchScanned([jd], [{
    company: '京东', position: '算法工程师-AI Infra', status: '笔试/测评', rawStatus: '待测评',
    platform: 'campus.jd.com', url: 'https://campus.jd.com/api/wx/position/index#/myDeliver'
  }]);
  assert(jdMatch[0].scanned && jdMatch[0].matchConfidence >= Matcher.AUTO_UPDATE_MIN_CONFIDENCE, '岗位+平台+URL 应达到自动匹配阈值');

  assert.strictEqual(core.FIELDS.status, '当前状态');
  assert.strictEqual(core.FIELDS.url, '岗位链接');
  assert.strictEqual(core.canonicalStatus('待面试'), '面试中');
  assert.strictEqual(Decision.statusDecision({status:'面试中'}, {status:'待面试'}, {confidence:1}).changed, false, '等价状态不得产生假变化');
  assert.strictEqual(Decision.statusDecision({status:'筛选中'}, {status:'面试安排'}, {confidence:1}).allowed, true, '规范化后的前向状态变化仍应允许');
  assert.strictEqual(Decision.statusDecision({status:'筛选中'}, {status:'未知状态'}, {confidence:1}).allowed, false, '未知状态不得触发更新');

  assert(core.urlScore('https://app.mokahr.com/x#/candidateHome/applications') > core.urlScore('https://example.com/zpdetail/123'), '候选人申请页应优先于岗位详情页');
  assert.strictEqual(core.isTerminalStatus('Offer'), true);
  assert.strictEqual(core.isTerminalStatus('已结束'), true);
  assert.strictEqual(core.isTerminalStatus('筛选中'), false);

  console.log('OfferTrack follow-up core + explicit decision tests: PASS');
})().catch(err => { console.error(err); process.exit(1); });
