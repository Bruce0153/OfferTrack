const FEISHU_BASE = 'https://open.feishu.cn/open-apis';
const DEFAULT_STATUS_OPTIONS = ['已投递', '筛选中', '笔试/测评', '面试中', 'Offer', '已结束', '已撤回'];
const NEXT_ACTION_OPTIONS = ['等待', '准备笔试', '准备面试', '联系HR', '复盘面试', '等待结果', '跟进', '无需处理'];
const PRIORITY_OPTIONS = ['S', 'A', 'B', 'C'];
const DEFAULT_SETTINGS = {
  appId: '', appSecret: '', appToken: '', tableId: '', baseUrl: '',
  autoSync: false, enabled: true, customSites: {}, companyAliases: {}, trustedAutoSyncHosts: []
};

const FIELD_DEFS = [
  { name: '公司', type: 1 },
  { name: '岗位名称', type: 1 },
  { name: '工作地点', type: 1 },
  { name: '投递时间', type: 1 },
  { name: '当前状态', type: 3, property: { options: DEFAULT_STATUS_OPTIONS.map(name => ({ name })) } },
  { name: '招聘平台', type: 1 },
  { name: '岗位链接', type: 1 },
  { name: '最近更新时间', type: 1 },
  { name: '下一步行动', type: 3, property: { options: NEXT_ACTION_OPTIONS.map(name => ({ name })) } },
  { name: '面试时间', type: 1 },
  { name: '优先级', type: 3, property: { options: PRIORITY_OPTIONS.map(name => ({ name })) } },
  { name: '备注', type: 1 },
  { name: '唯一记录ID', type: 1 },
  { name: '原始状态', type: 1 }
];

let tokenCache = { appId: '', token: '', expiresAt: 0 };

hardenStorageAccess();
chrome.runtime.onInstalled.addListener(async () => {
  await hardenStorageAccess();
  await migrateSettings();
});

async function hardenStorageAccess() {
  try {
    if (chrome.storage?.local?.setAccessLevel) {
      await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    }
  } catch (e) {
    console.warn('[OfferTrack] storage access hardening unavailable', e);
  }
}

async function migrateSettings() {
  const { settings } = await chrome.storage.local.get(['settings']);
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    customSites: settings?.customSites || {},
    companyAliases: settings?.companyAliases || {},
    trustedAutoSyncHosts: Array.isArray(settings?.trustedAutoSyncHosts) ? settings.trustedAutoSyncHosts : []
  };
  await chrome.storage.local.set({ settings: merged });
}

const BACKGROUND_MESSAGE_TYPES = new Set([
  'SYNC_RECORDS', 'RESOLVE_FEISHU_URL', 'TEST_FEISHU', 'INIT_FIELDS',
  'OPEN_OPTIONS', 'GET_STATE', 'GET_CONTENT_CONFIG', 'PAGE_SCAN_RESULT'
]);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!BACKGROUND_MESSAGE_TYPES.has(msg?.type)) return false;
  (async () => {
    try {
      switch (msg?.type) {
        case 'SYNC_RECORDS': {
          const result = await syncRecords(msg.records || [], msg.page || {}, msg.source || 'manual');
          sendResponse({ ok: true, ...result });
          break;
        }
        case 'RESOLVE_FEISHU_URL': {
          const settings = msg.settings || (await getSettings());
          const result = await resolveFeishuLink(settings, msg.url || settings.baseUrl || '');
          sendResponse({ ok: true, ...result });
          break;
        }
        case 'TEST_FEISHU': {
          const input = msg.settings || (await getSettings());
          const settings = await prepareSettings(input);
          validateSettings(settings);
          const token = await getTenantToken(settings, true);
          const fields = await listFields(settings, token);
          await listRecordsPage(settings, token, 20);
          sendResponse({
            ok: true,
            message: `连接成功：当前表有 ${fields.length} 个字段`,
            appToken: settings.appToken,
            tableId: settings.tableId
          });
          break;
        }
        case 'INIT_FIELDS': {
          const input = msg.settings || (await getSettings());
          const settings = await prepareSettings(input);
          const result = await ensureFields(settings);
          sendResponse({ ok: true, ...result, appToken: settings.appToken, tableId: settings.tableId });
          break;
        }
        case 'OPEN_OPTIONS':
          await chrome.runtime.openOptionsPage();
          sendResponse({ ok: true });
          break;
        case 'GET_STATE': {
          const state = await chrome.storage.local.get(['lastScan', 'lastSync']);
          sendResponse({ ok: true, ...state });
          break;
        }
        case 'GET_CONTENT_CONFIG': {
          const settings = await getSettings();
          const host = String(msg.host || sender?.tab?.url || '');
          const normalizedHost = normalizeHost(host);
          sendResponse({
            ok: true,
            enabled: settings.enabled !== false,
            autoSyncAllowed: !!settings.autoSync && settings.trustedAutoSyncHosts.includes(normalizedHost),
            customSite: settings.customSites?.[normalizedHost] || null,
            companyAlias: resolveCompanyAlias(settings.companyAliases || {}, normalizedHost)
          });
          break;
        }
        case 'PAGE_SCAN_RESULT': {
          const payload = { ...msg.payload, receivedAt: Date.now() };
          await chrome.storage.local.set({ lastScan: payload });
          sendResponse({ ok: true });
          break;
        }
      }
    } catch (err) {
      console.error('[OfferTrack]', err);
      sendResponse({ ok: false, error: friendlyError(err), code: err?.feishuCode || null });
    }
  })();
  return true;
});

