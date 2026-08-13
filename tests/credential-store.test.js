const assert = require('assert');
function area() {
  const map = {};
  return {
    map,
    async get(keys) { const out={}; for (const k of keys) if (k in map) out[k]=map[k]; return out; },
    async set(obj) { Object.assign(map,obj); },
    async remove(keys) { for (const k of keys) delete map[k]; },
    async setAccessLevel() {}
  };
}
const local=area(), session=area();
global.chrome={storage:{local,session}};
const C=require('../credential-store.js');
(async()=>{
  await C.setSecret('secret-1',{remember:false});
  assert.strictEqual(await C.getSecret(),'secret-1');
  assert.strictEqual(local.map.feishuCredential,undefined,'default must not persist locally');
  assert(session.map.feishuCredential?.secret==='secret-1');
  await C.setRemember(true);
  assert.strictEqual(local.map.feishuCredential.secret,'secret-1');
  await C.setRemember(false);
  assert.strictEqual(local.map.feishuCredential,undefined);
  await C.migrateLegacySecret('legacy-secret');
  assert.strictEqual(local.map.feishuCredential,undefined,'legacy migration is session-only');
  assert.strictEqual(await C.getSecret(),'legacy-secret');
  await C.clear();
  assert.strictEqual((await C.state()).hasSecret,false);
  console.log('credential store session-first policy: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
