(() => {
  const CompanyIdentity = globalThis.OfferTrackCompanyIdentity;
  const ApplicationContract = globalThis.OfferTrackApplicationContract;
  const APP_PAGE_RE = /(我的投递|投递记录|应聘记录|申请记录|我的申请|应聘进度|求职进度|招聘进度|候选人中心|网申投递|申请进度)/i;
  const APP_URL_RE = /(mydeliver|mydelivery|myapply|my-apply|application|applications|applyrecord|delivery|deliveries|candidate.*(?:apply|deliver)|process|progress|applicationcenter|jobapply)/i;
  const APP_ROUTE_RE = /\/(?:account|personal|candidate|user|profile)\/(?:apply|application|applications|delivery|deliveries|record|records)(?:[/?#]|$)/i;

  // “明确状态”与“流程阶段”分开。流程阶段本身不一定代表当前状态。
  const DIRECT_STATUS_RE = /(已投递|投递成功|已申请|申请成功|待筛选|筛选中|评估中|待评估|待测评|测评中|测评完成|待笔试|笔试中|笔试完成|待面试|面试中|面试安排|一面|二面|三面|四面|HR面|终面|已发offer|offer已发放|已录用|录用|意向书|不合适|不通过|未通过|流程结束|已结束|已拒绝|拒绝|淘汰|已撤回|撤回成功|已终止|终止|待处理|处理中|流程中)/i;
  const STAGE_RE = /^(投递简历|简历投递|简历筛选|简历初筛|简历评估|测评|笔试|面试|录用评估|录用审批|offer|预入职|入职)$/i;
  const STATUS_SIGNAL_RE = new RegExp(`${DIRECT_STATUS_RE.source}|${STAGE_RE.source}`, 'i');
  const TERMINAL_STATUS_RE = /(流程结束|已结束|不合适|不通过|未通过|已拒绝|拒绝|淘汰|已终止|终止|失败)/i;
  const OFFER_STATUS_RE = /(已发offer|offer已发放|已录用|^录用$|意向书)/i;

  // 操作词绝不能作为岗位或状态。注意“流程结束”是状态，“结束流程”是动作。
  const UI_ACTION_RE = /^(收藏|职位收藏|取消收藏|催促流程|催流程|结束流程|终止流程|变更职位|更换职位|刷新活跃度|刷新|更多|详情|查看详情|查看职位|查看岗位|返回|编辑|删除|取消|关闭|撤回申请|取消申请|重新投递|再次投递|编辑简历|查看简历|我的简历|去测评|参加测评|去笔试|参加笔试|去面试|预约面试|联系HR|联系招聘者|分享)$/i;
  const NAV_RE = /^(首页|投递记录|职位收藏|我的简历|个人中心|候选人中心|校园招聘|社会招聘|应届招聘|实习招聘|校招动态|探索|菜单|职位|岗位|职位列表|岗位列表)$/i;

  // “角色名词”与“技术/职类词”必须分开。裸的“算法/研发/数据”常常只是标签，不足以证明它是一条岗位。
  const STRONG_ROLE_RE = /(工程师|研究员|研究岗|专家|科学家|架构师|产品经理|项目经理|项目管理|运营|设计师|分析师|数据分析师|数据科学家|测试工程师|实习生|实习岗位|管培生|管理培训生|顾问|销售|市场|财务|法务|人力资源|HRBP|采购|供应链|解决方案|专员|主管|经理|总监|负责人|助理|博士后|研究助理|(?:算法|研发|技术|产品|运营|测试|设计|职能|销售|市场|数据)岗)/i;
  const TECH_ROLE_RE = /(AI|LLM|Agent|NLP|CV|Infra|机器学习|深度学习|大模型|多模态|计算机视觉|视觉|推荐|搜索|后端|前端|客户端|平台|策略|风控|安全|机器人|具身|云计算|数据库|基础架构|算法|研发|开发|数据|模型|智能)/i;
  const POSITION_SIGNAL_RE = new RegExp(`${STRONG_ROLE_RE.source}|${TECH_ROLE_RE.source}`, 'i');
  const CATEGORY_OR_NAV_RE = /(招聘会|专场招聘|专场投递|岗位类别|职位类别|招聘类型|职类|职位族|岗位族|人才类型|项目投递|网申投递|(?:数据|算法|研发|技术|产品|设计|运营|职能|销售|市场|供应链|制造|质量|智能)(?:与|及|\/|[-—–])?(?:数据|算法|研发|技术|产品|设计|运营|职能)?类$|(?:类|板块|序列|方向)$)/i;
  const EMPLOYMENT_TYPE_RE = /^(实习生|实习|全职|兼职|校招|社招|应届|应届生|正式|正式岗|校园招聘|社会招聘)$/i;

  // 只把带年份的日期作为无上下文日期。短日期只有在明确“投递时间：”标签后才接受。
  const FULL_DATE_RE = /(20\d{2}[\-\/.年](?:1[0-2]|0?[1-9])[\-\/.月](?:3[01]|[12]\d|0?[1-9])日?(?!\d)(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/;
  const SHORT_DATE_RE = /((?:1[0-2]|0?[1-9])[\-\/.月](?:3[01]|[12]\d|0?[1-9])日?(?!\d)(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/;
  const CITY_RE = /(北京|上海|深圳|广州|杭州|南京|苏州|成都|武汉|西安|天津|重庆|长沙|合肥|厦门|福州|青岛|济南|郑州|宁波|无锡|珠海|东莞|佛山|大连|沈阳|长春|哈尔滨|石家庄|太原|南昌|南宁|昆明|贵阳|海口|香港|澳门|台北|东京|大阪|新加坡|远程)/g;

  const GENERIC_COMPANY_RE = /^(logo|icon|brand|home|记录|投递记录|网申投递|官网投递|申请记录|我的投递|我的申请|候选人中心|个人中心|校园招聘|社会招聘|应届招聘|实习招聘|招聘|职位|岗位|职位列表|岗位列表|首页|菜单|更多|详情|求职|应届|应届生|校招|社招|实习|校园|社会|春招|秋招|career|careers|jobs?)$/i;
  const COMPANY_NOISE_RE = /^(?:相关公司|关联公司|推荐公司|相似公司|其他公司|更多公司|热门公司|合作公司|所属公司|招聘公司|目标公司|公司信息|公司介绍|企业信息|企业介绍|雇主信息|关于我们|合作伙伴|推荐企业|关联企业|相关企业)[：:]?$/i;
  const COMPANY_CONTEXT_BAD_RE = /(related|recommend|similar|other|partner|supplier|customer|competitor|affiliate|suggest|history|hot|search|list|关联|相关|推荐|相似|其他|合作|供应商|客户|竞品|搜索|列表)/i;
  const COMPANY_CONTEXT_NOISE_RE = /(?:板块|事业群|事业部|业务部|部门|中心|职类|类别|序列|方向|项目)$/i;
  const COHORT_RE = /^(?:20\d{2}|\d{2})届(?:应届生?)?(?:校园招聘|校招|招聘)?$|^(?:应届|应届生|校招|社招|实习|春招|秋招)$/i;
  const POSITION_NOISE_RE = /(?:第\s*\d+\s*志愿|第[一二三四五六七八九十]+志愿|官网投递|网申投递|校园投递|社会招聘|校招投递|社招投递|投递渠道|申请渠道)/ig;
  const ANNOUNCEMENT_RE = /(请您|请关注|及时完成|以.*为准|温馨提示|特别提醒|流程升级|面试流程|固定环节|实际邀约|关注邮件|邮件通知|短信通知|设置为|情况为准|公告|通知：|提示：)/i;
  const FIELD_LABELS = [
    '岗位名称','职位名称','应聘职位','申请职位','岗位','职位',
    '工作地点','工作地','意向地点','意向城市','地点','城市',
    '投递时间','申请时间','应聘时间','提交时间',
    '当前状态','投递状态','申请状态','应聘状态','状态','进度',
    '公司','企业','雇主','招聘类型','项目'
  ];

  let lastRecords = [];
  let lastRejectedCount = 0;
  let badge = null;
  let observerTimer = null;
  let routeTimer = null;
  let lastHref = location.href;
  let lastAutoFingerprint = '';
  let lastAutoAt = 0;
  let autoBackoffUntil = 0;
  let lastDetected = false;
  let lastAutoScanAt = 0;
  let scanPromise = null;
  let lastSemanticEnhanceAt = 0;
  let lastSemanticHref = '';
  let lastPageResultFingerprint = '';
  let runtimeConfigCache = null;
  let runtimeConfigAt = 0;
  let identityCache = null;
  let identityCacheAt = 0;
  let identityCacheKey = '';
  const AUTO_SCAN_MIN_GAP = 4000;
  const IDENTITY_CACHE_MS = 30 * 60 * 1000;

  document.getElementById('offertrack-badge')?.remove();

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg?.type === 'SCAN_PAGE') {
        const payload = await scanPage(true);
        sendResponse({ ok: true, ...payload });
      } else if (msg?.type === 'GET_PAGE_RECORDS') {
        sendResponse({ ok: true, records: lastRecords, rejectedCount: lastRejectedCount, page: pageMeta() });
      }
    })();
    return true;
  });

  init();

  async function init() {
    const cfg = await getRuntimeConfig(true);
    if (cfg.enabled === false) return;

    setTimeout(() => scheduleAutoScan(0), 1000);
    setTimeout(() => { if (!lastDetected) scheduleAutoScan(0); }, 4200);

    const obs = new MutationObserver(mutations => {
      if (!lastDetected && !routeLooksRelevant()) return;
      if (!mutations.some(isExternalMutation)) return;
      scheduleAutoScan(1400);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    const onRouteSignal = () => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      lastDetected = routeLooksRelevant();
      runtimeConfigCache = null;
      identityCache = null;
      try { globalThis.__offerTrackInvalidateSemanticCache?.(); } catch {}
      scheduleAutoScan(350);
      setTimeout(() => scheduleAutoScan(0), 2600);
    };
    window.addEventListener('hashchange', onRouteSignal, { passive: true });
    window.addEventListener('popstate', onRouteSignal, { passive: true });
    window.addEventListener('pageshow', onRouteSignal, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) onRouteSignal();
    }, { passive: true });
  }

  function routeLooksRelevant() {
    const routeText = `${document.title} ${decodeSafe(location.href)}`;
    return APP_PAGE_RE.test(routeText) || APP_URL_RE.test(routeText) || APP_ROUTE_RE.test(location.pathname + location.search + location.hash);
  }

  function isOfferTrackNode(node) {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return !!el && (el.id === 'offertrack-badge' || !!el.closest?.('#offertrack-badge'));
  }

  function isExternalMutation(mutation) {
    if (isOfferTrackNode(mutation.target)) return false;
    const target = mutation.target?.nodeType === 1 ? mutation.target : mutation.target?.parentElement;
    const recordSelector = 'article,li,tr,[role="listitem"],[role="row"],[class*="record"],[class*="apply"],[class*="delivery"],[class*="application"],[class*="process"],[class*="job"],[class*="position"]';
    if (target?.closest?.(recordSelector)) return true;
    const changed = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
    if (changed.length && changed.every(isOfferTrackNode)) return false;
    for (const node of changed.slice(0, 12)) {
      if (isOfferTrackNode(node)) continue;
      const el = node?.nodeType === 1 ? node : node?.parentElement;
      if (el?.matches?.(recordSelector) || el?.querySelector?.(recordSelector)) return true;
      const t = cleanText(node?.textContent || '').slice(0, 600);
      if (t && (APP_PAGE_RE.test(t) || DIRECT_STATUS_RE.test(t) || FULL_DATE_RE.test(t) || (POSITION_SIGNAL_RE.test(t) && t.length <= 180))) return true;
    }
    return false;
  }

  function scheduleAutoScan(delay = 1200) {
    clearTimeout(observerTimer);
    const since = Date.now() - lastAutoScanAt;
    const wait = Math.max(0, delay, AUTO_SCAN_MIN_GAP - since);
    observerTimer = setTimeout(async () => {
      lastAutoScanAt = Date.now();
      await scanPage(false).catch(() => {});
    }, wait);
  }

  async function getRuntimeConfig(force = false) {
    const now = Date.now();
    if (!force && runtimeConfigCache && now - runtimeConfigAt < 30000) return runtimeConfigCache;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_CONTENT_CONFIG', host: location.hostname });
      runtimeConfigCache = res?.ok ? res : { enabled: true, autoSyncAllowed: false, customSite: null, companyAlias: '' };
    } catch {
      runtimeConfigCache = { enabled: true, autoSyncAllowed: false, customSite: null, companyAlias: '' };
    }
    runtimeConfigAt = now;
    return runtimeConfigCache;
  }

  async function scanPage(userTriggered) {
    if (scanPromise) return scanPromise;
    scanPromise = doScanPage(userTriggered);
    try { return await scanPromise; }
    finally { scanPromise = null; }
  }

  async function doScanPage(userTriggered) {
    const cfg = await getRuntimeConfig();
    if (cfg.enabled === false) return { detected: false, records: [], rejectedCount: 0, page: pageMeta() };
    const routeText = `${document.title} ${decodeSafe(location.href)}`;
    const titleUrlSignal = APP_PAGE_RE.test(routeText) || APP_URL_RE.test(routeText) || APP_ROUTE_RE.test(location.pathname + location.search + location.hash);
    const bodyText = compactText(document.body?.innerText || '').slice(0, 30000);
    const textSignal = APP_PAGE_RE.test(bodyText.slice(0, 12000));
    const recordSignal = (FULL_DATE_RE.test(bodyText) || DIRECT_STATUS_RE.test(bodyText)) && POSITION_SIGNAL_RE.test(bodyText);
    if (!cfg.customSite && !titleUrlSignal && !textSignal && !recordSignal && !userTriggered) {
      lastDetected = false;
      return { detected: false, records: [], rejectedCount: 0, page: pageMeta() };
    }
    let parsed = cfg.customSite ? parseCustom(cfg.customSite, cfg.companyAlias) : parseGeneric(cfg.companyAlias);
    parsed = dedupe(parsed).slice(0, 300);
    let usable = parsed.filter(isUsableRecord);
    const baseDetected = !!cfg.customSite || titleUrlSignal || textSignal || usable.length > 0 || (userTriggered && recordSignal);
    const shouldEnhance = usable.length && typeof globalThis.__offerTrackEnhanceRecords === 'function' &&
      (userTriggered || lastSemanticHref !== location.href || Date.now() - lastSemanticEnhanceAt > 30000);
    if (shouldEnhance) {
      try {
        const enhanced = globalThis.__offerTrackEnhanceRecords(usable);
        if (Array.isArray(enhanced)) usable = enhanced.slice(0, 300);
        lastSemanticEnhanceAt = Date.now();
        lastSemanticHref = location.href;
      } catch {}
    }

    // Reconcile bounded site-level identity without replacing parser heuristics.
    // Strong site identity may correct weak/personal
    // page-level company candidates, but never forces a low-confidence overwrite.
    if (usable.length && !cfg.companyAlias) {
      try { usable = await reconcileSiteIdentity(usable); } catch {}
    }

    lastRejectedCount = Math.max(0, parsed.length - usable.length);
    lastRecords = usable;
    lastDetected = baseDetected;
    const payload = { detected: baseDetected, records: usable, rejectedCount: lastRejectedCount, page: pageMeta() };
    const resultFp = hash32(`${baseDetected}|${location.href}|${fingerprint(usable)}|${lastRejectedCount}`);
    if (userTriggered || resultFp !== lastPageResultFingerprint) {
      lastPageResultFingerprint = resultFp;
      chrome.runtime.sendMessage({ type: 'PAGE_SCAN_RESULT', payload }).catch(() => {});
    }
    if (baseDetected) renderBadge(usable, lastRejectedCount);
    await maybeAutoSync(cfg, usable);
    return payload;
  }

  async function reconcileSiteIdentity(records) {
    if (!CompanyIdentity?.resolve || !CompanyIdentity?.shouldPreferResolved) return records;
    const key = `${location.origin}${location.pathname}`;
    let identity = identityCache;
    if (!identity || identityCacheKey !== key || Date.now() - identityCacheAt > IDENTITY_CACHE_MS) {
      identity = await chrome.runtime.sendMessage({ type: 'RESOLVE_SITE_IDENTITY', url: location.href }).catch(() => null);
      identityCache = identity?.ok ? identity : null;
      identityCacheAt = Date.now();
      identityCacheKey = key;
    }
    const resolved = CompanyIdentity.normalizeCompany(identity?.company || '');
    if (!resolved || Number(identity?.confidence || 0) < 30) return records;

    const semanticCandidates = Array.isArray(globalThis.__offerTrackSemanticState?.companies)
      ? globalThis.__offerTrackSemanticState.companies.slice(0, 8).map(x => ({ value: x.value, source: x.source || 'current-record', context: x.context || '' }))
      : [];
    return records.map(record => {
      const current = CompanyIdentity.normalizeCompany(record?.company || '');
      const combined = CompanyIdentity.resolve([
        ...semanticCandidates,
        current ? { value: current, source: 'current-record' } : null,
        { value: resolved, source: identity?.source || 'site-json', bonus: 4 }
      ].filter(Boolean));
      const preferSite = CompanyIdentity.shouldPreferResolved(current, identity, { minConfidence: 35, strongConfidence: 65 });
      const company = preferSite ? resolved : (combined.company || current || resolved);
      return { ...record, company };
    });
  }

  async function maybeAutoSync(cfg, records) {
    if (!cfg.autoSyncAllowed || !records.length) return;
    const now = Date.now();
    const fp = fingerprint(records);
    if (!fp || fp === lastAutoFingerprint || now < autoBackoffUntil || now - lastAutoAt < 10000) return;

    lastAutoAt = now;
    setBadge('检测到变化，正在自动同步…', true);
    const result = await chrome.runtime.sendMessage({
      type: 'SYNC_RECORDS', records, page: pageMeta(), source: 'auto'
    }).catch(err => ({ ok: false, error: String(err) }));

    if (result?.ok) {
      lastAutoFingerprint = fp;
      updateBadgeSync(result);
    } else {
      autoBackoffUntil = Date.now() + 60000;
      updateBadgeSync(result);
    }
  }

  function fingerprint(records) {
    return hash32(records
      .map(r => `${r.uid}|${r.status}|${r.rawStatus}|${r.location}|${r.applyTime}`)
      .sort()
      .join('||'));
  }

  function pageMeta() {
    return { title: document.title, url: location.href, host: location.hostname };
  }

  function parseCustom(cfg, companyAlias) {
    const cards = safeQueryAll(cfg.card || 'body');
    return cards.map(card => buildRecord({
      company: selectText(card, cfg.company) || companyAlias,
      position: selectText(card, cfg.position),
      location: selectText(card, cfg.location),
      applyTime: selectText(card, cfg.time),
      rawStatus: selectText(card, cfg.status),
      url: selectHref(card, cfg.link),
      sourceId: extractApplicationId(card, selectHref(card, cfg.link)),
      positionScore: 12,
      cardScore: 12
    }, companyAlias)).filter(Boolean);
  }

  function parseGeneric(companyAlias) {
    const pageCompany = companyAlias || inferCompanyFromPage('');
    const nodes = collectRecordCandidates();
    return nodes.map(node => inferFromNode(node, pageCompany)).filter(Boolean);
  }

  // --------------------------
  // 1) 通用记录容器发现
  // --------------------------
  function collectRecordCandidates() {
    const pool = new Set();

    const structuralSelector = [
      'article', 'li', 'tr', '[role="listitem"]', '[role="row"]',
      '[class*="record"]', '[class*="apply"]', '[class*="delivery"]', '[class*="application"]',
      '[class*="job"]', '[class*="position"]', '[class*="item"]', '[class*="card"]', '[class*="process"]'
    ].join(',');

    const structuralNodes = document.querySelectorAll(structuralSelector);
    for (let i = 0, n = Math.min(structuralNodes.length, 2200); i < n; i++) {
      const el = structuralNodes[i];
      if (recordContainerScore(el) >= 5) pool.add(el);
    }

    for (const anchor of findRecordAnchors()) {
      const card = chooseCardAncestor(anchor);
      if (card) pool.add(card);
    }

    const candidates = [...pool]
      .filter(el => el?.isConnected && isVisible(el))
      .map(el => ({ el, score: recordContainerScore(el), text: compactText(el.innerText) }))
      .filter(x => x.text.length >= 10 && x.text.length <= 1800 && x.score >= 4.5)
      .sort((a, b) => b.score - a.score || a.text.length - b.text.length);

    const picked = [];
    for (const c of candidates) {
      let duplicate = false;
      for (let i = 0; i < picked.length; i++) {
        const p = picked[i];
        if (p.el === c.el) { duplicate = true; break; }
        if (p.el.contains(c.el) || c.el.contains(p.el)) {
          const pStats = cardStats(p.el);
          const cStats = cardStats(c.el);
          const pGlobal = pStats.fullDates.length > 1 || pStats.jobCount > 2;
          const cGlobal = cStats.fullDates.length > 1 || cStats.jobCount > 2;
          if (pGlobal && !cGlobal) {
            picked[i] = c;
            duplicate = true;
            break;
          }
          if (cGlobal && !pGlobal) { duplicate = true; break; }
          // 同一条记录优先更小、更紧凑的容器。
          if (sameRecordSignature(p.el, c.el)) {
            if (c.text.length < p.text.length && c.score >= p.score - 1.5) picked[i] = c;
            duplicate = true;
            break;
          }
        } else if (similarity(p.text, c.text) > 0.94) {
          duplicate = true;
          break;
        }
      }
      if (!duplicate) picked.push(c);
      if (picked.length >= 180) break;
    }

    return picked.map(x => x.el);
  }

  function findRecordAnchors() {
    const result = [];
    const all = document.querySelectorAll('body *');
    const max = Math.min(all.length, 4500);
    for (let i = 0; i < max; i++) {
      const el = all[i];
      if (!isVisible(el)) continue;
      const t = cleanText(el.innerText || el.textContent || '');
      if (!t || t.length > 130) continue;
      if (!isLeafish(el, t)) continue;
      if (isUiActionText(t) || NAV_RE.test(t) || isAnnouncementText(t)) continue;
      const fullDate = FULL_DATE_RE.test(t);
      const directStatus = !!matchDirectStatus(t);
      const stage = !!matchStage(t);
      const labeledCue = /^(?:投递时间|申请时间|应聘时间|提交时间|当前状态|投递状态|申请状态|应聘状态)[：:]/.test(t);
      // 记录锚点必须是“申请事件/状态”信号。岗位/职类文本本身不能独自创建一条记录。
      if (fullDate || directStatus || stage || labeledCue) result.push(el);
      if (result.length >= 700) break;
    }
    return result;
  }

  function chooseCardAncestor(anchor) {
    let cur = anchor;
    let best = null;
    let bestScore = -Infinity;
    let bestLen = Infinity;
    for (let depth = 0; cur && depth < 8; depth++, cur = cur.parentElement) {
      if (!cur || cur === document.body || cur === document.documentElement) break;
      const txt = compactText(cur.innerText);
      if (txt.length < 10 || txt.length > 1800) continue;
      const s = recordContainerScore(cur);
      if (s > bestScore + 0.3 || (Math.abs(s - bestScore) <= 0.3 && txt.length < bestLen)) {
        bestScore = s;
        bestLen = txt.length;
        best = cur;
      }
    }
    return bestScore >= 4.5 ? best : null;
  }

  function cardStats(el) {
    const raw = compactText(el.innerText || '');
    const fullDates = uniqueMatches(raw, new RegExp(FULL_DATE_RE.source, 'g'));
    const lines = raw.split(/\n+/).map(cleanText).filter(Boolean);
    let jobCount = 0;
    let directStatusCount = 0;
    for (const line of lines.slice(0, 120)) {
      if (line.length <= 120 && !isUiActionText(line) && !isAnnouncementText(line) && positionTextScore(line) >= 5) jobCount++;
      if (line.length <= 50 && matchDirectStatus(line) && !isUiActionText(line)) directStatusCount++;
    }
    return { raw, fullDates, lines, jobCount, directStatusCount };
  }

  function recordContainerScore(el) {
    if (!el || !isVisible(el)) return -100;
    const { raw, fullDates, jobCount, directStatusCount } = cardStats(el);
    if (raw.length < 10 || raw.length > 2000) return -100;

    // 通用解析的核心不变量：一条申请记录必须至少有一个“像岗位的标题”，并且要有申请事件/状态/流程信号。
    const recordCue = fullDates.length > 0 || directStatusCount > 0 || /(投递时间|申请时间|应聘时间|提交时间|投递简历|简历投递|简历筛选|简历评估|测评|笔试|面试|录用评估|预入职|第\s*\d+\s*志愿)/i.test(raw);
    if (jobCount < 1 || !recordCue) return -100;

    let s = 0;
    if (jobCount === 1) s += 7;
    else if (jobCount === 2) s += 2;
    else if (jobCount > 2) s -= Math.min(14, (jobCount - 2) * 3.5);

    if (fullDates.length === 1) s += 4.5;
    else if (fullDates.length > 1) s -= Math.min(14, (fullDates.length - 1) * 5);

    if (directStatusCount === 1) s += 2;
    else if (directStatusCount > 1) s += 0.5;
    if (extractCities(raw).length || /(工作地点|意向地点|工作地|城市)/.test(raw)) s += 1;
    if (/(投递时间|申请时间|投递简历|申请职位|应聘职位|志愿)/.test(raw)) s += 1.5;

    if (raw.length >= 30 && raw.length <= 750) s += 2;
    else if (raw.length > 1200) s -= 4;

    if (el.matches('li,article,tr,[role="listitem"],[role="row"]')) s += 1.2;
    if (/(card|item|record|application|apply|delivery|position|job)/i.test(String(el.className || ''))) s += 0.8;
    s += repeatedSiblingBonus(el);

    // 一个容器同时含多个日期和多个岗位，通常是列表外壳而非单条记录。
    if (fullDates.length >= 2 && jobCount >= 2) s -= 7;
    if (APP_PAGE_RE.test(raw.slice(0, 80)) && fullDates.length >= 2) s -= 2;
    return s;
  }

  function repeatedSiblingBonus(el) {
    const parent = el.parentElement;
    if (!parent || parent.children.length < 2 || parent.children.length > 80) return 0;
    let similar = 0;
    for (const sib of [...parent.children].slice(0, 40)) {
      if (sib === el || !isVisible(sib)) continue;
      const t = cleanText(sib.innerText || '');
      if (t.length < 15 || t.length > 1500) continue;
      const hasJob = positionTextScoreFromContainer(sib) >= 5;
      const hasRecordCue = FULL_DATE_RE.test(t) || matchDirectStatus(t) || /(投递|申请|应聘)/.test(t);
      if (hasJob && hasRecordCue) similar++;
      if (similar >= 2) break;
    }
    return similar >= 2 ? 3 : similar === 1 ? 1.5 : 0;
  }

  function sameRecordSignature(a, b) {
    const sa = cardStats(a), sb = cardStats(b);
    if (sa.fullDates.length === 1 && sb.fullDates.length === 1 && sa.fullDates[0] !== sb.fullDates[0]) return false;
    const pa = bestPositionTextQuick(sa.lines), pb = bestPositionTextQuick(sb.lines);
    if (pa && pb && pa !== pb && similarity(pa, pb) < 0.7) return false;
    return true;
  }

  // --------------------------
  // 2) 单条记录字段推断
  // --------------------------
  function inferFromNode(node, pageCompany) {
    const raw = compactText(node.innerText);
    if (!raw || raw.length < 8) return null;
    const units = collectTextUnits(node);

    const positionMeta = inferPosition(node, units);
    const positionLabeled = labeledValue(node, units, ['岗位名称','职位名称','应聘职位','申请职位','岗位','职位'], 'position');
    let position = positionLabeled || positionMeta.value;
    const positionScore = positionLabeled ? Math.max(positionMeta.score, 11) : positionMeta.score;

    const company = pageCompany || labeledValue(node, units, ['公司','企业','雇主'], 'company') || inferCompany(units);
    const locationText = labeledValue(node, units, ['工作地点','工作地','意向地点','意向城市','地点','城市'], 'location') || inferLocation(units, raw);
    position = cleanPositionAgainstLocation(position, locationText);
    const applyTime = labeledValue(node, units, ['投递时间','申请时间','应聘时间','提交时间'], 'date') || inferDate(units, raw);
    const rawStatus = labeledValue(node, units, ['当前状态','投递状态','申请状态','应聘状态','状态','进度'], 'status') || inferStatus(node, units);
    const link = bestLink(node, positionMeta.el, position);
    const sourceId = extractApplicationId(node, link);
    const cardScore = recordContainerScore(node);

    return buildRecord({ company, position, location: locationText, applyTime, rawStatus, url: link, sourceId, positionScore, cardScore }, pageCompany);
  }

  function collectTextUnits(node) {
    const out = [];
    const seen = new Set();
    const candidates = [node, ...node.querySelectorAll('h1,h2,h3,h4,h5,h6,a,button,p,span,div,td,th,label,strong,b,em,i')];
    for (const el of candidates.slice(0, 1200)) {
      if (!isVisible(el)) continue;
      const t = cleanText(el.innerText || el.textContent || '');
      if (!t || t.length > 220 || seen.has(t)) continue;
      if (!isLeafish(el, t) && !/^H[1-6]$/.test(el.tagName)) continue;
      seen.add(t);
      out.push({ text: t, el });
    }
    if (!out.length) {
      for (const t of compactText(node.innerText).split(/\n+/).map(cleanText).filter(Boolean)) {
        if (!seen.has(t) && t.length <= 220) out.push({ text: t, el: node });
      }
    }
    return out;
  }

  function isLeafish(el, text) {
    if (!el.children?.length) return true;
    const childTexts = [...el.children].map(c => cleanText(c.innerText || '')).filter(Boolean);
    if (!childTexts.length) return true;
    return childTexts.join(' ').length < text.length * 0.82;
  }

  // 标签必须位于文本开头或独立字段边界，绝不再把“变更职位”里的“职位”当 label。
  function labeledValue(node, units, labels, kind) {
    const allLabels = FIELD_LABELS.map(escapeRe).join('|');
    for (const { text, el } of units) {
      for (const label of labels) {
        const direct = text.match(new RegExp(`^${escapeRe(label)}\\s*[：:]\\s*(.+)$`, 'i'));
        if (direct) {
          const v = direct[1].replace(new RegExp(`\\s+(?=(?:${allLabels})\\s*[：:])`, 'i'), '\n').split('\n')[0].trim();
          const checked = validateLabeledValue(v, kind);
          if (checked) return checked;
        }
        if (text === label) {
          const next = nextMeaningfulText(el);
          const checked = validateLabeledValue(next, kind);
          if (checked) return checked;
        }
      }
    }

    // 支持“意向地点：深圳 招聘类型：全职 项目：... 投递时间：...”这种同一行多字段。
    const lines = compactText(node.innerText || '').split(/\n+/).map(cleanText).filter(Boolean);
    for (const line of lines) {
      for (const label of labels) {
        const re = new RegExp(`(?:^|\\s)${escapeRe(label)}\\s*[：:]\\s*(.+?)(?=\\s+(?:${allLabels})\\s*[：:]|$)`, 'i');
        const m = line.match(re);
        if (m) {
          const checked = validateLabeledValue(m[1], kind);
          if (checked) return checked;
        }
      }
    }
    return '';
  }

  function validateLabeledValue(v, kind) {
    let s = cleanField(v);
    if (!s) return '';
    if (kind === 'position') {
      s = cleanPosition(s);
      if (!s || isUiActionText(s) || NAV_RE.test(s) || isAnnouncementText(s) || positionTextScore(s) < 3) return '';
      return s;
    }
    if (kind === 'company') return cleanCompany(s);
    if (kind === 'location') return cleanLocation(s);
    if (kind === 'status') {
      if (isUiActionText(s)) return '';
      return cleanStatus(s);
    }
    if (kind === 'date') {
      const full = s.match(FULL_DATE_RE)?.[1];
      if (full) return full;
      const short = s.match(SHORT_DATE_RE)?.[1];
      return short || '';
    }
    return s;
  }

  function nextMeaningfulText(el) {
    if (!el) return '';
    let next = el.nextElementSibling;
    for (let i = 0; next && i < 3; i++, next = next.nextElementSibling) {
      const t = cleanText(next.innerText || next.textContent || '');
      if (t && !FIELD_LABELS.includes(t)) return t;
    }
    const parent = el.parentElement;
    if (parent) {
      const kids = [...parent.children];
      const idx = kids.indexOf(el);
      for (let i = idx + 1; i < Math.min(kids.length, idx + 4); i++) {
        const t = cleanText(kids[i]?.innerText || '');
        if (t && !FIELD_LABELS.includes(t)) return t;
      }
    }
    return '';
  }

  function buildRecord(data, companyAlias = '') {
    const company = cleanCompany(companyAlias || data.company || inferCompanyFromPage('') || hostBrand());
    const locationText = cleanLocation(data.location);
    const position = cleanPositionAgainstLocation(cleanPosition(data.position), locationText);
    const applyTime = normalizeDate(cleanField(data.applyTime));
    const rawStatus = cleanStatus(data.rawStatus);
    const platform = inferPlatform();
    const url = sanitizeUrl(data.url || location.href);
    const status = normalizeStatus(rawStatus);
    // 只有明确 application/apply/delivery id 才作为强唯一键；通用 record/process DOM id 可能只是流程子节点 id。
    // 语义 UID 不再依赖公司展示名：品牌清洗/公司简称升级后，仍应更新原记录而不是重复新增。
    const reliableSourceId = isStrongApplicationId(data.sourceId) ? data.sourceId : '';
    const stable = reliableSourceId
      ? `application|${platform}|${reliableSourceId}`
      : `semantic-v2|${platform}|${position}|${applyTime}|${canonicalApplicationPage(url)}`;

    const confidence = recordConfidence({
      company, position, location: locationText, applyTime, rawStatus,
      positionScore: Number(data.positionScore || 0), cardScore: Number(data.cardScore || 0)
    });

    return {
      company,
      position,
      location: locationText,
      applyTime,
      status,
      rawStatus,
      platform,
      url,
      uid: `${safeHost()}-${hash32(stable)}`,
      _sourceId: reliableSourceId,
      _confidence: confidence
    };
  }

  function recordConfidence(r) {
    let s = 0;
    s += Math.min(0.52, Math.max(0, r.positionScore) * 0.045);
    if (r.company) s += 0.12;
    if (r.location) s += 0.08;
    if (r.applyTime) s += 0.08;
    if (r.rawStatus) s += 0.08;
    if (r.cardScore >= 6) s += 0.12;
    return Math.max(0, Math.min(1, s));
  }

  function isUsableRecord(r) {
    if (!r?.position || r.position.length < 3) return false;
    if (/^(职位|岗位|职位名称|岗位名称|校园招聘|社会招聘|记录|投递记录)$/i.test(r.position)) return false;
    if (r.position.length > 110) return false;
    if (isUiActionText(r.position) || NAV_RE.test(r.position) || isAnnouncementText(r.position)) return false;
    if (CATEGORY_OR_NAV_RE.test(r.position) && !STRONG_ROLE_RE.test(r.position)) return false;
    if (positionTextScore(r.position) < 4.5) return false;
    return (r._confidence || 0) >= 0.48;
  }

  // --------------------------
  // 3) 公司名推断
  // --------------------------
  function inferCompanyFromPage(companyAlias = '') {
    if (companyAlias) return companyAlias;
    const candidates = [];
    const sourceBase = {
      'brand': 9, 'top-left': 8, 'header': 7, 'structured-org': 7,
      'structured-site': 6, 'declared': 7.5, 'runtime-json': 7, 'meta': 5.5, 'title-part': 4, 'title': 3
    };
    const push = (text, source, bonus = 0) => {
      const rawText = cleanText(text || '');
      if (!rawText) return;
      const sloganPenalty = /^(?:欢迎(?:加入|来到)|加入(?:我们)?|诚邀加入)/.test(rawText) ? -4 : 0;
      for (const value of companyVariants(rawText)) {
        if (!value || GENERIC_COMPANY_RE.test(value) || COMPANY_NOISE_RE.test(value)) continue;
        candidates.push({ value, source, bonus: (sourceBase[source] || 0) + bonus + sloganPenalty });
      }
    };

    // 结构化数据属于站点主动声明的语义信息；若存在 Organization / JobPosting.hiringOrganization，优先作为强证据。
    for (const item of extractStructuredCompanyCandidates()) {
      push(item.value, item.source, item.bonus || 0);
    }

    push(document.querySelector('meta[property="og:site_name"]')?.content, 'meta');
    push(document.querySelector('meta[name="application-name"]')?.content, 'meta');
    push(document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content, 'meta');

    const companyAttrs = ['data-company-name','data-company','data-corp-name','data-enterprise-name','data-employer-name','data-organization-name','data-org-name','data-brand-name','data-tenant-name','data-site-name'];
    for (const el of [...document.querySelectorAll(companyAttrs.map(x => `[${x}]`).join(','))].slice(0, 120)) {
      for (const attr of companyAttrs) {
        const value = el.getAttribute?.(attr);
        if (value) push(value, 'declared');
      }
    }

    const title = cleanText(document.title);
    push(title, 'title');
    for (const p of title.split(/[-_|｜·—–]/).map(s => s.trim()).filter(Boolean)) push(p, 'title-part');

    const brandSelectors = [
      'header [class*="brand"]', 'header [class*="logo"]', 'nav [class*="brand"]', 'nav [class*="logo"]',
      '[class*="header"] [class*="brand"]', '[class*="header"] [class*="logo"]',
      'header img[alt]', '[class*="logo"] img[alt]', 'img[class*="logo"][alt]',
      '[itemtype*="Organization"] [itemprop="name"]', '[itemtype*="Corporation"] [itemprop="name"]',
      '[aria-label*="招聘"]', '[title*="招聘"]'
    ];
    for (const sel of brandSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        push(el.innerText || el.alt || el.getAttribute?.('aria-label') || el.getAttribute?.('title'), 'brand');
      }
    }

    const top = document.querySelectorAll('header *, nav *, [class*="header"] *');
    for (let i = 0, n = Math.min(top.length, 350); i < n; i++) {
      const el = top[i];
      if (!isVisible(el)) continue;
      const t = cleanText(el.innerText || el.textContent || '');
      if (t.length >= 2 && t.length <= 50) push(t, 'header');
    }

    // 很多招聘站的顶栏没有 header/logo class。扫描页面左上区域，用位置、字号与可见性寻找品牌文字。
    const topLeft = document.querySelectorAll('body *');
    for (let i = 0, n = Math.min(topLeft.length, 900); i < n; i++) {
      const el = topLeft[i];
      if (!isVisible(el)) continue;
      const t = cleanText(el.innerText || el.textContent || '');
      if (!t || t.length < 2 || t.length > 36 || !isLeafish(el, t)) continue;
      const r = safeRect(el);
      if (r.top < -5 || r.top > 125 || r.left < -5 || r.left > Math.min(560, innerWidth * 0.45)) continue;
      const st = safeStyle(el);
      const fs = parseFloat(st?.fontSize || '0');
      let bonus = 0;
      if (r.left <= 360) bonus += 1.2;
      if (r.top <= 75) bonus += 0.8;
      if (fs >= 18) bonus += 1.2;
      if (fs >= 22) bonus += 0.8;
      push(t, 'top-left', bonus);
    }

    if (!candidates.length) return '';
    const scored = candidates
      .map(c => ({ ...c, score: companyCandidateScore(c.value) + c.bonus }))
      .filter(c => c.score > -5);

    // 候选共识：视觉品牌与法律全称/营销文案共享明显品牌根时，优先短而稳定的视觉品牌。
    for (const c of scored) {
      if (!isVisualBrandSource(c.source)) continue;
      for (const other of scored) {
        if (c === other) continue;
        const affinity = companyBrandAffinity(c.value, other.value);
        if (affinity >= 2) c.score += Math.min(4, affinity * 0.9);
      }
      if (looksLikeBrandDisplay(c.value)) c.score += 1.5;
    }

    scored.sort((a, b) => b.score - a.score || companyDisplayLength(a.value) - companyDisplayLength(b.value));
    return scored[0]?.score >= 4 ? scored[0].value : '';
  }

  function extractStructuredCompanyCandidates() {
    const out = [];
    const seen = new Set();
    let nodes = 0;
    const add = (v, source, bonus = 0, context = '') => {
      const t = cleanText(v || '');
      if (!t || COMPANY_NOISE_RE.test(t) || COMPANY_CONTEXT_BAD_RE.test(context || '')) return;
      const key = `${source}|${t}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ value: t, source, bonus });
    };
    const visit = (value, depth = 0, path = [], visited = new WeakSet()) => {
      if (!value || depth > 7 || nodes++ > 2400 || typeof value !== 'object') return;
      if (visited.has(value)) return;
      visited.add(value);
      if (Array.isArray(value)) {
        for (const x of value.slice(0, 60)) visit(x, depth + 1, path, visited);
        return;
      }
      const pathText = path.join('.');
      const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']].filter(Boolean);
      const typeText = types.join(' ').toLowerCase();
      if (/(organization|corporation|localbusiness)/.test(typeText)) {
        add(value.name, 'structured-org', 1.5, `${pathText}.name`);
        add(value.alternateName, 'structured-org', 0.8, `${pathText}.alternateName`);
      }
      if (/website/.test(typeText)) {
        add(value.name, 'structured-site', 0.5, `${pathText}.name`);
        add(value.alternateName, 'structured-site', 0.3, `${pathText}.alternateName`);
      }
      if (/jobposting/.test(typeText)) {
        const org = value.hiringOrganization;
        if (typeof org === 'string') add(org, 'structured-org', 2, `${pathText}.hiringOrganization`);
        else if (org && typeof org === 'object') {
          add(org.name, 'structured-org', 2, `${pathText}.hiringOrganization.name`);
          add(org.alternateName, 'structured-org', 1, `${pathText}.hiringOrganization.alternateName`);
        }
      }
      for (const [k, v] of Object.entries(value).slice(0, 180)) {
        if (k === '@context') continue;
        const nextPath = [...path, k];
        const nextPathText = nextPath.join('.');
        if ((typeof v === 'string' || typeof v === 'number') && ApplicationContract?.fieldKind?.(k, nextPathText) === 'company') {
          add(String(v), 'runtime-json', 1.2, nextPathText);
        } else if (v && typeof v === 'object' && !COMPANY_CONTEXT_BAD_RE.test(nextPathText)) {
          visit(v, depth + 1, nextPath, visited);
        }
      }
    };
    let budget = 0;
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"],script[type="application/json"],script#__NEXT_DATA__,script#__NUXT_DATA__')].slice(0, 24);
    for (const script of scripts) {
      const raw = script.textContent || '';
      if (!raw || raw.length > 600_000) continue;
      budget += raw.length;
      if (budget > 900_000) break;
      try { visit(JSON.parse(raw), 0, [script.id || script.type || 'json']); } catch {}
    }
    return out.slice(0, 120);
  }

  function companyVariants(text) {
    const raw = cleanText(text || '');
    if (!raw) return [];
    const pieces = [raw, ...raw.split(/[|｜·—–]/).map(x => x.trim())];
    const out = [];
    for (let p of pieces) {
      p = cleanCompany(p);
      if (!p || GENERIC_COMPANY_RE.test(p) || COMPANY_NOISE_RE.test(p)) continue;
      if (/^(logo|icon|brand|image|img)$/i.test(p)) continue;
      if (!out.includes(p)) out.push(p);
    }
    return out;
  }

  function inferCompany(units) {
    const candidates = units.map(u => cleanCompany(u.text)).filter(Boolean);
    return candidates.find(x => /(有限公司|集团|科技|网络|智能|银行|证券|研究院|实验室|大学|股份|公司|汽车|机器人)/.test(x) && x.length <= 55) || '';
  }

  function companyCandidateScore(v) {
    if (!v || GENERIC_COMPANY_RE.test(v) || COMPANY_NOISE_RE.test(v)) return -100;
    let s = 0;
    if (/^(?:欢迎(?:加入|来到)|加入(?:我们)?|诚邀加入)/.test(v) || /[！!]{1,}$/.test(v)) s -= 4;
    if (COHORT_RE.test(v)) return -20;
    if (/^[\d*+()\-\s]{4,}$/.test(v) || /\*{2,}/.test(v)) return -20;
    const corporate = /(有限公司|集团|科技|网络|智能|银行|证券|研究院|实验室|大学|股份|公司|汽车|机器人)/.test(v);
    const formalCorporate = /(有限公司|集团|科技|网络|银行|证券|研究院|实验室|大学|股份|公司|汽车|机器人)/.test(v);
    if (corporate) s += 4;
    if (COMPANY_CONTEXT_NOISE_RE.test(v) && !formalCorporate) s -= 12;
    if (/[\u4e00-\u9fff]/.test(v) && v.length <= 16) s += 3;
    if (/^[A-Za-z][A-Za-z0-9 .&+\-]{1,28}$/.test(v)) s += 1;
    if (/[\u4e00-\u9fff].*[A-Za-z0-9]|[A-Za-z0-9].*[\u4e00-\u9fff]/.test(v) && v.length <= 24) s += 1.5; // 影石Insta360、智元AGIBOT 等品牌展示名
    if (POSITION_SIGNAL_RE.test(v) || DIRECT_STATUS_RE.test(v) || FULL_DATE_RE.test(v)) s -= 6;
    if (/(记录|投递|申请|应聘|岗位|职位|个人中心|候选人|详情|更多|首页|菜单|收藏|流程)/.test(v)) s -= 7;
    if (/^(logo|icon|brand|image|img)$/i.test(v)) s -= 20;
    if (v.length > 35) s -= 4;
    return s;
  }

  function isVisualBrandSource(source) {
    return /^(brand|top-left|header)$/.test(source || '');
  }

  function looksLikeBrandDisplay(v) {
    const s = cleanCompany(v || '');
    if (!s || s.length > 24) return false;
    if (/(有限公司|股份有限公司|有限责任公司)$/.test(s)) return false;
    return /[\u4e00-\u9fffA-Za-z]/.test(s);
  }

  function companyDisplayLength(v) {
    return cleanText(v || '').replace(/\s+/g, '').length;
  }

  function companyBrandAffinity(a, b) {
    const x = cleanCompany(a || ''), y = cleanCompany(b || '');
    if (!x || !y || x === y) return x && y ? 4 : 0;
    const nx = companySemanticCore(x), ny = companySemanticCore(y);
    if (!nx || !ny) return 0;
    if (nx.includes(ny) || ny.includes(nx)) return Math.min(5, Math.max(2, Math.min(nx.length, ny.length) / 2));
    const cjkA = (nx.match(/[\u4e00-\u9fff]+/g) || []).join('');
    const cjkB = (ny.match(/[\u4e00-\u9fff]+/g) || []).join('');
    let prefix = 0;
    while (prefix < cjkA.length && prefix < cjkB.length && cjkA[prefix] === cjkB[prefix]) prefix++;
    if (prefix >= 2) return Math.min(4, prefix);
    const ta = new Set(nx.split(/[^a-z0-9\u4e00-\u9fff]+/).filter(t => t.length >= 2));
    const tb = new Set(ny.split(/[^a-z0-9\u4e00-\u9fff]+/).filter(t => t.length >= 2));
    for (const t of ta) if (tb.has(t)) return 2;
    return 0;
  }

  function companySemanticCore(v) {
    return cleanCompany(v || '')
      .toLowerCase()
      .replace(/(?:科技股份有限公司|股份有限公司|有限责任公司|有限公司|集团股份有限公司|集团有限公司|集团|公司)$/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  // --------------------------
  // 4) 岗位标题推断
  // --------------------------
  function inferPosition(node, units) {
    const scored = [];
    const nodeRect = safeRect(node);
    for (const { text, el } of units) {
      const t = cleanPosition(text);
      if (!t || t.length < 3 || t.length > 110) continue;
      let s = positionTextScore(t);
      if (s <= -10) continue;

      if (/^H[1-6]$/.test(el?.tagName || '')) s += 4;
      if (el?.getAttribute?.('role') === 'heading') s += 3;
      if (/(title|name|position|job)/i.test(String(el?.className || ''))) s += 2;
      if (/^(title|name)$/.test(el?.getAttribute?.('itemprop') || '')) s += 3;
      if (/(position|job|title|role)/i.test(`${el?.getAttribute?.('data-testid') || ''} ${el?.getAttribute?.('data-test') || ''} ${el?.getAttribute?.('aria-label') || ''}`)) s += 1.5;
      if (el?.matches?.('button,[role="button"]')) s -= 8;
      if (el?.matches?.('a[href]')) s += isUiActionText(t) ? -8 : 0.5;

      const style = safeStyle(el);
      const fontSize = parseFloat(style?.fontSize || '0');
      const fontWeight = parseInt(style?.fontWeight || '400', 10);
      if (fontSize >= 18) s += 2.5;
      else if (fontSize >= 16) s += 1.5;
      if (fontWeight >= 600) s += 1;

      const r = safeRect(el);
      if (nodeRect.height > 0 && r.height > 0) {
        const rel = (r.top - nodeRect.top) / Math.max(1, nodeRect.height);
        if (rel >= -0.05 && rel <= 0.35) s += 1.5;
      }

      scored.push({ value: t, score: s, el });
    }
    scored.sort((a, b) => b.score - a.score || a.value.length - b.value.length);
    return scored[0]?.score >= 5 ? scored[0] : { value: '', score: 0, el: null };
  }

  function positionTextScore(text) {
    const t = cleanPosition(text);
    if (!t) return -100;
    if (isUiActionText(t) || NAV_RE.test(t) || EMPLOYMENT_TYPE_RE.test(t)) return -100;
    if (isAnnouncementText(t)) return -20;
    const hasRoleNoun = STRONG_ROLE_RE.test(t);
    if (CATEGORY_OR_NAV_RE.test(t) && !hasRoleNoun) return -100;
    if (/^(公司|企业|雇主|招聘类型|项目|意向地点|工作地点|工作地|地点|城市|投递时间|申请时间|应聘时间|提交时间|状态|进度)[：:]?/i.test(t)) return -15;

    let s = 0;
    const strong = countRegexHits(t, STRONG_ROLE_RE);
    const tech = countRegexHits(t, TECH_ROLE_RE);
    if (strong) s += Math.min(10, 6 + (strong - 1) * 2);
    if (tech) s += Math.min(2.5, tech * 0.8);
    if (!strong && tech) s += 0.2; // 只有技术/职类词，不足以把“研发-算法 / 数据与算法类”抬成岗位。
    if (t.length >= 5 && t.length <= 60) s += 1.5;
    else if (t.length > 85) s -= 3;
    if (/[【\[].+[】\]]/.test(t)) s += 0.5;
    if (DIRECT_STATUS_RE.test(t)) s -= 5;
    if (FULL_DATE_RE.test(t)) s -= 5;
    if (extractCities(t).length && t.length <= 24 && !strong) s -= 3;
    if (/(投递|申请|应聘|志愿|官网|网申|详情|更多|收藏|流程|简历|招聘类型|意向地点|投递时间)/.test(t) && !strong) s -= 4;
    if (!strong && /^(?:研发|技术|算法|数据|产品|设计|运营|职能|销售|市场|供应链|制造|质量|智能)(?:\s*[-—–/·与及]\s*(?:研发|技术|算法|数据|产品|设计|运营|职能|销售|市场))*$/i.test(t)) s -= 8;
    if (sentenceLike(t)) s -= 7;
    return s;
  }

  function positionTextScoreFromContainer(el) {
    const lines = compactText(el?.innerText || '').split(/\n+/).map(cleanText).filter(Boolean);
    return Math.max(0, ...lines.slice(0, 50).map(positionTextScore));
  }

  function bestPositionTextQuick(lines) {
    let best = '', score = -Infinity;
    for (const line of lines.slice(0, 80)) {
      const s = positionTextScore(line);
      if (s > score) { score = s; best = cleanPosition(line); }
    }
    return score >= 5 ? best : '';
  }

  function isAnnouncementText(t) {
    const s = cleanText(t);
    if (!s) return false;
    if (ANNOUNCEMENT_RE.test(s)) return true;
    if (s.length >= 34 && sentenceLike(s) && !STRONG_ROLE_RE.test(s)) return true;
    return false;
  }

  function sentenceLike(t) {
    const s = cleanText(t);
    const punct = (s.match(/[，。；！!？?：:]/g) || []).length;
    return punct >= 2 || /(?:请|将|需要|关注|完成|设置|升级|根据|情况|为准|通知|邮件|及时|部分)/.test(s) && s.length >= 28;
  }

  // --------------------------
  // 5) 地点 / 日期 / 状态
  // --------------------------
  function inferLocation(units, raw) {
    const scored = [];
    for (const { text } of units) {
      if (isAnnouncementText(text)) continue;
      const cities = extractCities(text);
      if (!cities.length) continue;
      let s = cities.length * 2;
      if (/(工作地点|工作地|意向地点|地点|城市|base)/i.test(text)) s += 4;
      if (DIRECT_STATUS_RE.test(text) || FULL_DATE_RE.test(text)) s -= 2;
      if (STRONG_ROLE_RE.test(text) && text.length < 50) s -= 1;
      if (text.length > 100) s -= 3;
      scored.push({ value: cleanLocation(text), score: s });
    }
    scored.sort((a, b) => b.score - a.score || a.value.length - b.value.length);
    if (scored[0]?.score > 0) return scored[0].value;
    const cities = extractCities(raw);
    return cities.length ? [...new Set(cities)].join(' / ') : '';
  }

  function inferDate(units, raw) {
    const preferred = [];
    const regular = [];
    for (const { text } of units) {
      if (isAnnouncementText(text)) continue;
      const m = text.match(FULL_DATE_RE);
      if (!m) continue;
      if (/(投递时间|申请时间|应聘时间|提交时间)/.test(text)) preferred.push(m[1]);
      else if (text.length <= 90) regular.push(m[1]);
    }
    if (preferred.length) return preferred[0];
    if (regular.length) return regular[0];
    const matches = uniqueMatches(raw, new RegExp(FULL_DATE_RE.source, 'g'));
    return matches.length === 1 ? matches[0] : '';
  }

  function inferStatus(node, units) {
    // 明确终态永远优先于流程阶段名。比如流程图里出现“录用评估”，但卡片角标写“已结束”。
    const terminalCandidates = [];
    for (const { text, el } of units) {
      const t = cleanText(text);
      if (!t || isUiActionText(t) || isAnnouncementText(t)) continue;
      const m = t.match(TERMINAL_STATUS_RE);
      if (m) {
        let score = 14;
        if (t === m[0] || t.length <= m[0].length + 4) score += 3;
        if (el?.matches?.('button,[role="button"],a[href]')) score -= 8;
        terminalCandidates.push({ value: m[0], score });
      }
    }
    const rawTerminal = compactText(node.innerText || '').match(TERMINAL_STATUS_RE)?.[0];
    if (rawTerminal && !/结束流程/.test(rawTerminal)) terminalCandidates.push({ value: rawTerminal, score: 12 });
    terminalCandidates.sort((a,b) => b.score-a.score);
    if (terminalCandidates[0]?.score >= 12) return terminalCandidates[0].value;

    const candidates = [];
    for (const { text, el } of units) {
      const t = cleanText(text);
      if (!t || t.length > 100 || isAnnouncementText(t) || isUiActionText(t)) continue;
      const clickable = !!el?.matches?.('button,[role="button"],a[href]');
      const hints = stateHints(el);

      const direct = matchDirectStatus(t);
      if (direct) {
        let s = OFFER_STATUS_RE.test(direct) ? 11 : 8;
        if (t === direct || t.length <= direct.length + 4) s += 3;
        if (/(status|state|tag|badge|progress|result)/i.test(String(el?.className || ''))) s += 2;
        if (clickable) s -= 6;
        if (STRONG_ROLE_RE.test(t)) s -= 4;
        candidates.push({ value: direct, score: s });
      }

      const stage = matchStage(t);
      if (stage) {
        if (hints.fail) candidates.push({ value: `${stage}未通过`, score: 11 });
        else if (hints.current) candidates.push({ value: stage, score: 9 });
        else if (hints.done) candidates.push({ value: stage, score: 2 });
      }
    }

    // 某些站点把状态放在容器 class/aria 中，文本本身只是流程阶段。
    for (const el of [...node.querySelectorAll('[class*="status"],[class*="state"],[class*="active"],[class*="current"],[class*="fail"],[class*="reject"],[aria-current],[aria-selected="true"]')].slice(0, 120)) {
      if (!isVisible(el)) continue;
      const t = cleanText(el.innerText || el.textContent || '');
      if (!t || isUiActionText(t) || isAnnouncementText(t)) continue;
      const direct = matchDirectStatus(t);
      if (direct) candidates.push({ value: direct, score: 10 });
      const stage = matchStage(t);
      const hints = stateHints(el);
      if (stage && hints.fail) candidates.push({ value: `${stage}未通过`, score: 12 });
      else if (stage && hints.current) candidates.push({ value: stage, score: 10 });
    }

    candidates.sort((a, b) => b.score - a.score || a.value.length - b.value.length);
    return candidates[0]?.score >= 5 ? candidates[0].value : '';
  }

  function stateHints(el) {
    const parts = [];
    let cur = el;
    for (let i = 0; cur && i < 3; i++, cur = cur.parentElement) {
      parts.push(String(cur.className || ''));
      parts.push(cur.getAttribute?.('data-status') || '');
      parts.push(cur.getAttribute?.('data-state') || '');
      parts.push(cur.getAttribute?.('aria-current') || '');
      parts.push(cur.getAttribute?.('aria-selected') || '');
      parts.push(cur.getAttribute?.('title') || '');
    }
    const s = parts.join(' ').toLowerCase();
    return {
      fail: /(fail|failed|failure|reject|rejected|error|wrong|negative|terminate|closed|notpass|not-pass)/i.test(s),
      current: /(active|current|processing|doing|pending|selected|inprogress|in-progress)/i.test(s),
      done: /(done|finish|finished|complete|completed|success|passed|\bpass\b)/i.test(s)
    };
  }

  function matchDirectStatus(text) {
    const s = cleanText(text);
    if (!s || isUiActionText(s)) return '';
    // “录用评估/面试/简历筛选”等是流程阶段标签，不能因为内部含“录用”等词被当成当前状态。
    if (STAGE_RE.test(s.replace(/\s+/g, ''))) return '';
    const m = s.match(new RegExp(DIRECT_STATUS_RE.source, 'i'));
    return m?.[0] || '';
  }

  function matchStage(text) {
    const s = cleanStatus(text).replace(/\s+/g, '');
    const m = s.match(STAGE_RE);
    return m?.[1] || '';
  }

  function normalizeStatus(raw) {
    const s = (raw || '').toLowerCase();
    if (/offer|录用|意向书|通过.*录用/.test(s) && !/未通过|不通过|拒绝/.test(s)) return 'Offer';
    if (/撤回/.test(s)) return '已撤回';
    if (/不合适|不通过|未通过|结束|拒绝|淘汰|终止|失败/.test(s)) return '已结束';
    if (/面试|一面|二面|三面|四面|hr面|终面|待面试/.test(s)) return '面试中';
    if (/笔试|测评|考试|测验/.test(s)) return '笔试/测评';
    if (/筛选|评估|处理中|待处理|简历审核|初筛|流程中/.test(s)) return '筛选中';
    return '已投递';
  }

  // --------------------------
  // 6) 链接 / ID / 平台
  // --------------------------
  function bestLink(node, positionEl, positionText) {
    const links = [...node.querySelectorAll('a[href]')].filter(a => a.href && /^https?:/i.test(a.href));
    if (!links.length) return location.href;
    const scored = links.map(a => {
      const text = cleanText(a.innerText || a.getAttribute('aria-label') || a.title || '');
      let s = 0;
      if (positionEl && (a === positionEl || a.contains(positionEl) || positionEl.contains?.(a))) s += 8;
      if (positionText && text && (text.includes(positionText) || positionText.includes(text)) && text.length >= 4) s += 6;
      if (/(detail|position\/|job\/|jobs\/|positionId|jobId)/i.test(a.href)) s += 2;
      if (/(apply|application|delivery|my-apply|myapply|mydeliver)/i.test(a.href)) s += 1;
      if (isUiActionText(text) || NAV_RE.test(text)) s -= 7;
      if (/\/(jobs?|positions?)\/?(?:#.*)?$/i.test(new URL(a.href).pathname)) s -= 2;
      return { href: a.href, score: s };
    }).sort((a, b) => b.score - a.score);
    return scored[0]?.score >= 2 ? scored[0].href : location.href;
  }

  function extractApplicationId(node, url) {
    const attrs = ['data-application-id', 'data-apply-id', 'data-delivery-id', 'data-record-id', 'data-process-id'];
    for (const el of [node, ...(node?.querySelectorAll?.('*') || [])].slice(0, 150)) {
      for (const name of attrs) {
        const v = el?.getAttribute?.(name);
        if (v && /^[A-Za-z0-9_\-:.]{3,120}$/.test(v)) return `${name}:${v}`;
      }
      if (el?.dataset) {
        for (const [k, v] of Object.entries(el.dataset)) {
          if (/(application|apply|delivery|record|process).*id|^(applicationId|applyId|deliveryId|recordId|processId)$/i.test(k) && v) {
            return `dataset:${k}:${v}`;
          }
        }
      }
    }
    try {
      const u = new URL(url, location.href);
      const keys = ['applicationId', 'application_id', 'applyId', 'apply_id', 'deliveryId', 'delivery_id', 'recordId', 'record_id', 'processId', 'process_id'];
      for (const k of keys) {
        const v = u.searchParams.get(k);
        if (v) return `${k}:${v}`;
      }
    } catch {}
    return '';
  }

  function isStrongApplicationId(v) {
    const s = String(v || '');
    return /(?:data-application-id|data-apply-id|data-delivery-id|dataset:(?:application|apply|delivery)|^(?:applicationId|application_id|applyId|apply_id|deliveryId|delivery_id):)/i.test(s);
  }

  function inferPlatform() {
    const host = safeHost().replace(/^www\./, '');
    const known = [
      ['zhaopin.com','智联招聘'], ['51job.com','前程无忧'], ['liepin.com','猎聘'], ['nowcoder.com','牛客'],
      ['bosszhipin.com','BOSS直聘'], ['lagou.com','拉勾'], ['yingjiesheng.com','应届生求职网'], ['moka.jobs','Moka']
    ];
    return known.find(([d]) => host.endsWith(d))?.[1] || host;
  }

  function hostBrand() {
    const host = safeHost().replace(/^www\./, '').toLowerCase();
    const parts = host.split('.');
    const ignore = new Set(['www','jobs','job','career','careers','campus','recruit','recruiting','talent','hr','api','wx','m','cn','com','net','org','feishu']);
    const candidate = parts.find(p => p.length >= 2 && !ignore.has(p)) || '';
    return candidate.replace(/[-_]+/g, ' ').trim();
  }

  function sanitizeUrl(url) {
    try {
      const u = new URL(url, location.href);
      for (const key of [...u.searchParams.keys()]) {
        if (/^utm_/i.test(key) || /^(spm|trackingId|trackId)$/i.test(key)) u.searchParams.delete(key);
      }
      return u.toString();
    } catch { return String(url || '').slice(0, 1000); }
  }

  // --------------------------
  // 清洗 / 工具
  // --------------------------
  function normalizeDate(v) {
    let s = (v || '').replace(/年|月/g, '-').replace(/日/g, '').replace(/\//g, '-').replace(/\./g, '-').trim();
    const m = s.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})(.*)$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}${m[4] || ''}`;
    return s;
  }

  function cleanCompany(v) {
    let s = cleanField(v);
    // 招聘页常见营销前缀：只在句首移除，不碰品牌本身。
    s = s.replace(/^(?:(?:欢迎|诚邀)(?:您)?(?:加入|来到|关注|选择)?|加入(?:我们|本公司|公司)?|走进)\s*/i, '').trim();
    s = s.replace(/[！!]+$/g, '').trim();
    // 年份/届别 + 招聘活动尾巴。
    s = s.replace(/(?:20\d{2}|\d{2})(?:届)?(?:应届生?)?(?:秋季|春季)?(?:校园招聘|校招|招聘)/gi, ' ').trim();
    // 统一去掉纯招聘渠道/活动后缀，但保留公司品牌主体。
    s = s.replace(/[·•|｜\-—–\s]*(?:(?:秋季|春季)?(?:校园招聘|校招官网|校招|社会招聘|社招官网|社招|应届招聘|实习招聘)|人才招聘|招聘官网|招聘平台|招聘中心|招聘网站|招聘主页|招聘)\s*$/i, '').trim();
    s = s.replace(/^[·•|｜\-—–\s]+|[·•|｜\-—–\s]+$/g, '');
    if (GENERIC_COMPANY_RE.test(s) || COMPANY_NOISE_RE.test(s) || COHORT_RE.test(s)) return '';
    if (/^[\d*+()\-\s]{4,}$/.test(s) || /\*{2,}/.test(s)) return '';
    if (COMPANY_CONTEXT_NOISE_RE.test(s) && !/(有限公司|集团|科技|网络|银行|证券|研究院|实验室|大学|股份|公司|汽车|机器人)/.test(s)) return '';
    if (/^(logo|icon|brand|image|img)$/i.test(s)) return '';
    if (POSITION_SIGNAL_RE.test(s) && s.length > 24) return '';
    return s.slice(0, 60);
  }

  function cleanPosition(v) {
    let s = cleanField(v);
    s = s.replace(/^(岗位名称|职位名称|应聘职位|申请职位|岗位|职位)\s*[：:]?\s*/i, '');
    s = s.replace(POSITION_NOISE_RE, ' ');
    s = s.replace(/(?:投递时间|申请时间|应聘时间|提交时间|当前状态|投递状态|申请状态|状态|进度)\s*[：:]?.*$/i, '');
    s = s.replace(/[|｜]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    s = s.replace(/[>》›→]+$/g, '').trim();
    return s.slice(0, 110);
  }

  function cleanPositionAgainstLocation(v, locationText) {
    let s = cleanPosition(v);
    const loc = cleanLocation(locationText || '');
    if (!s || !loc) return s;
    const variants = new Set([loc, ...loc.split(/[\/；;，,、|｜]+/).map(x => x.trim()).filter(x => x.length >= 2)]);
    for (const city of extractCities(loc)) variants.add(city);
    const ordered = [...variants].sort((a, b) => b.length - a.length);
    for (const x of ordered) {
      if (!x || x.length < 2) continue;
      const escaped = escapeRe(x).replace(/\\\s+/g, '\\s*');
      s = s.replace(new RegExp(`\\s*[·•|｜,，;；/\\-—–]*\\s*${escaped}\\s*$`, 'i'), '').trim();
    }
    return s;
  }

  function cleanLocation(v) {
    let s = cleanField(v);
    s = s.replace(/^(工作地点|工作地|意向地点|意向城市|地点|城市)\s*[：:]?\s*/i, '');
    // 去掉列表序号/志愿序号，例如“① 深圳”“1 深圳”“第1志愿 深圳”。
    s = s.replace(/^(?:[①②③④⑤⑥⑦⑧⑨⑩]|\(?\d{1,2}\)?[.、]?|第\s*\d+\s*志愿)\s*/i, '').trim();
    // “深圳；接受调剂到其他城市”中，后半段是偏好而非地点。
    s = s.replace(/\s*[；;,，、|｜]\s*(?:(?:可|愿意|服从)?\s*(?:接受)?\s*调剂|接受调剂|可调剂|服从调剂)(?:到|至)?(?:其他|其它)?(?:城市|地点|地区)?.*$/i, '').trim();
    s = s.replace(/\s+(?:(?:可|愿意|服从)?\s*(?:接受)?\s*调剂|接受调剂|可调剂|服从调剂)(?:到|至)?(?:其他|其它)?(?:城市|地点|地区)?.*$/i, '').trim();
    s = s.replace(/[>》›]+$/g, '').trim();
    if (!s || /^\d{1,3}$/.test(s) || /^第?\s*\d+\s*(?:志愿)?$/i.test(s)) return '';
    const cities = extractCities(s);
    if (s.length > 100) return cities.length ? [...new Set(cities)].join(' / ') : '';
    if (!cities.length && s.length <= 1) return '';
    return s;
  }

  function cleanStatus(v) {
    let s = cleanField(v);
    s = s.replace(/^(当前状态|投递状态|申请状态|应聘状态|状态|进度)\s*[：:]?\s*/i, '');
    s = s.replace(/[>》›→]+$/g, '').trim();
    if (isUiActionText(s)) return '';
    if (s.length > 50) return matchDirectStatus(s) || '';
    return s;
  }

  function isUiActionText(v) {
    const s = cleanText(v).replace(/[>》›→]+$/g, '').trim();
    return UI_ACTION_RE.test(s);
  }

  function extractCities(text) {
    const matches = String(text || '').match(new RegExp(CITY_RE.source, 'g')) || [];
    return [...new Set(matches)];
  }

  function countRegexHits(text, re) {
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
    const r = new RegExp(re.source, flags);
    return (String(text || '').match(r) || []).length;
  }

  function uniqueMatches(text, re) {
    const found = String(text || '').match(re) || [];
    return [...new Set(found.map(x => cleanText(x)))];
  }

  function selectText(card, selector) {
    if (!selector) return '';
    try { return cleanField(card.querySelector(selector)?.innerText || ''); } catch { return ''; }
  }

  function selectHref(card, selector) {
    if (!selector) return bestLink(card, null, '');
    try { return card.querySelector(selector)?.href || ''; } catch { return ''; }
  }

  function safeQueryAll(selector) {
    try { return [...document.querySelectorAll(selector)]; } catch { return []; }
  }

  function dedupe(records) {
    // 第一层：完全相同 UID 去重。
    const exact = new Map();
    for (const r of records) {
      if (!r?.uid) continue;
      const prev = exact.get(r.uid);
      if (!prev || recordQuality(r) > recordQuality(prev)) exact.set(r.uid, r);
    }

    // 第二层：合并“同一张投递卡被拆成主卡 + 流程子卡”的影子记录。
    // 只在岗位高度一致，且日期不冲突时合并；若两个完整记录日期不同则保留，避免误伤重复投递。
    const merged = [];
    for (const r of [...exact.values()].sort((a, b) => recordQuality(b) - recordQuality(a))) {
      const idx = merged.findIndex(x => sameLogicalApplication(x, r));
      if (idx < 0) merged.push(r);
      else merged[idx] = mergeApplicationRecords(merged[idx], r);
    }
    return merged;
  }

  function sameLogicalApplication(a, b) {
    const pa = semanticText(a?.position), pb = semanticText(b?.position);
    if (!pa || !pb || (pa !== pb && similarity(pa, pb) < 0.94)) return false;

    const ca = semanticText(a?.company), cb = semanticText(b?.company);
    if (ca && cb && ca !== cb && similarity(ca, cb) < 0.8) return false;

    const da = dateOnly(a?.applyTime), db = dateOnly(b?.applyTime);
    if (da && db && da !== db) return false;

    // 如果两条都拥有可靠 application/apply/delivery id 且不同，视为不同申请。
    if (a?._sourceId && b?._sourceId && a._sourceId !== b._sourceId) return false;

    const samePage = canonicalApplicationPage(a?.url) === canonicalApplicationPage(b?.url);
    const oneIncomplete = completeness(a) <= 4 || completeness(b) <= 4 || !a?.rawStatus || !b?.rawStatus || !da || !db;
    const sameDate = !!da && da === db;
    return samePage && (oneIncomplete || sameDate);
  }

  function mergeApplicationRecords(a, b) {
    const qa = recordQuality(a), qb = recordQuality(b);
    const primary = qa >= qb ? { ...a } : { ...b };
    const other = qa >= qb ? b : a;

    for (const key of ['company','position','location','applyTime','rawStatus','url','_sourceId']) {
      if (!primary[key] && other[key]) primary[key] = other[key];
    }

    // 地点优先选择像真实地点的值；状态优先选择明确原始状态。
    if (locationQuality(other.location) > locationQuality(primary.location)) primary.location = other.location;
    if (statusQuality(other.rawStatus) > statusQuality(primary.rawStatus)) primary.rawStatus = other.rawStatus;

    primary.status = normalizeStatus(primary.rawStatus);
    primary._confidence = Math.max(a?._confidence || 0, b?._confidence || 0);
    const stable = primary._sourceId
      ? `application|${primary.platform}|${primary._sourceId}`
      : `semantic-v2|${primary.platform}|${primary.position}|${primary.applyTime}|${canonicalApplicationPage(primary.url)}`;
    primary.uid = `${safeHost()}-${hash32(stable)}`;
    return primary;
  }

  function recordQuality(r) {
    return completeness(r) * 10 + (r?._confidence || 0) * 8 + locationQuality(r?.location) + statusQuality(r?.rawStatus);
  }

  function completeness(r) {
    return ['company','position','location','applyTime','rawStatus','url'].reduce((n, k) => n + (r?.[k] ? 1 : 0), 0);
  }

  function semanticText(v) {
    return cleanText(v || '').toLowerCase().replace(/[\s\-—–_·•|｜【】\[\]（）()]/g, '');
  }

  function dateOnly(v) {
    return String(v || '').match(/20\d{2}-\d{2}-\d{2}/)?.[0] || '';
  }

  function canonicalApplicationPage(v) {
    try {
      const u = new URL(v || location.href, location.href);
      // 页面级链接只保留 host/path/hash 路由，不让 share_token/utm 等一次性参数阻断影子去重。
      return `${u.hostname}${u.pathname}${u.hash.split('?')[0]}`.toLowerCase();
    } catch { return safeHost(); }
  }

  function locationQuality(v) {
    const s = cleanLocation(v || '');
    if (!s) return 0;
    let q = 1;
    if (extractCities(s).length) q += 4;
    if (/(省|市|区|县|州|远程)/.test(s)) q += 1;
    if (/^\d+$/.test(s)) q -= 5;
    return q;
  }

  function statusQuality(v) {
    const s = cleanStatus(v || '');
    if (!s) return 0;
    if (DIRECT_STATUS_RE.test(s)) return 4;
    if (STAGE_RE.test(s.replace(/\s+/g, ''))) return 2;
    return 1;
  }

  // --------------------------
  // UI
  // --------------------------
  function renderBadge(records, rejectedCount) {
    if (!badge || !badge.isConnected) {
      badge = document.createElement('div');
      badge.id = 'offertrack-badge';
      badge.classList.add('ot-collapsed');
      const launcher = document.createElement('button');
      launcher.className = 'ot-launcher'; launcher.type = 'button'; launcher.title = '打开 OfferTrack'; launcher.setAttribute('aria-label', '打开 OfferTrack');
      const launchIcon = document.createElement('span'); launchIcon.className = 'ot-launch-icon'; launchIcon.textContent = '🎯';
      const launchCount = document.createElement('span'); launchCount.className = 'ot-launch-count'; launchCount.textContent = '0';
      launcher.append(launchIcon, launchCount);

      const panel = document.createElement('div'); panel.className = 'ot-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'OfferTrack 投递助手');
      const head = document.createElement('div'); head.className = 'ot-head';
      const title = document.createElement('strong'); title.textContent = '🎯 OfferTrack';
      const close = document.createElement('button'); close.className = 'ot-close'; close.type = 'button'; close.title = '收起'; close.textContent = '×';
      head.append(title, close);
      const main = document.createElement('div'); main.className = 'ot-main';
      const countNode = document.createElement('span'); countNode.className = 'ot-count'; countNode.textContent = '0';
      main.append(countNode, document.createTextNode(' 条投递记录'));
      const sub = document.createElement('div'); sub.className = 'ot-sub'; sub.textContent = '已自动解析';
      const actions = document.createElement('div'); actions.className = 'ot-actions';
      const sync = document.createElement('button'); sync.className = 'ot-sync'; sync.type = 'button'; sync.textContent = '同步到飞书';
      const settings = document.createElement('button'); settings.className = 'ot-settings'; settings.type = 'button'; settings.textContent = '设置';
      actions.append(sync, settings);
      panel.append(head, main, sub, actions);
      badge.append(launcher, panel);
      document.documentElement.appendChild(badge);
      badge.querySelector('.ot-launcher').onclick = () => badge.classList.remove('ot-collapsed');
      badge.querySelector('.ot-close').onclick = () => badge.classList.add('ot-collapsed');
      badge.querySelector('.ot-settings').onclick = () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
      badge.querySelector('.ot-sync').onclick = async () => {
        setBadge('正在同步…', true);
        const res = await chrome.runtime.sendMessage({
          type: 'SYNC_RECORDS', records: lastRecords, page: pageMeta(), source: 'manual'
        }).catch(e => ({ ok: false, error: String(e) }));
        updateBadgeSync(res);
      };
    }
    const count = String(records.length);
    const mainCount = badge.querySelector('.ot-count');
    const launchCount = badge.querySelector('.ot-launch-count');
    if (mainCount && mainCount.textContent !== count) mainCount.textContent = count;
    if (launchCount) {
      const launchText = records.length > 99 ? '99+' : count;
      if (launchCount.textContent !== launchText) launchCount.textContent = launchText;
      launchCount.classList.toggle('ot-zero', records.length === 0);
    }
    const sub = badge.querySelector('.ot-sub');
    if (sub) {
      const subText = records.length
        ? `已解析${rejectedCount ? ` · 忽略 ${rejectedCount} 条低置信项` : ''}`
        : '未识别到可用投递记录';
      if (sub.textContent !== subText) sub.textContent = subText;
    }
  }

  function updateBadgeSync(res) {
    if (!badge || !badge.isConnected) return;
    if (res?.ok) badge.querySelector('.ot-sub').textContent = `新增 ${res.created || 0} · 更新 ${res.updated || 0} · 跳过 ${res.skipped || 0}`;
    else badge.querySelector('.ot-sub').textContent = `同步失败：${res?.error || '未知错误'}`;
    const btn = badge.querySelector('.ot-sync');
    if (btn) { btn.disabled = false; btn.textContent = '同步到飞书'; }
  }

  function setBadge(text, busy) {
    if (!badge || !badge.isConnected) return;
    badge.querySelector('.ot-sub').textContent = text;
    const btn = badge.querySelector('.ot-sync');
    if (btn) { btn.disabled = !!busy; btn.textContent = busy ? '同步中…' : '同步到飞书'; }
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  }

  function safeStyle(el) { try { return el ? getComputedStyle(el) : null; } catch { return null; } }
  function safeRect(el) { try { return el?.getBoundingClientRect?.() || { top:0,left:0,width:0,height:0 }; } catch { return { top:0,left:0,width:0,height:0 }; } }
  function compactText(s) { return (s || '').replace(/\r/g, '').replace(/[\t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').trim(); }
  function cleanText(s) { return (s || '').replace(/[\t\r\n\u00a0]+/g, ' ').replace(/\s{2,}/g, ' ').trim(); }
  function cleanField(s) { return cleanText(s).replace(/^[：:|｜\-—–·•]+|[|｜]+$/g, '').slice(0, 220); }
  function safeHost() { return location.hostname || 'unknown'; }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  function similarity(a, b) { if (!a || !b) return 0; const short = a.length < b.length ? a : b; const long = a.length < b.length ? b : a; return long.includes(short) ? short.length / long.length : 0; }
  function decodeSafe(v) { try { return decodeURIComponent(v); } catch { return v; } }
})();
