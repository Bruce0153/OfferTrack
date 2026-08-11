from pathlib import Path
import json


def replace_once(path, old, new, label):
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    if old not in s:
        raise SystemExit(f'{label}: pattern not found in {path}')
    p.write_text(s.replace(old, new, 1), encoding='utf-8')

# 1) background message ownership: unknown messages must be left to other modules.
replace_once('background.js',
"chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {\n  (async () => {\n    try {\n      switch (msg?.type) {\n",
"const BACKGROUND_MESSAGE_TYPES = new Set([\n  'SYNC_RECORDS', 'RESOLVE_FEISHU_URL', 'TEST_FEISHU', 'INIT_FIELDS',\n  'OPEN_OPTIONS', 'GET_STATE', 'GET_CONTENT_CONFIG', 'PAGE_SCAN_RESULT'\n]);\n\nchrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {\n  if (!BACKGROUND_MESSAGE_TYPES.has(msg?.type)) return false;\n  (async () => {\n    try {\n      switch (msg?.type) {\n",
'background listener gate')
replace_once('background.js',
"        default:\n          sendResponse({ ok: false, error: 'unknown_message' });\n      }\n",
"      }\n",
'background unknown response')

# 2) Popup bridge recovery after extension reload / stale page contexts.
replace_once('popup.js',
"async function activeTab() {\n  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });\n  return tab;\n}\n\n",
"async function activeTab() {\n  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });\n  return tab;\n}\n\nfunction isMissingReceiverError(err) {\n  return /Receiving end does not exist|Could not establish connection|message port closed/i.test(err?.message || String(err || ''));\n}\n\nasync function ensurePageBridge(tabId) {\n  if (!chrome.scripting?.executeScript) throw new Error('当前浏览器无法恢复页面解析器，请刷新招聘页面后重试');\n  await chrome.scripting.executeScript({\n    target: { tabId },\n    files: ['semantic.js', 'content.js', 'strategy-probe.js', 'followup-probe.js'],\n    world: 'ISOLATED'\n  });\n  if (chrome.scripting?.insertCSS) {\n    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] }).catch(() => {});\n  }\n}\n\nasync function sendPageMessage(tabId, message) {\n  try {\n    return await chrome.tabs.sendMessage(tabId, message);\n  } catch (e) {\n    if (!isMissingReceiverError(e)) throw e;\n    await ensurePageBridge(tabId);\n    await new Promise(resolve => setTimeout(resolve, 120));\n    return chrome.tabs.sendMessage(tabId, message);\n  }\n}\n\n",
'popup page bridge')
replace_once('popup.js',
"    const res = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' });",
"    const res = await sendPageMessage(tab.id, { type: 'SCAN_PAGE' });",
'popup scan recovery')

# 3) Follow-up bridge recovery.
p = Path('followup-background.js')
s = p.read_text(encoding='utf-8')
s = s.replace("const earlyProbe = await chrome.tabs.sendMessage(tab.id, { type: 'PROBE_PAGE' }).catch(() => null);", "const earlyProbe = await sendTabMessage(tab.id, { type: 'PROBE_PAGE' }).catch(() => null);", 1)
s = s.replace("const probe = await chrome.tabs.sendMessage(tab.id, { type: 'PROBE_PAGE' }).catch(() => null);", "const probe = await sendTabMessage(tab.id, { type: 'PROBE_PAGE' }).catch(() => null);", 1)
s = s.replace("last = await chrome.tabs.sendMessage(tabId, { type: 'SCAN_PAGE' });", "last = await sendTabMessage(tabId, { type: 'SCAN_PAGE' });", 1)
needle = "  async function collectStrategyProbe(tabId) {\n"
helper = """  function isMissingReceiverError(err) {
    return /Receiving end does not exist|Could not establish connection|message port closed/i.test(err?.message || String(err || ''));
  }

  async function injectPageBridge(tabId) {
    if (!chrome.scripting?.executeScript) throw new Error('当前浏览器无法恢复页面解析器');
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['semantic.js', 'content.js', 'strategy-probe.js', 'followup-probe.js'],
      world: 'ISOLATED'
    });
    if (chrome.scripting?.insertCSS) {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] }).catch(() => {});
    }
  }

  async function sendTabMessage(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
      if (!isMissingReceiverError(e)) throw e;
      await injectPageBridge(tabId);
      await sleep(120);
      return chrome.tabs.sendMessage(tabId, message);
    }
  }

  async function collectStrategyProbe(tabId) {
"""
if needle not in s:
    raise SystemExit('follow-up helper insertion point missing')
