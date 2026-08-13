(function(root, factory) {
  const StatusState = root?.OfferTrackStatusStateMachine
    || (typeof module !== 'undefined' && module.exports ? require('./status-state-machine.js') : null);
  const Contract = root?.OfferTrackApplicationContract
    || (typeof module !== 'undefined' && module.exports ? require('./application-contract.js') : null);
  const api = factory(StatusState, Contract);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackFollowUpCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(StatusState, Contract) {
  'use strict';

  const FIELDS = Contract?.FEISHU_FIELDS || Object.freeze({});
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


  return {
    FIELDS, FOLLOWUP_TERMINAL, text, hostOf, canonicalUrl, norm, canonicalStatus,
    isTerminalStatus, followUpOptOut, fromFeishu, selectTargets,
    urlScore, chooseCheckUrl, groupTargets
  };
});
