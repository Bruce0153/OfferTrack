(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackFollowUpReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const STORAGE_KEY = 'followUpReview';
  const LEGACY_STORAGE_KEYS = Object.freeze(['followUpReviewV26']);
  let migrationPromise = null;
  const MAX_ENTRIES = 30;
  const TTL_MS = 14 * 24 * 60 * 60 * 1000;
  const MIN_REVIEW_CONFIDENCE = 0.68;
  const REASONS = Object.freeze({
    AMBIGUOUS_MATCH: '发现多个相近岗位',
    LOW_CONFIDENCE: '岗位匹配置信度不足',
    TERMINAL_REVIEW: '检测到结束/撤回状态，需要确认'
  });

  const clean = (v, max = 180) => String(v || '').replace(/[\t\r\n\u00a0]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
  const clamp = v => Math.max(0, Math.min(1, Number(v || 0)));

  function sanitize(input = {}) {
    const createdAt = Number(input.createdAt || Date.now());
    const reasonCode = REASONS[input.reasonCode] ? input.reasonCode : 'LOW_CONFIDENCE';
    return {
      id: clean(input.id || `${createdAt}-${Math.random().toString(36).slice(2, 8)}`, 120),
      key: clean(input.key || `${input.recordId || ''}|${reasonCode}`, 180),
      recordId: clean(input.recordId, 120),
      host: clean(input.host, 180).toLowerCase().replace(/^www\./, ''),
      provider: clean(input.provider, 100),
      company: clean(input.company, 120),
      position: clean(input.position, 160),
      currentStatus: clean(input.currentStatus, 80),
      detectedStatus: clean(input.detectedStatus, 80),
      rawStatus: clean(input.rawStatus, 160),
      candidateCompany: clean(input.candidateCompany, 120),
      candidatePosition: clean(input.candidatePosition, 160),
      matchMethod: clean(input.matchMethod, 80),
      confidence: clamp(input.confidence),
      reasonCode,
      createdAt,
      updatedAt: Number(input.updatedAt || Date.now())
    };
  }

  function prune(items = [], at = Date.now()) {
    const minAt = at - TTL_MS;
    const seen = new Set();
    return (items || [])
      .map(sanitize)
      .filter(x => x.recordId && x.createdAt >= minAt)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter(x => !seen.has(x.key) && seen.add(x.key))
      .slice(0, MAX_ENTRIES);
  }

  async function ensureStorageMigration() {
    if (!globalThis.chrome?.storage?.local) return;
    if (migrationPromise) return migrationPromise;
    migrationPromise = (async () => {
      const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
      const stored = await chrome.storage.local.get(keys);
      if (!Array.isArray(stored[STORAGE_KEY])) {
        const legacy = LEGACY_STORAGE_KEYS.map(k => stored[k]).find(Array.isArray);
        if (legacy) await chrome.storage.local.set({ [STORAGE_KEY]: prune(legacy) });
      }
      await chrome.storage.local.remove(LEGACY_STORAGE_KEYS);
    })();
    return migrationPromise;
  }

  async function read() {
    if (!globalThis.chrome?.storage?.local) return [];
    await ensureStorageMigration();
    const stored = await chrome.storage.local.get([STORAGE_KEY]);
    const safe = prune(Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : []);
    await chrome.storage.local.set({ [STORAGE_KEY]: safe });
    return safe;
  }

  async function write(items) {
    const safe = prune(items);
    if (globalThis.chrome?.storage?.local) { await ensureStorageMigration(); await chrome.storage.local.set({ [STORAGE_KEY]: safe }); }
    return safe;
  }

  async function add(input = {}) {
    const item = sanitize(input);
    if (!item.recordId) return null;
    if (item.reasonCode !== 'TERMINAL_REVIEW' && item.confidence < MIN_REVIEW_CONFIDENCE) return null;
    const items = await read();
    const idx = items.findIndex(x => x.key === item.key);
    if (idx >= 0) items[idx] = sanitize({ ...items[idx], ...item, id: items[idx].id, createdAt: items[idx].createdAt, updatedAt: Date.now() });
    else items.unshift(item);
    await write(items);
    return idx >= 0 ? items[idx] : item;
  }

  async function get(id) { return (await read()).find(x => x.id === clean(id, 120)) || null; }

  async function remove(id) {
    const key = clean(id, 120);
    const items = (await read()).filter(x => x.id !== key);
    await write(items);
    return items;
  }

  async function removeForRecord(recordId) {
    const rid = clean(recordId, 120);
    if (!rid) return read();
    return write((await read()).filter(x => x.recordId !== rid));
  }

  async function retainRecordIds(recordIds = []) {
    const allowed = new Set((recordIds || []).map(x => clean(x, 120)).filter(Boolean));
    return write((await read()).filter(x => allowed.has(x.recordId)));
  }

  async function clear() {
    if (globalThis.chrome?.storage?.local) { await ensureStorageMigration(); await chrome.storage.local.remove([STORAGE_KEY, ...LEGACY_STORAGE_KEYS]); }
    return [];
  }

  function labelFor(reasonCode) { return REASONS[reasonCode] || '需要人工确认'; }

  return {
    STORAGE_KEY, LEGACY_STORAGE_KEYS, MAX_ENTRIES, TTL_MS, MIN_REVIEW_CONFIDENCE, REASONS,
    sanitize, prune, read, write, add, get, remove, removeForRecord, retainRecordIds, clear, labelFor
  };
});