s = s.replace(needle, helper, 1)
p.write_text(s, encoding='utf-8')

# 4) Generic page routing + company evidence improvements in content.js.
p = Path('content.js')
s = p.read_text(encoding='utf-8')
s = s.replace(
"  const APP_URL_RE = /(mydeliver|mydelivery|myapply|my-apply|application|applications|applyrecord|delivery|deliveries|candidate.*(?:apply|deliver)|process|progress|applicationcenter|jobapply)/i;\n",
"  const APP_URL_RE = /(mydeliver|mydelivery|myapply|my-apply|application|applications|applyrecord|delivery|deliveries|candidate.*(?:apply|deliver)|process|progress|applicationcenter|jobapply)/i;\n  const APP_ROUTE_RE = /\\/(?:account|personal|candidate|user|profile)\\/(?:apply|application|applications|delivery|deliveries|record|records)(?:[/?#]|$)/i;\n", 1)
s = s.replace(
"  const GENERIC_COMPANY_RE = /^(logo|icon|brand|home|记录|投递记录|网申投递|官网投递|申请记录|我的投递|我的申请|候选人中心|个人中心|校园招聘|社会招聘|应届招聘|实习招聘|招聘|职位|岗位|职位列表|岗位列表|首页|菜单|更多|详情|求职|应届|应届生|校招|社招|实习|校园|社会|春招|秋招|career|careers|jobs?)$/i;\n",
"  const GENERIC_COMPANY_RE = /^(logo|icon|brand|home|记录|投递记录|网申投递|官网投递|申请记录|我的投递|我的申请|候选人中心|个人中心|校园招聘|社会招聘|应届招聘|实习招聘|招聘|职位|岗位|职位列表|岗位列表|首页|菜单|更多|详情|求职|应届|应届生|校招|社招|实习|校园|社会|春招|秋招|career|careers|jobs?)$/i;\n  const COMPANY_NOISE_RE = /^(?:相关公司|关联公司|推荐公司|相似公司|其他公司|更多公司|热门公司|合作公司|所属公司|招聘公司|目标公司|公司信息|公司介绍|企业信息|企业介绍|雇主信息|关于我们|合作伙伴|推荐企业|关联企业|相关企业)[：:]?$/i;\n  const COMPANY_CONTEXT_BAD_RE = /(related|recommend|similar|other|partner|supplier|customer|competitor|affiliate|suggest|history|hot|search|list|关联|相关|推荐|相似|其他|合作|供应商|客户|竞品|搜索|列表)/i;\n  const COMPANY_KEY_RE = /^(?:company(?:name|shortname|fullname|displayname)?|company_name|company_short_name|company_full_name|corp(?:name|shortname|fullname)?|corp_name|enterprise(?:name|shortname|fullname)?|employer(?:name|shortname|fullname)?|organization(?:name|shortname|fullname)?|organisation(?:name|shortname|fullname)?|orgname|org_name|brandname|brand_name|tenantname|tenant_name|sitename|site_name|publisher)$/i;\n", 1)
s = s.replace("    return APP_PAGE_RE.test(routeText) || APP_URL_RE.test(routeText);", "    return APP_PAGE_RE.test(routeText) || APP_URL_RE.test(routeText) || APP_ROUTE_RE.test(location.pathname + location.search + location.hash);", 1)
s = s.replace("    const titleUrlSignal = APP_PAGE_RE.test(routeText) || APP_URL_RE.test(routeText);", "    const titleUrlSignal = APP_PAGE_RE.test(routeText) || APP_URL_RE.test(routeText) || APP_ROUTE_RE.test(location.pathname + location.search + location.hash);", 1)
s = s.replace("      'structured-site': 6, 'meta': 5.5, 'title-part': 4, 'title': 3", "      'structured-site': 6, 'declared': 7.5, 'runtime-json': 7, 'meta': 5.5, 'title-part': 4, 'title': 3", 1)
s = s.replace("        if (!value || GENERIC_COMPANY_RE.test(value)) continue;", "        if (!value || GENERIC_COMPANY_RE.test(value) || COMPANY_NOISE_RE.test(value)) continue;", 1)
s = s.replace("      if (!p || GENERIC_COMPANY_RE.test(p)) continue;", "      if (!p || GENERIC_COMPANY_RE.test(p) || COMPANY_NOISE_RE.test(p)) continue;", 1)
s = s.replace("    if (!v || GENERIC_COMPANY_RE.test(v)) return -20;", "    if (!v || GENERIC_COMPANY_RE.test(v) || COMPANY_NOISE_RE.test(v)) return -100;", 1)
s = s.replace("    if (GENERIC_COMPANY_RE.test(s) || COHORT_RE.test(s)) return '';", "    if (GENERIC_COMPANY_RE.test(s) || COMPANY_NOISE_RE.test(s) || COHORT_RE.test(s)) return '';", 1)
# clear stale OfferTrack UI when a dead page context is recovered
listener = "  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {\n"
if listener not in s:
    raise SystemExit('content listener insertion point missing')
