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
  $('runFollowUp').onclick = runFollowUp;
  $('refreshFollowUp').onclick = refreshFollowUpState;
  $('refreshSessions').onclick = refreshSessionHealth;
  $('openSessionProblem').onclick = openSessionProblem;
  $('clearSessions').onclick = clearSessionHealth;
  $('baseUrl').addEventListener('input', () => {
    const current = $('baseUrl').value.trim();
    if (current !== (settings.baseUrl || '')) {
      $('appToken').value = '';
      $('tableId').value = '';
    }
  });
  await refreshFollowUpState();
  await refreshSessionHealth();
});

function fill() {
  for (const k of ['appId','appSecret','appToken','tableId','baseUrl']) $(k).value = settings[k] || '';
  $('enabled').checked = settings.enabled !== false;
  $('autoSync').checked = !!settings.autoSync;
  $('followUpEnabled').checked = !!settings.followUpEnabled;
  $('followUpIntervalHours').value = Number(settings.followUpIntervalHours || 6);
  $('followUpMaxSitesPerRun').value = Number(settings.followUpMaxSitesPerRun || 12);
  $('followUpMode').value = settings.followUpMode || 'open_tabs';
  $('followUpApiFirst').checked = settings.followUpApiFirst !== false;
  $('followUpStructuredState').checked = settings.followUpStructuredState !== false;
  $('followUpNotify').checked = settings.followUpNotify !== false;
  $('followUpNotifySessionIssues').checked = settings.followUpNotifySessionIssues !== false;
  $('followUpIncludeTerminal').checked = !!settings.followUpIncludeTerminal;
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
    followUpEnabled: $('followUpEnabled').checked,
    followUpIntervalHours: Math.min(72, Math.max(1, Number($('followUpIntervalHours').value || 6))),
    followUpMaxSitesPerRun: Math.min(30, Math.max(1, Number($('followUpMaxSitesPerRun').value || 12))),
    followUpMode: $('followUpMode').value || 'open_tabs',
    followUpApiFirst: $('followUpApiFirst').checked,
    followUpStructuredState: $('followUpStructuredState').checked,
    followUpApiTimeoutSeconds: Number(settings.followUpApiTimeoutSeconds || 6),
    followUpNotify: $('followUpNotify').checked,
    followUpNotifySessionIssues: $('followUpNotifySessionIssues').checked,
    followUpIncludeTerminal: $('followUpIncludeTerminal').checked,
    followUpTabTimeoutSeconds: Number(settings.followUpTabTimeoutSeconds || 25),
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


async function runFollowUp() {
  await save();
  const btn = $('runFollowUp');
  btn.disabled = true;
  btn.textContent = '正在启动…';
  const request = { id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now() };
  await chrome.storage.local.set({ followUpRunRequest: request });
  setFollowUpStatus('已启动自动跟进任务。任务会在后台继续执行，可关闭设置页；稍后刷新状态即可查看结果。');
  setTimeout(() => refreshFollowUpState(false), 1200);
  setTimeout(() => refreshFollowUpState(false), 5000);
  setTimeout(() => { btn.disabled = false; btn.textContent = '立即跟进一次'; }, 900);
}

async function refreshFollowUpState(showMessage = true) {
  try {
    const stored = await chrome.storage.local.get(['settings','lastFollowUp','followUpLease']);
    const current = stored.settings || settings || {};
    const alarm = await chrome.alarms.get('offertrack-follow-up').catch(() => null);
    const lease = stored.followUpLease || {};
    const running = lease.status === 'running' && Date.now() - Number(lease.startedAt || 0) < 20 * 60 * 1000;
    const parts = [];
    const enabled = !!current.followUpEnabled;
    const interval = Number(current.followUpIntervalHours || 6);
    parts.push(enabled ? `自动跟进：已开启（每 ${interval} 小时）` : '自动跟进：未开启');
    if (alarm?.scheduledTime) parts.push(`下次计划：${fmtTime(alarm.scheduledTime)}`);
    if (running) parts.push('当前：任务运行中');
    if (stored.lastFollowUp) parts.push(`上次：${formatFollowUpResult(stored.lastFollowUp)}`);
    if (showMessage || !$('followUpStatus').textContent || running) setFollowUpStatus(parts.join('；'));
  } catch (e) {
    if (showMessage) setFollowUpStatus(e?.message || String(e), true);
  }
}

function formatFollowUpResult(r) {
  if (!r) return '暂无记录';
  const at = r.at ? fmtTime(r.at) : '';
  const core = `检查 ${r.checked ?? 0} 条，变化 ${r.changed ?? 0}，待登录 ${r.loginRequired ?? 0}，失败 ${r.failed ?? 0}`;
  const providers = Array.isArray(r.providers) && r.providers.length ? ` · 系统 ${r.providers.map(x => `${x.name}:${x.sites}`).join('/')}` : '';
  return `${at ? `${at} · ` : ''}${core}${providers}`;
}

function fmtTime(ts) {
  try { return new Date(Number(ts)).toLocaleString('zh-CN', { hour12: false }); }
  catch { return ''; }
}

function setFollowUpStatus(text, error=false) {
  $('followUpStatus').textContent = text || '';
  $('followUpStatus').style.color = error ? '#c94646' : '#647085';
}


async function refreshSessionHealth() {
  const summaryEl = $('sessionSummary');
  const listEl = $('sessionList');
  summaryEl.textContent = '读取中…';
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_SESSION_HEALTH' });
    if (!res?.ok) throw new Error(res?.error || '无法读取会话状态');
    const q = res.summary || {};
    summaryEl.textContent = `健康 ${q.healthy || 0} · 需登录 ${q.loginRequired || 0} · 验证/受限 ${(q.challenge || 0) + (q.rateLimited || 0)} · 异常 ${q.error || 0}`;
    renderSessionList(res.entries || []);
  } catch (e) {
    summaryEl.textContent = '读取失败';
    listEl.innerHTML = `<div class="hint">${escapeHtml2(e?.message || String(e))}</div>`;
  }
}

