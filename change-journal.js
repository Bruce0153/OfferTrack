(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackChangeJournal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const STORAGE_KEY = 'followUpChangeJournal';
  const MAX_ENTRIES = 300;
  const recentMatches = new Map();

  const clean = (v, max = 180) => String(v || '').replace(/[\t\r\n\u00a0]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
  const keyOf = (company, position) => `${clean(company,120).toLowerCase()}|${clean(position,160).toLowerCase()}`;

  function hostOf(url) {
    try { return new URL(String(url || '')).hostname.toLowerCase().replace(/^www\./, ''); }
    catch { return ''; }
  }

  function sanitizeEntry(input = {}) {
    const confidence = Number(input.matchConfidence || 0);
    return {
      at: Number(input.at || Date.now()),
      company: clean(input.company, 120),
      position: clean(input.position, 160),
      oldStatus: clean(input.oldStatus, 80),
      newStatus: clean(input.newStatus, 80),
      provider: clean(input.provider, 100),
      checkMethod: clean(input.checkMethod, 80),
      matchConfidence: Math.max(0, Math.min(1, Number.isFinite(confidence) ? confidence : 0)),
      matchMethod: clean(input.matchMethod, 80),
      host: clean(input.host, 180)
    };
  }

  function isRealChange(entry) {
    return !!entry.company && !!entry.position && !!entry.oldStatus && !!entry.newStatus && entry.oldStatus !== entry.newStatus;
  }

  function rememberMatch(target = {}, scanned = {}) {
    const match = scanned?._offerTrackMatch || {};
    const key = keyOf(target.company, target.position);
    if (!key || key === '|') return;
    recentMatches.set(key, {
      matchConfidence: Number(match.confidence || 0),
      matchMethod: clean(match.method, 80),
      host: hostOf(target.url || scanned.url),
      provider: clean(target.platform, 100),
      at: Date.now()
    });
    if (recentMatches.size > 200) {
      const first = recentMatches.keys().next().value;
      if (first) recentMatches.delete(first);
    }
  }

  function entriesFromResult(result = {}) {
    const out = [];
    for (const detail of result.details || []) {
      for (const change of detail?.changes || []) {
        const meta = recentMatches.get(keyOf(change.company, change.position)) || {};
        const entry = sanitizeEntry({
          at: result.at || Date.now(),
          company: change.company,
          position: change.position,
          oldStatus: change.from,
          newStatus: change.to,
          provider: detail.provider || meta.provider,
          checkMethod: detail.strategy || '',
          matchConfidence: meta.matchConfidence,
          matchMethod: meta.matchMethod,
          host: detail.host || meta.host
        });
        if (isRealChange(entry)) out.push(entry);
      }
    }
    return out;
  }

  async function read() {
    if (!globalThis.chrome?.storage?.local) return [];
    const stored = await chrome.storage.local.get([STORAGE_KEY]);
    return Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
  }

  async function append(entries = []) {
    const safe = entries.map(sanitizeEntry).filter(isRealChange);
    if (!safe.length) return [];
    if (!globalThis.chrome?.storage?.local) return safe;
    const previous = await read();
    const merged = [...previous, ...safe]
      .filter((x, i, all) => all.findIndex(y => y.at === x.at && y.company === x.company && y.position === x.position && y.oldStatus === x.oldStatus && y.newStatus === x.newStatus) === i)
      .slice(-MAX_ENTRIES);
    await chrome.storage.local.set({ [STORAGE_KEY]: merged });
    return safe;
  }

  async function appendFromResult(result = {}) {
    const entries = entriesFromResult(result);
    try { return await append(entries); }
    finally { recentMatches.clear(); }
  }

  function clearRecentMatches() { recentMatches.clear(); }

  async function clear() {
    recentMatches.clear();
    if (globalThis.chrome?.storage?.local) await chrome.storage.local.remove([STORAGE_KEY]);
  }

  return {
    STORAGE_KEY, MAX_ENTRIES, sanitizeEntry, isRealChange, rememberMatch, entriesFromResult,
    read, append, appendFromResult, clearRecentMatches, clear
  };
});
