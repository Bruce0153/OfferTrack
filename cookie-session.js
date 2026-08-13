(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackCookieSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const AUTH_NAME_RE = /(?:^|[_-])(session|sess|sid|token|auth|login|ticket|jwt|sso|passport|credential|candidate|account|identity|access)(?:$|[_-])|^(?:JSESSIONID|PHPSESSID|ASP\.NET_SessionId)$/i;
  const TRACKING_NAME_RE = /^(?:_ga|_gid|_gat|_gcl|_fbp|_hj|Hm_|sensors|sa_|utm_|analytics|track|amplitude|clarity|mp_)/i;
  const PREFERENCE_NAME_RE = /(?:lang|locale|theme|consent|privacy|timezone|tz|abtest|experiment|device[_-]?id)$/i;

  const cleanHost = value => String(value || '').trim().toLowerCase().replace(/^\./, '').replace(/^www\./, '');

  function cookieKey(c) {
    return `${c?.storeId || ''}|${c?.domain || ''}|${c?.path || ''}|${c?.name || ''}|${c?.partitionKey?.topLevelSite || ''}`;
  }

  function isAuthLike(c) {
    return !!c && AUTH_NAME_RE.test(String(c.name || ''));
  }

  function isNoise(c) {
    const name = String(c?.name || '');
    return TRACKING_NAME_RE.test(name) || PREFERENCE_NAME_RE.test(name);
  }

  function summarize(cookies, at = Date.now()) {
    const rows = Array.isArray(cookies) ? cookies : [];
    let authLike = 0, httpOnly = 0, secure = 0, nonNoise = 0, session = 0, expired = 0;
    let nearestExpiry = 0;
    for (const c of rows) {
      if (isAuthLike(c)) authLike++;
      if (c?.httpOnly) httpOnly++;
      if (c?.secure) secure++;
      if (!isNoise(c)) nonNoise++;
      if (c?.session || !Number(c?.expirationDate)) session++;
      const expMs = Number(c?.expirationDate || 0) * 1000;
      if (expMs && expMs <= at) expired++;
      if (expMs && expMs > at && (!nearestExpiry || expMs < nearestExpiry)) nearestExpiry = expMs;
    }
    const activeCount = Math.max(0, rows.length - expired);
    const level = authLike > 0 ? 'strong' : (httpOnly > 0 || nonNoise >= 2 ? 'possible' : activeCount ? 'weak' : 'none');
    return {
      available: true,
      level,
      strength: level,
      cookieCount: activeCount,
      authLikeCount: authLike,
      sessionLikeCount: authLike,
      httpOnlyCount: httpOnly,
      secureCount: secure,
      sessionCount: session,
      expiresSoon: !!nearestExpiry && nearestExpiry - at < 60 * 60 * 1000,
      nearestExpiryAt: nearestExpiry || 0,
      checkedAt: at
    };
  }

  async function inspectUrls(urls) {
    if (!globalThis.chrome?.cookies?.getAll) return { available: false, level: 'unavailable', strength: 'unavailable', cookieCount: 0, authLikeCount: 0, sessionLikeCount: 0, httpOnlyCount: 0, checkedAt: Date.now() };
    const seen = new Map();
    for (const raw of Array.isArray(urls) ? urls : [urls]) {
      let url;
      try {
        const u = new URL(String(raw || ''));
        if (u.protocol !== 'https:') continue;
        url = u.toString();
      } catch { continue; }
      try {
        const cookies = await chrome.cookies.getAll({ url });
        for (const c of cookies || []) seen.set(cookieKey(c), c);
      } catch {}
    }
    return summarize([...seen.values()]);
  }

  async function inspectGroup(group) {
    const urls = [];
    if (group?.url) urls.push(group.url);
    for (const r of group?.records || []) if (r?.url) urls.push(r.url);
    if (!urls.length && group?.host) urls.push(`https://${cleanHost(group.host)}/`);
    return inspectUrls([...new Set(urls)].slice(0, 8));
  }

  function changedCookieHost(changeInfo) {
    const c = changeInfo?.cookie;
    if (!c || isNoise(c)) return '';
    if (!isAuthLike(c) && !c.httpOnly) return '';
    return cleanHost(c.domain || '');
  }



  return {
    AUTH_NAME_RE,
    TRACKING_NAME_RE,
    isAuthLike,
    isNoise,
    summarize,
    inspectUrls,
    inspectGroup,
    changedCookieHost
  };
});