async function getSettings() {
  const { settings } = await chrome.storage.local.get(['settings']);
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

function normalizeHost(value) {
  try {
    if (/^https?:\/\//i.test(value)) return new URL(value).hostname;
  } catch {}
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}


function resolveCompanyAlias(aliases, host) {
  const h = normalizeHost(host);
  if (!h || !aliases || typeof aliases !== 'object') return '';
  if (aliases[h]) return String(aliases[h]).trim();
  let best = '';
  let bestLen = -1;
  for (const [domain, name] of Object.entries(aliases)) {
    const d = normalizeHost(domain);
    if (!d || !name) continue;
    if ((h === d || h.endsWith(`.${d}`)) && d.length > bestLen) {
      best = String(name).trim();
      bestLen = d.length;
    }
  }
  return best;
}

function validateAuthSettings(settings) {
  const missing = [];
  if (!settings.appId) missing.push('App ID');
  if (!settings.appSecret) missing.push('App Secret');
  if (missing.length) throw new Error(`请先配置飞书应用：缺少 ${missing.join('、')}`);
}

function validateSettings(settings) {
  validateAuthSettings(settings);
  const missing = [];
  if (!settings.appToken) missing.push('App Token');
  if (!settings.tableId) missing.push('Table ID');
  if (missing.length) throw new Error(`请先配置多维表格：缺少 ${missing.join('、')}`);
}

async function getTenantToken(settings, forceRefresh = false) {
  validateAuthSettings(settings);
  if (!forceRefresh && tokenCache.appId === settings.appId && tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  const json = await fetchJson(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: settings.appId, app_secret: settings.appSecret })
  }, true);
  if (json.code !== 0 || !json.tenant_access_token) {
    throw makeFeishuError(`飞书鉴权失败：${json.msg || '未知错误'}`, json.code);
  }
  const expireSeconds = Number(json.expire || 7200);
  tokenCache = {
    appId: settings.appId,
    token: json.tenant_access_token,
    expiresAt: Date.now() + Math.max(60, expireSeconds - 120) * 1000
  };
  return tokenCache.token;
}

