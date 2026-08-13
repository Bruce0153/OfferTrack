(() => {
  'use strict';

  const Core = globalThis.OfferTrackFollowUpCore;
  const Review = globalThis.OfferTrackFollowUpReview;
  const Sessions = globalThis.OfferTrackSessionManager;
  const Journal = globalThis.OfferTrackChangeJournal;
  const Decision = globalThis.OfferTrackFollowUpDecision;
  const Contract = globalThis.OfferTrackApplicationContract;
  const F = Contract?.FEISHU_FIELDS || Core?.FIELDS || {};
  const FollowUp = globalThis.OfferTrackFollowUp;

  const clean = (v, max = 180) => String(v || '').replace(/[\t\r\n\u00a0]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);

  async function summary() {
    const state = FollowUp?.getState ? await FollowUp.getState() : { enabled: false, intervalHours: 6, mode: 'open_tabs', running: false };
    const session = Sessions?.state ? await Sessions.state().catch(() => null) : null;
    const reviews = Review?.read ? await Review.read().catch(() => []) : [];
    const q = session?.summary || {};
    const sessionActions = Number(q.loginRequired || 0) + Number(q.challenge || 0) + Number(q.rateLimited || 0);
    const permissionActions = (state?.lastFollowUp?.details || []).filter(x => x?.status === 'permission_required').length;
    return {
      ...state,
      session: {
        healthy: Number(q.healthy || 0),
        loginRequired: Number(q.loginRequired || 0),
        challenge: Number(q.challenge || 0),
        rateLimited: Number(q.rateLimited || 0),
        pendingRecheck: Number(q.pendingRecheck || 0),
        error: Number(q.error || 0)
      },
      reviewCount: reviews.length,
      permissionCount: permissionActions,
      actionableCount: sessionActions + permissionActions + reviews.length
    };
  }

  async function actions() {
    const state = Sessions?.state ? await Sessions.state().catch(() => null) : null;
    const reviews = Review?.read ? await Review.read().catch(() => []) : [];
    const followState = FollowUp?.getState ? await FollowUp.getState().catch(() => null) : null;
    const out = [];
    const permissionSeen = new Set();
    for (const detail of followState?.lastFollowUp?.details || []) {
      if (detail?.status !== 'permission_required' || !detail.host || permissionSeen.has(detail.host)) continue;
      permissionSeen.add(detail.host);
      out.push({
        id: `permission:${detail.host}`,
        kind: 'permission',
        host: detail.host,
        title: detail.provider || detail.host,
        subtitle: '需要授权此招聘网站，才能在后台自动跟进',
        url: detail.url || `https://${detail.host}/`
      });
    }
    for (const entry of state?.entries || []) {
      if (!['login_required','challenge','rate_limited'].includes(entry.state)) continue;
      out.push({
        id: `session:${entry.host}`,
        kind: 'session',
        host: entry.host,
        title: entry.providerName || entry.host,
        subtitle: entry.reason || entry.label || '需要处理登录状态',
        url: entry.lastUrl || `https://${entry.host}/`
      });
    }
    for (const item of reviews) {
      out.push({
        id: item.id,
        kind: 'review',
        host: item.host,
        title: [item.company, item.position].filter(Boolean).join(' · ') || item.host,
        subtitle: Review?.labelFor?.(item.reasonCode) || '需要人工确认',
        reasonCode: item.reasonCode,
        confidence: item.confidence,
        currentStatus: item.currentStatus,
        detectedStatus: item.detectedStatus
      });
    }
    return out.slice(0, 30);
  }

  async function openAction(id) {
    const key = String(id || '');
    if (!key.startsWith('session:')) throw new Error('当前操作不需要打开网页');
    const host = key.slice(8);
    const entry = Sessions?.get ? await Sessions.get(host) : null;
    if (!entry) throw new Error('该会话问题已不存在');
    await chrome.tabs.create({ url: entry.lastUrl || `https://${host}/`, active: true });
    return { opened: true, host };
  }

  async function resolveReview(id, action) {
    const followState = FollowUp?.getState ? await FollowUp.getState().catch(() => null) : null;
    if (followState?.running) return { ok: false, error: '自动跟进正在运行，请稍后处理' };
    const item = Review?.get ? await Review.get(id) : null;
    if (!item) return { ok: false, error: '待确认项已失效或已处理' };
    if (action === 'ignore') {
      await Review.remove(item.id);
      return { ok: true, ignored: true, message: '已忽略此次' };
    }
    if (action !== 'confirm') return { ok: false, error: '未知处理方式' };

    const settings = await prepareStoredSettings();
    validateSettings(settings);
    const token = await getTenantToken(settings);
    const all = await listAllRecords(settings, token);
    const raw = all.find(x => x?.record_id === item.recordId);
    if (!raw) {
      await Review.remove(item.id);
      return { ok: false, error: '对应飞书记录已不存在' };
    }
    const current = Core.fromFeishu(raw);
    const decision = Decision?.statusDecision(current, { status: item.detectedStatus, rawStatus: item.rawStatus }, {
      confidence: 1,
      userConfirmed: true
    });
    if (!decision?.changed) {
      await Review.remove(item.id);
      return { ok: true, changed: false, message: '状态已经一致，无需更新' };
    }
    if (!decision.allowed) {
      await Review.remove(item.id);
      return { ok: false, blocked: true, error: '状态安全规则阻止了本次更新' };
    }

    const nowText = new Date().toLocaleString('zh-CN', { hour12: false });
    const fields = {
      [F.status]: clean(item.detectedStatus || current.status || '已投递', 80),
      [F.rawStatus]: clean(item.rawStatus, 160),
      [F.updatedAt]: nowText
    };
    await feishuRequest(settings, token,
      `/bitable/v1/apps/${encodeURIComponent(settings.appToken)}/tables/${encodeURIComponent(settings.tableId)}/records/batch_update`,
      { method: 'POST', body: { records: [{ record_id: item.recordId, fields }] } }
    );
    await Journal?.append?.([{
      at: Date.now(), company: current.company || item.company, position: current.position || item.position,
      oldStatus: current.status, newStatus: item.detectedStatus, provider: item.provider,
      checkMethod: '人工确认', matchConfidence: 1, matchMethod: 'manual_review', host: item.host
    }]).catch(() => []);
    await Review.remove(item.id);
    return { ok: true, changed: true, message: `${current.status || '未知'} → ${item.detectedStatus}` };
  }

  function registerMessages() {
    chrome.runtime?.onMessage?.addListener((msg, _sender, sendResponse) => {
      if (!['GET_FOLLOWUP_SUMMARY','GET_FOLLOWUP_ACTIONS','OPEN_FOLLOWUP_ACTION','RESOLVE_FOLLOWUP_REVIEW'].includes(msg?.type)) return;
      (async () => {
        try {
          if (msg.type === 'GET_FOLLOWUP_SUMMARY') return sendResponse({ ok: true, ...(await summary()) });
          if (msg.type === 'GET_FOLLOWUP_ACTIONS') return sendResponse({ ok: true, actions: await actions() });
          if (msg.type === 'OPEN_FOLLOWUP_ACTION') return sendResponse({ ok: true, ...(await openAction(msg.id)) });
          if (msg.type === 'RESOLVE_FOLLOWUP_REVIEW') return sendResponse(await resolveReview(msg.id, msg.action));
        } catch (e) {
          sendResponse({ ok: false, error: e?.message || String(e) });
        }
      })();
      return true;
    });
  }

  registerMessages();
})();
