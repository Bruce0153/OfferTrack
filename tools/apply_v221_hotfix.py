from pathlib import Path
import json

ROOT = Path('.')

def read(name):
    return (ROOT / name).read_text(encoding='utf-8')

def write(name, text):
    (ROOT / name).write_text(text, encoding='utf-8')

def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'missing patch target: {label}')
    return text.replace(old, new, 1)

# Manifest: bump version and remove the obsolete UI controller.
m = json.loads(read('manifest.json'))
m['version'] = '2.2.1'
m['version_name'] = '2.2.1'
m['description'] = '自动识别并同步招聘投递记录；提供轻量页面解析、Provider Registry 与 API/Structured State/Page Scan 三级自动跟进。'
for cs in m.get('content_scripts', []):
    cs['js'] = [x for x in cs.get('js', []) if x != 'content-ui.js']
write('manifest.json', json.dumps(m, ensure_ascii=False, indent=2) + '\n')
Path('content-ui.js').unlink(missing_ok=True)

# content.js: stop the page/UI MutationObserver feedback loop and bound automatic rescans.
s = read('content.js')
s = replace_once(s,
"""  let lastAutoFingerprint = '';
  let lastAutoAt = 0;
  let autoBackoffUntil = 0;
""",
"""  let lastAutoFingerprint = '';
  let lastAutoAt = 0;
  let autoBackoffUntil = 0;
  let lastDetected = false;
  let lastAutoScanAt = 0;
  let scanPromise = null;
  let lastSemanticEnhanceAt = 0;
  let lastSemanticHref = '';
  let lastPageResultFingerprint = '';
  let runtimeConfigCache = null;
  let runtimeConfigAt = 0;
  const AUTO_SCAN_MIN_GAP = 4000;
""", 'content vars')

