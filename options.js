const $ = id => document.getElementById(id);
const HostAccess = globalThis.OfferTrackHostAccess;
let settings = {};
let actionsVisible = false;
const Credentials = globalThis.OfferTrackCredentialStore;

const fmtTime = ts => {
  try { return ts ? new Date(Number(ts)).toLocaleString('zh-CN', { hour12: false }) : ''; }
  catch { return ''; }
};

const modeText = mode => mode === 'background_tabs' ? '后台标签页' : '仅已打开页面';

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['settings']);
  settings = stored.settings || { customSites: {}, companyAliases: {}, trustedAutoSyncHosts: [] };
  await fill();
  $('save').onclick = save;
  $('clearAppSecret').onclick = clearAppSecret;
  $('parseUrl').onclick = parseUrl;
  $('test').onclick = testConnection;
  $('initFields').onclick = initFields;
  $('saveCustom').onclick = saveCustom;
  $('deleteCustom').onclick = deleteCustom;
  $('saveAlias').onclick = saveAlias;
  $('deleteAlias').onclick = deleteAlias;
  $('runFollowUp').onclick = runFollowUp;
  $('showFollowUpActions').onclick = toggleActions;
  $('baseUrl').addEventListener('input', () => {
    if ($('baseUrl').value.trim() !== (settings.baseUrl || '')) {
      $('appToken').value = '';
      $('tableId').value = '';
    }
  });
  await refreshFollowUpSummary();
});

async function fill() {
  for (const k of ['appId','appToken','tableId','baseUrl']) $(k).value = settings[k] || '';
  $('appSecret').value = '';
  const credentialState = await Credentials?.state?.().catch(() => ({ hasSecret: false, remembered: false })) || { hasSecret: false, remembered: false };
  $('rememberAppSecret').checked = !!credentialState.remembered;
  $('appSecret').placeholder = credentialState.hasSecret ? '已保存，留空保持不变' : '默认仅本次浏览器会话保存';
  $('enabled').checked = settings.enabled !== false;
  $('autoSync').checked = !!settings.autoSync;
  $('followUpEnabled').checked = !!settings.followUpEnabled;
  const interval = [3,6,12,24].includes(Number(settings.followUpIntervalHours)) ? Number(settings.followUpIntervalHours) : 6;
  $('followUpIntervalHours').value = String(interval);
  $('followUpMaxSitesPerRun').value = Number(settings.followUpMaxSitesPerRun || 12);
  $('followUpMode').value = settings.followUpMode || 'open_tabs';
  $('followUpNotify').checked = settings.followUpNotify !== false;
  $('followUpNotifySessionIssues').checked = settings.followUpNotifySessionIssues !== false;
  $('followUpIncludeTerminal').checked = !!settings.followUpIncludeTerminal;
}

function collect() {
  return {
    ...settings,
    appId: $('appId').value.trim(),
    appToken: $('appToken').value.trim(), tableId: $('tableId').value.trim(), baseUrl: $('baseUrl').value.trim(),
    enabled: $('enabled').checked, autoSync: $('autoSync').checked,
    followUpEnabled: $('followUpEnabled').checked,
    followUpIntervalHours: Number($('followUpIntervalHours').value || 6),
    followUpMaxSitesPerRun: Math.min(30, Math.max(1, Number($('followUpMaxSitesPerRun').value || 12))),
    followUpMode: $('followUpMode').value || 'open_tabs',
    // The four-level safe follow-up is one core pipeline, not separate user-facing switches.
    followUpCookiePreflight: true,
    followUpApiFirst: true,
    followUpStructuredState: true,
    followUpApiTimeoutSeconds: Math.min(15, Math.max(3, Number(settings.followUpApiTimeoutSeconds || 6))),
    followUpTabTimeoutSeconds: Math.min(60, Math.max(8, Number(settings.followUpTabTimeoutSeconds || 25))),
    followUpNotify: $('followUpNotify').checked,
    followUpNotifySessionIssues: $('followUpNotifySessionIssues').checked,
    followUpIncludeTerminal: $('followUpIncludeTerminal').checked,
    customSites: settings.customSites || {}, companyAliases: settings.companyAliases || {},
    trustedAutoSyncHosts: Array.isArray(settings.trustedAutoSyncHosts) ? settings.trustedAutoSyncHosts : []
  };
}

async function save() {
  settings = collect();
  delete settings.appSecret;
  const typedSecret = $('appSecret').value.trim();
  if (typedSecret) {
    await Credentials?.setSecret?.(typedSecret, { remember: $('rememberAppSecret').checked });
    $('appSecret').value = '';
    $('appSecret').placeholder = '已保存，留空保持不变';
  } else {
    await Credentials?.setRemember?.($('rememberAppSecret').checked);
  }
  await chrome.storage.local.set({ settings });
  $('saveMsg').textContent = '已保存';
  setTimeout(() => $('saveMsg').textContent = '', 1400);
  await refreshFollowUpSummary();
}