s = s.replace(listener, "  document.getElementById('offertrack-badge')?.remove();\n\n" + listener, 1)
# declared DOM company fields
meta = "    push(document.querySelector('meta[name=\"apple-mobile-web-app-title\"]')?.content, 'meta');\n\n    const title = cleanText(document.title);\n"
if meta not in s:
    raise SystemExit('content meta insertion point missing')
s = s.replace(meta,
"    push(document.querySelector('meta[name=\"apple-mobile-web-app-title\"]')?.content, 'meta');\n\n    const companyAttrs = ['data-company-name','data-company','data-corp-name','data-enterprise-name','data-employer-name','data-organization-name','data-org-name','data-brand-name','data-tenant-name','data-site-name'];\n    for (const el of [...document.querySelectorAll(companyAttrs.map(x => `[${x}]`).join(','))].slice(0, 120)) {\n      for (const attr of companyAttrs) {\n        const value = el.getAttribute?.(attr);\n        if (value) push(value, 'declared');\n      }\n    }\n\n    const title = cleanText(document.title);\n", 1)
# bounded structured/runtime JSON company extraction
start = s.index('  function extractStructuredCompanyCandidates() {')
end = s.index('\n  function companyVariants(text) {', start)
new_extract = r'''  function extractStructuredCompanyCandidates() {
    const out = [];
    const seen = new Set();
    let nodes = 0;
    const add = (v, source, bonus = 0, context = '') => {
      const t = cleanText(v || '');
      if (!t || COMPANY_NOISE_RE.test(t) || COMPANY_CONTEXT_BAD_RE.test(context || '')) return;
      const key = `${source}|${t}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ value: t, source, bonus });
    };
    const visit = (value, depth = 0, path = [], visited = new WeakSet()) => {
      if (!value || depth > 7 || nodes++ > 2400 || typeof value !== 'object') return;
      if (visited.has(value)) return;
      visited.add(value);
      if (Array.isArray(value)) {
        for (const x of value.slice(0, 60)) visit(x, depth + 1, path, visited);
        return;
      }
      const pathText = path.join('.');
      const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']].filter(Boolean);
      const typeText = types.join(' ').toLowerCase();
      if (/(organization|corporation|localbusiness)/.test(typeText)) {
        add(value.name, 'structured-org', 1.5, `${pathText}.name`);
        add(value.alternateName, 'structured-org', 0.8, `${pathText}.alternateName`);
      }
      if (/website/.test(typeText)) {
        add(value.name, 'structured-site', 0.5, `${pathText}.name`);
        add(value.alternateName, 'structured-site', 0.3, `${pathText}.alternateName`);
      }
      if (/jobposting/.test(typeText)) {
        const org = value.hiringOrganization;
        if (typeof org === 'string') add(org, 'structured-org', 2, `${pathText}.hiringOrganization`);
        else if (org && typeof org === 'object') {
          add(org.name, 'structured-org', 2, `${pathText}.hiringOrganization.name`);
          add(org.alternateName, 'structured-org', 1, `${pathText}.hiringOrganization.alternateName`);
        }
      }
      for (const [k, v] of Object.entries(value).slice(0, 180)) {
        if (k === '@context') continue;
        const nextPath = [...path, k];
        const nextPathText = nextPath.join('.');
        if ((typeof v === 'string' || typeof v === 'number') && COMPANY_KEY_RE.test(k)) {
          add(String(v), 'runtime-json', 1.2, nextPathText);
        } else if (v && typeof v === 'object' && !COMPANY_CONTEXT_BAD_RE.test(nextPathText)) {
          visit(v, depth + 1, nextPath, visited);
        }
      }
    };
    let budget = 0;
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"],script[type="application/json"],script#__NEXT_DATA__,script#__NUXT_DATA__')].slice(0, 24);
    for (const script of scripts) {
      const raw = script.textContent || '';
      if (!raw || raw.length > 600_000) continue;
      budget += raw.length;
      if (budget > 900_000) break;
      try { visit(JSON.parse(raw), 0, [script.id || script.type || 'json']); } catch {}
    }
    return out.slice(0, 120);
  }
'''
s = s[:start] + new_extract + s[end:]
p.write_text(s, encoding='utf-8')