async function fetchJson(url, options = {}, retrySafe = false) {
  let lastErr;
  const attempts = retrySafe ? 3 : 1;
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(url, options);
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const err = new Error(`${resp.status} ${json.msg || resp.statusText || 'HTTP Error'}`);
        err.httpStatus = resp.status;
        err.responseJson = json;
        if (retrySafe && (resp.status === 429 || resp.status >= 500) && i < attempts - 1) {
          await sleep(500 * (2 ** i));
          continue;
        }
        throw err;
      }
      return json;
    } catch (e) {
      lastErr = e;
      if (retrySafe && i < attempts - 1 && !e.httpStatus) {
        await sleep(500 * (2 ** i));
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('网络请求失败');
}

async function feishuRequest(settings, token, path, options = {}) {
  const method = options.method || 'GET';
  const url = `${FEISHU_BASE}${path}`;
  let resp;
  try {
    resp = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch (e) {
    throw new Error(`网络请求失败：${e.message || e}`);
  }
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json.code !== 0) {
    const detail = json.msg || `${resp.status} ${resp.statusText}`;
    const err = makeFeishuError(`飞书 API 失败：${detail}`, json.code);
    err.httpStatus = resp.status;
    err.path = path;
    throw err;
  }
  return json;
}

function makeFeishuError(message, code) {
  const err = new Error(message);
  if (code != null) err.feishuCode = code;
  return err;
}

async function resolveFeishuLink(settings, rawUrl) {
  if (!rawUrl) throw new Error('请先粘贴飞书多维表格链接');
  let u;
  try { u = new URL(rawUrl.trim()); } catch { throw new Error('多维表格链接格式不正确'); }
  if (!/\.feishu\.cn$/i.test(u.hostname) && u.hostname !== 'feishu.cn') {
    throw new Error('当前版本仅支持 feishu.cn 的多维表格链接');
  }

  const parts = u.pathname.split('/').filter(Boolean);
  const tableFromUrl = u.searchParams.get('table') || '';
  const baseIdx = parts.indexOf('base');
  const wikiIdx = parts.indexOf('wiki');

  if (baseIdx >= 0 && parts[baseIdx + 1]) {
    const appToken = parts[baseIdx + 1];
    const tableId = tableFromUrl || await resolveSingleTableId(settings, appToken);
    return { kind: 'base', appToken, tableId, message: '已解析普通多维表格链接' };
  }

  if (wikiIdx >= 0 && parts[wikiIdx + 1]) {
    validateAuthSettings(settings);
    const wikiToken = parts[wikiIdx + 1];
    const token = await getTenantToken(settings);
    const q = new URLSearchParams({ token: wikiToken });
    const json = await feishuRequest(settings, token, `/wiki/v2/spaces/get_node?${q}`);
    const node = json.data?.node;
    if (!node?.obj_token) throw new Error('飞书返回了知识库节点，但没有实际文档 Token');
    if (node.obj_type !== 'bitable') {
      throw new Error(`这个 Wiki 节点不是多维表格（实际类型：${node.obj_type || '未知'}）`);
    }
    const appToken = node.obj_token;
    const tableId = tableFromUrl || await resolveSingleTableId(settings, appToken, token);
    return {
      kind: 'wiki', wikiToken, appToken, tableId,
      message: '已解析 Wiki 多维表格链接'
    };
  }

  throw new Error('无法识别此链接。请复制飞书多维表格的 /base/... 或 /wiki/... 链接');
}

async function resolveSingleTableId(settings, appToken, suppliedToken = '') {
  validateAuthSettings(settings);
  const token = suppliedToken || await getTenantToken(settings);
  const json = await feishuRequest(settings, token, `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables?page_size=100`);
  const items = json.data?.items || [];
  if (items.length === 1) return items[0].table_id;
  if (!items.length) throw new Error('该多维表格中没有数据表');
  throw new Error('链接没有 Table ID，且该 Base 中有多张数据表。请打开目标数据表后重新复制浏览器链接');
}

async function prepareSettings(input) {
  let settings = { ...DEFAULT_SETTINGS, ...(input || {}) };
  if ((!settings.appToken || !settings.tableId) && settings.baseUrl) {
    const resolved = await resolveFeishuLink(settings, settings.baseUrl);
    settings = { ...settings, appToken: resolved.appToken, tableId: resolved.tableId };
  }
  return settings;
}

async function prepareStoredSettings() {
  let settings = await getSettings();
  if ((!settings.appToken || !settings.tableId) && settings.baseUrl) {
    const resolved = await resolveFeishuLink(settings, settings.baseUrl);
    settings = { ...settings, appToken: resolved.appToken, tableId: resolved.tableId };
    await chrome.storage.local.set({ settings });
  }
  return settings;
}

async function listFields(settings, token) {
  const items = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ page_size: '100' });
    if (pageToken) q.set('page_token', pageToken);
    const json = await feishuRequest(settings, token, `/bitable/v1/apps/${encodeURIComponent(settings.appToken)}/tables/${encodeURIComponent(settings.tableId)}/fields?${q}`);
    items.push(...(json.data?.items || []));
    pageToken = json.data?.has_more ? (json.data?.page_token || '') : '';
  } while (pageToken);
  return items;
}

