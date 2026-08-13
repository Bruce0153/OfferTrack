const assert=require('assert');
const seen=[];
global.chrome={permissions:{
  async contains(q){seen.push(['contains',q]);return false;},
  async request(q){seen.push(['request',q]);return true;}
}};
const H=require('../host-access.js');
assert.strictEqual(H.originPattern('https://jobs.example.com/a/b'),'https://jobs.example.com/*');
assert.strictEqual(H.originPattern('jobs.example.com'),'https://jobs.example.com/*');
assert.strictEqual(H.originPattern('http://jobs.example.com'),'');
(async()=>{
  assert.strictEqual(await H.request('https://jobs.example.com/apply'),true);
  assert.deepStrictEqual(seen.at(-1)[1],{origins:['https://jobs.example.com/*']});
  console.log('host access exact-origin permission: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
