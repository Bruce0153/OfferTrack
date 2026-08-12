(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackCompanyIdentity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const NOISE_RE = /^(?:相关公司|关联公司|推荐公司|相似公司|其他公司|更多公司|热门公司|合作公司|所属公司|招聘公司|目标公司|公司信息|公司介绍|企业信息|企业介绍|雇主信息|关于我们|合作伙伴|推荐企业|关联企业|相关企业|个人资料|个人信息|我的资料|我的信息|候选人资料|候选人信息|用户资料|用户信息|账号信息|个人主页|我的主页|我的简历|投递记录|申请记录|应聘记录|校园招聘|社会招聘|应届招聘|实习招聘|职位|岗位|招聘|首页|更多|详情|logo|icon|brand|home|career|careers|jobs?)$/i;
  const PERSONAL_TEXT_RE = /(?:个人资料|个人信息|我的资料|我的信息|候选人资料|候选人信息|用户资料|用户信息|账号信息|个人主页|我的主页|我的简历)/i;
  const PERSONAL_CONTEXT_RE = /(?:^|[\s_.:#/\-])(avatar|user(?:name|info|profile|center)?|profile|personal|resume|account|member|candidate(?:name|info|profile)?)(?:$|[\s_.:#/\-])|个人资料|个人信息|我的资料|我的信息|候选人资料|候选人信息|用户资料|用户信息|账号信息|个人主页|我的主页|我的简历|头像|用户名|用户名称|姓名/i;
  const BAD_CONTEXT_RE = /(related|recommend|similar|other|partner|supplier|customer|competitor|affiliate|suggest|history|hot|search|list|关联|相关|推荐|相似|其他|合作|供应商|客户|竞品|搜索|列表)/i;
  const COMPANY_WORD_RE = /(有限公司|有限责任公司|股份有限公司|集团|科技|网络|智能|银行|证券|研究院|实验室|大学|股份|公司|汽车|机器人|控股|实业|电子|信息|通信|软件|半导体|能源|医药|生物|材料|制造|工业)/;
  const NAV_PREFIX_RE = /^(?:(?:欢迎|诚邀)(?:您)?(?:加入|来到|关注|选择)?|加入(?:我们|本公司|公司)?|走进|了解|认识|探索|关于)\s*/i;
  const RECRUIT_SUFFIX_RE = /[·•|｜\-—–\s]*(?:(?:秋季|春季)?(?:校园招聘|校招官网|校招|社会招聘|社招官网|社招|应届招聘|实习招聘)|人才招聘|招聘官网|招聘平台|招聘中心|招聘网站|招聘主页|Campus\s*Recruitment|Careers?|Jobs?|Application\s*Inquiry|招聘)\s*$/i;
  const RECRUIT_TEXT_RE = /(投递|申请|应聘|岗位|职位|个人中心|候选人中心|详情|收藏|流程|简历筛选|面试流程)/;

  const SOURCE_WEIGHT = {
    'structured-jobposting': 18,
    'structured-org': 17,
    'site-json': 17,
    'runtime-json': 16,
    'declared-dom': 15,
    'declared': 15,
    'site-meta': 14,
    'meta': 12,
    'site-title-part': 10,
    'site-title': 8,
    'header-brand': 8,
    'header': 7,
    'top-left': 4,
    'header-visual': 4,
    'title-part': 4,
    'title': 3,
    'current-record': 2
  };

  const cleanText = value => String(value ?? '')
    .replace(/[\t\r\n\u00a0]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  function normalizeCompany(value) {
    let s = cleanText(value).replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!s) return '';
    s = s.replace(NAV_PREFIX_RE, '').trim();
    s = s.replace(/[！!]+$/g, '').trim();
    s = s.replace(/(?:20\d{2}|\d{2})(?:届)?(?:应届生?)?(?:秋季|春季)?(?:校园招聘|校招|招聘)/gi, ' ').trim();
    s = s.replace(RECRUIT_SUFFIX_RE, '').trim();
    s = s.replace(/^[·•|｜\-—–\s]+|[·•|｜\-—–\s]+$/g, '');
    if (!s || NOISE_RE.test(s) || PERSONAL_TEXT_RE.test(s)) return '';
    if (/^[\d*+()\-\s]{4,}$/.test(s) || /\*{2,}/.test(s)) return '';
    if (RECRUIT_TEXT_RE.test(s) && !COMPANY_WORD_RE.test(s)) return '';
    return s.slice(0, 100);
  }

  function isPersonalContext(context = '', nearby = '') {
    return PERSONAL_CONTEXT_RE.test(`${cleanText(context)} ${cleanText(nearby).slice(0, 260)}`);
  }

  function isBadContext(context = '') {
    return BAD_CONTEXT_RE.test(cleanText(context));
  }

  function isPersonalNameLike(value, context = '', nearby = '') {
    if (!isPersonalContext(context, nearby)) return false;
    const s = normalizeCompany(value);
    if (!s) return true;
    if (/^[\u4e00-\u9fff·]{2,6}$/.test(s) && !COMPANY_WORD_RE.test(s)) return true;
    if (/^[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,3}$/.test(s) && s.length <= 48) return true;
    return false;
  }

  function sourceWeight(source = '') {
    if (SOURCE_WEIGHT[source] != null) return SOURCE_WEIGHT[source];
    for (const [key, value] of Object.entries(SOURCE_WEIGHT)) if (String(source).includes(key)) return value;
    return 2;
  }

  function providerNoise(value, providerName = '') {
    const a = normalizeCompany(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
    const b = normalizeCompany(providerName).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
    return !!(a && b && (a === b || (a.length >= 4 && b.includes(a))));
  }

  function candidateScore(candidate, opts = {}) {
    const value = normalizeCompany(candidate?.value ?? candidate);
    const source = String(candidate?.source || '');
    const context = String(candidate?.context || '');
    const nearby = String(candidate?.nearby || '');
    if (!value || NOISE_RE.test(value) || isBadContext(context) || isPersonalNameLike(value, context, nearby)) return -100;
    if (providerNoise(value, opts.providerName || '')) return -80;

    let score = sourceWeight(source) + Number(candidate?.bonus || 0);
    if (COMPANY_WORD_RE.test(value)) score += 4;
    if (/[\u4e00-\u9fff]/.test(value) && value.length >= 2 && value.length <= 30) score += 2;
    if (/[A-Za-z]/.test(value) && /[\u4e00-\u9fff]/.test(value) && value.length <= 45) score += 2.5;
    if (/^[A-Za-z][A-Za-z0-9 .&+\-]{1,36}$/.test(value)) score += 1;
    if (value.length > 60) score -= 4;
    if (/visual|top-left/.test(source) && !COMPANY_WORD_RE.test(value)) score -= 2;
    if (/title/.test(source) && !COMPANY_WORD_RE.test(value) && value.length <= 6) score -= 1;
    return score;
  }

  function core(value) {
    return normalizeCompany(value).toLowerCase()
      .replace(/(?:科技股份有限公司|股份有限公司|有限责任公司|集团股份有限公司|集团有限公司|有限公司|集团|公司)$/g, '')
      .replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
  }

  function affinity(a, b) {
    const x = core(a), y = core(b);
    if (!x || !y) return 0;
    if (x === y) return 5;
    if (x.includes(y) || y.includes(x)) return 4;
    const cjkA = (x.match(/[\u4e00-\u9fff]+/g) || []).join('');
    const cjkB = (y.match(/[\u4e00-\u9fff]+/g) || []).join('');
    let prefix = 0;
    while (prefix < cjkA.length && prefix < cjkB.length && cjkA[prefix] === cjkB[prefix]) prefix++;
    if (prefix >= 2) return Math.min(4, prefix);
    const latinA = new Set((x.match(/[a-z0-9]{3,}/g) || []));
    for (const token of (y.match(/[a-z0-9]{3,}/g) || [])) if (latinA.has(token)) return 3;
    return 0;
  }

  function resolve(candidates, opts = {}) {
    const prepared = [];
    for (const raw of Array.isArray(candidates) ? candidates : []) {
      const value = normalizeCompany(raw?.value ?? raw);
      if (!value) continue;
      const item = { ...(typeof raw === 'object' ? raw : {}), value };
      item.score = candidateScore(item, opts);
      if (item.score > -20) prepared.push(item);
    }
    if (!prepared.length) return { company: '', confidence: 0, source: '', candidates: [] };

    const groups = [];
    for (const c of prepared) {
      let g = groups.find(x => affinity(x.anchor, c.value) >= 3);
      if (!g) groups.push(g = { anchor: c.value, items: [], score: 0, sources: new Set() });
      g.items.push(c);
      g.score += Math.max(0, c.score);
      g.sources.add(String(c.source || '').split(':')[0]);
    }

    for (const g of groups) {
      g.score += Math.max(0, g.sources.size - 1) * 4;
      g.items.sort((a, b) => b.score - a.score || b.value.length - a.value.length);
      const topScore = g.items[0]?.score ?? -100;
      const rich = g.items
        .filter(x => x.score >= topScore - 2 && x.value.length <= 60)
        .sort((a, b) => (/[A-Za-z]/.test(b.value) && /[\u4e00-\u9fff]/.test(b.value) ? 1 : 0) - (/[A-Za-z]/.test(a.value) && /[\u4e00-\u9fff]/.test(a.value) ? 1 : 0) || b.value.length - a.value.length)[0];
      g.best = rich || g.items[0];
    }
    groups.sort((a, b) => b.score - a.score || (b.best?.score || 0) - (a.best?.score || 0));
    const best = groups[0];
    const runner = groups[1];
    const margin = best.score - (runner?.score || 0);
    const confidence = Math.max(0, Math.min(100, (best.best?.score || 0) * 3 + Math.min(20, margin)));
    return { company: best.best?.value || '', confidence, source: best.best?.source || '', candidates: prepared.sort((a,b)=>b.score-a.score).slice(0,20) };
  }

  function shouldPreferResolved(current, resolved, opts = {}) {
    const c = normalizeCompany(current);
    const r = normalizeCompany(resolved?.company || resolved);
    if (!r) return false;
    if (!c) return true;
    if (affinity(c, r) >= 3) return true;
    const confidence = Number(resolved?.confidence || 0);
    if (confidence < Number(opts.minConfidence || 35)) return false;
    const currentFormal = COMPANY_WORD_RE.test(c);
    const currentMixed = /[A-Za-z]/.test(c) && /[\u4e00-\u9fff]/.test(c);
    const currentWeak = !currentFormal && !currentMixed && c.replace(/\s/g, '').length <= 12;
    return currentWeak || confidence >= Number(opts.strongConfidence || 55);
  }

  function decodeHtml(value) {
    return cleanText(String(value || '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\\//g, '/'));
  }

  function parseHtmlCandidates(html, opts = {}) {
    const text = String(html || '').slice(0, Number(opts.maxChars || 900000));
    const out = [];
    const add = (value, source, context = '') => {
      const v = normalizeCompany(decodeHtml(value));
      if (!v) return;
      out.push({ value: v, source, context });
    };
    const title = text.match(/<title[^>]*>([\s\S]{1,400}?)<\/title>/i)?.[1];
    if (title) {
      add(title, 'site-title');
      for (const part of decodeHtml(title).split(/[-_|｜·—–]/).map(x => x.trim()).filter(Boolean)) add(part, 'site-title-part');
    }
    for (const tag of text.match(/<meta\b[^>]{0,1400}>/gi) || []) {
      const attrs = {};
      for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gi)) attrs[m[1].toLowerCase()] = m[3];
      const key = String(attrs.property || attrs.name || '').toLowerCase();
      if (/^(?:og:site_name|application-name|apple-mobile-web-app-title|publisher)$/.test(key)) add(attrs.content, 'site-meta', key);
    }
    const keyRe = /(?:company(?:Name|ShortName|FullName|DisplayName)?|company_name|company_short_name|company_full_name|corp(?:Name|ShortName|FullName)?|corp_name|enterprise(?:Name|ShortName|FullName)?|employer(?:Name|ShortName|FullName)?|organization(?:Name|ShortName|FullName)?|organisation(?:Name|ShortName|FullName)?|orgName|org_name|brandName|brand_name|tenantName|tenant_name|siteName|site_name)/gi;
    for (const m of text.matchAll(new RegExp(String.raw`["']?(${keyRe.source})["']?\s*[:=]\s*["']([^"'\n\r]{2,180})["']`, 'gi'))) {
      const before = text.slice(Math.max(0, m.index - 200), m.index);
      if (!isBadContext(before) && !isPersonalContext(before)) add(m[2], 'site-json', `${m[1]} ${before.slice(-120)}`);
    }
    for (const m of text.matchAll(new RegExp(String.raw`\\["'](${keyRe.source})\\["']\s*:\s*\\["']([^"'\n\r]{2,180})\\["']`, 'gi'))) {
      const before = text.slice(Math.max(0, m.index - 200), m.index);
      if (!isBadContext(before) && !isPersonalContext(before)) add(m[2], 'site-json', `${m[1]} ${before.slice(-120)}`);
    }
    return out;
  }

  function siteIdentityRoot(url) {
    try {
      const u = new URL(String(url || ''));
      if (u.protocol !== 'https:') return '';
      const parts = u.pathname.split('/').filter(Boolean);
      const routeIndex = parts.findIndex((part, i) => /^(?:account|personal|candidate|user|profile)$/i.test(part) && /^(?:apply|application|applications|delivery|deliveries|record|records)$/i.test(parts[i + 1] || ''));
      const path = routeIndex >= 0 ? '/' + parts.slice(0, routeIndex).join('/') : u.pathname;
      return `${u.origin}${path || '/'}`.replace(/\/$/, '') || u.origin;
    } catch { return ''; }
  }

  return {
    NOISE_RE,
    COMPANY_WORD_RE,
    cleanText,
    normalizeCompany,
    isPersonalContext,
    isBadContext,
    isPersonalNameLike,
    candidateScore,
    affinity,
    resolve,
    shouldPreferResolved,
    parseHtmlCandidates,
    siteIdentityRoot
  };
});