old = """  async function init() {
    const cfg = await getRuntimeConfig();
    if (cfg.enabled === false) return;
    setTimeout(() => scanPage(false), 850);
    setTimeout(() => scanPage(false), 1800);

    const obs = new MutationObserver(() => {
      clearTimeout(observerTimer);
      observerTimer = setTimeout(() => scanPage(false), 900);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

    routeTimer = setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        setTimeout(() => scanPage(false), 400);
        setTimeout(() => scanPage(false), 1300);
        setTimeout(() => scanPage(false), 2600);
      }
    }, 650);
  }

  async function getRuntimeConfig() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_CONTENT_CONFIG', host: location.hostname });
      return res?.ok ? res : { enabled: true, autoSyncAllowed: false, customSite: null, companyAlias: '' };
    } catch {
      return { enabled: true, autoSyncAllowed: false, customSite: null, companyAlias: '' };
    }
  }

  async function scanPage(userTriggered) {
    const cfg = await getRuntimeConfig();
    if (cfg.enabled === false) return { detected: false, records: [], rejectedCount: 0, page: pageMeta() };

    const bodyText = compactText(document.body?.innerText || '').slice(0, 50000);
    const routeText = `${document.title} ${decodeSafe(location.href)}`;
    const titleUrlSignal = APP_PAGE_RE.test(routeText) || APP_URL_RE.test(routeText);
    const textSignal = APP_PAGE_RE.test(bodyText.slice(0, 16000));
    const recordSignal = (FULL_DATE_RE.test(bodyText) || DIRECT_STATUS_RE.test(bodyText)) && POSITION_SIGNAL_RE.test(bodyText);

    if (!cfg.customSite && !titleUrlSignal && !textSignal && !recordSignal && !userTriggered) {
      return { detected: false, records: [], rejectedCount: 0, page: pageMeta() };
    }

    let parsed = cfg.customSite ? parseCustom(cfg.customSite, cfg.companyAlias) : parseGeneric(cfg.companyAlias);
    parsed = dedupe(parsed).slice(0, 500);
    const usable = parsed.filter(isUsableRecord);
    lastRejectedCount = Math.max(0, parsed.length - usable.length);
    lastRecords = usable;

    const detected = !!cfg.customSite || titleUrlSignal || textSignal || usable.length > 0 || (userTriggered && recordSignal);
    const payload = { detected, records: usable, rejectedCount: lastRejectedCount, page: pageMeta() };
    chrome.runtime.sendMessage({ type: 'PAGE_SCAN_RESULT', payload }).catch(() => {});

    if (detected) renderBadge(usable, lastRejectedCount);
    await maybeAutoSync(cfg, usable);
    return payload;
  }
"""
new = """  async function init() {
    const cfg = await getRuntimeConfig(true);
    if (cfg.enabled === false) return;

    setTimeout(() => scheduleAutoScan(0), 1000);
    setTimeout(() => { if (!lastDetected) scheduleAutoScan(0); }, 4200);

    const obs = new MutationObserver(mutations => {
      if (!lastDetected && !routeLooksRelevant()) return;
      if (!mutations.some(isExternalMutation)) return;
      scheduleAutoScan(1400);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    routeTimer = setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        lastDetected = routeLooksRelevant();
        runtimeConfigCache = null;
        try { globalThis.__offerTrackInvalidateSemanticCache?.(); } catch {}
        scheduleAutoScan(350);
        setTimeout(() => scheduleAutoScan(0), 2600);
      }
    }, 1500);
  }

  function routeLooksRelevant() {
    const routeText = `${document.title} ${decodeSafe(location.href)}`;
    return APP_PAGE_RE.test(routeText) || APP_URL_RE.test(routeText);
  }

  function isOfferTrackNode(node) {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return !!el && (el.id === 'offertrack-badge' || !!el.closest?.('#offertrack-badge'));
  }

  function isExternalMutation(mutation) {
    if (isOfferTrackNode(mutation.target)) return false;
    const target = mutation.target?.nodeType === 1 ? mutation.target : mutation.target?.parentElement;
    const recordSelector = 'article,li,tr,[role="listitem"],[role="row"],[class*="record"],[class*="apply"],[class*="delivery"],[class*="application"],[class*="process"],[class*="job"],[class*="position"]';
    if (target?.closest?.(recordSelector)) return true;
    const changed = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
    if (changed.length && changed.every(isOfferTrackNode)) return false;
    for (const node of changed.slice(0, 12)) {
      if (isOfferTrackNode(node)) continue;
      const el = node?.nodeType === 1 ? node : node?.parentElement;
      if (el?.matches?.(recordSelector) || el?.querySelector?.(recordSelector)) return true;
      const t = cleanText(node?.textContent || '').slice(0, 600);
      if (t && (APP_PAGE_RE.test(t) || DIRECT_STATUS_RE.test(t) || FULL_DATE_RE.test(t) || (POSITION_SIGNAL_RE.test(t) && t.length <= 180))) return true;
    }
    return false;
  }

  function scheduleAutoScan(delay = 1200) {
    clearTimeout(observerTimer);
    const since = Date.now() - lastAutoScanAt;
    const wait = Math.max(0, delay, AUTO_SCAN_MIN_GAP - since);
    observerTimer = setTimeout(async () => {
      lastAutoScanAt = Date.now();
      await scanPage(false).catch(() => {});
    }, wait);
  }

  async function getRuntimeConfig(force = false) {
    const now = Date.now();
    if (!force && runtimeConfigCache && now - runtimeConfigAt < 30000) return runtimeConfigCache;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_CONTENT_CONFIG', host: location.hostname });
      runtimeConfigCache = res?.ok ? res : { enabled: true, autoSyncAllowed: false, customSite: null, companyAlias: '' };
    } catch {
      runtimeConfigCache = { enabled: true, autoSyncAllowed: false, customSite: null, companyAlias: '' };
    }
    runtimeConfigAt = now;
    return runtimeConfigCache;
  }

  async function scanPage(userTriggered) {
    if (scanPromise) return scanPromise;
    scanPromise = doScanPage(userTriggered);
    try { return await scanPromise; }
    finally { scanPromise = null; }
  }

  async function doScanPage(userTriggered) {
    const cfg = await getRuntimeConfig();
    if (cfg.enabled === false) return { detected: false, records: [], rejectedCount: 0, page: pageMeta() };
    const routeText = `${document.title} ${decodeSafe(location.href)}`;
    const titleUrlSignal = APP_PAGE_RE.test(routeText) || APP_URL_RE.test(routeText);
    const bodyText = compactText(document.body?.innerText || '').slice(0, 30000);
    const textSignal = APP_PAGE_RE.test(bodyText.slice(0, 12000));
    const recordSignal = (FULL_DATE_RE.test(bodyText) || DIRECT_STATUS_RE.test(bodyText)) && POSITION_SIGNAL_RE.test(bodyText);
    if (!cfg.customSite && !titleUrlSignal && !textSignal && !recordSignal && !userTriggered) {
      lastDetected = false;
      return { detected: false, records: [], rejectedCount: 0, page: pageMeta() };
    }
    let parsed = cfg.customSite ? parseCustom(cfg.customSite, cfg.companyAlias) : parseGeneric(cfg.companyAlias);
    parsed = dedupe(parsed).slice(0, 300);
    let usable = parsed.filter(isUsableRecord);
    const baseDetected = !!cfg.customSite || titleUrlSignal || textSignal || usable.length > 0 || (userTriggered && recordSignal);
    const shouldEnhance = usable.length && typeof globalThis.__offerTrackEnhanceRecords === 'function' &&
      (userTriggered || lastSemanticHref !== location.href || Date.now() - lastSemanticEnhanceAt > 30000);
    if (shouldEnhance) {
      try {
        const enhanced = globalThis.__offerTrackEnhanceRecords(usable);
        if (Array.isArray(enhanced)) usable = enhanced.slice(0, 300);
        lastSemanticEnhanceAt = Date.now();
        lastSemanticHref = location.href;
      } catch {}
    }
    lastRejectedCount = Math.max(0, parsed.length - usable.length);
    lastRecords = usable;
    lastDetected = baseDetected;
    const payload = { detected: baseDetected, records: usable, rejectedCount: lastRejectedCount, page: pageMeta() };
    const resultFp = hash32(`${baseDetected}|${location.href}|${fingerprint(usable)}|${lastRejectedCount}`);
    if (userTriggered || resultFp !== lastPageResultFingerprint) {
      lastPageResultFingerprint = resultFp;
      chrome.runtime.sendMessage({ type: 'PAGE_SCAN_RESULT', payload }).catch(() => {});
    }
    if (baseDetected) renderBadge(usable, lastRejectedCount);
    await maybeAutoSync(cfg, usable);
    return payload;
  }
"""
s = replace_once(s, old, new, 'content init/scan')
s = replace_once(s,
"""    for (const el of document.querySelectorAll(structuralSelector)) {
      if (recordContainerScore(el) >= 5) pool.add(el);
    }
""",
"""    const structuralNodes = document.querySelectorAll(structuralSelector);
    for (let i = 0, n = Math.min(structuralNodes.length, 2200); i < n; i++) {
      const el = structuralNodes[i];
      if (recordContainerScore(el) >= 5) pool.add(el);
    }
""", 'structural cap')
s = replace_once(s,
"""    const all = [...document.querySelectorAll('body *')];
    const max = Math.min(all.length, 9000);
""",
"""    const all = document.querySelectorAll('body *');
    const max = Math.min(all.length, 4500);
""", 'anchor cap')
s = replace_once(s,
"""    const top = [...document.querySelectorAll('header *, nav *, [class*="header"] *')].slice(0, 700);
    for (const el of top) {
""",
"""    const top = document.querySelectorAll('header *, nav *, [class*="header"] *');
    for (let i = 0, n = Math.min(top.length, 350); i < n; i++) {
      const el = top[i];
""", 'header cap')
s = replace_once(s,
"""    const topLeft = [...document.querySelectorAll('body *')].slice(0, 1800);
    for (const el of topLeft) {
""",
"""    const topLeft = document.querySelectorAll('body *');
    for (let i = 0, n = Math.min(topLeft.length, 900); i < n; i++) {
      const el = topLeft[i];
""", 'brand cap')
s = replace_once(s,
"""    if (mainCount) mainCount.textContent = count;
    if (launchCount) {
      launchCount.textContent = records.length > 99 ? '99+' : count;
      launchCount.classList.toggle('ot-zero', records.length === 0);
    }
    const sub = badge.querySelector('.ot-sub');
    if (sub) {
      sub.textContent = records.length
        ? `已解析${rejectedCount ? ` · 忽略 ${rejectedCount} 条低置信项` : ''}`
        : '未识别到可用投递记录';
    }
""",
"""    if (mainCount && mainCount.textContent !== count) mainCount.textContent = count;
    if (launchCount) {
      const launchText = records.length > 99 ? '99+' : count;
      if (launchCount.textContent !== launchText) launchCount.textContent = launchText;
      launchCount.classList.toggle('ot-zero', records.length === 0);
    }
    const sub = badge.querySelector('.ot-sub');
    if (sub) {
      const subText = records.length
        ? `已解析${rejectedCount ? ` · 忽略 ${rejectedCount} 条低置信项` : ''}`
        : '未识别到可用投递记录';
      if (sub.textContent !== subText) sub.textContent = subText;
    }
""", 'badge idempotence')
s = replace_once(s,
"""  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
""",
"""  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  }
""", 'visibility order')
write('content.js', s)

