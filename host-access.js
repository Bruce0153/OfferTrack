(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackHostAccess = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function originPattern(value) {
    try {
      const u = /^https?:\/\//i.test(String(value || '')) ? new URL(String(value)) : new URL(`https://${String(value || '').replace(/^\.+|^www\./, '')}/`);
      if (u.protocol !== 'https:') return '';
      return `${u.origin}/*`;
    } catch { return ''; }
  }

  async function has(value) {
    const pattern = originPattern(value);
    if (!pattern) return false;
    if (!globalThis.chrome?.permissions?.contains) return true;
    try { return !!(await chrome.permissions.contains({ origins: [pattern] })); }
    catch { return false; }
  }

  async function request(value) {
    const pattern = originPattern(value);
    if (!pattern) return false;
    if (await has(pattern)) return true;
    if (!globalThis.chrome?.permissions?.request) return false;
    try { return !!(await chrome.permissions.request({ origins: [pattern] })); }
    catch { return false; }
  }

  return { originPattern, has, request };
});
