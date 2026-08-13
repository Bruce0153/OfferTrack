const fs=require('fs');
const assert=require('assert');
const read=f=>fs.readFileSync(f,'utf8');
const manifest=JSON.parse(read('manifest.json'));
assert.deepStrictEqual(manifest.host_permissions,['https://open.feishu.cn/*']);
assert.deepStrictEqual(manifest.optional_host_permissions,['https://*/*']);
assert(manifest.permissions.includes('activeTab') && manifest.permissions.includes('cookies'));
const worker=read('service-worker.js');
for(const f of ['application-contract.js','credential-store.js','host-access.js','followup-decision.js']) assert(worker.includes(`'${f}'`));
const orchestrator=read('followup-orchestrator.js');
const actions=read('followup-actions.js');
assert(!/Core\.(?:matchScanned|statusChanged)\s*=/.test(orchestrator+actions),'no runtime monkey patch');
assert(!/install(?:Core|Review)Guard/.test(orchestrator+actions));
const probe=read('strategy-probe.js');
assert(probe.includes('projectStructured'), 'script JSON must be safe-projected before messaging');
const follow=read('followup-background.js');
assert(follow.includes('projectionPolicy()'), 'MAIN world projector must consume centralized policy');
assert(follow.includes('nodes++ >= 650'), 'MAIN world node budget must be tightened');
assert(follow.includes('blocked_cross_origin_redirect'), 'GET redirects must remain same-origin');
assert(follow.includes('Contract?.projectStructured?.(parsed'), 'API JSON must be projected before extraction');
assert(follow.includes("status: 'permission_required'"), 'background follow-up must require per-origin permission');
for(const field of ['最后检查时间','状态更新时间','检查状态','登录状态','最近错误','招聘系统','检查方式','下一步行动','面试时间','优先级','备注']) {
  assert(![read('background.js'),follow,actions].join('\n').includes(`'${field}'`), `${field} must not be maintained by production sync`);
}
const options=read('options.js');
assert(!/appSecret\s*:/.test(options.match(/function collect\(\)[\s\S]*?\n}\n/)?.[0]||''),'settings collect must not persist App Secret');
assert(read('credential-store.js').includes("const SESSION_KEY = 'feishuCredential'"));
assert(!/setInterval\s*\(/.test([...fs.readdirSync('.').filter(x=>x.endsWith('.js'))].map(read).join('\n')));
console.log('final privacy / permissions / architecture hardening: PASS');