# semantic.js: strictly on demand; smaller budgets; no sendMessage monkey patch or route polling.
s = read('semantic.js')
s = s.replace('const MAX_SCRIPT_CHARS = 3_000_000;', 'const MAX_SCRIPT_CHARS = 900_000;')
s = s.replace('if (!force && cache && cacheHref === location.href && now - cacheAt < 2500) return cache;', 'if (!force && cache && cacheHref === location.href && now - cacheAt < 30000) return cache;')
s = s.replace("    if (document.body?.innerText?.includes(s)) score += 2;\n", '')
s = s.replace("if (value == null || depth > 10 || typeof value !== 'object') return;", "if (value == null || depth > 8 || typeof value !== 'object') return;")
s = s.replace('Math.min(value.length, 100)', 'Math.min(value.length, 60)')
s = s.replace('Object.entries(value).slice(0, 500)', 'Object.entries(value).slice(0, 220)')
s = s.replace(".slice(0, 80)) {\n      const raw = script.textContent || '';\n      if (!raw || raw.length > 1_800_000) continue;", ".slice(0, 24)) {\n      const raw = script.textContent || '';\n      if (!raw || raw.length > 600_000) continue;")
s = s.replace("[...document.scripts].filter(s => !s.src).slice(0, 140)", "[...document.scripts].filter(s => !s.src).slice(0, 60)")
s = s.replace('raw.length > 2_000_000', 'raw.length > 600_000')
s = s.replace('hit++ < 100', 'hit++ < 40').replace('hit++ < 150', 'hit++ < 60')
s = s.replace("for (const el of [...document.querySelectorAll('body *')].slice(0, 2200)) {", "const brandNodes = document.querySelectorAll('body *');\n    for (let i = 0, n = Math.min(brandNodes.length, 900); i < n; i++) {\n      const el = brandNodes[i];")
s = s.replace("for (const el of [...document.querySelectorAll('body *')].slice(0, 8000)) {", "const positionNodes = document.querySelectorAll('body *');\n    for (let i = 0, n = Math.min(positionNodes.length, 2600); i < n; i++) {\n      const el = positionNodes[i];")
s = replace_once(s,
"""  function visible(el) {
    try {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    } catch { return false; }
  }
""",
"""  function visible(el) {
    try {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const st = getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) !== 0;
    } catch { return false; }
  }
""", 'semantic visibility')
start = s.find("  try {\n    const originalSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);")
end = s.find("  globalThis.__offerTrackEnhanceRecords = enhanceRecords;", start)
if start < 0 or end < 0:
    raise RuntimeError('missing semantic monkey patch block')
