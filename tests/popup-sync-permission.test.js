const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const elements = new Map();
function el(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      id,
      disabled: false,
      hidden: false,
      textContent: '',
      style: {},
      onclick: null,
      replaceChildren() {},
      appendChild() {}
    });
  }
  return elements.get(id);
}

let permissionRequests = 0;
let syncRequests = 0;
const context = {
  console,
  URL,
  setTimeout,
  clearTimeout,
  globalThis: null,
  document: {
    addEventListener() {},
    getElementById: el,
    createElement: () => ({ className:'', textContent:'', append(){}, appendChild(){} })
  },
  chrome: {
    runtime: {
      openOptionsPage() {},
      async sendMessage(msg) {
        if (msg?.type === 'SYNC_RECORDS') {
          syncRequests += 1;
          assert.strictEqual(msg.page?.url, 'https://jobs.example.com/applications');
          assert(!Object.prototype.hasOwnProperty.call(msg.page, 'persistentHostAccess'));
          return { ok: true, created: 1, updated: 0, skipped: 0, message: '同步完成' };
        }
        return { ok: true };
      }
    },
    tabs: { async query(){ return []; } },
    storage: { local: { async set(){} } }
  },
  OfferTrackHostAccess: {
    async request(url) {
      permissionRequests += 1;
      assert.strictEqual(url, 'https://jobs.example.com/applications');
      return false;
    }
  }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8'), context);

(async () => {
  vm.runInContext("currentRecords = [{company:'测试公司', position:'算法工程师'}]; currentPage = {url:'https://jobs.example.com/applications'};", context);
  await vm.runInContext('sync()', context);

  assert.strictEqual(permissionRequests, 1);
  assert.strictEqual(syncRequests, 1);
  assert.strictEqual(el('created').textContent, 1);
  assert.strictEqual(el('lastSync').textContent, '刚刚同步');
  assert.match(el('message').textContent, /同步完成/);
  assert.match(el('message').textContent, /未授予该招聘网站的长期访问权限/);
  assert(!/persistentHostAccess is not defined/.test(el('message').textContent));
  console.log('popup sync permission runtime regression: PASS');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
