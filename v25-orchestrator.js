(() => {
  'use strict';

  const Core = globalThis.OfferTrackFollowUpCore;
  const Matcher = globalThis.OfferTrackApplicationMatcher;
  const StateMachine = globalThis.OfferTrackStatusStateMachine;
  const Queue = globalThis.OfferTrackFollowUpQueue;
  const Journal = globalThis.OfferTrackChangeJournal;
  const CookieSession = globalThis.OfferTrackCookieSession;
  const Sessions = globalThis.OfferTrackSessionManager;
  const Providers = globalThis.OfferTrackProviderRegistry;
  const triggerAt = new Map();
  const LIKELY_RECRUIT_URL_RE = /(?:jobs?|career|careers|recruit|recruitment|campus|candidate|application|applications|apply|delivery|deliveries|zhiye|mokahr|feishu)/i;

  function installCoreGuards() {
    if (!Core || !Matcher || !StateMachine) return;

    Core.matchScanned = function(targets, scannedRecords) {
      const matches = Matcher.matchScanned(targets || [], scannedRecords || []);
      for (const match of matches) {
        if (match.scanned) Journal?.rememberMatch?.(match.target, match.scanned);
      }
      return matches;
    };

    Core.statusChanged = function(target, scanned) {
      if (!scanned) return false;
      const meta = scanned._offerTrackMatch || null;
      const decision = StateMachine.decide(target?.status, scanned?.status, {
        matchConfidence: meta ? Number(meta.confidence || 0) : 1,
        rawStatus: scanned?.rawStatus || ''
      });
      try { scanned._offerTrackStatusDecision = decision; } catch {}
      return !!decision.changed && !!decision.allowed;
    };
  }

  async function resolveKnownHost(inputHost) {
    const host = Queue?.normalizeHost ? Queue.normalizeHost(inputHost) : String(inputHost || '').toLowerCase().replace(/^\.+|^www\./, '');
    if (!host) return '';

    const jobs = Queue?.read ? await Queue.read().catch(() => []) : [];
    const job = jobs.find(x => x.host === host || host.endsWith(`.${x.host}`) || x.host.endsWith(`.${host}`));
    if (job?.host) return job.host;

    const state = Sessions?.state ? await Sessions.state().catch(() => null) : null;
    const entry = state?.entries?.find(x => x.host === host || host.endsWith(`.${x.host}`) || x.host.endsWith(`.${host}`));
    return entry?.host || '';
  }

  async function markPendingRecheck(host) {
    if (!host) return;
    if (Sessions?.markCookieChanged) {
      await Sessions.markCookieChanged(host).catch(() => null);
      return;
    }
    if (!Sessions?.STORAGE_KEY || !globalThis.chrome?.storage?.local) return;
    const key = Sessions.STORAGE_KEY;
    const stored = await chrome.storage.local.get([key]);
    const map = stored[key] && typeof stored[key] === 'object' ? stored[key] : {};
    const previous = map[host];
    if (!previous) return;
    map[host] = {
      ...previous,
      state: 'pending_recheck',
      label: '等待重新检查',
      reason: '浏览器会话证据已变化',
      cooldownUntil: 0,
      updatedAt: Date.now()
    };
    await chrome.storage.local.set({ [key]: map });
  }

  function recentlyTriggered(host, reason, gapMs) {
    const key = `${reason}:${host}`;
    const previous = Number(triggerAt.get(key) || 0);
    const now = Date.now();
    if (previous && now - previous < gapMs) return true;
    triggerAt.set(key, now);
    return false;
  }

  async function runHost(host, reason) {
    if (!Queue || !host) return null;
    const resetRetryCount = ['manual', 'cookie_change', 'page_open'].includes(String(reason || ''));
    const job = await Queue.enqueue({ host, reason, nextRunAt: Date.now(), ...(resetRetryCount ? { resetRetryCount: true } : {}) });
    const followUp = globalThis.OfferTrackFollowUp;
    if (!followUp?.run) return job;
    const state = await followUp.getState?.().catch(() => null);
    if (state?.running) return job;
    return Queue.withActiveJob(job, () => followUp.run(reason));
  }

  async function handleCookieChange(changeInfo) {
    if (!Queue || !CookieSession) return;
    const rawHost = CookieSession.changedCookieHost
      ? CookieSession.changedCookieHost(changeInfo)
      : CookieSession.changedHost?.(changeInfo);
    const host = await resolveKnownHost(rawHost);
    if (!host || recentlyTriggered(host, 'cookie_change', 30_000)) return;

    const session = Sessions?.get ? await Sessions.get(host).catch(() => null) : null;
    if (!session || !['login_required','challenge','rate_limited','error','pending_recheck'].includes(session.state)) return;

    await markPendingRecheck(host);
    await Queue.enqueue({ host, provider: session.providerName || '', reason: 'cookie_change', nextRunAt: Date.now() });
    await runHost(host, 'cookie_change');
  }

  function isLikelyRecruitmentUrl(url) {
    if (!/^https:\/\//i.test(String(url || ''))) return false;
    try {
      const info = Providers?.detect?.({ url });
      if (info?.id && info.id !== 'generic_web' && Number(info.score || 0) >= 16) return true;
    } catch {}
    return LIKELY_RECRUIT_URL_RE.test(String(url || ''));
  }

  async function ensurePageBridge(tabId, url) {
    if (!isLikelyRecruitmentUrl(url) || !chrome.scripting?.executeScript) return false;
    const alive = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_RECORDS' }).catch(() => null);
    if (alive?.ok) return true;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['company-identity.js', 'semantic.js', 'content.js', 'strategy-probe.js', 'followup-probe.js'],
      world: 'ISOLATED'
    });
    if (chrome.scripting?.insertCSS) {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] }).catch(() => {});
    }
    return true;
  }

  async function handlePageOpen(tabId, changeInfo, tab) {
    const url = changeInfo?.url || tab?.url || '';
    if (!/^https:\/\//i.test(url)) return;
    if (changeInfo?.status === 'complete' || changeInfo?.url) {
      await ensurePageBridge(tabId, url).catch(() => false);
    }
    if (changeInfo?.status !== 'complete') return;
    let rawHost = '';
    try { rawHost = new URL(url).hostname; } catch { return; }
    const host = await resolveKnownHost(rawHost);
    if (!host || recentlyTriggered(host, 'page_open', 30 * 60 * 1000)) return;

    const session = Sessions?.get ? await Sessions.get(host).catch(() => null) : null;
    if (!session) return;
    const stale = Date.now() - Number(session.lastCheckedAt || 0) > 30 * 60 * 1000;
    const unhealthy = session.state && session.state !== 'healthy';
    if (!stale && !unhealthy) return;
    await runHost(host, 'page_open');
  }

  async function handleQueueAlarm(alarm) {
    if (!Queue || alarm?.name !== Queue.QUEUE_ALARM) return;
    const job = await Queue.nextReady();
    if (!job?.host) return;
    await runHost(job.host, job.reason || 'retry');
  }

  function registerMessages() {
    if (!globalThis.chrome?.runtime?.onMessage) return;
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!['GET_FOLLOWUP_QUEUE_V2','CLEAR_FOLLOWUP_QUEUE_V2','GET_CHANGE_JOURNAL','CLEAR_CHANGE_JOURNAL','GET_COOKIE_SESSION_EVIDENCE'].includes(msg?.type)) return;
      (async () => {
        try {
          if (msg.type === 'GET_FOLLOWUP_QUEUE_V2') return sendResponse({ ok: true, jobs: await Queue.read() });
          if (msg.type === 'CLEAR_FOLLOWUP_QUEUE_V2') return sendResponse({ ok: true, jobs: await Queue.clear() });
          if (msg.type === 'GET_CHANGE_JOURNAL') return sendResponse({ ok: true, entries: await Journal.read() });
          if (msg.type === 'CLEAR_CHANGE_JOURNAL') { await Journal.clear(); return sendResponse({ ok: true, entries: [] }); }
          if (msg.type === 'GET_COOKIE_SESSION_EVIDENCE') {
            const host = await resolveKnownHost(msg.host || '');
            let evidence = CookieSession.summarize([]);
            if (host) {
              if (CookieSession.inspectUrls) evidence = await CookieSession.inspectUrls([`https://${host}/`]);
              else if (CookieSession.inspectHost) evidence = await CookieSession.inspectHost(host);
            }
            return sendResponse({ ok: true, host, evidence });
          }
        } catch (e) {
          sendResponse({ ok: false, error: e?.message || String(e) });
        }
      })();
      return true;
    });
  }

  installCoreGuards();
  registerMessages();
  chrome.cookies?.onChanged?.addListener(info => { handleCookieChange(info).catch(() => {}); });
  chrome.tabs?.onUpdated?.addListener((tabId, changeInfo, tab) => { handlePageOpen(tabId, changeInfo, tab).catch(() => {}); });
  chrome.alarms?.onAlarm?.addListener(alarm => { handleQueueAlarm(alarm).catch(() => {}); });

  globalThis.OfferTrackV25Orchestrator = {
    installCoreGuards,
    resolveKnownHost,
    markPendingRecheck,
    runHost,
    handleCookieChange,
    isLikelyRecruitmentUrl,
    ensurePageBridge,
    handlePageOpen,
    handleQueueAlarm
  };
})();