async function clearAppSecret() {
  await Credentials?.clear?.();
  $('appSecret').value = '';
  $('rememberAppSecret').checked = false;
  $('appSecret').placeholder = '默认仅本次浏览器会话保存';
  setStatus('✓ App Secret 已从浏览器会话和本机持久化存储中清除');
}

async function parseUrl() {
  await save();
  const raw = $('baseUrl').value.trim();
  if (!raw) return setStatus('请先粘贴多维表格链接', true);
  setStatus('正在解析链接…');
  const res = await chrome.runtime.sendMessage({ type: 'RESOLVE_FEISHU_URL', url: raw, settings: collect() });
  if (!res?.ok) return setStatus(res?.error || '解析失败', true);
  $('appToken').value = res.appToken || ''; $('tableId').value = res.tableId || '';
  settings = collect(); await chrome.storage.local.set({ settings });
  setStatus(`✓ ${res.message || '解析成功'}`);
}

async function testConnection() {
  await save(); setStatus('正在测试连接…');
  const res = await chrome.runtime.sendMessage({ type: 'TEST_FEISHU', settings: collect() });
  if (res?.ok) {
    if (res.appToken) $('appToken').value = res.appToken;
    if (res.tableId) $('tableId').value = res.tableId;
    settings = collect(); await chrome.storage.local.set({ settings });
  }
  setStatus(res?.ok ? `✓ ${res.message || '飞书连接成功'}` : res?.error || '连接失败', !res?.ok);
}

async function initFields() {
  await save(); setStatus('正在检查并初始化表头…');
  const res = await chrome.runtime.sendMessage({ type: 'INIT_FIELDS', settings: collect() });
  if (res?.ok) {
    if (res.appToken) $('appToken').value = res.appToken;
    if (res.tableId) $('tableId').value = res.tableId;
    settings = collect(); await chrome.storage.local.set({ settings });
    setStatus(`✓ ${res.message}${res.warnings?.length ? `；${res.warnings.join('；')}` : ''}`);
  } else setStatus(res?.error || '初始化失败', true);
}

async function saveAlias() {
  const host = normalizeHost($('aliasHost').value), company = $('aliasCompany').value.trim();
  if (!host || !company) return setStatus('公司名覆盖需要填写域名和公司名', true);
  settings = collect(); settings.companyAliases = settings.companyAliases || {}; settings.companyAliases[host] = company;
  await chrome.storage.local.set({ settings }); setStatus(`✓ 已保存：${host} → ${company}`);
}
async function deleteAlias() {
  const host = normalizeHost($('aliasHost').value); if (!host) return setStatus('请填写要删除的域名', true);
  settings = collect(); if (settings.companyAliases?.[host]) delete settings.companyAliases[host];
  await chrome.storage.local.set({ settings }); setStatus(`✓ 已删除 ${host} 的公司名覆盖`);
}
async function saveCustom() {
  const host = normalizeHost($('customHost').value), card = $('selCard').value.trim();
  if (!host || !card) return setStatus('高级规则至少需要域名和 card 选择器', true);
  settings = collect(); settings.customSites = settings.customSites || {};
  settings.customSites[host] = { card, company:$('selCompany').value.trim(), position:$('selPosition').value.trim(), location:$('selLocation').value.trim(), time:$('selTime').value.trim(), status:$('selStatus').value.trim(), link:$('selLink').value.trim() };
  await chrome.storage.local.set({ settings }); setStatus(`✓ 已保存 ${host} 的解析规则`);
}
async function deleteCustom() {
  const host = normalizeHost($('customHost').value); if (!host) return setStatus('请填写要删除规则的域名', true);
  settings = collect(); if (settings.customSites?.[host]) delete settings.customSites[host];
  await chrome.storage.local.set({ settings }); setStatus(`✓ 已删除 ${host} 的解析规则`);
}
function normalizeHost(v) { return String(v || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase(); }
function setStatus(text, error=false) { $('status').textContent = text || ''; $('status').style.color = error ? '#c94646' : '#647085'; }

async function runFollowUp() {
  await save();
  const btn = $('runFollowUp'); btn.disabled = true; btn.textContent = '正在启动…';
  const request = { id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now() };
  await chrome.storage.local.set({ followUpRunRequest: request });
  $('followUpSummary').textContent = '任务已在后台启动…';
  for (const delay of [700, 2200, 5200]) setTimeout(() => refreshFollowUpSummary(false), delay);
  setTimeout(() => { btn.disabled = false; btn.textContent = '立即跟进'; }, 900);
}

async function refreshFollowUpSummary(showError = true) {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_FOLLOWUP_SUMMARY' });
    if (!res?.ok) throw new Error(res?.error || '读取失败');
    const enabled = !!res.enabled;
    $('followUpBadge').textContent = res.running ? '运行中' : (enabled ? '已开启' : '未开启');
    $('followUpBadge').classList.toggle('running', !!res.running);
    const q = res.session || {};
    const problems = Number(q.loginRequired || 0) + Number(q.challenge || 0) + Number(q.rateLimited || 0);
    const healthyText = q.healthy ? `${q.healthy} 个网站正常` : '暂无会话记录';
    const pieces = [res.running ? '正在后台检查' : healthyText];
    if (problems) pieces.push(`${problems} 个登录/验证问题`);
    if (res.permissionCount) pieces.push(`${res.permissionCount} 个网站待授权`);
    if (res.reviewCount) pieces.push(`${res.reviewCount} 项待确认`);
    if (res.lastFollowUp?.ok === false && res.lastFollowUp?.message) pieces.push(`上次失败：${res.lastFollowUp.message}`);
    $('followUpSummary').textContent = pieces.join(' · ');
    const schedule = [];
    if (res.lastFollowUp?.at) schedule.push(`上次 ${fmtTime(res.lastFollowUp.at)} · 变化 ${res.lastFollowUp.changed ?? 0}`);
    if (res.nextAt) schedule.push(`下次 ${fmtTime(res.nextAt)}`);
    schedule.push(`${Number(res.intervalHours || 6)}h · ${modeText(res.mode)}`);
    $('followUpSchedule').textContent = schedule.join(' · ');
    const actionBtn = $('showFollowUpActions');
    actionBtn.hidden = !res.actionableCount;
    actionBtn.textContent = `${res.actionableCount || 0} 项需要处理`;
    if (actionsVisible) await loadActions();
  } catch (e) {
    if (showError) $('followUpSummary').textContent = e?.message || String(e);
  }
}

