(() => {
  'use strict';

  const Core = globalThis.OfferTrackFollowUpCore;
  const Providers = globalThis.OfferTrackProviderRegistry;
  const ApplicationData = globalThis.OfferTrackApplicationData;
  const Strategy = globalThis.OfferTrackFollowUpStrategy;
  const Sessions = globalThis.OfferTrackSessionManager;
  const CookieSession = globalThis.OfferTrackCookieSession;
  const ALARM = 'offertrack-follow-up';
  const LEASE_MS = 20 * 60 * 1000;
  const FOLLOWUP_FIELDS = ['自动跟进','最后检查时间','状态更新时间','检查状态','登录状态','最近错误','招聘系统','检查方式'];
  let runningPromise = null;

  function normalizedSettings(input = {}) {
    return {
      followUpEnabled: !!input.followUpEnabled,
      followUpIntervalHours: Math.min(72, Math.max(1, Number(input.followUpIntervalHours || 6))),
      followUpMode: input.followUpMode === 'background_tabs' ? 'background_tabs' : 'open_tabs',
      followUpMaxSitesPerRun: Math.min(30, Math.max(1, Number(input.followUpMaxSitesPerRun || 12))),
      followUpIncludeTerminal: !!input.followUpIncludeTerminal,
      followUpNotify: input.followUpNotify !== false,
      followUpNotifySessionIssues: input.followUpNotifySessionIssues !== false,
      followUpApiFirst: input.followUpApiFirst !== false,
      followUpCookiePreflight: input.followUpCookiePreflight !== false,
      followUpStructuredState: input.followUpStructuredState !== false,
      followUpApiTimeoutSeconds: Math.min(15, Math.max(3, Number(input.followUpApiTimeoutSeconds || 6))),
      followUpTabTimeoutSeconds: Math.min(60, Math.max(8, Number(input.followUpTabTimeoutSeconds || 25)))
    };
  }

  async function configure(input = null) {
    if (!chrome.alarms) return { enabled: false, nextAt: 0, message: '当前浏览器不支持 alarms API' };
    const raw = input || await getSettings();
    const cfg = normalizedSettings(raw);
    if (!cfg.followUpEnabled) {
      await chrome.alarms.clear(ALARM).catch(() => false);
      return { enabled: false, nextAt: 0, intervalHours: cfg.followUpIntervalHours };
    }
    const periodInMinutes = cfg.followUpIntervalHours * 60;
    const old = await chrome.alarms.get(ALARM).catch(() => null);
    if (!old || Math.abs(Number(old.periodInMinutes || 0) - periodInMinutes) > 0.01) {
      await chrome.alarms.create(ALARM, { delayInMinutes: periodInMinutes, periodInMinutes });
    }
    const alarm = await chrome.alarms.get(ALARM).catch(() => null);
    return { enabled: true, intervalHours: cfg.followUpIntervalHours, nextAt: Number(alarm?.scheduledTime || 0) };
  }

  async function getState() {
    const raw = await getSettings();
    const cfg = normalizedSettings(raw);
    const alarm = chrome.alarms ? await chrome.alarms.get(ALARM).catch(() => null) : null;
    const stored = await chrome.storage.local.get(['lastFollowUp', 'followUpLease']);
    const leaseRunning = stored.followUpLease?.status === 'running' && Date.now() - Number(stored.followUpLease?.startedAt || 0) < LEASE_MS;
    return {
      enabled: cfg.followUpEnabled,
      mode: cfg.followUpMode,
      intervalHours: cfg.followUpIntervalHours,
      nextAt: Number(alarm?.scheduledTime || 0),
      running: !!runningPromise || leaseRunning,
      lastFollowUp: stored.lastFollowUp || null
    };
  }

  async function acquireLease(source) {
    const now = Date.now();
    const { followUpLease } = await chrome.storage.local.get(['followUpLease']);
    if (followUpLease?.status === 'running' && now - Number(followUpLease.startedAt || 0) < LEASE_MS) return false;
    await chrome.storage.local.set({ followUpLease: { status: 'running', source, startedAt: now } });
    return true;
  }

  async function releaseLease(result = null) {
    await chrome.storage.local.set({ followUpLease: { status: 'idle', finishedAt: Date.now(), result: result ? {
      checked: result.checked || 0, changed: result.changed || 0, failed: result.failed || 0
    } : null } });
  }

  async function run(source = 'manual') {
    if (runningPromise) return runningPromise;
    runningPromise = (async () => {
      const leased = await acquireLease(source);
      if (!leased) return { message: '已有自动跟进任务正在运行', skippedRun: true, checked: 0, changed: 0, failed: 0 };
      try {
        const result = await execute(source);
        await releaseLease(result);
        return result;
      } catch (e) {
        globalThis.OfferTrackChangeJournal?.clearRecentMatches?.();
        const failState = { source, at: Date.now(), ok: false, message: friendlyError(e), checked: 0, changed: 0, failed: 1 };
        await chrome.storage.local.set({ lastFollowUp: failState });
        await releaseLease(failState);
        throw e;
      } finally {
        runningPromise = null;
      }
    })();
    return runningPromise;
  }

  async function ensureFollowUpFields(settings, token) {
    const fields = await listFields(settings, token);
    const names = new Set(fields.map(f => f.field_name));
    for (const name of FOLLOWUP_FIELDS) {
      if (names.has(name)) continue;
      await feishuRequest(settings, token,
        `/bitable/v1/apps/${encodeURIComponent(settings.appToken)}/tables/${encodeURIComponent(settings.tableId)}/fields`,
        { method: 'POST', body: { field_name: name, type: 1 } }
      );
      names.add(name);
    }
  }

  async function execute(source) {
    const settings = await prepareStoredSettings();
    validateSettings(settings);
    const cfg = normalizedSettings(settings);
    if (source === 'alarm' && !cfg.followUpEnabled) return { message: '自动跟进已关闭', checked: 0, changed: 0, failed: 0, at: Date.now(), source };

    const token = await getTenantToken(settings);
    await ensureFields(settings);
    await ensureFollowUpFields(settings, token);
    const existing = await listAllRecords(settings, token);
    const targets = Core.selectTargets(existing, cfg);
    const rawGroups = Core.groupTargets(targets);
    const allGroups = Providers?.enrichGroups ? Providers.enrichGroups(rawGroups, Core) : rawGroups;
    // Session health shown in the UI must represent current follow-up sites only.
    // This also removes stale/orphan entries left by older builds.
    await Sessions?.retainHosts?.(allGroups.map(group => group.host)).catch(() => null);
    const groups = globalThis.OfferTrackFollowUpQueue?.selectGroups
      ? globalThis.OfferTrackFollowUpQueue.selectGroups(allGroups, cfg, source)
      : allGroups.slice(0, cfg.followUpMaxSitesPerRun);

    const result = {
      ok: true, source, mode: cfg.followUpMode, at: Date.now(),
      totalRecords: targets.length, totalSites: allGroups.length, scheduledSites: groups.length,
      providers: Providers?.summarize ? Providers.summarize(allGroups) : [],
      strategyStats: {},
      cookieStats: { strong: 0, possible: 0, weak: 0, none: 0, unavailable: 0 },
      checked: 0, changed: 0, failed: 0, loginRequired: 0, sessionBlocked: 0, waiting: 0, unmatched: 0, details: [], sessionIssues: []
    };

    for (const group of groups) {
      await globalThis.OfferTrackFollowUpQueue?.markRunning?.(group, source).catch(() => null);
      const inspected = await inspectGroup(group, cfg, source).catch(err => ({ host: group.host, provider: group.provider, status: 'error', error: err?.message || String(err), records: [], page: null }));
      if (inspected?.strategy) result.strategyStats[inspected.strategy] = (result.strategyStats[inspected.strategy] || 0) + 1;
      const cookieEvidence = group._cookieEvidence || null;
      if (cookieEvidence) {
        const level = cookieEvidence.available === false ? 'unavailable' : (cookieEvidence.level || 'weak');
        if (result.cookieStats[level] != null) result.cookieStats[level] += 1;
      }
      const sessionEvent = Sessions?.record ? await Sessions.record(group, { ...inspected, cookieEvidence }, source).catch(() => null) : null;
      if (sessionEvent?.issue) result.sessionIssues.push({ host: group.host, provider: group.providerName || group.provider?.name || '', state: sessionEvent.entry?.state || '', label: sessionEvent.entry?.label || '', reason: sessionEvent.entry?.reason || '', url: sessionEvent.entry?.lastUrl || group.url });
      const patchResult = await applyGroupResult(settings, token, group, inspected);
      for (const k of ['checked','changed','failed','loginRequired','sessionBlocked','waiting','unmatched']) result[k] += patchResult[k] || 0;
      if (patchResult.detail) result.details.push(patchResult.detail);
      await globalThis.OfferTrackFollowUpQueue?.completeGroup?.(group, inspected, patchResult).catch(() => null);
      await sleep(250);
    }

    if (allGroups.length > groups.length) result.details.push({ host: '', status: 'limited', message: `本轮按设置只检查前 ${groups.length}/${allGroups.length} 个招聘网站` });
    result.sessionHealth = Sessions?.state ? (await Sessions.state().catch(() => null))?.summary || null : null;
    result.message = `自动跟进完成：检查 ${result.checked} 条，状态变化 ${result.changed}，待登录 ${result.loginRequired}，需验证/受限 ${result.sessionBlocked}，失败 ${result.failed}`;
    await globalThis.OfferTrackChangeJournal?.appendFromResult?.(result).catch(() => []);
    await chrome.storage.local.set({ lastFollowUp: result });
    if (cfg.followUpNotify && result.changed > 0) await notifyChanges(result);
    if (cfg.followUpNotifySessionIssues && result.sessionIssues.length) await notifySessionIssues(result);
    await configure(settings);
    return result;
  }

  async function inspectGroup(group, cfg, source = 'manual') {
    const cookieEvidence = cfg.followUpCookiePreflight && CookieSession?.inspectGroup
      ? await CookieSession.inspectGroup(group).catch(() => ({ available: false, level: 'unavailable', checkedAt: Date.now() }))
      : { available: false, level: 'unavailable', checkedAt: Date.now() };
    group._cookieEvidence = cookieEvidence;
    const apiSessionLikely = cookieEvidence.available === false || cookieEvidence.level !== 'none';
    let tab = await findBestOpenTab(group);
    const sessionDecision = Sessions?.shouldSkip ? await Sessions.shouldSkip(group, { source, hasOpenTab: !!tab, cookieEvidence }).catch(() => ({ skip: false })) : { skip: false };
    if (sessionDecision?.skip) {
      return { host: group.host, provider: group.provider, status: 'session_paused', sessionState: sessionDecision.state, error: `${sessionDecision.label || '会话异常'}，已暂停自动重试至 ${formatLocalTime(sessionDecision.cooldownUntil)}`, records: [], page: { url: group.url } };
    }

    // 1) 若之前已经学到过“安全、无敏感参数、且成功返回投递数据”的 GET API，先尝试无页面检查。
    if (cfg.followUpApiFirst && apiSessionLikely && group.capabilities?.apiDirect && group.strategies?.includes('api_get')) {
      const cached = await loadApiHints(group);
      if (cached.length) {
        const cachedResult = await tryApiCandidates(group, cfg, cached, group.url, true);
        if (cachedResult?.status === 'ok') return cachedResult;
      }
    }

    let createdTab = false;
    if (!tab && cfg.followUpMode === 'background_tabs') {
      tab = await chrome.tabs.create({ url: group.url, active: false });
      createdTab = true;
    }
    if (!tab) return { host: group.host, provider: group.provider, status: 'waiting', error: '没有找到已打开的招聘网站页面，且没有可复用的安全 API', records: [], page: null };

    try {
      if (createdTab) await waitForTabLoad(tab.id, cfg.followUpTabTimeoutSeconds * 1000);
      const latestTab = await chrome.tabs.get(tab.id).catch(() => tab);
      const finalUrl = latestTab?.url || tab.url || group.url;
      if (/\/(?:login|signin|sign-in)(?:[/?#]|$)|(?:login|signin)=/i.test(finalUrl || '')) {
        return { host: group.host, provider: group.provider, status: 'login', error: '招聘网站登录状态已失效', records: [], page: { url: finalUrl } };
      }

      const earlyProbe = await sendTabMessage(tab.id, { type: 'PROBE_PAGE' }).catch(() => null);
      if (earlyProbe?.loginRequired) return { host: group.host, provider: group.provider, status: 'login', error: earlyProbe.reason || '招聘网站要求重新登录', records: [], page: { url: finalUrl } };
      if (earlyProbe?.rateLimited) return { host: group.host, provider: group.provider, status: 'rate_limited', error: earlyProbe.reason || '招聘网站暂时限制访问', records: [], page: { url: finalUrl } };
      if (earlyProbe?.challenge) return { host: group.host, provider: group.provider, status: 'challenge', error: earlyProbe.reason || '招聘网站要求安全验证', records: [], page: { url: finalUrl } };

      // 2) 先只收集“只读探针”：页面 JSON script + Resource Timing URL，不执行页面代码；Cookie 仅由后台会话证据层做摘要，不读取/保存值。
      const strategyProbe = await collectStrategyProbe(tab.id);

      // 3) API GET：只尝试同源、明显属于投递/申请查询、且不含 create/update/delete/withdraw 等动作词的 URL。
      if (cfg.followUpApiFirst && apiSessionLikely && group.capabilities?.apiDirect && group.strategies?.includes('api_get')) {
        const apiResult = await tryApiCandidates(group, cfg, strategyProbe?.resources || [], finalUrl, false);
        if (apiResult?.status === 'ok') return apiResult;
      }

      // 4) Structured State：读取 script JSON 与少量 MAIN-world 常见 SSR/Store 全局变量；全部做有界净化，不 eval。
      if (cfg.followUpStructuredState && group.capabilities?.structuredState && group.strategies?.includes('structured_state') && ApplicationData?.extractRecords) {
        // First use compact JSON already present in the DOM. Only enter MAIN world if that evidence is insufficient.
        // This avoids cloning large framework stores on every check.
        const domSnapshots = (strategyProbe?.jsonSnapshots || []).map(x => x?.data).filter(x => x != null).slice(0, 12);
        let structuredRecords = [];
        if (domSnapshots.length) {
          structuredRecords = ApplicationData.extractRecords(domSnapshots, group.records, { maxNodes: 2800, maxDepth: 7 });
          const records = enrichStrategyRecords(structuredRecords, group, finalUrl);
          const useful = Strategy?.isUseful ? Strategy.isUseful(group.records, records, Core, 0.8) : { ok: records.length > 0 };
          if (useful.ok) {
            return { host: group.host, provider: group.provider, status: 'ok', strategy: 'structured_state', records, page: { url: finalUrl, title: strategyProbe?.page?.title || '' }, evidence: { matched: useful.matched, total: useful.total, source: 'dom-json' } };
          }
        }

        const mainSnapshots = await collectMainWorldSnapshot(tab.id);
        if (mainSnapshots.length) {
          const mainRecords = ApplicationData.extractRecords(mainSnapshots.map(x => x.data).filter(Boolean), group.records, { maxNodes: 2200, maxDepth: 6 });
          const records = enrichStrategyRecords([...structuredRecords, ...mainRecords], group, finalUrl);
          const useful = Strategy?.isUseful ? Strategy.isUseful(group.records, records, Core, 0.8) : { ok: records.length > 0 };
          if (useful.ok) {
            return { host: group.host, provider: group.provider, status: 'ok', strategy: 'structured_state', records, page: { url: finalUrl, title: strategyProbe?.page?.title || '' }, evidence: { matched: useful.matched, total: useful.total, source: 'main-world-safe' } };
          }
        }
      }

      // 5) 最后才使用现有 DOM/Semantic Parser，保证 v2.0/v2.1 的能力始终是兜底。
      const scan = await scanTab(tab.id, createdTab ? 4 : 2, createdTab);
      if (!scan?.ok) return { host: group.host, provider: group.provider, status: 'error', strategy: 'page_scan', error: scan?.error || '页面解析失败', records: [], page: { url: finalUrl } };
      const records = Array.isArray(scan.records) ? scan.records : [];
      if (!records.length) {
        const probe = await sendTabMessage(tab.id, { type: 'PROBE_PAGE' }).catch(() => null);
        if (probe?.loginRequired) return { host: group.host, provider: group.provider, status: 'login', strategy: 'page_scan', error: probe.reason || '页面要求重新登录', records: [], page: scan.page || { url: finalUrl } };
        if (probe?.rateLimited) return { host: group.host, provider: group.provider, status: 'rate_limited', strategy: 'page_scan', error: probe.reason || '页面提示访问频繁或受限', records: [], page: scan.page || { url: finalUrl } };
        if (probe?.challenge) return { host: group.host, provider: group.provider, status: 'challenge', strategy: 'page_scan', error: probe.reason || '页面要求安全验证', records: [], page: scan.page || { url: finalUrl } };
        return { host: group.host, provider: group.provider, status: 'empty', strategy: 'page_scan', error: '页面已打开，但没有解析到投递记录', records: [], page: scan.page || { url: finalUrl } };
      }
      return { host: group.host, provider: group.provider, status: 'ok', strategy: 'page_scan', records, page: scan.page || { url: finalUrl } };
    } finally {
      if (createdTab && tab?.id != null) await chrome.tabs.remove(tab.id).catch(() => {});
    }
  }

  function enrichStrategyRecords(records, group, pageUrl) {
    const fallbackCompany = group.records?.[0]?.company || '';
    const fallbackPlatform = group.records?.[0]?.platform || group.host;
    return (records || []).map(r => ({
      ...r,
      company: r.company || fallbackCompany,
      platform: r.platform || fallbackPlatform,
      url: r.url || pageUrl || group.url
    }));
  }

  function isMissingReceiverError(err) {
    return /Receiving end does not exist|Could not establish connection|message port closed/i.test(err?.message || String(err || ''));
  }

  async function injectPageBridge(tabId) {
    if (!chrome.scripting?.executeScript) throw new Error('当前浏览器无法恢复页面解析器');
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['company-identity.js', 'semantic.js', 'content.js', 'strategy-probe.js', 'followup-probe.js'],
      world: 'ISOLATED'
    });
    if (chrome.scripting?.insertCSS) {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] }).catch(() => {});
    }
  }

  async function sendTabMessage(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
      if (!isMissingReceiverError(e)) throw e;
      await injectPageBridge(tabId);
      await sleep(120);
      return chrome.tabs.sendMessage(tabId, message);
    }
  }

  async function collectStrategyProbe(tabId) {
    let res = await chrome.tabs.sendMessage(tabId, { type: 'COLLECT_STRATEGY_PROBE' }).catch(() => null);
    if (res?.ok) return res;
    if (chrome.scripting?.executeScript) {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['strategy-probe.js'], world: 'ISOLATED' }).catch(() => null);
      res = await chrome.tabs.sendMessage(tabId, { type: 'COLLECT_STRATEGY_PROBE' }).catch(() => null);
    }
    return res?.ok ? res : { ok: false, resources: [], jsonSnapshots: [], page: null };
  }

  async function collectMainWorldSnapshot(tabId) {
    if (!chrome.scripting?.executeScript) return [];
    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const names = ['__NEXT_DATA__','__NUXT__','__NUXT_DATA__','__INITIAL_STATE__','__PRELOADED_STATE__','__APOLLO_STATE__','__INITIAL_PROPS__','__DATA__','__STORE__'];
        const SAFE_LEAF_RE = /(position|job|post|vacancy|role|status|state|stage|result|company|corp|employer|organization|tenant|brand|location|city|apply|application|delivery|submit|created|time|date|id|number|progress|process)/i;
        const SENSITIVE_KEY_RE = /(cookie|token|secret|password|passwd|credential|authorization|phone|mobile|email|e-mail|avatar|profile|resume(?:content|file)?|address|identitycard|idcard|passport|bank|salary|compensation)/i;
        let nodes = 0;
        const seen = new WeakSet();
        function project(v, depth=0, path='') {
          if (v == null || nodes++ > 900 || depth > 6) return null;
          if (typeof v !== 'object') return null;
          if (seen.has(v)) return null;
          seen.add(v);
          if (Array.isArray(v)) {
            const rows = [];
            for (const x of v.slice(0, 40)) {
              const child = project(x, depth + 1, path);
              if (child && (typeof child !== 'object' || Object.keys(child).length)) rows.push(child);
            }
            return rows.length ? rows : null;
          }
          const out = {};
          for (const key of Object.keys(v).slice(0, 70)) {
            if (SENSITIVE_KEY_RE.test(key)) continue;
            const nextPath = path ? `${path}.${key}` : key;
            let val;
            try { val = v[key]; } catch { continue; }
            if (val == null) continue;
            if (typeof val === 'object') {
              const child = project(val, depth + 1, nextPath);
              if (child && (Array.isArray(child) ? child.length : Object.keys(child).length)) out[key] = child;
              continue;
            }
            if (!SAFE_LEAF_RE.test(key) && !SAFE_LEAF_RE.test(nextPath)) continue;
            if (typeof val === 'string') out[key] = val.slice(0, 500);
            else if (typeof val === 'number' || typeof val === 'boolean') out[key] = val;
          }
          return Object.keys(out).length ? out : null;
        }
        const snapshots = [];
        for (const name of names) {
          try {
            const value = globalThis[name];
            if (!value || typeof value !== 'object') continue;
            const data = project(value, 0, name);
            if (data) snapshots.push({ name, data });
          } catch {}
        }
        return snapshots;
      }
    }).catch(() => []);
    return Array.isArray(injected?.[0]?.result) ? injected[0].result : [];
  }

  async function tryApiCandidates(group, cfg, resources, pageUrl, fromCache) {
    if (!Strategy?.rankApiCandidates || !ApplicationData?.extractRecords) return null;
    const ranked = Strategy.rankApiCandidates(resources, [], pageUrl || group.url, 3);
    for (const candidate of ranked) {
      const fetched = await fetchJsonCandidate(candidate.url, cfg.followUpApiTimeoutSeconds);
      if (!fetched?.ok || fetched.data == null) continue;
      const extracted = ApplicationData.extractRecords([fetched.data], group.records, { maxNodes: 3000, maxDepth: 7 });
      const records = enrichStrategyRecords(extracted, group, pageUrl || group.url);
      const useful = Strategy.isUseful(group.records, records, Core, 0.8);
      if (!useful.ok) continue;
      if (!fromCache) await saveApiHint(group, candidate.url, pageUrl || group.url);
      return { host: group.host, provider: group.provider, status: 'ok', strategy: 'api_get', records, page: { url: pageUrl || group.url }, evidence: { endpoint: redactUrl(candidate.url), matched: useful.matched, total: useful.total, cached: !!fromCache } };
    }
    return null;
  }

  async function fetchJsonCandidate(url, timeoutSeconds) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(3000, Number(timeoutSeconds || 6) * 1000));
    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'follow',
        headers: { 'Accept': 'application/json, text/plain;q=0.9, */*;q=0.5' },
        signal: controller.signal
      });
      if (!response.ok) return { ok: false, status: response.status };
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 1_000_000) return { ok: false, status: response.status, error: 'API 响应过大' };
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const body = await response.text();
      if (body.length > 1_200_000) return { ok: false, status: response.status, error: 'API 响应过大' };
      if (/text\/html/.test(contentType) && /(登录|sign\s*in|login)/i.test(body.slice(0, 12000))) return { ok: false, status: response.status, loginHint: true };
      let data = null;
      try { data = JSON.parse(body); } catch { return { ok: false, status: response.status, error: '不是 JSON 响应' }; }
      return { ok: true, status: response.status, data };
    } catch (e) {
      return { ok: false, error: e?.name === 'AbortError' ? 'API 请求超时' : (e?.message || String(e)) };
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadApiHints(group) {
    const stored = await chrome.storage.local.get(['followUpApiHints']);
    const entry = stored.followUpApiHints?.[group.host];
    if (!entry || entry.providerId !== group.providerId || Date.now() - Number(entry.successAt || 0) > 30*24*3600*1000) return [];
    const url = Strategy?.sanitizeCacheUrl ? Strategy.sanitizeCacheUrl(entry.url, entry.pageUrl || group.url) : '';
    return url ? [url] : [];
  }

  async function saveApiHint(group, url, pageUrl) {
    const safe = Strategy?.sanitizeCacheUrl ? Strategy.sanitizeCacheUrl(url, pageUrl) : '';
    if (!safe) return;
    const stored = await chrome.storage.local.get(['followUpApiHints']);
    const hints = stored.followUpApiHints && typeof stored.followUpApiHints === 'object' ? stored.followUpApiHints : {};
    hints[group.host] = { providerId: group.providerId, url: safe, pageUrl: Strategy.sanitizeCacheUrl(pageUrl, pageUrl) || pageUrl.split('#')[0], successAt: Date.now() };
    await chrome.storage.local.set({ followUpApiHints: hints });
  }

  function redactUrl(url) {
    try {
      const u = new URL(url);
      for (const k of [...u.searchParams.keys()]) u.searchParams.set(k, '…');
      return `${u.origin}${u.pathname}${u.search}`.slice(0, 400);
    } catch { return String(url || '').slice(0, 300); }
  }

  async function findBestOpenTab(group) {
    const host = String(group?.host || '').trim().toLowerCase();
    if (!host || !/^[a-z0-9.-]+$/.test(host)) return null;
    const tabs = await chrome.tabs.query({ url: [`https://${host}/*`] }).catch(() => []);
    const matching = tabs.filter(t => {
      try { return t.id != null && /^https:/i.test(t.url || '') && new URL(t.url).hostname.replace(/^www\./, '') === group.host; }
      catch { return false; }
    });
    if (!matching.length) return null;
    const score = t => {
      let s = Providers?.tabScore ? Providers.tabScore(group, t.url || '', Core) : Core.urlScore(t.url || '');
      if (!Providers?.tabScore && Core.canonicalUrl(t.url || '') === Core.canonicalUrl(group.url)) s += 20;
      if (t.active) s += 2;
      return s;
    };
    matching.sort((a, b) => score(b) - score(a));
    return matching[0];
  }

  async function waitForTabLoad(tabId, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab) throw new Error('后台检查标签页已关闭');
      if (tab.status === 'complete') { await sleep(900); return tab; }
      await sleep(350);
    }
    throw new Error('招聘页面加载超时');
  }

  async function scanTab(tabId, attempts, requireRecords) {
    let last = null;
    for (let i = 0; i < attempts; i++) {
      try {
        last = await sendTabMessage(tabId, { type: 'SCAN_PAGE' });
        if (last?.ok && last.records?.length) return last;
        if (last?.ok && last.detected && !requireRecords) return last;
      } catch (e) {
        last = { ok: false, error: e?.message || String(e) };
      }
      await sleep(1000 + i * 700);
    }
    return last || { ok: false, error: '无法连接页面解析器' };
  }

  async function applyGroupResult(settings, token, group, inspected) {
    const now = new Date().toLocaleString('zh-CN', { hour12: false });
    const patches = [];
    const summary = { checked: 0, changed: 0, failed: 0, loginRequired: 0, sessionBlocked: 0, waiting: 0, unmatched: 0, detail: null };
    const common = { '最后检查时间': now, '招聘系统': group.providerName || group.provider?.name || 'Generic Web', '检查方式': inspected?.strategy ? (Strategy?.strategyLabel ? Strategy.strategyLabel(inspected.strategy) : inspected.strategy) : '' };

    if (inspected.status === 'session_paused') {
      const loginText = inspected.sessionState === 'login_required' ? '已失效' : inspected.sessionState === 'challenge' ? '需验证' : inspected.sessionState === 'rate_limited' ? '访问受限' : '未知';
      for (const t of group.records) patches.push({ record_id: t.recordId, fields: { ...common, '检查状态': '会话暂停', '登录状态': loginText, '最近错误': safeCell(inspected.error || '', 500) } });
      summary.waiting = group.records.length;
      summary.detail = { host: group.host, provider: group.providerName || group.provider?.name || '', strategy: inspected?.strategy || '', status: 'session_paused', message: inspected.error };
    } else if (inspected.status === 'waiting') {
      for (const t of group.records) patches.push({ record_id: t.recordId, fields: { ...common, '检查状态': '等待打开招聘网站', '登录状态': '未知', '最近错误': inspected.error || '' } });
      summary.waiting = group.records.length;
      summary.detail = { host: group.host, provider: group.providerName || group.provider?.name || '', strategy: inspected?.strategy || '', status: 'waiting', message: inspected.error };
    } else if (inspected.status === 'login') {
      for (const t of group.records) patches.push({ record_id: t.recordId, fields: { ...common, '检查状态': '需要登录', '登录状态': '已失效', '最近错误': inspected.error || '' } });
      summary.loginRequired = group.records.length;
      summary.detail = { host: group.host, provider: group.providerName || group.provider?.name || '', strategy: inspected?.strategy || '', status: 'login', message: inspected.error };
    } else if (inspected.status === 'challenge' || inspected.status === 'rate_limited') {
      const loginText = inspected.status === 'challenge' ? '需验证' : '访问受限';
      const checkText = inspected.status === 'challenge' ? '需要安全验证' : '访问暂时受限';
      for (const t of group.records) patches.push({ record_id: t.recordId, fields: { ...common, '检查状态': checkText, '登录状态': loginText, '最近错误': safeCell(inspected.error || '', 500) } });
      summary.sessionBlocked = group.records.length;
      summary.detail = { host: group.host, provider: group.providerName || group.provider?.name || '', strategy: inspected?.strategy || '', status: inspected.status, message: inspected.error };
    } else if (inspected.status === 'error') {
      for (const t of group.records) patches.push({ record_id: t.recordId, fields: { ...common, '检查状态': '检查失败', '登录状态': '未知', '最近错误': safeCell(inspected.error, 500) } });
      summary.failed = group.records.length;
      summary.detail = { host: group.host, provider: group.providerName || group.provider?.name || '', strategy: inspected?.strategy || '', status: 'error', message: inspected.error };
    } else if (inspected.status === 'empty') {
      for (const t of group.records) patches.push({ record_id: t.recordId, fields: { ...common, '检查状态': '未解析到投递', '登录状态': '可访问', '最近错误': inspected.error || '' } });
      summary.unmatched = group.records.length;
      summary.detail = { host: group.host, provider: group.providerName || group.provider?.name || '', strategy: inspected?.strategy || '', status: 'empty', message: inspected.error };
    } else {
      const matches = Core.matchScanned(group.records, inspected.records || []);
      const changedItems = [];
      for (const m of matches) {
        const target = m.target, scanned = m.scanned;
        if (!scanned) {
          patches.push({ record_id: target.recordId, fields: { ...common, '检查状态': '未匹配到岗位', '登录状态': '可访问', '最近错误': '页面已解析，但未找到与该岗位足够匹配的记录' } });
          summary.unmatched += 1;
          continue;
        }
        summary.checked += 1;
        const fields = { ...common, '检查状态': '已检查', '登录状态': '可访问', '最近错误': '' };
        if (!target.location && scanned.location) fields['工作地点'] = safeCell(scanned.location);
        if (!target.applyTime && scanned.applyTime) fields['投递时间'] = safeCell(scanned.applyTime);
        if (Core.statusChanged(target, scanned)) {
          fields['当前状态'] = safeCell(scanned.status || target.status || '已投递');
          fields['原始状态'] = safeCell(scanned.rawStatus || '');
          fields['状态更新时间'] = now;
          fields['最近更新时间'] = now;
          summary.changed += 1;
          changedItems.push({ company: target.company, position: target.position, from: target.status, to: scanned.status });
        } else if (scanned.rawStatus && scanned.rawStatus !== target.rawStatus) {
          fields['原始状态'] = safeCell(scanned.rawStatus);
        }
        patches.push({ record_id: target.recordId, fields });
      }
      summary.detail = { host: group.host, provider: group.providerName || group.provider?.name || '', strategy: inspected?.strategy || '', status: 'ok', checked: summary.checked, changed: summary.changed, unmatched: summary.unmatched, changes: changedItems.slice(0, 5), evidence: inspected?.evidence || null };
    }

    for (const chunk of chunks(patches, 500)) {
      if (!chunk.length) continue;
      await feishuRequest(settings, token,
        `/bitable/v1/apps/${encodeURIComponent(settings.appToken)}/tables/${encodeURIComponent(settings.tableId)}/records/batch_update`,
        { method: 'POST', body: { records: chunk } }
      );
    }
    return summary;
  }

  function formatLocalTime(ts) {
    if (!ts) return '稍后';
    try { return new Date(Number(ts)).toLocaleString('zh-CN', { hour12: false }); }
    catch { return '稍后'; }
  }

  async function notifySessionIssues(result) {
    if (!chrome.notifications || !result?.sessionIssues?.length) return;
    const issues = result.sessionIssues.slice(0, 3);
    const message = issues.map(x => `${x.host}：${x.label || '会话异常'}${x.reason ? `（${x.reason}）` : ''}`).join('\n');
    await chrome.notifications.create(`offertrack-session-${Date.now()}`, {
      type: 'basic', iconUrl: 'icons/icon128.png', title: `OfferTrack：${result.sessionIssues.length} 个招聘网站需要处理`, message,
      contextMessage: '重新登录或完成验证后，可手动立即跟进以恢复自动检查'
    }).catch(() => {});
  }

  async function notifyChanges(result) {
    if (!chrome.notifications || !result?.changed) return;
    const changes = result.details.flatMap(d => d?.changes || []).slice(0, 3);
    const message = changes.length
      ? changes.map(x => `${x.company || ''} ${x.position}: ${x.from || '未知'} → ${x.to || '未知'}`).join('\n')
      : `发现 ${result.changed} 条招聘进度变化`;
    await chrome.notifications.create(`offertrack-followup-${Date.now()}`, {
      type: 'basic', iconUrl: 'icons/icon128.png', title: `OfferTrack：${result.changed} 条进度更新`, message,
      contextMessage: `本轮检查 ${result.checked} 条投递`
    }).catch(() => {});
  }

  chrome.runtime.onInstalled.addListener(() => configure().catch(() => {}));
  chrome.runtime.onStartup?.addListener(() => configure().catch(() => {}));
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) configure().catch(() => {});
    if (changes.followUpRunRequest?.newValue) {
      run('manual').catch(() => {});
    }
  });
  chrome.alarms?.onAlarm.addListener(alarm => {
    if (alarm?.name === ALARM) run('alarm').catch(() => {});
  });

  globalThis.OfferTrackFollowUp = { configure, getState, run, _execute: execute, _inspectGroup: inspectGroup };
})();
