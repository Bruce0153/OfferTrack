const assert = require('assert');
const Journal = require('../change-journal.js');

const safe = Journal.sanitizeEntry({
  company:'Example Robotics', position:'算法工程师', oldStatus:'筛选中', newStatus:'面试中',
  provider:'Generic Web', checkMethod:'API GET', matchConfidence:1.5, matchMethod:'application_id', host:'jobs.example.test',
  cookie:'secret-cookie-value', token:'secret-token', responseBody:'do-not-store'
});
assert.strictEqual(safe.matchConfidence, 1);
assert.strictEqual('cookie' in safe, false);
assert.strictEqual('token' in safe, false);
assert.strictEqual('responseBody' in safe, false);
assert.strictEqual(Journal.isRealChange(safe), true);
assert.strictEqual(Journal.isRealChange({ ...safe, newStatus:safe.oldStatus }), false);

Journal.rememberMatch(
  { company:'Example Robotics', position:'算法工程师', platform:'Generic Web', url:'https://jobs.example.test/applications' },
  { _offerTrackMatch:{ confidence:.98, method:'application_id' } }
);
const entries = Journal.entriesFromResult({
  at: 123456,
  details:[{ host:'jobs.example.test', provider:'Generic Web', strategy:'api_get', changes:[{
    company:'Example Robotics', position:'算法工程师', from:'筛选中', to:'面试中'
  }] }]
});
assert.strictEqual(entries.length, 1);
assert.strictEqual(entries[0].matchConfidence, .98);
assert.strictEqual(entries[0].matchMethod, 'application_id');
assert.strictEqual(entries[0].checkMethod, 'api_get');

console.log('change-journal-v25.test.js PASS');
