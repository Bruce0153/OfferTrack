const assert = require('assert');
const Contract = require('../application-contract.js');
const Data = require('../application-data.js');

assert.strictEqual(Object.keys(Contract.FEISHU_FIELDS).length, 11, 'only 11 maintained Feishu fields');
assert.strictEqual(Contract.fieldKind('applicationId', 'root.applications[0].applicationId'), 'id');
assert.strictEqual(Contract.fieldKind('id', 'root.applications[0].id'), 'id');
assert.strictEqual(Contract.fieldKind('id', 'root.user.id'), '', 'generic user id must not pass');
assert.strictEqual(Contract.fieldKind('status', 'root.applications[0].status'), 'status');
assert.strictEqual(Contract.fieldKind('userStatus', 'root.user.userStatus'), '', 'unscoped user status must not pass');
assert.strictEqual(Contract.fieldKind('companyName', 'root.companyName'), 'company');
assert.strictEqual(Contract.isSensitiveKey('access_token', 'root.access_token'), true);
assert.strictEqual(Contract.isSensitiveKey('candidateEmail', 'root.candidateEmail'), true);
assert.strictEqual(Contract.isSensitiveKey('resumeContent', 'root.resumeContent'), true);

const raw = {
  user: { id: 'u-1', email: 'candidate@example.com', profile: { phone: '13800000000' } },
  data: { applications: [{
    applicationId: 'a-1',
    positionName: '大模型算法工程师',
    applicationStatus: '待面试',
    companyName: '测试科技有限公司',
    workCity: '深圳',
    appliedAt: '2026-08-10',
    accessToken: 'do-not-copy',
    resumeContent: 'private resume'
  }] }
};
const projected = Contract.projectStructured(raw, { maxNodes: 200, maxDepth: 6 });
const serialized = JSON.stringify(projected);
assert(serialized.includes('大模型算法工程师'));
assert(serialized.includes('a-1'));
assert(!serialized.includes('candidate@example.com'));
assert(!serialized.includes('13800000000'));
assert(!serialized.includes('do-not-copy'));
assert(!serialized.includes('private resume'));
assert(!serialized.includes('u-1'));

const records = Data.extractRecords([projected], [{ position: '大模型算法工程师' }]);
assert.strictEqual(records.length, 1);
assert.strictEqual(records[0].status, '面试中');
assert.strictEqual(records[0].sourceId, 'a-1');
console.log('application contract + safe structured projection: PASS');
