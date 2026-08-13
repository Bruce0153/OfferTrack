let currentRecords = [];
let currentPage = {};
let rejectedCount = 0;
const HostAccess = globalThis.OfferTrackHostAccess;

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  $('scan').onclick = scan;
  $('sync').onclick = sync;
  $('options').onclick = () => chrome.runtime.openOptionsPage();
  $('followUpNow').onclick = runFollowUpNow;
  $('followUpActions').onclick = () => chrome.runtime.openOptionsPage();
  await loadState();
  await loadFollowUpState();
  await scan();
});

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isMissingReceiverError(err) {
  return /Receiving end does not exist|Could not establish connection|message port closed/i.test(err?.message || String(err || ''));
}

async function ensurePageBridge(tabId) {
  if (!chrome.scripting?.executeScript) throw new Error('当前浏览器无法恢复页面解析器，请刷新招聘页面后重试');
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['company-identity.js', 'application-contract.js', 'semantic.js', 'content.js', 'strategy-probe.js', 'followup-probe.js'],
    world: 'ISOLATED'
  });
  if (chrome.scripting?.insertCSS) {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] }).catch(() => {});
  }
}

async function sendPageMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    if (!isMissingReceiverError(e)) throw e;
    await ensurePageBridge(tabId);
    await new Promise(resolve => setTimeout(resolve, 120));
    return chrome.tabs.sendMessage(tabId, message);
  }
}

async function scan() {
  setMessage('正在解析当前页面…');
  $('scan').disabled = true;
  try {
    const tab = await activeTab();
    if (!tab?.id || !/^https:/.test(tab.url || '')) throw new Error('请打开 HTTPS 招聘网站的“我的投递/投递记录”页面');
    const res = await sendPageMessage(tab.id, { type: 'SCAN_PAGE' });
    if (!res?.ok) throw new Error(res?.error || '无法解析当前页面');
    currentRecords = Array.isArray(res.records) ? res.records : [];
    currentPage = res.page || {};
    rejectedCount = res.rejectedCount || 0;
    $('count').textContent = currentRecords.length;
    $('pageState').textContent = res.detected ? '已识别 ✓' : '手动扫描';
    renderPreview();
    setMessage(currentRecords.length
      ? `解析完成${rejectedCount ? `，已忽略 ${rejectedCount} 条低置信项` : ''}`
      : '没有识别到可用投递记录，可刷新页面后重试；必要时使用设置中的解析覆盖');
  } catch (e) {
    $('pageState').textContent = '未识别';
    currentRecords = [];
    renderPreview();
    setMessage(e.message || String(e), true);
  } finally {
    $('scan').disabled = false;
  }
}

function renderPreview() {
  const root = $('preview');
  root.replaceChildren();
  if (!currentRecords.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '暂无预览';
    root.appendChild(empty);
    return;
  }
  for (const r of currentRecords.slice(0, 5)) {
    const row = document.createElement('div');
    row.className = 'preview-row';
    const info = document.createElement('div');
    const company = document.createElement('b');
    const position = document.createElement('span');
    const detail = document.createElement('small');
    const status = document.createElement('em');
    company.textContent = r.company || r.platform || '未知公司';
    position.textContent = r.position || '未知岗位';
    detail.textContent = [r.location, r.applyTime].filter(Boolean).join(' · ') || '地点/投递时间未识别';
    status.textContent = r.status || '已投递';
    info.append(company, position, detail);
    row.append(info, status);
    root.appendChild(row);
  }
  if (currentRecords.length > 5) {
    const more = document.createElement('div');
    more.className = 'more';
    more.textContent = `另有 ${currentRecords.length - 5} 条`;
    root.appendChild(more);
  }
}