async function toggleActions() {
  actionsVisible = !actionsVisible;
  $('followUpActions').hidden = !actionsVisible;
  if (actionsVisible) await loadActions();
}

async function loadActions() {
  const root = $('followUpActions');
  root.replaceChildren();
  const res = await chrome.runtime.sendMessage({ type: 'GET_FOLLOWUP_ACTIONS' });
  if (!res?.ok) return root.appendChild(actionMessage(res?.error || '读取失败'));
  if (!res.actions?.length) {
    actionsVisible = false; root.hidden = true; $('showFollowUpActions').hidden = true; return;
  }
  for (const item of res.actions.slice(0, 8)) {
    const row = document.createElement('div'); row.className = 'action-row';
    const info = document.createElement('div');
    const title = document.createElement('b'); title.textContent = item.title || item.host || '需要处理';
    const sub = document.createElement('small'); sub.textContent = item.subtitle || '';
    info.append(title, sub); row.appendChild(info);
    const buttons = document.createElement('div'); buttons.className = 'action-buttons';
    if (item.kind === 'session') {
      const open = document.createElement('button'); open.textContent = '打开';
      open.onclick = async () => {
        const r = await chrome.runtime.sendMessage({ type: 'OPEN_FOLLOWUP_ACTION', id: item.id });
        if (!r?.ok) setStatus(r?.error || '打开失败', true);
        else setStatus('完成登录/验证后会自动复检，无需再次手动刷新。');
      };
      buttons.appendChild(open);
    } else if (item.kind === 'permission') {
      const grant = document.createElement('button'); grant.className = 'primary mini'; grant.textContent = '授权';
      grant.onclick = async () => {
        const ok = await HostAccess?.request?.(item.url || `https://${item.host}/`).catch(() => false);
        if (!ok) return setStatus('未授予此招聘网站的后台访问权限', true);
        await chrome.storage.local.set({ followUpRunRequest: { id: `permission-${Date.now()}`, at: Date.now() } });
        setStatus('✓ 已授权，正在重新检查该招聘网站');
        setTimeout(() => refreshFollowUpSummary(false), 900);
      };
      buttons.appendChild(grant);
    } else {
      const confirm = document.createElement('button'); confirm.className = 'primary mini'; confirm.textContent = '确认';
      confirm.onclick = () => resolveReview(item.id, 'confirm');
      const ignore = document.createElement('button'); ignore.textContent = '忽略'; ignore.onclick = () => resolveReview(item.id, 'ignore');
      buttons.append(confirm, ignore);
    }
    row.appendChild(buttons); root.appendChild(row);
  }
}

function actionMessage(text) { const el = document.createElement('div'); el.className = 'hint'; el.textContent = text; return el; }
async function resolveReview(id, action) {
  const res = await chrome.runtime.sendMessage({ type: 'RESOLVE_FOLLOWUP_REVIEW', id, action });
  setStatus(res?.ok ? (res.message || (action === 'ignore' ? '已忽略此次' : '已确认更新')) : (res?.error || '处理失败'), !res?.ok);
  await refreshFollowUpSummary(); await loadActions();
}
