from pathlib import Path

OLD_FIELDS="['公司','岗位名称','工作地点','投递时间','当前状态','招聘平台','岗位链接','最近更新时间','下一步行动','面试时间','优先级','备注','唯一记录ID','原始状态','自动跟进','最后检查时间','状态更新时间','检查状态','登录状态','最近错误','招聘系统','检查方式']"
NEW_FIELDS="['公司','岗位名称','工作地点','投递时间','当前状态','招聘平台','岗位链接','最近更新时间','唯一记录ID','原始状态','自动跟进','最后检查时间','状态更新时间','检查状态','登录状态']"

# Runtime test follows responsibility-based module naming.
src=Path('tests/v26-lite-runtime.test.js')
dst=Path('tests/followup-actions.test.js')
if src.exists():
    src.rename(dst)
s=dst.read_text()
s=s.replace("const lite = read('v26-lite.js');", "const lite = read('followup-actions.js');")
s=s.replace("assert.strictEqual(manifest.version, '2.6.1');", "assert.strictEqual(manifest.version, '2.6.2');")
s=s.replace("worker.includes(\"'v26-lite.js'\")", "worker.includes(\"'followup-actions.js'\")")
s=s.replace("worker.indexOf(\"'v26-lite.js'\")", "worker.indexOf(\"'followup-actions.js'\")")
s=s.replace('v2.6 lite runtime must be loaded', 'follow-up actions runtime must be loaded')
s=s.replace('lite runtime must wrap completed follow-up runtime', 'actions runtime must load after follow-up runtime')
s=s.replace("console.log('v2.6.1 lightweight runtime regression: PASS');", "console.log('follow-up actions regression: PASS');")
dst.write_text(s)

# All mocked Feishu schemas use only fields the extension actively maintains.
for p in Path('tests').glob('*.test.js'):
    s=p.read_text()
    s=s.replace(OLD_FIELDS, NEW_FIELDS)
    p.write_text(s)

replacements={
    'tests/api-execution-flow.test.js':[
        ("assert.strictEqual(patched.fields['检查方式'],'API GET');", "assert.ok(!Object.prototype.hasOwnProperty.call(patched.fields,'检查方式'),'diagnostic strategy must stay out of Feishu');")
    ],
    'tests/structured-execution-flow.test.js':[
        ("assert.strictEqual(patched.fields['检查方式'],'Structured State');", "assert.ok(!Object.prototype.hasOwnProperty.call(patched.fields,'检查方式'),'diagnostic strategy must stay out of Feishu');")
    ],
    'tests/strategy-fallback.test.js':[
        ("assert.strictEqual(patch.fields['检查方式'],'Page Scan');", "assert.ok(!Object.prototype.hasOwnProperty.call(patch.fields,'检查方式'),'diagnostic strategy must stay out of Feishu');")
    ],
    'tests/background-followup-flow.test.js':[
        ("assert.strictEqual(jd.fields['招聘系统'],'Self-hosted SPA');", "assert.ok(!Object.prototype.hasOwnProperty.call(jd.fields,'招聘系统'),'provider diagnostics must stay out of Feishu');"),
        ("assert.strictEqual(intsig.fields['招聘系统'],'Beisen / Zhiye');", "assert.ok(!Object.prototype.hasOwnProperty.call(intsig.fields,'招聘系统'),'provider diagnostics must stay out of Feishu');")
    ],
    'tests/background-tab-mode.test.js':[
        ("assert.strictEqual(patched.fields['招聘系统'],'Feishu Jobs');", "assert.ok(!Object.prototype.hasOwnProperty.call(patched.fields,'招聘系统'),'provider diagnostics must stay out of Feishu');assert(r.providers.some(x=>x.id==='feishu_jobs'),'provider detection must remain observable internally');")
    ]
}
for name, reps in replacements.items():
    p=Path(name)
    s=p.read_text()
    for old,new in reps:
        if old not in s:
            raise SystemExit(f'expected old test contract missing: {name}: {old}')
        s=s.replace(old,new)
    p.write_text(s)

Path('tests/runtime-hygiene.test.js').write_text(r'''const fs = require('fs');
const assert = require('assert');
const read = name => fs.readFileSync(name, 'utf8');
const worker = read('service-worker.js');
const background = read('background.js');
const followup = read('followup-background.js');
const actions = read('followup-actions.js');
const orchestrator = read('followup-orchestrator.js');
const semantic = read('semantic.js');
const Queue = require('../followup-queue.js');
const Review = require('../followup-review.js');
assert(!fs.existsSync('v25-orchestrator.js'));
assert(!fs.existsSync('v26-lite.js'));
assert(worker.includes("'followup-orchestrator.js'") && worker.includes("'followup-actions.js'"));
assert(!/['\"]v\d[^'\"]*\.js['\"]/i.test(worker));
assert(!orchestrator.includes('GET_FOLLOWUP_QUEUE_V2'));
assert(orchestrator.includes('GET_FOLLOWUP_QUEUE') && orchestrator.includes('CLEAR_FOLLOWUP_QUEUE'));
assert(!actions.includes('__offerTrackV26Wrapped'));
assert(actions.includes('__offerTrackReviewGuardWrapped'));
assert(!semantic.includes('__offerTrackSemanticSnapshot'));
assert(!background.includes('function normalizeCompanyComparable'));
for (const field of ['下一步行动','面试时间','优先级','备注']) assert(!background.includes(`name: '${field}'`));
for (const field of ['最近错误','招聘系统','检查方式']) assert(!followup.includes(`'${field}'`));
assert(followup.includes("const FOLLOWUP_FIELDS = ['自动跟进','最后检查时间','状态更新时间','检查状态','登录状态'];"));
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
''')

# No old assertion may require diagnostic columns to be written back to Feishu.
for p in Path('tests').glob('*.test.js'):
    if p.name == 'runtime-hygiene.test.js':
        continue
    s=p.read_text()
    for needle in ["fields['检查方式']", "fields['招聘系统']", "fields['最近错误']"]:
        if needle in s:
            raise SystemExit(f'stale diagnostic-field contract remains in {p}: {needle}')
print('test contracts aligned with lean Feishu schema')
