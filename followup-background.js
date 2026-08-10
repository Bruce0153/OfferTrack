(() => {
  'use strict';

  const Core = globalThis.OfferTrackFollowUpCore;
  const ALARM = 'offertrack-follow-up';
  const LEASE_MS = 20 * 60 * 1000;
  const FOLLOWUP_FIELDS = ['自动跟进','最后检查时间','状态更新时间','检查状态','登录状态','最近错误'];
  let runningPromise = null;

  function normalizedSettings(input = {}) {
    return {
      followUpEnabled: !!input.followUpEnabled,
      followUpIntervalHours: Math.min(72, Math.max(1, Number(input.followUpIntervalHours || 6))),
      followUpMode: input.followUpMode === 'background_tabs' ? 'background_tabs' : 'open_tabs',
      followUpMaxSitesPerRun: Math.min(30, Math.max(1, Number(input.followUpMaxSitesPerRun || 12))),
      followUpIncludeTerminal: !!input.followUpIncludeTerminal,
      followUpNotify: input.followUpNotify !== false,
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
    const allGroups = Core.groupTargets(targets);
    const groups = allGroups.slice(0, cfg.followUpMaxSitesPerRun);

    const result = {
      ok: true, source, mode: cfg.followUpMode, at: Date.now(),
      totalRecords: targets.length, totalSites: allGroups.length, scheduledSites: groups.length,
      checked: 0, changed: 0, failed: 0, loginRequired: 0, waiting: 0, unmatched: 0, details: []
    };

    for (const group of groups) {
      const inspected = await inspectGroup(group, cfg).catch(err => ({ host: group.host, status: 'error', error: err?.message || String(err), records: [], page: null }));
      const patchResult = await applyGroupResult(settings, token, group, inspected);
      for (const k of ['checked','changed','failed','loginRequired','waiting','unmatched']) result[k] += patchResult[k] || 0;
      if (patchResult.detail) result.details.push(patchResult.detail);
      await sleep(250);
    }

    if (allGroups.length > groups.length) result.details.push({ host: '', status: 'limited', message: `本轮按设置只检查前 ${groups.length}/${allGroups.length} 个招聘网站` });
    result.message = `自动跟进完成：检查 ${result.checked} 条，状态变化 ${result.changed}，待登录 ${result.loginRequired}，失败 ${result.failed}`;
    await chrome.storage.local.set({ lastFollowUp: result });
    if (cfg.followUpNotify && result.changed > 0) await notifyChanges(result);
    await configure(settings);
    return result;
  }

  async function inspectGroup(group, cfg) {
    let tab = await findBestOpenTab(group);
    let createdTab = false;
    if (!tab && cfg.followUpMode === 'background_tabs') {
      tab = await chrome.tabs.create({ url: group.url, active: false });
      createdTab = true;
    }
    if (!tab) return { host: group.host, status: 'waiting', error: '没有找到已打开的招聘网站页面', records: [], page: null };

    try {
      if (createdTab) await waitForTabLoad(tab.id, cfg.followUpTabTimeoutSeconds * 1000);
      const scan = await scanTab(tab.id, createdTab ? 4 : 2, createdTab);
      const latestTab = await chrome.tabs.get(tab.id).catch(() => tab);
      const finalUrl = latestTab?.url || tab.url || group.url;
      if (/\/(?:login|signin|sign-in)(?:[/?#]|$)|(?:login|signin)=/i.test(finalUrl || '')) {
        return { host: group.host, status: 'login', error: '招聘网站登录状态已失效', records: [], page: { url: finalUrl } };
      }
      if (!scan?.ok) return { host: group.host, status: 'error', error: scan?.error || '页面解析失败', records: [], page: { url: finalUrl } };
      let records = Array.isArray(scan.records) ? scan.records : [];
      try {
        const enhanced = await chrome.tabs.sendMessage(tab.id, { type: 'ENHANCE_RECORDS', records });
        if (enhanced?.ok && Array.isArray(enhanced.records)) records = enhanced.records;
      } catch {}
      if (!records.length) {
        const probe = await chrome.tabs.sendMessage(tab.id, { type: 'PROBE_PAGE' }).catch(() => null);
        if (probe?.loginRequired) return { host: group.host, status: 'login', error: '页面要求重新登录', records: [], page: scan.page || { url: finalUrl } };
        if (probe?.blocked) return { host: group.host, status: 'error', error: '页面出现验证码或访问限制', records: [], page: scan.page || { url: finalUrl } };
        return { host: group.host, status: 'empty', error: '页面已打开，但没有解析到投递记录', records: [], page: scan.page || { url: finalUrl } };
      }
      return { host: group.host, status: 'ok', records, page: scan.page || { url: finalUrl } };
    } finally {
      if (createdTab && tab?.id != null) await chrome.tabs.remove(tab.id).catch(() => {});
    }
  }

  async function findBestOpenTab(group) {
    const tabs = await chrome.tabs.query({}).catch(() => []);
    const matching = tabs.filter(t => {
      try { return t.id != null && /^https:/i.test(t.url || '') && new URL(t.url).hostname.replace(/^www\./, '') === group.host; }
      catch { return false; }
    });
    if (!matching.length) return null;
    const score = t => {
      let s = Core.urlScore(t.url || '');
      if (Core.canonicalUrl(t.url || '') === Core.canonicalUrl(group.url)) s += 20;
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
        last = await chrome.tabs.sendMessage(tabId, { type: 'SCAN_PAGE' });
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
    const summary = { checked: 0, changed: 0, failed: 0, loginRequired: 0, waiting: 0, unmatched: 0, detail: null };
    const common = { '最后检查时间': now };

    if (inspected.status === 'waiting') {
      for (const t of group.records) patches.push({ record_id: t.recordId, fields: { ...common, '检查状态': '等待打开招聘网站', '登录状态': '未知', '最近错误': inspected.error || '' } });
      summary.waiting = group.records.length;
      summary.detail = { host: group.host, status: 'waiting', message: inspected.error };
    } else if (inspected.status === 'login') {
      for (const t of group.records) patches.push({ record_id: t.recordId, fields: { ...common, '检查状态': '需要登录', '登录状态': '已失效', '最近错误': inspected.error || '' } });
      summary.loginRequired = group.records.length;
      summary.detail = { host: group.host, status: 'login', message: inspected.error };
    } else if (inspected.status === 'error') {
      for (const t of group.records) patches.push({ record_id: t.recordId, fields: { ...common, '检查状态': '检查失败', '登录状态': '未知', '最近错误': safeCell(inspected.error, 500) } });
      summary.failed = group.records.length;
      summary.detail = { host: group.host, status: 'error', message: inspected.error };
    } else if (inspected.status === 'empty') {
      for (const t of group.records) patches.push({ record_id: t.recordId, fields: { ...common, '检查状态': '未解析到投递', '登录状态': '可访问', '最近错误': inspected.error || '' } });
      summary.unmatched = group.records.length;
      summary.detail = { host: group.host, status: 'empty', message: inspected.error };
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
      summary.detail = { host: group.host, status: 'ok', checked: summary.checked, changed: summary.changed, unmatched: summary.unmatched, changes: changedItems.slice(0, 5) };
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

  chrome.runtime.onInstalled.addListener(() => configure().catch(console.warn));
  chrome.runtime.onStartup?.addListener(() => configure().catch(console.warn));
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) configure().catch(console.warn);
    if (changes.followUpRunRequest?.newValue) {
      run('manual').catch(err => console.error('[OfferTrack follow-up manual]', err));
    }
  });
  chrome.alarms?.onAlarm.addListener(alarm => {
    if (alarm?.name === ALARM) run('alarm').catch(err => console.error('[OfferTrack follow-up]', err));
  });

  globalThis.OfferTrackFollowUp = { configure, getState, run, _execute: execute, _inspectGroup: inspectGroup };
})();
