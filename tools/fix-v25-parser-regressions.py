from pathlib import Path

p = Path('semantic.js')
s = p.read_text(encoding='utf-8')

old = "  const STATUS_RE = /(已投递|投递成功|申请成功|筛选中|评估中|待测评|测评中|笔试中|待面试|面试中|已结束|未通过|不通过|淘汰|已录用|offer)/i;\n"
new = old + "  const ACCOUNT_UI_TEXT_RE = /(?:个人资料|个人信息|我的资料|个人主页|个人中心|用户中心|账号(?:设置|信息|管理)?|账户(?:设置|信息|管理)?|候选人中心|退出登录|退出账号|修改密码|安全中心)/i;\n  const ACCOUNT_UI_CONTEXT_RE = /(?:^|[\\s_-])(?:profile|account|avatar|user[-_]?info|user[-_]?menu|personal|member[-_]?center|candidate[-_]?menu)(?:$|[\\s_-])/i;\n  const PAGE_STATUS_EXACT_RE = /^(?:投递简历|简历投递|已投递|投递成功|已申请|申请成功|简历筛选|简历初筛|简历评估|待筛选|筛选中|评估中|待评估|测评|待测评|测评中|测评完成|笔试|待笔试|笔试中|笔试完成|面试|待面试|面试中|面试安排|一面|二面|三面|四面|HR面|终面|已发\\s*offer|offer已发放|已录用|录用|意向书|不合适|不通过|未通过|流程结束|已结束|已拒绝|淘汰|已撤回|撤回成功|已终止)$/i;\n  const PAGE_STATUS_DATE_RE = /(20\\d{2})[-\\/.年](1[0-2]|0?[1-9])[-\\/.月](3[01]|[12]\\d|0?[1-9])日?(?:[ T](\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?/;\n  const STATUS_RANK = Object.freeze({ '已投递': 1, '筛选中': 2, '笔试/测评': 3, '面试中': 4, 'Offer': 5 });\n"
if old not in s:
    raise SystemExit('STATUS_RE anchor missing')
s = s.replace(old, new, 1)

old = "    if (STATUS_RE.test(s) || POSITION_NOISE_RE.test(s)) return '';\n    if (/(投递|申请|应聘|岗位|职位|个人中心|候选人|详情|收藏|流程)/.test(s)) return '';\n"
new = "    if (STATUS_RE.test(s) || POSITION_NOISE_RE.test(s) || ACCOUNT_UI_TEXT_RE.test(s)) return '';\n    if (/(投递|申请|应聘|岗位|职位|个人中心|候选人|详情|收藏|流程)/.test(s)) return '';\n"
if old not in s:
    raise SystemExit('normalizeCompany anchor missing')
s = s.replace(old, new, 1)

