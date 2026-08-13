(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackApplicationContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const FEISHU_FIELDS = Object.freeze({
    company: '公司',
    position: '岗位名称',
    location: '工作地点',
    applyTime: '投递时间',
    status: '当前状态',
    platform: '招聘平台',
    url: '岗位链接',
    updatedAt: '最近更新时间',
    uid: '唯一记录ID',
    rawStatus: '原始状态',
    autoFollowUp: '自动跟进'
  });

  const DOM_LABELS = Object.freeze({
    position: Object.freeze(['岗位名称','职位名称','应聘职位','申请职位','岗位','职位']),
    location: Object.freeze(['工作地点','工作地','意向地点','意向城市','地点','城市']),
    applyTime: Object.freeze(['投递时间','申请时间','应聘时间','提交时间']),
    status: Object.freeze(['当前状态','投递状态','申请状态','应聘状态','状态','进度']),
    company: Object.freeze(['公司','企业','雇主'])
  });

  const URL_PATTERNS = Object.freeze({
    sensitiveQuery: /(token|auth|authorization|sign|signature|nonce|timestamp|session|cookie|secret|ticket|share|code|key|credential|candidateid|userid|user_id|openid|unionid|mobile|phone|email)/i,
    cacheBuster: /^(?:_|t|ts|timestamp|rnd|random|cacheBust|cb)$/i
  });

  const STRUCTURED_PATTERNS = Object.freeze({
    positionKey: /^(?:(?:position|job|post|vacancy|role|recruitPosition|recruitJob)[A-Za-z0-9_-]*(?:name|title)|positionName|positionTitle|jobName|jobTitle|postName|postTitle|roleName|vacancyName|职位名称|岗位名称|应聘职位|申请职位)$/i,
    positionContainerKey: /^(?:position|job|post|vacancy|role)$/i,
    statusKey: /^(?:(?:apply|application|delivery|process|progress|candidate|recruit)[A-Za-z0-9_-]*(?:status|state|stage|result)|statusName|stateName|stageName|processStatus|applicationStatus|deliveryStatus|applyStatus|candidateStatus|投递状态|申请状态|流程状态)$/i,
    companyKey: /^(?:(?:company|corp|enterprise|employer|organization|organisation|org|tenant|brand|site)[A-Za-z0-9_-]*(?:name|title)|companyName|companyShortName|companyFullName|companyDisplayName|corpName|employerName|organizationName|organisationName|orgName|brandName|tenantName|siteName|publisher|公司名称|企业名称)$/i,
    locationKey: /^(?:(?:work)?[A-Za-z0-9_-]*(?:location|city|place)|location|city|workLocation|workCity|cityName|工作地点|工作城市)$/i,
    timeKey: /^(?:(?:apply|application|delivery|submit|create|created|applied)[A-Za-z0-9_-]*(?:time|at|date)|applyTime|applicationTime|deliveryTime|submitTime|createdAt|createTime|appliedAt|投递时间|申请时间)$/i,
    idKey: /^(?:(?:application|apply|delivery|position|job|post|vacancy)[A-Za-z0-9_-]*(?:id|no|number)|applicationId|applyId|deliveryId|positionId|jobId)$/i,
    applicationPath: /(?:application|applications|apply|delivery|candidate|process|progress|job|position|post|vacancy|recruit)/i,
    companyParent: /(?:company|corp|enterprise|employer|organization|organisation|tenant|brand|site|career|recruit|hr)/i,
    positionParent: /(?:position|job|post|role|vacancy|recruit|application|apply|delivery)/i
  });

  // Applied to keys after punctuation/underscore normalization. Deliberately broad: structured
  // follow-up never needs identity/contact/authentication payloads.
  const SENSITIVE_KEY_RE = /(?:cookie|token|secret|password|passwd|credential|authorization|authheader|phone|mobile|telephone|email|avatar|portrait|profile|contact|address|identitycard|idcard|passport|bank|salary|compensation|resume(?:content|file|url)?|cv(?:url)?|verificationcode|captcha|smscode)/i;
  const SENSITIVE_CONTAINER_RE = /(?:^|[._-])(?:auth|session|credential|account|userprofile|personal|contact|address|resume|verification)(?:$|[._-])/i;
  const GENERIC_ID_RE = /^(?:id|no|number)$/i;
  const GENERIC_NAME_RE = /^(?:name|title|label|text|value|displayName)$/i;
  const GENERIC_STATUS_RE = /^(?:status|state|stage|result)$/i;
  const GENERIC_TIME_RE = /^(?:time|date|createdAt|updatedAt)$/i;

  function cleanKey(v) {
    return String(v || '').replace(/[-_\s]/g, '').trim();
  }

  function isSensitiveKey(key, path = '') {
    const raw = cleanKey(key).toLowerCase();
    const normalizedPath = String(path || '').toLowerCase();
    return SENSITIVE_KEY_RE.test(raw) || SENSITIVE_CONTAINER_RE.test(normalizedPath);
  }

  function fieldKind(key, path = '') {
    const k = String(key || '');
    const p = String(path || '');
    if (!k || isSensitiveKey(k, p)) return '';
    if (STRUCTURED_PATTERNS.positionKey.test(k)) return 'position';
    if (STRUCTURED_PATTERNS.statusKey.test(k)) return 'status';
    if (STRUCTURED_PATTERNS.companyKey.test(k)) return 'company';
    if (STRUCTURED_PATTERNS.locationKey.test(k)) return 'location';
    if (STRUCTURED_PATTERNS.timeKey.test(k)) return 'time';
    if (STRUCTURED_PATTERNS.idKey.test(k)) return 'id';

    const parent = p.split('.').slice(0, -1).join('.');
    if (GENERIC_NAME_RE.test(k)) {
      if (STRUCTURED_PATTERNS.positionParent.test(parent)) return 'position';
      if (STRUCTURED_PATTERNS.companyParent.test(parent)) return 'company';
      if (/(location|city|place)/i.test(parent)) return 'location';
    }
    if (GENERIC_STATUS_RE.test(k) && STRUCTURED_PATTERNS.applicationPath.test(parent)) return 'status';
    if (GENERIC_TIME_RE.test(k) && STRUCTURED_PATTERNS.applicationPath.test(parent)) return 'time';
    if (GENERIC_ID_RE.test(k) && /(?:application|apply|delivery|position|job|post|vacancy)/i.test(parent)) return 'id';
    return '';
  }

  function projectStructured(value, options = {}) {
    const maxNodes = Math.min(5000, Math.max(100, Number(options.maxNodes || 700)));
    const maxDepth = Math.min(10, Math.max(2, Number(options.maxDepth || 6)));
    const maxArray = Math.min(120, Math.max(5, Number(options.maxArray || 32)));
    const maxKeys = Math.min(160, Math.max(10, Number(options.maxKeys || 64)));
    const maxString = Math.min(1000, Math.max(80, Number(options.maxString || 240)));
    let nodes = 0;
    const seen = new WeakSet();

    function project(v, depth = 0, path = '') {
      if (v == null || depth > maxDepth || nodes++ >= maxNodes) return null;
      if (typeof v !== 'object') return null;
      if (seen.has(v)) return null;
      seen.add(v);

      if (Array.isArray(v)) {
        const out = [];
        for (const item of v.slice(0, maxArray)) {
          const child = project(item, depth + 1, path);
          if (child && (Array.isArray(child) ? child.length : Object.keys(child).length)) out.push(child);
        }
        return out.length ? out : null;
      }

      const out = {};
      for (const key of Object.keys(v).slice(0, maxKeys)) {
        const nextPath = path ? `${path}.${key}` : key;
        if (isSensitiveKey(key, nextPath)) continue;
        let val;
        try { val = v[key]; } catch { continue; }
        if (val == null) continue;
        if (typeof val === 'object') {
          const child = project(val, depth + 1, nextPath);
          if (child && (Array.isArray(child) ? child.length : Object.keys(child).length)) out[key] = child;
          continue;
        }
        if (!fieldKind(key, nextPath)) continue;
        if (typeof val === 'string') out[key] = val.slice(0, maxString);
        else if (typeof val === 'number' || typeof val === 'boolean') out[key] = val;
      }
      return Object.keys(out).length ? out : null;
    }

    return project(value, 0, String(options.rootName || 'root'));
  }

  function projectionPolicy() {
    return {
      positionKey: STRUCTURED_PATTERNS.positionKey.source,
      statusKey: STRUCTURED_PATTERNS.statusKey.source,
      companyKey: STRUCTURED_PATTERNS.companyKey.source,
      locationKey: STRUCTURED_PATTERNS.locationKey.source,
      timeKey: STRUCTURED_PATTERNS.timeKey.source,
      idKey: STRUCTURED_PATTERNS.idKey.source,
      applicationPath: STRUCTURED_PATTERNS.applicationPath.source,
      companyParent: STRUCTURED_PATTERNS.companyParent.source,
      positionParent: STRUCTURED_PATTERNS.positionParent.source,
      sensitiveKey: SENSITIVE_KEY_RE.source,
      sensitiveContainer: SENSITIVE_CONTAINER_RE.source
    };
  }

  return {
    FEISHU_FIELDS,
    DOM_LABELS,
    URL_PATTERNS,
    STRUCTURED_PATTERNS,
    SENSITIVE_KEY_RE,
    SENSITIVE_CONTAINER_RE,
    cleanKey,
    isSensitiveKey,
    fieldKind,
    projectStructured,
    projectionPolicy
  };
});