s = s[:start] + "  // v2.2.1: semantic extraction is strictly on-demand.\n" + s[end:]
s = s.replace("  globalThis.__offerTrackSemanticSnapshot = () => collectSemanticSnapshot(true);\n})();", "  globalThis.__offerTrackSemanticSnapshot = () => collectSemanticSnapshot(false);\n  globalThis.__offerTrackInvalidateSemanticCache = () => { cache = null; cacheAt = 0; cacheHref = ''; };\n})();")
write('semantic.js', s)

# strategy probe: smaller message payloads.
s = read('strategy-probe.js')
s = s.replace('let budget=1_200_000;', 'let budget=450_000;').replace('.slice(0,60);', '.slice(0,20);').replace('raw.length>300_000', 'raw.length>180_000').replace('out.slice(0,40)', 'out.slice(0,12)').replace('entries.slice(-1200)', 'entries.slice(-320)').replace('out.length>=80', 'out.length>=30')
write('strategy-probe.js', s)

# application data: avoid allocating a shallow snapshot for every object in a large store.
s = read('application-data.js')
s = s.replace("  const POSITION_KEY_RE = /(position|job|post|vacancy|role).*(name|title)|^(positionName|positionTitle|jobName|jobTitle|postName|postTitle|roleName|vacancyName)$/i;", "  const POSITION_KEY_RE = /(position|job|post|vacancy|role).*(name|title)|^(positionName|positionTitle|jobName|jobTitle|postName|postTitle|roleName|vacancyName)$/i;\n  const POSITION_CONTAINER_KEY_RE = /^(position|job|post|vacancy|role)$/i;")
s = s.replace('out.length >= 240', 'out.length >= 120').replace('Math.min(v.length,20)', 'Math.min(v.length,10)').replace('Object.entries(v).slice(0,120)', 'Object.entries(v).slice(0,60)')
marker = "  function recordFromObject(obj, path, targets) {\n"
helper = """  function objectLooksRelevant(obj, path='') {
    if (!obj || typeof obj !== 'object') return false;
    if (APPLICATION_PATH_RE.test(path)) return true;
    const keys = Object.keys(obj).slice(0, 80);
    let hasPosition = false, hasStatus = false;
    for (const key of keys) {
      if (!hasPosition && (POSITION_KEY_RE.test(key) || POSITION_CONTAINER_KEY_RE.test(key))) hasPosition = true;
      if (!hasStatus && STATUS_KEY_RE.test(key)) hasStatus = true;
      if (hasPosition && hasStatus) return true;
    }
    return false;
  }

"""
s = replace_once(s, marker, helper + marker, 'application relevance helper')
s = replace_once(s, """      const candidate = recordFromObject(v,path,targets);
      if (candidate) out.push(candidate);
""", """      if (objectLooksRelevant(v, path)) {
        const candidate = recordFromObject(v,path,targets);
        if (candidate) out.push(candidate);
      }
""", 'application candidate gate')
s = s.replace('Math.min(12000, Math.max(500, Number(options.maxNodes || 5000)))', 'Math.min(5000, Math.max(400, Number(options.maxNodes || 2500)))').replace('Math.min(12, Math.max(3, Number(options.maxDepth || 8)))', 'Math.min(10, Math.max(3, Number(options.maxDepth || 7)))').replace('Math.min(v.length,250)', 'Math.min(v.length,120)').replace('Object.entries(v).slice(0,180)', 'Object.entries(v).slice(0,100)')
write('application-data.js', s)

