(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackFollowUpStrategy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const POSITIVE_API_RE = /(application|apply|delivery|candidate|resume|process|progress|job.*apply|position.*apply|my.*apply|my.*deliver)/i;
  const NEGATIVE_API_RE = /(logout|signout|delete|remove|withdraw|cancel|submit|create|update|modify|save|upload|download|track|analytics|collect|report|log|metric|beacon|captcha|verify|sms|email|sendcode|send-code)/i;
  const SENSITIVE_QUERY_RE = /(token|auth|authorization|sign|signature|nonce|timestamp|session|cookie|secret|ticket|share|code|key|credential|candidateid|userid|user_id|openid|unionid|mobile|phone|email)/i;
  const CACHE_BUSTER_RE = /^(?:_|t|ts|timestamp|rnd|random|cacheBust|cb)$/i;

  function safeUrl(input, base='') {
    try { return new URL(String(input || ''), base || undefined); }
    catch { return null; }
  }

  function normalizeHost(host) { return String(host || '').toLowerCase().replace(/^www\./,''); }

  function sameOrigin(a,b) {
    const A=safeUrl(a), B=safeUrl(b);
    return !!A && !!B && A.origin === B.origin;
  }

  function endpointScore(url, pageUrl='') {
    const u=safeUrl(url, pageUrl); if (!u || u.protocol !== 'https:') return -100;
    let s=0;
    const full=`${u.pathname}${u.search}`;
    if (POSITIVE_API_RE.test(full)) s += 18;
    if (/\/api\//i.test(u.pathname)) s += 6;
    if (/list|query|search|detail|status|record|history|progress/i.test(full)) s += 5;
    if (/json/i.test(full)) s += 2;
    if (NEGATIVE_API_RE.test(full)) s -= 40;
    if (pageUrl && sameOrigin(u.href,pageUrl)) s += 8;
    if (u.search.length > 1200) s -= 8;
    return s;
  }

  function isSafeGetCandidate(url,pageUrl='') {
    const u=safeUrl(url,pageUrl); if (!u || u.protocol !== 'https:') return false;
    if (pageUrl && !sameOrigin(u.href,pageUrl)) return false;
    const full=`${u.pathname}${u.search}`;
    if (!POSITIVE_API_RE.test(full) || NEGATIVE_API_RE.test(full)) return false;
    return endpointScore(u.href,pageUrl) >= 18;
  }

  function sanitizeCacheUrl(url,pageUrl='') {
    const u=safeUrl(url,pageUrl); if (!u || !isSafeGetCandidate(u.href,pageUrl || u.href)) return '';
    for (const [k,v] of [...u.searchParams.entries()]) {
      if (SENSITIVE_QUERY_RE.test(k) || SENSITIVE_QUERY_RE.test(v) || String(v).length > 96) return '';
      if (CACHE_BUSTER_RE.test(k)) u.searchParams.delete(k);
    }
    u.hash='';
    return u.toString();
  }

  function rankApiCandidates(resources=[], cached=[], pageUrl='', limit=3) {
    const map=new Map();
    const add=(url,source) => {
      if (!isSafeGetCandidate(url,pageUrl)) return;
      const u=safeUrl(url,pageUrl); if (!u) return;
      const key=u.toString();
      const score=endpointScore(key,pageUrl)+(source==='cache'?12:0);
      const old=map.get(key);
      if (!old || score>old.score) map.set(key,{url:key,score,source});
    };
    for (const x of cached || []) add(typeof x==='string'?x:x?.url,'cache');
    for (const x of resources || []) add(typeof x==='string'?x:x?.url || x?.name,'resource');
    return [...map.values()].sort((a,b)=>b.score-a.score).slice(0,Math.max(1,Math.min(6,Number(limit||3))));
  }

  function coverage(targets=[], records=[], core=null) {
    if (!targets.length || !records.length || !core?.matchScanned) return { matched:0,total:targets.length,ratio:0,matches:[] };
    const matches=core.matchScanned(targets,records);
    const matched=matches.filter(m=>m.scanned && m.score>=55).length;
    return { matched,total:targets.length,ratio:targets.length?matched/targets.length:0,matches };
  }

  function isUseful(targets, records, core, minRatio=.8) {
    const c=coverage(targets,records,core);
    if (!records?.length || !c.matched) return { ok:false,...c };
    const required = c.total <= 1 ? 1 : Math.max(1, Math.ceil(c.total * minRatio));
    return { ok:c.matched>=required,...c,required };
  }

  function strategyLabel(id) {
    return ({ api_get:'API GET', structured_state:'Structured State', page_scan:'Page Scan' })[id] || String(id||'');
  }

  return { endpointScore, isSafeGetCandidate, sanitizeCacheUrl, rankApiCandidates, coverage, isUseful, strategyLabel, sameOrigin };
});