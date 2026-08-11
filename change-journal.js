(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackChangeJournal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const STORAGE_KEY = 'followUpChangeJournal';
  const MAX_ENTRIES = 300;
  let staged = [];

  const clean = (v, max = 180) => String(v || '').replace(/[\t\r\n\u00a0]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);

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

  function stage(input = {}) {
    const target = input.target || {};
    const scanned = input.scanned || {};
    const decision = input.decision || {};
    const match = scanned._offerTrackMatch || input.match || {};
    const entry = sanitizeEntry({
      company: target.company,
      position: target.position,
      oldStatus: decision.from || target.status,
      newStatus: decision.to || scanned.status,
      matchConfidence: match.confidence || input.matchConfidence,
      matchMethod: match.method || input.matchMethod,
      host: hostOf(target.url || scanned.url),
      provider: target.platform || '',
      checkMethod: ''
    });
    if (decision.allowed && decision.changed && isRealChange(entry)) staged.push(entry);
    if (staged.length > 100) staged = staged.slice(-100);
    return entry;
  }

  function enrichFromResult(entry, result = {}) {
    const detail = (result.details || []).find(d => d && entry.host && d.host === entry.host) ||
      (result.details || []).find(d => Array.isArray(d?.changes) && d.changes.some(c => c.position === entry.position && c.from === entry.oldStatus && c.to === entry.newStatus));
    return sanitizeEntry({
      ...entry,
      provider: detail?.provider || entry.provider,
      checkMethod: detail?.strategy || entry.checkMethod
    });
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

  async function flush(result = {}) {
    const pending = staged;
    staged = [];
    if (!pending.length) return [];
    return append(pending.map(x => enrichFromResult(x, result)));
  }

  function clearStaged() { staged = []; }

  async function clear() {
    staged = [];
    if (globalThis.chrome?.storage?.local) await chrome.storage.local.remove([STORAGE_KEY]);
  }

  return { STORAGE_KEY, MAX_ENTRIES, sanitizeEntry, isRealChange, stage, enrichFromResult, read, append, flush, clearStaged, clear };
});