# follow-up executor: use DOM JSON first; only clone MAIN-world stores if necessary; reduce budgets.
s = read('followup-background.js')
old = """      if (cfg.followUpStructuredState && group.capabilities?.structuredState && group.strategies?.includes('structured_state')) {
        const snapshots = [];
        for (const x of strategyProbe?.jsonSnapshots || []) if (x?.data != null) snapshots.push(x.data);
        const mainSnapshots = await collectMainWorldSnapshot(tab.id);
        for (const x of mainSnapshots) if (x?.data != null) snapshots.push(x.data);
        if (snapshots.length && ApplicationData?.extractRecords) {
          const structured = ApplicationData.extractRecords(snapshots, group.records, { maxNodes: 6500, maxDepth: 9 });
          const records = enrichStrategyRecords(structured, group, finalUrl);
          const useful = Strategy?.isUseful ? Strategy.isUseful(group.records, records, Core, 0.8) : { ok: records.length > 0 };
          if (useful.ok) {
            return { host: group.host, provider: group.provider, status: 'ok', strategy: 'structured_state', records, page: { url: finalUrl, title: strategyProbe?.page?.title || '' }, evidence: { matched: useful.matched, total: useful.total } };
          }
        }
      }
"""
new = """      if (cfg.followUpStructuredState && group.capabilities?.structuredState && group.strategies?.includes('structured_state') && ApplicationData?.extractRecords) {
        const domSnapshots = (strategyProbe?.jsonSnapshots || []).map(x => x?.data).filter(x => x != null).slice(0, 12);
        let structuredRecords = [];
        if (domSnapshots.length) {
          structuredRecords = ApplicationData.extractRecords(domSnapshots, group.records, { maxNodes: 2800, maxDepth: 7 });
          const records = enrichStrategyRecords(structuredRecords, group, finalUrl);
          const useful = Strategy?.isUseful ? Strategy.isUseful(group.records, records, Core, 0.8) : { ok: records.length > 0 };
          if (useful.ok) return { host: group.host, provider: group.provider, status: 'ok', strategy: 'structured_state', records, page: { url: finalUrl, title: strategyProbe?.page?.title || '' }, evidence: { matched: useful.matched, total: useful.total, source: 'dom-json' } };
        }
        const mainSnapshots = await collectMainWorldSnapshot(tab.id);
        if (mainSnapshots.length) {
          const mainRecords = ApplicationData.extractRecords(mainSnapshots.map(x => x.data).filter(Boolean), group.records, { maxNodes: 2200, maxDepth: 6 });
          const records = enrichStrategyRecords([...structuredRecords, ...mainRecords], group, finalUrl);
          const useful = Strategy?.isUseful ? Strategy.isUseful(group.records, records, Core, 0.8) : { ok: records.length > 0 };
          if (useful.ok) return { host: group.host, provider: group.provider, status: 'ok', strategy: 'structured_state', records, page: { url: finalUrl, title: strategyProbe?.page?.title || '' }, evidence: { matched: useful.matched, total: useful.total, source: 'main-world' } };
        }
      }
"""
s = replace_once(s, old, new, 'structured strategy')
s = s.replace('nodes++ > 4500 || depth > 7', 'nodes++ > 1400 || depth > 5').replace("v.slice(0, 5000)", "v.slice(0, 1200)").replace('v.slice(0, 120).map', 'v.slice(0, 50).map').replace('Object.keys(v).slice(0, 140)', 'Object.keys(v).slice(0, 60)').replace('count++ > 120', 'count++ > 55').replace("{ maxNodes: 7000, maxDepth: 9 }", "{ maxNodes: 3000, maxDepth: 7 }").replace('length > 2_000_000', 'length > 1_000_000').replace('body.length > 2_500_000', 'body.length > 1_200_000')
s = s.replace("""      let records = Array.isArray(scan.records) ? scan.records : [];
      try {
        const enhanced = await chrome.tabs.sendMessage(tab.id, { type: 'ENHANCE_RECORDS', records });
        if (enhanced?.ok && Array.isArray(enhanced.records)) records = enhanced.records;
      } catch {}
""", """      const records = Array.isArray(scan.records) ? scan.records : [];
""")
write('followup-background.js', s)

