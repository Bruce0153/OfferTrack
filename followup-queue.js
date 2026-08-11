(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackFollowUpQueue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const STORAGE_KEY = 'followUpJobQueueV2';
  const MAX_JOBS = 120;
  const MAX_RETRIES = 4;
  const PRIORITY = Object.freeze({ manual: 100, cookie_change: 90, page_open: 70, alarm: 50, retry: 40, unknown: 30 });
  let activeJob = null;
  let memory = [];

  const clean = (v, max = 180) => String(v || '').replace(/[\t\r\n\u00a0]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
  const normalizeHost = host => clean(host, 180).toLowerCase().replace(/^\.+|^www\./, '');

  function reasonKey(reason) {
    const r = clean(reason, 60).toLowerCase();
    if (r.includes('manual')) return 'manual';
    if (r.includes('cookie')) return 'cookie_change';
    if (r.includes('page')) return 'page_open';
    if (r.includes('alarm')) return 'alarm';
    if (r.includes('retry')) return 'retry';
    return 'unknown';
  }

  function priorityFor(reason) { return PRIORITY[reasonKey(reason)] || PRIORITY.unknown; }

  function backoffMs(retryCount) {
    const n = Math.max(1, Number(retryCount || 1));
    return Math.min(6 * 3600 * 1000, 5 * 60 * 1000 * (2 ** Math.min(6, n - 1)));
  }

  function jobId(host) { return `host:${normalizeHost(host) || 'all'}`; }

  function normalizeJob(input = {}) {
    const host = normalizeHost(input.host);
    const reason = reasonKey(input.reason || 'unknown');
    const applications = Array.isArray(input.applications) ? input.applications.map(x => clean(x?.recordId || x?.record_id || x, 120)).filter(Boolean).slice(0, 80) : [];
    return {
      id: jobId(host),
      host,
      provider: clean(input.provider || input.providerName || '', 100),
      applications: [...new Set(applications)],
      priority: Math.max(Number(input.priority || 0), priorityFor(reason)),
      retryCount: Math.max(0, Number(input.retryCount || 0)),
      nextRunAt: Math.max(0, Number(input.nextRunAt || Date.now())),
      lastResult: input.lastResult && typeof input.lastResult === 'object' ? {
        status: clean(input.lastResult.status, 60),
        checked: Number(input.lastResult.checked || 0),
        changed: Number(input.lastResult.changed || 0),
        failed: Number(input.lastResult.failed || 0),
        at: Number(input.lastResult.at || Date.now())
      } : null,
      reason,
      updatedAt: Number(input.updatedAt || Date.now())
    };
  }

  function mergeJobs(a, b) {
    const A = normalizeJob(a), B = normalizeJob(b);
    if (A.id !== B.id) return B;
    return normalizeJob({
      ...A,
      ...B,
      applications: [...new Set([...A.applications, ...B.applications])],
      priority: Math.max(A.priority, B.priority),
      retryCount: Math.min(A.retryCount, B.retryCount),
      nextRunAt: Math.min(A.nextRunAt || Infinity, B.nextRunAt || Infinity),
      reason: B.priority >= A.priority ? B.reason : A.reason,
      updatedAt: Date.now()
    });
  }

  function sortJobs(jobs = [], at = Date.now()) {
    return jobs.map(normalizeJob).sort((a, b) => {
      const ar = a.nextRunAt <= at ? 0 : 1, br = b.nextRunAt <= at ? 0 : 1;
      return ar - br || b.priority - a.priority || a.nextRunAt - b.nextRunAt || a.host.localeCompare(b.host);
    });
  }

  async function read() {
    if (!globalThis.chrome?.storage?.local) return memory.slice();
    const stored = await chrome.storage.local.get([STORAGE_KEY]);
    const jobs = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
    memory = sortJobs(jobs).slice(0, MAX_JOBS);
    return memory.slice();
  }

  async function write(jobs) {
    memory = sortJobs(jobs).slice(0, MAX_JOBS);
    if (globalThis.chrome?.storage?.local) await chrome.storage.local.set({ [STORAGE_KEY]: memory });
    return memory.slice();
  }

  async function enqueue(input = {}) {
    const incoming = normalizeJob(input);
    const jobs = await read();
    const idx = jobs.findIndex(x => x.id === incoming.id);
    if (idx >= 0) jobs[idx] = mergeJobs(jobs[idx], incoming);
    else jobs.push(incoming);
    await write(jobs);
    return incoming;
  }

  async function knownHost(host) {
    const key = normalizeHost(host);
    if (!key) return false;
    const jobs = await read();
    return jobs.some(x => x.host === key);
  }

  function setActiveJob(job) { activeJob = job ? normalizeJob(job) : null; return activeJob; }
  function getActiveJob() { return activeJob; }
  function clearActiveJob() { activeJob = null; }

  function selectGroups(groups = [], cfg = {}, source = 'alarm') {
    const limit = Math.min(30, Math.max(1, Number(cfg.followUpMaxSitesPerRun || 12)));
    let out = [...groups];
    if (activeJob?.host) out = out.filter(g => normalizeHost(g.host) === activeJob.host);
    const reasonPriority = priorityFor(source);
    out.sort((a, b) => {
      const ah = normalizeHost(a.host), bh = normalizeHost(b.host);
      const aj = memory.find(j => j.host === ah), bj = memory.find(j => j.host === bh);
      return (bj?.priority || reasonPriority) - (aj?.priority || reasonPriority) || ah.localeCompare(bh);
    });
    return out.slice(0, limit);
  }

  async function markRunning(group, source = 'alarm') {
    const host = normalizeHost(group?.host);
    if (!host) return null;
    const job = await enqueue({
      host,
      provider: group?.providerName || group?.provider?.name || '',
      applications: (group?.records || []).map(r => r.recordId),
      reason: activeJob?.reason || source,
      retryCount: activeJob?.retryCount || 0,
      nextRunAt: Date.now()
    });
    return job;
  }

  function shouldRetry(inspected = {}, patchResult = {}) {
    const status = String(inspected?.status || '');
    if (['login','challenge','rate_limited','session_paused'].includes(status)) return false;
    if (status === 'waiting') return false;
    return status === 'error' || Number(patchResult?.failed || 0) > 0;
  }

  async function completeGroup(group, inspected = {}, patchResult = {}) {
    const host = normalizeHost(group?.host);
    if (!host) return;
    const jobs = await read();
    const idx = jobs.findIndex(x => x.host === host);
    const current = idx >= 0 ? jobs[idx] : normalizeJob({ host, reason: activeJob?.reason || 'unknown' });
    if (shouldRetry(inspected, patchResult) && current.retryCount < MAX_RETRIES) {
      const retryCount = current.retryCount + 1;
      const next = normalizeJob({
        ...current,
        reason: 'retry',
        priority: PRIORITY.retry,
        retryCount,
        nextRunAt: Date.now() + backoffMs(retryCount),
        lastResult: { status: inspected?.status || 'error', checked: patchResult.checked, changed: patchResult.changed, failed: patchResult.failed || 1, at: Date.now() }
      });
      if (idx >= 0) jobs[idx] = next; else jobs.push(next);
    } else {
      if (idx >= 0) jobs.splice(idx, 1);
    }
    await write(jobs);
  }

  async function nextReady(at = Date.now()) {
    const jobs = sortJobs(await read(), at);
    return jobs.find(j => j.nextRunAt <= at) || null;
  }

  async function withActiveJob(job, fn) {
    const previous = activeJob;
    setActiveJob(job);
    try { return await fn(); }
    finally { activeJob = previous; }
  }

  async function clear() { return write([]); }

  return {
    STORAGE_KEY, MAX_JOBS, MAX_RETRIES, PRIORITY,
    normalizeHost, reasonKey, priorityFor, backoffMs, normalizeJob, mergeJobs, sortJobs,
    read, write, enqueue, knownHost, setActiveJob, getActiveJob, clearActiveJob,
    selectGroups, markRunning, shouldRetry, completeGroup, nextReady, withActiveJob, clear
  };
});