async function sync() {
  if (!currentRecords.length) return setMessage('当前没有可同步记录', true);
  $('sync').disabled = true;
  $('sync').textContent = '同步中…';
  setMessage('正在去重并同步到飞书…');
  try {
    const tab = await activeTab();
    let persistentHostAccess = false;
    if (tab?.url && /^https:/i.test(tab.url)) {
      persistentHostAccess = await HostAccess?.request?.(tab.url).catch(() => false) || false;
    }
    const res = await chrome.runtime.sendMessage({
      type: 'SYNC_RECORDS', records: currentRecords, page: { ...currentPage, persistentHostAccess }, source: 'manual'
    });
    if (!res?.ok) throw new Error(res?.error || '同步失败');
    $('created').textContent = res.created ?? 0;
    $('updated').textContent = res.updated ?? 0;
    $('skipped').textContent = res.skipped ?? 0;
    $('lastSync').textContent = '刚刚同步';
    setMessage(`${res.message || '同步完成'}${persistentHostAccess ? '' : '；未授予该招聘网站的长期访问权限，自动跟进将跳过此站点'}`);
  } catch (e) {
    setMessage(e.message || String(e), true);
  } finally {
    $('sync').disabled = false;
    $('sync').textContent = '同步到飞书';
  }
}

async function loadState() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (res?.lastSync) {
    $('created').textContent = res.lastSync.created ?? '-';
    $('updated').textContent = res.lastSync.updated ?? '-';
    $('skipped').textContent = res.lastSync.skipped ?? '-';
    $('lastSync').textContent = new Date(res.lastSync.at).toLocaleString('zh-CN', { hour12:false });
  }
}

function setMessage(text, error=false) {
  $('message').textContent = text || '';
  $('message').style.color = error ? '#c94646' : '#6f798b';
}

async function loadFollowUpState() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_FOLLOWUP_SUMMARY' });
    if (!res?.ok) throw new Error(res?.error || '读取失败');
    const mode = res.mode === 'background_tabs' ? '后台标签页' : '仅已打开页面';
    $('followUpState').textContent = res.running ? '运行中…' : (res.enabled ? `已开启 · ${Number(res.intervalHours || 6)}h` : '未开启');
    const q = res.session || {};
    const sessionProblems = Number(q.loginRequired || 0) + Number(q.challenge || 0) + Number(q.rateLimited || 0);
    const parts = [];
    if (res.running) parts.push('正在后台检查');
    else if (q.healthy) parts.push(`${q.healthy} 个网站正常`);
    if (sessionProblems) parts.push(`${sessionProblems} 个登录/验证问题`);
    if (res.permissionCount) parts.push(`${res.permissionCount} 个网站待授权`);
    if (res.reviewCount) parts.push(`${res.reviewCount} 项待确认`);
    if (res.lastFollowUp?.ok === false && res.lastFollowUp?.message) parts.push(`上次失败：${res.lastFollowUp.message}`);
    if (res.lastFollowUp?.at) parts.push(`上次 ${new Date(res.lastFollowUp.at).toLocaleString('zh-CN', { hour12:false })} · 变化 ${res.lastFollowUp.changed ?? 0}`);
    if (res.nextAt) parts.push(`下次 ${new Date(res.nextAt).toLocaleString('zh-CN', { hour12:false })}`);
    parts.push(mode);
    $('followUpMeta').textContent = parts.join(' · ') || '可在设置中开启自动跟进';
    const btn = $('followUpActions');
    btn.hidden = !res.actionableCount;
    btn.textContent = `${res.actionableCount || 0} 项需处理`;
  } catch (e) {
    $('followUpState').textContent = '不可用';
    $('followUpMeta').textContent = e?.message || String(e);
  }
}

async function runFollowUpNow() {
  const btn = $('followUpNow'); btn.disabled = true; btn.textContent = '正在启动…';
  try {
    await chrome.storage.local.set({ followUpRunRequest: { id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now() } });
    setMessage('自动跟进已在后台启动，可关闭此窗口。');
    for (const delay of [650, 2200, 5200]) setTimeout(loadFollowUpState, delay);
  } catch (e) { setMessage(e?.message || String(e), true); }
  finally { setTimeout(() => { btn.disabled = false; btn.textContent = '立即跟进'; }, 800); }
}