async function listRecordsPage(settings, token, pageSize = 20, pageToken = '') {
  const q = new URLSearchParams({ page_size: String(pageSize) });
  if (pageToken) q.set('page_token', pageToken);
  return feishuRequest(settings, token, `/bitable/v1/apps/${encodeURIComponent(settings.appToken)}/tables/${encodeURIComponent(settings.tableId)}/records?${q}`);
}

async function ensureFields(inputSettings) {
  const settings = await prepareSettings(inputSettings);
  validateSettings(settings);
  const token = await getTenantToken(settings);
  let fields = await listFields(settings, token);
  const names = new Set(fields.map(f => f.field_name));
  const created = [];
  const warnings = [];

  if (!names.has('公司')) {
    const firstPage = await listRecordsPage(settings, token, 20);
    const tableEmpty = !(firstPage.data?.items || []).length;
    const primary = fields.find(f => f.is_primary && f.type === 1);
    const looksDefault = primary && /^(多行文本|文本|标题|名称|Name|字段\s*1)$/i.test(primary.field_name || '');
    if (tableEmpty && looksDefault) {
      try {
        await feishuRequest(settings, token,
          `/bitable/v1/apps/${encodeURIComponent(settings.appToken)}/tables/${encodeURIComponent(settings.tableId)}/fields/${encodeURIComponent(primary.field_id)}`,
          { method: 'PUT', body: { field_name: '公司', type: 1 } }
        );
        created.push('公司（复用空表主字段）');
        names.add('公司');
      } catch (e) {
        warnings.push('未能复用默认主字段，已改为新建“公司”字段');
      }
    }
  }

  for (const def of FIELD_DEFS) {
    if (names.has(def.name)) continue;
    const createBody = { field_name: def.name, type: def.type };
    if (def.property) createBody.property = def.property;
    await feishuRequest(settings, token,
      `/bitable/v1/apps/${encodeURIComponent(settings.appToken)}/tables/${encodeURIComponent(settings.tableId)}/fields`,
      { method: 'POST', body: createBody }
    );
    created.push(def.name);
    names.add(def.name);
  }

  fields = await listFields(settings, token);
  for (const def of FIELD_DEFS) {
    const actual = fields.find(f => f.field_name === def.name);
    if (actual && def.type === 3 && actual.type !== 3) {
      warnings.push(`“${def.name}”已存在但不是单选字段；插件不会自动改类型，以免影响已有数据`);
    }
  }

  return {
    message: created.length ? `已初始化 ${created.length} 个字段${warnings.length ? `；${warnings.length} 条提醒` : ''}` : `字段已经完整${warnings.length ? `；${warnings.length} 条提醒` : ''}`,
    created,
    warnings
  };
}

async function listAllRecords(settings, token) {
  const all = [];
  let pageToken = '';
  let pages = 0;
  do {
    const json = await listRecordsPage(settings, token, 500, pageToken);
    all.push(...(json.data?.items || []));
    pageToken = json.data?.has_more ? (json.data?.page_token || '') : '';
    pages += 1;
    if (pages > 200) throw new Error('表格记录超过 100,000 条，已停止全表去重。建议新建专用秋招表格');
  } while (pageToken);
  return all;
}

function recordToFields(r, now) {
  return {
    '公司': safeCell(r.company),
    '岗位名称': safeCell(r.position),
    '工作地点': safeCell(r.location),
    '投递时间': safeCell(r.applyTime),
    '当前状态': safeCell(r.status || '已投递'),
    '招聘平台': safeCell(r.platform),
    '岗位链接': safeCell(r.url, 1000),
    '最近更新时间': now,
    '唯一记录ID': safeCell(r.uid, 200),
    '原始状态': safeCell(r.rawStatus)
  };
}

