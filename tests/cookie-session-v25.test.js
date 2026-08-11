const assert = require('assert');
const CookieSession = require('../cookie-session.js');

const evidence = CookieSession.summarize([
  { name:'session_id', value:'SECRET-A', httpOnly:true, secure:true },
  { name:'candidate_auth', value:'SECRET-B', httpOnly:true, secure:true, expirationDate:Date.now()/1000+3600 }
]);
assert.strictEqual(evidence.strength, 'strong');
assert.strictEqual(evidence.cookieCount, 2);
assert.strictEqual(evidence.sessionLikeCount, 2);
assert.strictEqual(JSON.stringify(evidence).includes('SECRET-A'), false);
assert.strictEqual(JSON.stringify(evidence).includes('SECRET-B'), false);
assert.strictEqual('value' in evidence, false);

console.log('cookie-session-v25.test.js PASS');
