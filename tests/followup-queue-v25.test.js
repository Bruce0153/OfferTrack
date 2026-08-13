const assert = require('assert');
const Queue = require('../followup-queue.js');

(async () => {
  assert(Queue.priorityFor('manual') > Queue.priorityFor('cookie_change'));
  assert(Queue.priorityFor('cookie_change') > Queue.priorityFor('alarm'));
  assert.strictEqual(Queue.backoffMs(1), 5 * 60 * 1000);
  assert.strictEqual(Queue.backoffMs(2), 10 * 60 * 1000);
  assert(Queue.backoffMs(10) <= 6 * 3600 * 1000);

  {
    const a = Queue.normalizeJob({ host:'jobs.example.test', applications:['r1'], reason:'alarm', nextRunAt:1000 });
    const b = Queue.normalizeJob({ host:'jobs.example.test', applications:['r2'], reason:'manual', nextRunAt:500 });
    const merged = Queue.mergeJobs(a,b);
    assert.deepStrictEqual(new Set(merged.applications), new Set(['r1','r2']));
    assert.strictEqual(merged.reason, 'manual');
    assert.strictEqual(merged.nextRunAt, 500);
  }

  assert.strictEqual(Queue.shouldRetry({ status:'error' }, { failed:1 }), true);
  assert.strictEqual(Queue.shouldRetry({ status:'login' }, { failed:1 }), false, 'login failures must not auto-retry');
  assert.strictEqual(Queue.shouldRetry({ status:'challenge' }, { failed:1 }), false);
  assert.strictEqual(Queue.shouldRetry({ status:'rate_limited' }, { failed:1 }), false);

  {
    const groups = [
      {host:'b.example.test'}, {host:'a.example.test'}, {host:'c.example.test'}
    ];
    await Queue.withActiveJob({ host:'a.example.test', reason:'manual' }, async () => {
      const selected = Queue.selectGroups(groups, {followUpMaxSitesPerRun:12}, 'manual');
      assert.deepStrictEqual(selected.map(x => x.host), ['a.example.test'], 'active host scope must isolate one background site job');
    });
    const restored = Queue.selectGroups(groups, {followUpMaxSitesPerRun:12}, 'manual');
    assert.strictEqual(restored.length, 3, 'active host scope must be released after callback');
  }

  console.log('followup-queue active-scope tests: PASS');
})().catch(err => { console.error(err); process.exit(1); });