# Popup scan already receives enhanced records from content.js.
s = read('popup.js')
s = s.replace("""    let records = res.records || [];
    try {
      const enhanced = await chrome.tabs.sendMessage(tab.id, { type: 'ENHANCE_RECORDS', records });
      if (enhanced?.ok && Array.isArray(enhanced.records)) records = enhanced.records;
    } catch {}
    currentRecords = records;
""", """    currentRecords = Array.isArray(res.records) ? res.records : [];
""")
write('popup.js', s)

# Performance guard regression test.
Path('tests/performance-safety.test.js').write_text(r'''const fs=require('fs'), path=require('path'), assert=require('assert');
const root=path.join(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const scripts=manifest.content_scripts.flatMap(x=>x.js||[]);
assert(!scripts.includes('content-ui.js'));
assert(!fs.existsSync(path.join(root,'content-ui.js')));
const content=fs.readFileSync(path.join(root,'content.js'),'utf8');
assert(!/characterData\s*:\s*true/.test(content));
assert(/AUTO_SCAN_MIN_GAP\s*=\s*4000/.test(content));
assert(/isOfferTrackNode/.test(content));
const semantic=fs.readFileSync(path.join(root,'semantic.js'),'utf8');
assert(!/chrome\.runtime\.sendMessage\s*=/.test(semantic));
assert(!/setInterval\s*\(/.test(semantic));
assert(/MAX_SCRIPT_CHARS\s*=\s*900_000/.test(semantic));
const probe=fs.readFileSync(path.join(root,'strategy-probe.js'),'utf8');
assert(/budget=450_000/.test(probe));
const bg=fs.readFileSync(path.join(root,'followup-background.js'),'utf8');
assert(/nodes\+\+ > 1400/.test(bg));
console.log('OfferTrack v2.2.1 performance safety guards: PASS');
''', encoding='utf-8')