# 5) Semantic company fusion: no company-specific rule, bilingual text becomes candidates only.
p = Path('semantic.js')
s = p.read_text(encoding='utf-8')
old_bilingual = """    const bilingual = s.match(/^(?:[A-Za-z][A-Za-z0-9.&+\\-]{1,24}\\s+)([\\u4e00-\\u9fff]{2,8})$/);\n    if (bilingual) s = bilingual[1];\n    return s.slice(0, 80);\n  }\n\n"""
new_bilingual = """    return s.slice(0, 80);\n  }\n\n  function companyCandidateVariants(value) {\n    const base = normalizeCompany(value);\n    if (!base) return [];\n    const out = [{ value: base, penalty: 0 }];\n    const bilingual = base.match(/^([A-Za-z][A-Za-z0-9.&+\\-]{1,28})\\s+([\\u4e00-\\u9fff]{2,10})$/);\n    if (bilingual) {\n      out.push({ value: bilingual[2], penalty: -1.5 });\n      out.push({ value: bilingual[1], penalty: -2.5 });\n    }\n    const seen = new Set();\n    return out.filter(x => x.value && !seen.has(x.value.toLowerCase()) && seen.add(x.value.toLowerCase()));\n  }\n\n"""
if old_bilingual not in s:
    raise SystemExit('semantic bilingual block missing')
s = s.replace(old_bilingual, new_bilingual, 1)
old_add = """    const addCompany = (value, source, context = '') => {\n      const cleaned = normalizeCompany(value);\n      if (!cleaned) return;\n      const sig = cleaned.toLowerCase();\n      if (companySeen.has(sig) || COMPANY_CONTEXT_BAD_RE.test(context || '')) return;\n      companySeen.add(sig);\n      companies.push({ value: cleaned, source, context, score: companyScore(cleaned, source, context) });\n    };\n"""
new_add = """    const addCompany = (value, source, context = '') => {\n      if (COMPANY_CONTEXT_BAD_RE.test(context || '')) return;\n      for (const variant of companyCandidateVariants(value)) {\n        const cleaned = variant.value;\n        const sig = cleaned.toLowerCase();\n        if (companySeen.has(sig)) continue;\n        companySeen.add(sig);\n        companies.push({ value: cleaned, source, context, score: companyScore(cleaned, source, context) + Number(variant.penalty || 0) });\n      }\n    };\n"""
if old_add not in s:
    raise SystemExit('semantic addCompany block missing')
s = s.replace(old_add, new_add, 1)
old_sort = """    collectDeclaredDom(addCompany, addPosition);\n    collectVisibleBrand(addCompany);\n    collectVisiblePositions(addPosition);\n\n    companies.sort((a, b) => b.score - a.score || a.value.length - b.value.length);\n"""
new_sort = """    collectDeclaredDom(addCompany, addPosition);\n    collectVisibleBrand(addCompany);\n    collectVisiblePositions(addPosition);\n\n    for (const c of companies) {\n      if (!/(header|brand|meta)/.test(c.source || '')) continue;\n      for (const other of companies) {\n        if (c === other || !/(structured|runtime|declared|meta)/.test(other.source || '')) continue;\n        const affinity = companyAffinity(c.value, other.value);\n        if (affinity >= 2) c.score += Math.min(4, affinity * 1.1);\n      }\n    }\n\n    companies.sort((a, b) => b.score - a.score || a.value.length - b.value.length);\n"""
if old_sort not in s:
    raise SystemExit('semantic sort block missing')
