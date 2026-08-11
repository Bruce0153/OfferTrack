(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackSessionManager = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const STORAGE_KEY = 'followUpSessionHealth';
  const MAX_ENTRIES = 120;
  const MAX_AGE_MS = 90 * 24 * 3600 * 1000;
  const ISSUE_STATES = new Set(['login_required', 'challenge', 'rate_limited', 'error']);

  const now = () => Date.now();
  const clean = (v, max = 240) => String(v || '').replace(/[\t\r\n\u00a0]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
  const normalizeHost = host => clean(host, 200).toLowerCase().replace(/^www\./, '');

  function safePageUrl(url) {
    try {
      const u = new URL(String(url || ''));
      const hash = u.hash && !/(token|auth|sign|ticket|code|key|credential)/i.test(u.hash) ? u.hash.split('?')[0] : '';
      return /^https:$/.test(u.protocol) ? `${u.origin}${u.pathname}${hash}`.slice(0, 500) : '';
    } catch { return ''; }
  }

  function deriveState(inspected = {}) {
    const status = String(inspected.status || '');
    if (status === 'ok' || status === 'empty') return 'healthy';
    if (status === 'login') return 'login_required';
    if (status === 'challenge') return 'challenge';
    if (status === 'rate_limited') return 'rate_limited';
    if (status === 'error') return 'error';
    return 'unknown';
  }

  function stateLabel(state) {
    return ({
      healthy: '健康',
      login_required: '需要登录',
      challenge: '需要验证',
      rate_limited: '访问受限',
      error: '检查异常',
      unknown: '未知'
    })[state] || '未知';
  }

  function cooldownFor(state, consecutiveFailures = 1) {
    if (state === 'login_required') return 12 * 3600 * 1000;
    if (state === 'challenge') return 2 * 3600 * 1000;
    if (state === 'rate_limited') return 6 * 3600 * 1000;
    if (state === 'error' && consecutiveFailures >= 3) return 60 * 60 * 1000;
    return 0;
  }

  function issueReason(inspected = {}, state = deriveState(inspected)) {
    const raw = clean(inspected.error || inspected.reason || '', 320);
    if (raw) return raw;
    return ({
      login_required: '招聘网站要求重新登录',
      challenge: '招聘网站要求安全验证',
      rate_limited: '招聘网站暂时限制访问',
      error: '招聘网站检查异常'
    })[state] || '';
  }

  function shouldSkipEntry(entry, { source = 'alarm', hasOpenTab = false, at = now() } = {}) {
    if (!entry || !ISSUE_STATES.has(entry.state)) return { skip: false };
    if (source === 'manual' || hasOpenTab) return { skip: false, bypassed: true };
    const until = Number(entry.cooldownUntil || 0);
    if (!until || at >= until) return { skip: false };
    return {
      skip: true,
      state: entry.state,
      label: stateLabel(entry.state),
      reason: clean(entry.reason, 320),
      cooldownUntil: until
    };
  }

  async function readMap() {
    if (!globalThis.chrome?.storage?.local) return {};
    const stored = await chrome.storage.local.get([STORAGE_KEY]);
    return stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === 'object' ? stored[STORAGE_KEY] : {};
  }

  function pruneMap(input, at = now()) {
    const rows = Object.entries(input || {})
      .filter(([host, entry]) => host && entry && at - Number(entry.lastCheckedAt || entry.updatedAt || 0) <= MAX_AGE_MS)
      .sort((a, b) => Number(b[1].lastCheckedAt || b[1].updatedAt || 0) - Number(a[1].lastCheckedAt || a[1].updatedAt || 0))
      .slice(0, MAX_ENTRIES);
    return Object.fromEntries(rows);
  }

  async function writeMap(map) {
    if (!globalThis.chrome?.storage?.local) return;
    await chrome.storage.local.set({ [STORAGE_KEY]: pruneMap(map) });
  }

  async function get(host) {
    const map = await readMap();
    return map[normalizeHost(host)] || null;
  }

  async function shouldSkip(group, opts = {}) {
    const host = normalizeHost(group?.host || group);
    if (!host) return { skip: false };
    return shouldSkipEntry(await get(host), opts);
  }

  async function record(group, inspected = {}, source = 'alarm') {
    const host = normalizeHost(group?.host || inspected.host || '');
    if (!host) return { transition: false, issue: false, entry: null };
    const map = await readMap();
    const previous = map[host] || null;
    const state = deriveState(inspected);
    if (state === 'unknown') return { transition: false, issue: false, entry: previous };

    const at = now();
    const failed = ISSUE_STATES.has(state);
    const consecutiveFailures = failed ? (previous?.state === state ? Number(previous.consecutiveFailures || 0) + 1 : 1) : 0;
    const cooldownMs = cooldownFor(state, consecutiveFailures);
    const entry = {
      host,
      providerId: clean(group?.providerId || group?.provider?.id || '', 80),
      providerName: clean(group?.providerName || group?.provider?.name || '', 100),
      state,
      label: stateLabel(state),
      reason: failed ? issueReason(inspected, state) : '',
      source: clean(source, 40),
      strategy: clean(inspected.strategy || '', 60),
      lastUrl: safePageUrl(inspected.page?.url || group?.url || ''),
      lastCheckedAt: at,
      lastHealthyAt: state === 'healthy' ? at : Number(previous?.lastHealthyAt || 0),
      lastFailureAt: failed ? at : Number(previous?.lastFailureAt || 0),
      consecutiveFailures,
      cooldownUntil: cooldownMs ? at + cooldownMs : 0,
      updatedAt: at
    };
    map[host] = entry;
    await writeMap(map);
    const transition = previous?.state !== state;
    const previousFailures = Number(previous?.consecutiveFailures || 0);
    const actionableError = state === 'error' && consecutiveFailures >= 3 && previousFailures < 3;
    const issue = failed && ((state !== 'error' && transition) || actionableError);
    return { transition, issue, recovered: state === 'healthy' && previous && ISSUE_STATES.has(previous.state), previous, entry };
  }

  function summarizeMap(map) {
    const entries = Object.values(pruneMap(map || {}));
    const counts = { total: entries.length, healthy: 0, loginRequired: 0, challenge: 0, rateLimited: 0, error: 0, unknown: 0 };
    for (const e of entries) {
      if (e.state === 'healthy') counts.healthy++;
      else if (e.state === 'login_required') counts.loginRequired++;
      else if (e.state === 'challenge') counts.challenge++;
      else if (e.state === 'rate_limited') counts.rateLimited++;
      else if (e.state === 'error') counts.error++;
      else counts.unknown++;
    }
    return counts;
  }

  async function state() {
    const map = pruneMap(await readMap());
    const entries = Object.values(map).sort((a, b) => Number(b.lastCheckedAt || 0) - Number(a.lastCheckedAt || 0));
    return { entries, summary: summarizeMap(map) };
  }

  async function clear(host = '') {
    const map = await readMap();
    const key = normalizeHost(host);
    if (key) delete map[key];
    else {
      for (const k of Object.keys(map)) delete map[k];
    }
    await writeMap(map);
    return state();
  }

  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type !== 'GET_SESSION_HEALTH' && msg?.type !== 'CLEAR_SESSION_HEALTH') return;
      (async () => {
        try {
          const result = msg.type === 'CLEAR_SESSION_HEALTH' ? await clear(msg.host || '') : await state();
          sendResponse({ ok: true, ...result });
        } catch (e) {
          sendResponse({ ok: false, error: e?.message || String(e), entries: [], summary: summarizeMap({}) });
        }
      })();
      return true;
    });
  }

  return {
    STORAGE_KEY,
    ISSUE_STATES,
    normalizeHost,
    deriveState,
    stateLabel,
    cooldownFor,
    shouldSkipEntry,
    pruneMap,
    summarizeMap,
    get,
    shouldSkip,
    record,
    state,
    clear
  };
});