old = """  function collectVisibleBrand(addCompany) {
    const selectors = ['header [class*=\"brand\"]','header [class*=\"logo\"]','nav [class*=\"brand\"]','nav [class*=\"logo\"]','[class*=\"header\"] [class*=\"brand\"]','[class*=\"header\"] [class*=\"logo\"]','header img[alt]','[class*=\"logo\"] img[alt]','img[class*=\"logo\"][alt]'];
    for (const selector of selectors) for (const el of [...document.querySelectorAll(selector)].slice(0, 120)) addCompany(el.innerText || el.alt || el.getAttribute?.('aria-label') || el.getAttribute?.('title'), 'header-brand', selector);
"""
new = """  function isAccountUiElement(el) {
    if (!el) return false;
    const ownText = cleanText(el.innerText || el.textContent || el.getAttribute?.('aria-label') || el.getAttribute?.('title') || '').slice(0, 160);
    if (ACCOUNT_UI_TEXT_RE.test(ownText)) return true;
    const parts = [];
    let cur = el;
    for (let i = 0; cur && i < 4; i++, cur = cur.parentElement) {
      parts.push(String(cur.className || ''));
      parts.push(cur.id || '');
      parts.push(cur.getAttribute?.('aria-label') || '');
      parts.push(cur.getAttribute?.('title') || '');
      parts.push(cur.getAttribute?.('data-testid') || '');
      parts.push(cur.getAttribute?.('href') || '');
    }
    const ctx = parts.join(' ').toLowerCase();
    if (ACCOUNT_UI_CONTEXT_RE.test(ctx)) return true;
    return /\\/(?:profile|account|personal|user\\/(?:profile|center)|candidate\\/(?:profile|center))(?:[/?#]|$)/i.test(ctx);
  }

  function collectVisibleBrand(addCompany) {
    const selectors = ['header [class*=\"brand\"]','header [class*=\"logo\"]','nav [class*=\"brand\"]','nav [class*=\"logo\"]','[class*=\"header\"] [class*=\"brand\"]','[class*=\"header\"] [class*=\"logo\"]','header img[alt]','[class*=\"logo\"] img[alt]','img[class*=\"logo\"][alt]'];
    for (const selector of selectors) {
      for (const el of [...document.querySelectorAll(selector)].slice(0, 120)) {
        if (isAccountUiElement(el)) continue;
        addCompany(el.innerText || el.alt || el.getAttribute?.('aria-label') || el.getAttribute?.('title'), 'header-brand', selector);
      }
    }
"""
if old not in s:
    raise SystemExit('collectVisibleBrand anchor missing')
s = s.replace(old, new, 1)

old = "      const el = brandNodes[i];\n      if (!visible(el)) continue;\n"
new = "      const el = brandNodes[i];\n      if (!visible(el) || isAccountUiElement(el)) continue;\n"
if old not in s:
    raise SystemExit('brandNodes anchor missing')
s = s.replace(old, new, 1)

