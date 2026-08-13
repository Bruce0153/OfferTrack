(function(root, factory) {
  const StatusState = root?.OfferTrackStatusStateMachine
    || (typeof module !== 'undefined' && module.exports ? require('./status-state-machine.js') : null);
  const api = factory(StatusState);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackFollowUpCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(StatusState) {
  'use strict';

  const FIELDS = Object.freeze({
    company: '公司', position: '岗位名称', location: '工作地点', applyTime: '投递时间',
    status: '当前状态', platform: '招聘平台', url: '岗位链接', uid: '唯一记录ID', rawStatus: '原始状态',
    autoFollowUp: '自动跟进', lastCheckedAt: '最后检查时间'
  });
  const FOLLOWUP_TERMINAL = new Set(['Offer', '已结束', '已撤回']);
  const CHECK_URL_HINT_RE = /(mydeliver|mydelivery|myapply|my-apply|applications?|applicationcenter|deliveryrecord|delivery|candidatehome|candidate|personal\/delivery|account\/apply|position\/application|campusrecruitment\/position\/application|progress|process)/i;
  const DETAIL_URL_HINT_RE = /(zpdetail|jobdetail|position\/detail|jobs?\/\d+|positions?\/\d+)/i;

  function text(v) {
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
    if (Array.isArray(v)) return v.map(text).filter(Boolean).join(',');
    if (typeof v === 'object') {
      if ('text' in v) return text(v.text);
      if ('name' in v) return text(v.name);
      if ('link' in v) return text(v.link);
    }
    return String(v).trim();
  }

  function hostOf(url) {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
    catch { return ''; }
  }

  function canonicalUrl(url) {
    try {
      const u = new URL(url);
      for (const key of [...u.searchParams.keys()]) {
        if (/^(?:utm_|share_token|token|recommendCode|spm|trackingId|trackId)/i.test(key)) u.searchParams.delete(key);
      }
      return `${u.origin}${u.pathname}${u.hash ? u.hash.split('?')[0] : ''}`;
    } catch { return String(url || ''); }
  }

  function norm(v) {
    return text(v).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function normPosition(v) {
    return norm(v).replace(/[\s\-—–_·•|｜【】\[\]（）()]/g, '');
  }

  function normCompany(v) {
    return norm(v)
      .replace(/^(?:(?:欢迎|诚邀)(?:您)?(?:加入|来到|关注|选择)?|加入(?:我们|本公司|公司)?|走进)\s*/i, '')
      .replace(/(?:20\d{2}|\d{2})(?:届)?(?:应届生?)?(?:秋季|春季)?(?:校园招聘|校招|招聘)/gi, ' ')
      .replace(/[·•|｜\-—–\s]*(?:校园招聘|校招官网|校招|社会招聘|社招官网|社招|应届招聘|实习招聘|人才招聘|招聘官网|招聘平台|招聘中心|招聘网站|招聘主页|招聘)\s*$/i, '')
      .trim();
  }

  function canonicalStatus(status) {
    return StatusState?.normalize?.(text(status)) || '';
  }

  function isTerminalStatus(status) {
    return FOLLOWUP_TERMINAL.has(canonicalStatus(status));
  }

  function followUpOptOut(value) {
    return /^(?:0|false|off|no|否|关闭|不跟进|无需跟进)$/i.test(norm(value));
  }

  function fromFeishu(item) {
    const f = item?.fields || {};
    const value = key => text(f[key]);
    const url = value(FIELDS.url);
    return {
      recordId: item?.record_id || '',
      company: value(FIELDS.company),
      position: value(FIELDS.position),
      location: value(FIELDS.location),
      applyTime: value(FIELDS.applyTime),
      status: value(FIELDS.status),
      platform: value(FIELDS.platform),
      url,
      uid: value(FIELDS.uid),
      rawStatus: value(FIELDS.rawStatus),
      autoFollowUp: value(FIELDS.autoFollowUp),
      lastCheckedAt: value(FIELDS.lastCheckedAt),
      host: hostOf(url)
    };
  }

  function selectTargets(items, settings = {}) {
    const includeTerminal = !!settings.followUpIncludeTerminal;
    const out = [];
    for (const item of items || []) {
      const r = item?.recordId ? item : fromFeishu(item);
      if (!r.recordId || !r.position || !r.url || !/^https:\/\//i.test(r.url)) continue;
      if (!r.host) r.host = hostOf(r.url);
      if (!r.host) continue;
      if (followUpOptOut(r.autoFollowUp)) continue;
      if (!includeTerminal && isTerminalStatus(r.status)) continue;
      out.push(r);
    }
    return out;
  }

  function urlScore(url) {
    const s = String(url || '');
    let score = 0;
    if (/^https:\/\//i.test(s)) score += 2;
    if (CHECK_URL_HINT_RE.test(s)) score += 12;
    if (/(my|personal|candidate|account)/i.test(s)) score += 3;
    if (DETAIL_URL_HINT_RE.test(s)) score -= 5;
    try {
      const u = new URL(s);
      if (u.hash && /(apply|deliver|application|candidate|progress)/i.test(u.hash)) score += 4;
    } catch {}
    return score;
  }

  function chooseCheckUrl(records) {
    const candidates = [...new Set((records || []).map(r => r.url).filter(Boolean))];
    candidates.sort((a, b) => urlScore(b) - urlScore(a) || canonicalUrl(a).length - canonicalUrl(b).length);
    return candidates[0] || '';
  }

  function groupTargets(records) {
    const map = new Map();
    for (const r of records || []) {
      const host = r.host || hostOf(r.url);
      if (!host) continue;
      const bucket = map.get(host) || { host, records: [], url: '' };
      bucket.records.push({ ...r, host });
      map.set(host, bucket);
    }
    const groups = [...map.values()];
    for (const g of groups) g.url = chooseCheckUrl(g.records);
    return groups.sort((a, b) => a.host.localeCompare(b.host));
  }

  function bigrams(s) {
    const x = normPosition(s);
    const set = new Set();
    for (let i = 0; i < x.length - 1; i++) set.add(x.slice(i, i + 2));
    return set;
  }

  function similarity(a, b) {
    const x = normPosition(a), y = normPosition(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.includes(y) || y.includes(x)) return Math.min(x.length, y.length) / Math.max(x.length, y.length);
    const A = bigrams(x), B = bigrams(y);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    return (2 * inter) / (A.size + B.size);
  }

  function matchScore(target, scanned) {
    if (!target || !scanned) return -100;
    if (target.uid && scanned.uid && target.uid === scanned.uid) return 150;
    let score = 0;
    const pSim = similarity(target.position, scanned.position);
    if (pSim >= 0.98) score += 85;
    else if (pSim >= 0.82) score += 62;
    else if (pSim >= 0.68) score += 38;
    else score -= 20;
    if (target.applyTime && scanned.applyTime) score += target.applyTime === scanned.applyTime ? 22 : -12;
    if (target.company && scanned.company) {
      const a = normCompany(target.company), b = normCompany(scanned.company);
      if (a && b && (a === b || a.includes(b) || b.includes(a))) score += 12;
    }
    if (target.platform && scanned.platform && norm(target.platform) === norm(scanned.platform)) score += 8;
    if (hostOf(target.url) && hostOf(scanned.url) && hostOf(target.url) === hostOf(scanned.url)) score += 8;
    return score;
  }

  function matchScanned(targets, scannedRecords) {
    const unused = new Set((scannedRecords || []).map((_, i) => i));
    const result = [];
    for (const target of targets || []) {
      let bestIndex = -1, bestScore = -Infinity;
      for (const i of unused) {
        const score = matchScore(target, scannedRecords[i]);
        if (score > bestScore) { bestScore = score; bestIndex = i; }
      }
      if (bestIndex >= 0 && bestScore >= 55) {
        unused.delete(bestIndex);
        result.push({ target, scanned: scannedRecords[bestIndex], score: bestScore });
      } else {
        result.push({ target, scanned: null, score: bestScore });
      }
    }
    return result;
  }

  function statusChanged(target, scanned) {
    if (!scanned) return false;
    const from = canonicalStatus(target?.status);
    const to = canonicalStatus(scanned.status);
    return !!to && from !== to;
  }

  return {
    FIELDS, FOLLOWUP_TERMINAL, text, hostOf, canonicalUrl, norm, normPosition, normCompany, canonicalStatus,
    isTerminalStatus, followUpOptOut, fromFeishu, selectTargets,
    urlScore, chooseCheckUrl, groupTargets, similarity, matchScore,
    matchScanned, statusChanged
  };
});
