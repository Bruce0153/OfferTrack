const assert = require('assert');
const Matcher = require('../application-matcher.js');

{
  const [m] = Matcher.matchScanned(
    [{ recordId:'r1', applicationId:'app-42', position:'算法工程师', url:'https://jobs.example.test/applications' }],
    [{ applicationId:'app-42', position:'完全不同岗位', status:'面试中', url:'https://jobs.example.test/applications' }]
  );
  assert(m.scanned, 'exact application id should match');
  assert(m.matchConfidence >= 0.99);
  assert.strictEqual(m.matchMethod, 'application_id');
}

{
  const [m] = Matcher.matchScanned(
    [{ recordId:'r1', applicationId:'A', position:'算法工程师' }],
    [{ applicationId:'B', position:'算法工程师', applyTime:'2026-08-01' }]
  );
  assert.strictEqual(m.scanned, null, 'conflicting application ids must not auto-match');
}

{
  const [m] = Matcher.matchScanned(
    [{ recordId:'r1', company:'Example Robotics', position:'大模型算法工程师', applyTime:'2026-08-01', url:'https://jobs.example.test/applications' }],
    [{ company:'Example Robotics', position:'大模型算法工程师', applyTime:'2026-08-01 10:30', status:'筛选中', url:'https://jobs.example.test/applications' }]
  );
  assert(m.scanned, 'exact position + date should be confident enough');
  assert(m.matchConfidence >= Matcher.AUTO_UPDATE_MIN_CONFIDENCE);
}

{
  const [m] = Matcher.matchScanned(
    [{ recordId:'r1', position:'机器学习工程师', applyTime:'2026-08-01' }],
    [
      { position:'机器学习工程师', applyTime:'2026-08-01', status:'筛选中' },
      { position:'机器学习工程师', applyTime:'2026-08-01', status:'面试中' }
    ]
  );
  assert.strictEqual(m.scanned, null, 'ambiguous equal candidates must not auto-match');
  assert.strictEqual(m.ambiguous, true);
}

{
  const [m] = Matcher.matchScanned(
    [{ recordId:'r1', position:'算法工程师', applyTime:'2026-08-01' }],
    [{ position:'财务专员', applyTime:'2026-07-01', status:'筛选中' }]
  );
  assert.strictEqual(m.scanned, null, 'weak semantic evidence must not update');
}

console.log('application-matcher-v25.test.js PASS');