anchor = "  function enhanceRecords(input) {\n"
helpers = r'''  function parsePageStatus(value) {
    let raw = cleanText(value || '');
    if (!raw || raw.length > 80) return null;
    raw = raw.replace(/^(?:当前状态|投递状态|申请状态|应聘状态|状态|进度)\s*[：:]?\s*/i, '').trim();
    const date = parseStatusDate(raw);
    if (date?.raw) raw = cleanText(raw.replace(date.raw, ''));
    if (!PAGE_STATUS_EXACT_RE.test(raw)) return null;
    const compact = raw.replace(/\s+/g, '');
    if (/撤回/.test(compact)) return { raw, status: '已撤回', terminal: true, rank: 90 };
    if (/不合适|不通过|未通过|流程结束|已结束|已拒绝|淘汰|已终止/.test(compact)) return { raw, status: '已结束', terminal: true, rank: 90 };
    if (/已发offer|offer已发放|已录用|录用|意向书/i.test(compact)) return { raw, status: 'Offer', terminal: false, rank: STATUS_RANK.Offer };
    if (/面试|一面|二面|三面|四面|hr面|终面|待面试/i.test(compact)) return { raw, status: '面试中', terminal: false, rank: STATUS_RANK['面试中'] };
    if (/笔试|测评/.test(compact)) return { raw, status: '笔试/测评', terminal: false, rank: STATUS_RANK['笔试/测评'] };
    if (/筛选|评估/.test(compact)) return { raw, status: '筛选中', terminal: false, rank: STATUS_RANK['筛选中'] };
    if (/投递|申请/.test(compact)) return { raw, status: '已投递', terminal: false, rank: STATUS_RANK['已投递'] };
    return null;
  }

  function parseStatusDate(value) {
    const m = cleanText(value || '').match(PAGE_STATUS_DATE_RE);
    if (!m) return null;
    const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
    const hour = Number(m[4] || 0), minute = Number(m[5] || 0), second = Number(m[6] || 0);
    const stamp = Date.UTC(year, month - 1, day, hour, minute, second);
    if (!Number.isFinite(stamp)) return null;
    return { raw: m[0], stamp };
  }

  function inferLatestStatusFromPage() {
    const body = String(document.body?.innerText || '').slice(0, 120000);
    if (!body) return null;
    const lines = body.replace(/\r/g, '').split(/\n+/).map(cleanText).filter(Boolean).slice(0, 4000);
    const pairs = [];
    for (let i = 0; i < lines.length; i++) {
      const status = parsePageStatus(lines[i]);
      if (!status) continue;
      let date = parseStatusDate(lines[i]);
      let dateIndex = i;
      if (!date) {
        for (let j = i + 1; j <= Math.min(lines.length - 1, i + 2); j++) {
          if (parsePageStatus(lines[j])) break;
          if (lines[j].length > 48) break;
          const d = parseStatusDate(lines[j]);
          if (d) { date = d; dateIndex = j; break; }
        }
      }
      if (date) pairs.push({ ...status, stamp: date.stamp, lineIndex: i, dateIndex });
    }
    if (pairs.length < 2) return null;

    const clusters = [];
    let current = [];
    for (const pair of pairs) {
      const prev = current[current.length - 1];
      if (!prev || pair.lineIndex - prev.dateIndex <= 4) current.push(pair);
      else { if (current.length) clusters.push(current); current = [pair]; }
    }
    if (current.length) clusters.push(current);
    const valid = clusters.filter(c => c.length >= 2);
    if (!valid.length) return null;
    valid.sort((a, b) => Math.max(...b.map(x => x.stamp)) - Math.max(...a.map(x => x.stamp)) || b.length - a.length);
    const cluster = valid[0];
    const latest = [...cluster].sort((a, b) => b.stamp - a.stamp || b.rank - a.rank || b.lineIndex - a.lineIndex)[0];
    return { ...latest, pairCount: cluster.length };
  }

  function canonicalStatus(value) {
    const s = cleanText(value || '');
    if (Object.prototype.hasOwnProperty.call(STATUS_RANK, s)) return s;
    if (s === '已结束' || s === '已撤回') return s;
    return parsePageStatus(s)?.status || '';
  }

  function shouldAdoptPageStatus(currentValue, evidence) {
    if (!evidence?.status || Number(evidence.pairCount || 0) < 2) return false;
    const current = canonicalStatus(currentValue);
    if (current === evidence.status) return false;
    if (current === 'Offer' || current === '已结束' || current === '已撤回') return false;
    if (evidence.terminal) return true;
    const currentRank = STATUS_RANK[current] || 0;
    const nextRank = STATUS_RANK[evidence.status] || 0;
    return nextRank > currentRank;
  }

'''
if anchor not in s:
    raise SystemExit('enhanceRecords anchor missing')
s = s.replace(anchor, helpers + anchor, 1)

old = "    const snap = collectSemanticSnapshot();\n    const goodExistingPositions = new Set(records.filter(r => !isSuspiciousPosition(r.position) && positionScore(r.position, 'existing') >= 9).map(r => semanticText(r.position)));\n"
new = "    const snap = collectSemanticSnapshot();\n    const pageStatus = records.length === 1 ? inferLatestStatusFromPage() : null;\n    const goodExistingPositions = new Set(records.filter(r => !isSuspiciousPosition(r.position) && positionScore(r.position, 'existing') >= 9).map(r => semanticText(r.position)));\n"
if old not in s:
    raise SystemExit('enhanceRecords snapshot anchor missing')
s = s.replace(old, new, 1)

old = "      const current = normalizePosition(r.position);\n"
new = "      if (pageStatus && shouldAdoptPageStatus(r.status || r.rawStatus, pageStatus)) {\n        r.status = pageStatus.status;\n        r.rawStatus = pageStatus.raw;\n      }\n\n      const current = normalizePosition(r.position);\n"
if old not in s:
    raise SystemExit('enhanceRecords status insertion anchor missing')
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
print('semantic.js patched')
