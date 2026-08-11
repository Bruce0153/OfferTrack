(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackCookieSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const SESSION_NAME_RE = /(session|sid|sso|auth|login|passport|ticket|user|candidate|account)/i;
  const normalizeHost = host => String(host || '').toLowerCase().replace(/^\.+|^www\./, '').trim();

  function summarize(cookies = [], atSeconds = Date.now() / 1000) {
    let sessionLikeCount = 0, httpOnlyCount = 0, secureCount = 0, expiredCount = 0, persistentCount = 0;
    for (const cookie of cookies || []) {
      if (SESSION_NAME_RE.test(String(cookie?.name || ''))) sessionLikeCount++;
      if (cookie?.httpOnly) httpOnlyCount++;
      if (cookie?.secure) secureCount++;
      if (Number(cookie?.expirationDate || 0) > 0) {
        persistentCount++;
        if (Number(cookie.expirationDate) <= atSeconds) expiredCount++;
      }
    }
    const cookieCount = Array.isArray(cookies) ? cookies.length : 0;
    let strength = 'none';
    if (cookieCount && (sessionLikeCount >= 2 || (sessionLikeCount >= 1 && httpOnlyCount >= 1))) strength = 'strong';
    else if (cookieCount && (sessionLikeCount >= 1 || httpOnlyCount >= 1)) strength = 'possible';
    else if (cookieCount) strength = 'weak';
    return {
      strength,
      cookieCount,
      sessionLikeCount,
      httpOnlyCount,
      secureCount,
      expiryState: expiredCount ? (expiredCount === persistentCount ? 'expired' : 'mixed') : (persistentCount ? 'valid' : 'session')
    };
  }

  async function inspectHost(host) {
    const key = normalizeHost(host);
    if (!key || !globalThis.chrome?.cookies?.getAll) return summarize([]);
    // Cookie values are deliberately never returned, logged, stored, or serialized.
    const cookies = await chrome.cookies.getAll({ domain: key }).catch(() => []);
    return summarize(cookies);
  }

  function changedHost(changeInfo = {}) {
    return normalizeHost(changeInfo?.cookie?.domain || '');
  }

  return { SESSION_NAME_RE, normalizeHost, summarize, inspectHost, changedHost };
});