function renderSessionList(entries) {
  const root = $('sessionList');
  root.innerHTML = '';
  const visible = (entries || []).slice(0, 8);
  if (!visible.length) {
    root.innerHTML = '<div class="hint">尚无会话检查记录。运行一次自动跟进后会在这里显示。</div>';
    return;
  }
  for (const e of visible) {
    const row = document.createElement('div');
    row.className = 'session-row';
    const bad = e.state === 'login_required' || e.state === 'error';
    const warn = e.state === 'challenge' || e.state === 'rate_limited';
    const cls = e.state === 'healthy' ? 'ok' : bad ? 'bad' : warn ? 'warn' : '';
    const sub = [e.providerName, e.reason, e.lastCheckedAt ? fmtTime(e.lastCheckedAt) : ''].filter(Boolean).join(' · ');
    row.innerHTML = `<div><b>${escapeHtml2(e.host || '')}</b><small>${escapeHtml2(sub)}</small></div><span class="session-tag ${cls}">${escapeHtml2(e.label || e.state || '未知')}</span>`;
    root.appendChild(row);
  }
}

async function openSessionProblem() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_SESSION_HEALTH' });
    const entry = (res?.entries || []).find(e => ['login_required','challenge','rate_limited'].includes(e.state));
    if (!entry) return setFollowUpStatus('当前没有需要重新登录或验证的网站。');
    const url = entry.lastUrl || `https://${entry.host}/`;
    await chrome.tabs.create({ url, active: true });
    setFollowUpStatus(`已打开 ${entry.host}。完成登录/验证后，点击“立即跟进一次”即可立即恢复检查。`);
  } catch (e) {
    setFollowUpStatus(e?.message || String(e), true);
  }
}

async function clearSessionHealth() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'CLEAR_SESSION_HEALTH' });
    if (!res?.ok) throw new Error(res?.error || '清理失败');
    renderSessionList(res.entries || []);
    const q = res.summary || {};
    $('sessionSummary').textContent = `健康 ${q.healthy || 0} · 需登录 ${q.loginRequired || 0} · 验证/受限 ${(q.challenge || 0) + (q.rateLimited || 0)} · 异常 ${q.error || 0}`;
    setFollowUpStatus('会话健康记录已清理；不会清除浏览器登录状态。');
  } catch (e) {
    setFollowUpStatus(e?.message || String(e), true);
  }
}

function escapeHtml2(v) {
  return String(v || '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
