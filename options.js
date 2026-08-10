const $ = id => document.getElementById(id);
let settings = {};

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['settings']);
  settings = stored.settings || { customSites: {}, companyAliases: {}, trustedAutoSyncHosts: [] };
  fill();
  $('save').onclick = save;
  $('parseUrl').onclick = parseUrl;
  $('test').onclick = testConnection;
  $('initFields').onclick = initFields;
  $('saveCustom').onclick = saveCustom;
  $('deleteCustom').onclick = deleteCustom;
  $('saveAlias').onclick = saveAlias;
  $('deleteAlias').onclick = deleteAlias;
  $('baseUrl').addEventListener('input', () => {
    const current = $('baseUrl').value.trim();
    if (current !== (settings.baseUrl || '')) {
      $('appToken').value = '';
      $('tableId').value = '';
    }
  });
});

function fill() {
  for (const k of ['appId','appSecret','appToken','tableId','baseUrl']) $(k).value = settings[k] || '';
  $('enabled').checked = settings.enabled !== false;
  $('autoSync').checked = !!settings.autoSync;
}

function collect() {
  return {
    ...settings,
    appId: $('appId').value.trim(),
    appSecret: $('appSecret').value.trim(),
    appToken: $('appToken').value.trim(),
    tableId: $('tableId').value.trim(),
    baseUrl: $('baseUrl').value.trim(),
    enabled: $('enabled').checked,
    autoSync: $('autoSync').checked,
    customSites: settings.customSites || {},
    companyAliases: settings.companyAliases || {},
    trustedAutoSyncHosts: Array.isArray(settings.trustedAutoSyncHosts) ? settings.trustedAutoSyncHosts : []
  };
}

async function save() {
  settings = collect();
  await chrome.storage.local.set({ settings });
  $('saveMsg').textContent = '已保存';
  setTimeout(() => $('saveMsg').textContent = '', 1600);
}

async function parseUrl() {
  const raw = $('baseUrl').value.trim();
  if (!raw) return setStatus('请先粘贴多维表格链接', true);
  setStatus('正在解析链接…');
  const res = await chrome.runtime.sendMessage({ type: 'RESOLVE_FEISHU_URL', url: raw, settings: collect() });
  if (!res?.ok) return setStatus(res?.error || '解析失败', true);
  $('appToken').value = res.appToken || '';
  $('tableId').value = res.tableId || '';
  settings = collect();
  await chrome.storage.local.set({ settings });
  setStatus(`✓ ${res.message || '解析成功'}：${res.kind === 'wiki' ? 'Wiki' : 'Base'} / ${res.tableId}`);
}

async function testConnection() {
  await save();
  setStatus('正在测试连接…');
  const res = await chrome.runtime.sendMessage({ type: 'TEST_FEISHU', settings: collect() });
  if (res?.ok) {
    if (res.appToken) $('appToken').value = res.appToken;
    if (res.tableId) $('tableId').value = res.tableId;
    settings = collect();
    await chrome.storage.local.set({ settings });
  }
  setStatus(res?.ok ? `✓ ${res.message || '飞书连接成功'}` : res?.error || '连接失败', !res?.ok);
}

async function initFields() {
  await save();
  setStatus('正在检查并初始化表头…');
  const res = await chrome.runtime.sendMessage({ type: 'INIT_FIELDS', settings: collect() });
  if (res?.ok) {
    if (res.appToken) $('appToken').value = res.appToken;
    if (res.tableId) $('tableId').value = res.tableId;
    settings = collect();
    await chrome.storage.local.set({ settings });
    const warning = res.warnings?.length ? `；${res.warnings.join('；')}` : '';
    setStatus(`✓ ${res.message}${warning}`);
  } else {
    setStatus(res?.error || '初始化失败', true);
  }
}


async function saveAlias() {
  const host = normalizeHost($('aliasHost').value);
  const company = $('aliasCompany').value.trim();
  if (!host || !company) return setStatus('公司名覆盖需要填写域名和公司名', true);
  settings = collect();
  settings.companyAliases = settings.companyAliases || {};
  settings.companyAliases[host] = company;
  await chrome.storage.local.set({ settings });
  setStatus(`✓ 已保存公司名覆盖：${host} → ${company}`);
}

async function deleteAlias() {
  const host = normalizeHost($('aliasHost').value);
  if (!host) return setStatus('请先填写要删除覆盖的域名', true);
  settings = collect();
  if (settings.companyAliases?.[host]) delete settings.companyAliases[host];
  await chrome.storage.local.set({ settings });
  setStatus(`✓ 已删除 ${host} 的公司名覆盖`);
}

async function saveCustom() {
  const host = normalizeHost($('customHost').value);
  const card = $('selCard').value.trim();
  if (!host || !card) return setStatus('高级规则至少需要填写域名和 card 选择器', true);
  settings = collect();
  settings.customSites = settings.customSites || {};
  settings.customSites[host] = {
    card,
    company: $('selCompany').value.trim(),
    position: $('selPosition').value.trim(),
    location: $('selLocation').value.trim(),
    time: $('selTime').value.trim(),
    status: $('selStatus').value.trim(),
    link: $('selLink').value.trim()
  };
  await chrome.storage.local.set({ settings });
  setStatus(`✓ 已保存 ${host} 的解析规则`);
}

async function deleteCustom() {
  const host = normalizeHost($('customHost').value);
  if (!host) return setStatus('请先填写要删除规则的域名', true);
  settings = collect();
  if (settings.customSites?.[host]) delete settings.customSites[host];
  await chrome.storage.local.set({ settings });
  setStatus(`✓ 已删除 ${host} 的解析规则`);
}

function normalizeHost(v) {
  return String(v || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
}

function setStatus(text, error=false) {
  $('status').textContent = text;
  $('status').style.color = error ? '#c94646' : '#647085';
}
