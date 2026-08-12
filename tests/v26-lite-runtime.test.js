const fs = require('fs');
const assert = require('assert');

const read = name => fs.readFileSync(name, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const worker = read('service-worker.js');
const followup = read('followup-background.js');
const lite = read('v26-lite.js');
const options = read('options.html');
const popup = read('popup.html');
const State = require('../status-state-machine.js');
const Review = require('../followup-review.js');

assert.strictEqual(manifest.version, '2.6.0');
assert.ok(!(manifest.content_scripts || []).some(x => (x.matches || []).includes('https://*/*')), 'must not inject on every HTTPS page');
assert.ok(worker.includes("'v26-lite.js'"), 'v2.6 lite runtime must be loaded');
assert.ok(worker.indexOf("'followup-background.js'") < worker.indexOf("'v26-lite.js'"), 'lite runtime must wrap completed follow-up runtime');

assert.ok(followup.includes('let runningPromise = null'), 'single-flight guard missing');
assert.ok(followup.includes('if (runningPromise) return runningPromise'), 'parallel follow-up runs must reuse one promise');
assert.ok(followup.includes('CookieSession.inspectGroup'), 'Cookie session evidence missing');
assert.ok(followup.includes("files: ['company-identity.js', 'semantic.js', 'content.js'"), 'background bridge must restore Company Identity');
assert.ok(followup.includes("chrome.tabs.create({ url: group.url, active: false })"), 'automatic page must be inactive');
assert.ok(followup.includes('chrome.tabs.remove(tab.id)'), 'temporary background tab must close');
assert.ok(!followup.includes('chrome.tabs.query({})'), 'unscoped tab query forbidden');

for (const type of ['GET_FOLLOWUP_SUMMARY','GET_FOLLOWUP_ACTIONS','OPEN_FOLLOWUP_ACTION','RESOLVE_FOLLOWUP_REVIEW']) {
  assert.ok(lite.includes(type), `${type} handler missing`);
}
assert.ok(lite.includes('active: true'), 'explicit user login action should be able to open a visible page');
assert.ok(lite.includes('userConfirmed: true'), 'review confirmation must still go through state machine');

assert.ok(options.includes('Cookie 会话证据 → 安全 GET API → Structured State → Page Scan'));
assert.ok(!/id="followUp(?:CookiePreflight|ApiFirst|StructuredState)"/.test(options), 'low-level switches must stay hidden');
assert.ok(popup.includes('followUpActions'), 'popup actionable entry missing');
assert.ok(Review.MAX_ENTRIES <= 30 && Review.TTL_MS <= 14 * 24 * 60 * 60 * 1000, 'review store too large');

assert.strictEqual(State.decide('面试中', '已投递', { matchConfidence: 1 }).allowed, false, 'rollback must stay blocked');
assert.strictEqual(State.decide('面试中', '已结束', { matchConfidence: 1, rawStatus: '流程结束' }).allowed, true);
assert.strictEqual(State.decide('面试中', '已结束', { matchConfidence: 1, rawStatus: '状态不明确', userConfirmed: true }).allowed, true, 'explicit user confirmation may approve terminal transition');

console.log('v2.6 lightweight runtime regression: PASS');