s = s.replace(old_sort, new_sort, 1)
p.write_text(s, encoding='utf-8')

# 6) Version and docs.
p = Path('manifest.json')
m = json.loads(p.read_text(encoding='utf-8'))
m['version'] = '2.3.1'
m['version_name'] = '2.3.1'
m['description'] = '自动识别并同步招聘投递记录；支持会话健康管理、三级自动跟进、页面桥自动恢复与多源公司名语义校验。'
p.write_text(json.dumps(m, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

ch = Path('CHANGELOG.md')
old = ch.read_text(encoding='utf-8')
prefix = """# Changelog\n\n## v2.3.1\n\n- 修复扩展更新/重新加载后旧招聘页面无法建立消息连接的问题。\n- 修复 Session Manager 消息被基础后台路由抢占的问题。\n- 公司名解析增加通用栏目噪声硬过滤，并增强底层 JSON/声明字段/Meta/Header 多源证据融合。\n- 双语品牌仅生成候选变体，需要其他证据共识后才提高优先级。\n- 增加常见候选人中心申请记录路由识别。\n- 保留 v2.2.1 性能保护，不新增高频页面扫描。\n\n"""
if old.startswith('# Changelog\n'):
    old = old[len('# Changelog\n'):].lstrip('\n')
ch.write_text(prefix + old, encoding='utf-8')

# 7) Generic tests only: synthetic brand, no company/site-specific regression.
tests = Path('tests')
tests.mkdir(exist_ok=True)
(tests / 'generic-company-quality.test.js').write_text(r'''const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const code = fs.readFileSync(path.join(__dirname, '..', 'semantic.js'), 'utf8');
const scripts = [{ textContent: JSON.stringify({ candidate: { companyName: '星辰智造科技有限公司', positionName: '大模型算法工程师' }, relatedCompanies: [{ companyName: '旁观者科技有限公司' }] }), id: '__DATA__', type: 'application/json' }];
const document = { title: '我的申请 - 招聘平台', scripts, body: { innerText: '' }, querySelector(sel) { if (sel === 'meta[property="og:site_name"]') return { content: '星辰智造招聘' }; return null; }, querySelectorAll(sel) { if (sel.includes('script[type="application/ld+json"]') || sel.includes('script[type="application/json"]')) return scripts; return []; } };
const context = { console, URL, Date, JSON, Math, Set, Map, WeakSet, Array, Object, String, Number, RegExp, document, location: { href: 'https://jobs.example.test/account/apply/', hostname: 'jobs.example.test', pathname: '/account/apply/', search: '', hash: '' }, innerWidth: 1280, chrome: { runtime: { onMessage: { addListener() {} } } }, getComputedStyle() { return { display: 'block', visibility: 'visible', opacity: '1', fontSize: '16px' }; }, Element: function Element() {} };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(code, context);
const out = context.__offerTrackEnhanceRecords([{ company: '相关公司', position: '大模型算法工程师', status: '已投递', rawStatus: '投递成功', platform: 'example.test', url: context.location.href, applyTime: '2026-08-11' }]);
assert.equal(out.length, 1);
assert.equal(out[0].company, '星辰智造科技有限公司');
const snap = context.__offerTrackSemanticSnapshot();
assert(!snap.companies.some(x => /旁观者/.test(x.value)));
console.log('generic company quality PASS');
''', encoding='utf-8')
(tests / 'message-routing-recovery.test.js').write_text(r'''const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const bg = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
const follow = fs.readFileSync(path.join(root, 'followup-background.js'), 'utf8');
const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
assert(bg.includes('BACKGROUND_MESSAGE_TYPES'));
assert(!bg.includes("error: 'unknown_message'"));
assert(popup.includes('ensurePageBridge') && popup.includes('sendPageMessage'));
assert(follow.includes('injectPageBridge') && follow.includes('sendTabMessage'));
assert(content.includes('COMPANY_NOISE_RE') && content.includes('COMPANY_KEY_RE') && content.includes('APP_ROUTE_RE'));
assert(!/Lenovo|联想|京东|快手|小鹏|影石|GALBOT|合合信息/.test(fs.readFileSync(__filename, 'utf8')));
console.log('message routing and recovery PASS');
''', encoding='utf-8')

print('v2.3.1 generic updater applied')