# Docs.
s = read('README.md').replace('# OfferTrack v2.2.0', '# OfferTrack v2.2.1', 1)
if 'v2.2.1 是性能热修复版' not in s:
    s = s.replace('\nOfferTrack 是', '\n\n> v2.2.1 是性能热修复版。若安装 v2.2.0 后出现招聘页面卡死或 Edge 内存持续上涨，请立即升级并在 `edge://extensions/` 重新加载扩展。\n\nOfferTrack 是', 1)
write('README.md', s)

s = read('QUICK_START.txt').replace('OfferTrack v2.2.0', 'OfferTrack v2.2.1').replace('OfferTrack_Edge_v2.2.0.zip', 'OfferTrack_Edge_v2.2.1.zip').replace('OfferTrack_Edge_v2.2.0 文件夹', 'OfferTrack_Edge_v2.2.1 文件夹')
if '性能热修复提示' not in s:
    s = '性能热修复提示：如果 v2.2.0 打开招聘网站后 Edge 卡顿或内存持续上涨，请升级 v2.2.1 并重新加载扩展。\n\n' + s
write('QUICK_START.txt', s)

s = read('CHANGELOG.md')
if '## 2.2.1' not in s:
    s = s.replace('# Change Log\n\n', '# Change Log\n\n## 2.2.1\n\n- 移除 `content-ui.js` MutationObserver 自触发死循环。\n- 页面重扫忽略 OfferTrack 自身 DOM，取消 characterData 监听，并增加 4 秒最小扫描间隔。\n- Semantic Parser 改为按需执行，取消运行时消息 monkey-patch 和独立路由轮询。\n- 收紧 DOM、脚本、Structured State、MAIN-world Store 和 API JSON 扫描/复制预算。\n- Structured Extractor 增加相关对象门控，降低大型状态树临时对象分配。\n\n', 1)
write('CHANGELOG.md', s)

print('v2.2.1 hotfix applied')
