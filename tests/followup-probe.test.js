const assert=require('assert'), fs=require('fs'), vm=require('vm'), path=require('path');
const code=fs.readFileSync(path.join(__dirname,'..','followup-probe.js'),'utf8');
function probe(body,url='https://jobs.example.com/applications'){
  let listener=null;
  const sandbox={
    document:{body:{innerText:body},title:'Test'},
    location:{href:url},
    chrome:{runtime:{onMessage:{addListener(fn){listener=fn;}}}}
  };
  vm.runInNewContext(code,sandbox);
  let out=null; listener({type:'PROBE_PAGE'},null,r=>out=r); return out;
}
let r=probe('手机号登录 验证码登录');
assert(r.loginRequired && !r.challenge && !r.rateLimited);
r=probe('请拖动滑块完成安全验证');
assert(r.challenge && !r.loginRequired);
r=probe('访问过于频繁，请稍后再试');
assert(r.rateLimited && !r.loginRequired);
r=probe('我的投递 大模型算法工程师 面试中');
assert(!r.loginRequired && !r.challenge && !r.rateLimited);
console.log('Session probe login/challenge/rate-limit classification: PASS');