function safeCell(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function comparableFromExisting(fields) {
  return {
    company: stringValue(fields['公司']),
    position: stringValue(fields['岗位名称']),
    location: stringValue(fields['工作地点']),
    applyTime: stringValue(fields['投递时间']),
    status: stringValue(fields['当前状态']),
    platform: stringValue(fields['招聘平台']),
    url: stringValue(fields['岗位链接']),
    uid: stringValue(fields['唯一记录ID']),
    rawStatus: stringValue(fields['原始状态'])
  };
}

function stringValue(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(x => stringValue(x)).join(',');
  if (typeof v === 'object') {
    if ('text' in v) return String(v.text || '');
    if ('name' in v) return String(v.name || '');
    if ('link' in v) return String(v.link || '');
  }
  return String(v);
}

function normalizeComparable(v) {
  return String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeCompanyComparable(v) {
  return normalizeComparable(v)
    .replace(/^(?:(?:欢迎|诚邀)(?:您)?(?:加入|来到|关注|选择)?|加入(?:我们|本公司|公司)?|走进)\s*/i, '')
    .replace(/[！!。.]$/g, '')
    .replace(/(?:20\d{2}|\d{2})(?:届)?(?:应届生?)?(?:秋季|春季)?(?:校园招聘|校招|招聘)/gi, ' ')
    .replace(/[·•|｜\-—–\s]*(?:(?:秋季|春季)?(?:校园招聘|校招官网|校招|社会招聘|社招官网|社招|应届招聘|实习招聘)|人才招聘|招聘官网|招聘平台|招聘中心|招聘网站|招聘主页|招聘)\s*$/i, '')
    .trim();
}

function normalizePositionComparable(v) {
  return normalizeComparable(v)
    .replace(/[\s\-—–_·•|｜【】\[\]（）()]/g, '')
    .trim();
}

function canonicalRecordPage(v) {
  try {
    const u = new URL(v || 'https://invalid.local/');
    for (const key of [...u.searchParams.keys()]) {
      if (/^(share_token|recommendCode|utm_|spm|trackingId|trackId)/i.test(key)) u.searchParams.delete(key);
    }
    return `${u.hostname}${u.pathname}${u.hash.split('?')[0]}`.toLowerCase();
  } catch { return ''; }
}

function semanticSignature(r) {
  const position = normalizePositionComparable(r.position);
  const platform = normalizeComparable(r.platform);
  const applyTime = normalizeComparable(r.applyTime);
  const page = canonicalRecordPage(r.url);
  if (!position) return '';
  // 公司展示名会随着解析器优化（“快手校招”→“快手”、“加入XX”→“XX”），不能参与主匹配键。
  return `${platform}|${position}|${applyTime}|${page}`;
}

function semanticLooseSignature(r) {
  const position = normalizePositionComparable(r.position);
  const platform = normalizeComparable(r.platform);
  const applyTime = normalizeComparable(r.applyTime);
  if (!position) return '';
  return `${platform}|${position}|${applyTime}`;
}

function hasMeaningfulChange(oldR, newR) {
  const keys = ['company', 'position', 'location', 'applyTime', 'status', 'platform', 'rawStatus'];
  if (keys.some(k => normalizeComparable(oldR[k]) !== normalizeComparable(newR[k]))) return true;
  if (!oldR.url && newR.url) return true;
  if (oldR.uid !== newR.uid) return true;
  return false;
}

async function syncRecords(records, page = {}, source = 'manual') {
  const settings = await prepareStoredSettings();
  validateSettings(settings);
  if (!Array.isArray(records) || !records.length) {
    return { message: '当前页面没有可同步的记录', total: 0, created: 0, updated: 0, skipped: 0 };
  }

  const input = dedupeInput(records).filter(r => r?.uid && r?.position);
  if (!input.length) throw new Error('解析结果缺少岗位名称，已阻止写入飞书。请先确认页面解析是否正确');

  const token = await getTenantToken(settings);
  await ensureFields(settings);
  const existing = await listAllRecords(settings, token);
  const byUid = new Map();
  const semanticBuckets = new Map();
  const semanticLooseBuckets = new Map();

  for (const item of existing) {
    const oldR = comparableFromExisting(item.fields || {});
    if (oldR.uid) byUid.set(oldR.uid, item);
    const sig = semanticSignature(oldR);
    if (sig) {
      const bucket = semanticBuckets.get(sig) || [];
      bucket.push(item);
      semanticBuckets.set(sig, bucket);
    }
    const loose = semanticLooseSignature(oldR);
    if (loose) {
      const bucket = semanticLooseBuckets.get(loose) || [];
      bucket.push(item);
      semanticLooseBuckets.set(loose, bucket);
    }
  }

  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const toCreate = [];
  const toUpdate = [];
  let skipped = 0;

  for (const r of input) {
    let old = byUid.get(r.uid);
    if (!old) {
      const bucket = semanticBuckets.get(semanticSignature(r)) || [];
      if (bucket.length === 1) old = bucket[0];
    }
    if (!old) {
      // 兼容旧版本：旧记录的 URL 可能是列表页/详情页之一，只要平台+岗位+投递时间唯一即可迁移更新。
      const bucket = semanticLooseBuckets.get(semanticLooseSignature(r)) || [];
      if (bucket.length === 1) old = bucket[0];
    }

    if (!old) {
      toCreate.push({ fields: recordToFields(r, now) });
      continue;
    }

    const oldR = comparableFromExisting(old.fields || {});
    if (hasMeaningfulChange(oldR, r)) {
      toUpdate.push({ record_id: old.record_id, fields: recordToFields(r, now) });
    } else {
      skipped += 1;
    }
  }

  let created = 0;
  let updated = 0;
  for (const chunk of chunks(toCreate, 500)) {
    const json = await feishuRequest(settings, token,
      `/bitable/v1/apps/${encodeURIComponent(settings.appToken)}/tables/${encodeURIComponent(settings.tableId)}/records/batch_create`,
      { method: 'POST', body: { records: chunk } }
    );
    created += json.data?.records?.length ?? chunk.length;
  }
  for (const chunk of chunks(toUpdate, 500)) {
    const json = await feishuRequest(settings, token,
      `/bitable/v1/apps/${encodeURIComponent(settings.appToken)}/tables/${encodeURIComponent(settings.tableId)}/records/batch_update`,
      { method: 'POST', body: { records: chunk } }
    );
    updated += json.data?.records?.length ?? chunk.length;
  }

  if (source === 'manual' && page?.host) await trustHostForAutoSync(page.host);

  const result = {
    message: `同步完成：新增 ${created}，更新 ${updated}，无变化 ${skipped}`,
    total: input.length,
    created,
    updated,
    skipped,
    page,
    at: Date.now()
  };
  await chrome.storage.local.set({ lastSync: result });
  return result;
}

async function trustHostForAutoSync(host) {
  const normalized = normalizeHost(host);
  if (!normalized) return;
  const settings = await getSettings();
  const set = new Set(settings.trustedAutoSyncHosts || []);
  set.add(normalized);
  settings.trustedAutoSyncHosts = [...set].slice(-100);
  await chrome.storage.local.set({ settings });
}

function dedupeInput(records) {
  const map = new Map();
  for (const r of records) {
    if (!r?.uid) continue;
    const old = map.get(r.uid);
    if (!old || recordCompleteness(r) > recordCompleteness(old)) map.set(r.uid, r);
  }
  return [...map.values()];
}

function recordCompleteness(r) {
  return ['company', 'position', 'location', 'applyTime', 'rawStatus', 'url'].reduce((n, k) => n + (r?.[k] ? 1 : 0), 0);
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function friendlyError(err) {
  const msg = err?.message || String(err);
  const path = err?.path || '';
  const code = err?.feishuCode;
  if (/wiki\/v2/i.test(path) || /Wiki|知识库/i.test(msg)) {
    return `${msg}。如果你使用 /wiki/ 链接，请给应用开通“查看知识库”权限，并确保应用能访问该知识库节点。`;
  }
  if (err?.httpStatus === 403 || /permission|forbidden|权限|无权/i.test(msg) || code === 99991663) {
    return `${msg}。请确认应用已开通多维表格读写/字段管理权限，并已被添加为目标多维表格的可编辑协作者；权限刚调整时还需确认应用新版本已生效。`;
  }
  if (/field validation failed/i.test(msg)) {
    const endpoint = path ? path.split('?')[0] : '未知接口';
    return `${msg}（接口：${endpoint}${code != null ? `，错误码：${code}` : ''}）。这是飞书请求参数校验错误，并不等同于“缺少表头”。请使用 v1.1.1；若仍出现，把这条完整错误发回即可定位。`;
  }
  if (/字段不存在|field.*not.*found|wrongfieldid/i.test(msg)) return `${msg}。目标表字段不完整，可在插件设置中点击“初始化表头”。`;
  if (/token|鉴权|App ID|App Secret/i.test(msg)) return `${msg}。请重新检查 App ID / App Secret，注意不要带多余空格。`;
  return msg;
}
