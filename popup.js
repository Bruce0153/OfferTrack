let currentRecords = [];
let currentPage = {};
let rejectedCount = 0;

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  $('scan').onclick = scan;
  $('sync').onclick = sync;
  $('options').onclick = () => chrome.runtime.openOptionsPage();
  $('followUpNow').onclick = runFollowUpNow;
  await loadState();
  await loadFollowUpState();
  await scan();
});

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function scan() {
  setMessage('正在解析当前页面…');
  $('scan').disabled = true;
  try {
    const tab = await activeTab();
    if (!tab?.id || !/^https:/.test(tab.url || '')) throw new Error('请打开 HTTPS 招聘网站的“我的投递/投递记录”页面');
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' });
    if (!res?.ok) throw new Error(res?.error || '无法解析当前页面');
    let records = res.records || [];
    try {
      const enhanced = await chrome.tabs.sendMessage(tab.id, { type: 'ENHANCE_RECORDS', records });
      if (enhanced?.ok && Array.isArray(enhanced.records)) records = enhanced.records;
    } catch {}
    currentRecords = records;
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
  root.innerHTML = '';
  if (!currentRecords.length) {
    root.innerHTML = '<div class="empty">暂无预览</div>';
    return;
  }
  for (const r of currentRecords.slice(0, 5)) {
    const row = document.createElement('div');
    row.className = 'preview-row';
    const company = escapeHtml(r.company || r.platform || '未知公司');
    const position = escapeHtml(r.position || '未知岗位');
    const status = escapeHtml(r.status || '已投递');
    const detail = escapeHtml([r.location, r.applyTime].filter(Boolean).join(' · ') || '地点/投递时间未识别');
    row.innerHTML = `<div><b>${company}</b><span>${position}</span><small>${detail}</small></div><em>${status}</em>`;
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
    const res = await chrome.runtime.sendMessage({
      type: 'SYNC_RECORDS', records: currentRecords, page: currentPage, source: 'manual'
    });
    if (!res?.ok) throw new Error(res?.error || '同步失败');
    $('created').textContent = res.created ?? 0;
    $('updated').textContent = res.updated ?? 0;
    $('skipped').textContent = res.skipped ?? 0;
    $('lastSync').textContent = '刚刚同步';
    setMessage(res.message || '同步完成');
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

function escapeHtml(v) {
  return String(v || '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}


async function loadFollowUpState() {
  try {
    const stored = await chrome.storage.local.get(['settings','lastFollowUp','followUpLease']);
    const settings = stored.settings || {};
    const alarm = await chrome.alarms.get('offertrack-follow-up').catch(() => null);
    const lease = stored.followUpLease || {};
    const running = lease.status === 'running' && Date.now() - Number(lease.startedAt || 0) < 20 * 60 * 1000;
    $('followUpState').textContent = running ? '运行中…' : (settings.followUpEnabled ? `已开启 · ${Number(settings.followUpIntervalHours || 6)}h` : '未开启');
    const parts = [];
    if (stored.lastFollowUp?.at) {
      parts.push(`上次 ${new Date(stored.lastFollowUp.at).toLocaleString('zh-CN', { hour12:false })}`);
      parts.push(`变化 ${stored.lastFollowUp.changed ?? 0}`);
      if (Array.isArray(stored.lastFollowUp.providers) && stored.lastFollowUp.providers.length) {
        parts.push(`系统 ${stored.lastFollowUp.providers.map(x => `${x.name}:${x.sites}`).join('/')}`);
      }
    }
    if (alarm?.scheduledTime) parts.push(`下次 ${new Date(alarm.scheduledTime).toLocaleString('zh-CN', { hour12:false })}`);
    $('followUpMeta').textContent = parts.join(' · ') || '可在设置中开启每 6 小时自动跟进';
  } catch (e) {
    $('followUpState').textContent = '不可用';
    $('followUpMeta').textContent = e?.message || String(e);
  }
}

async function runFollowUpNow() {
  const btn = $('followUpNow');
  btn.disabled = true;
  btn.textContent = '正在启动…';
  try {
    const request = { id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now() };
    await chrome.storage.local.set({ followUpRunRequest: request });
    setMessage('自动跟进任务已启动，可关闭插件窗口；任务会在后台继续运行。');
    await new Promise(resolve => setTimeout(resolve, 700));
    await loadFollowUpState();
  } catch (e) {
    setMessage(e?.message || String(e), true);
  } finally {
    btn.disabled = false;
    btn.textContent = '立即跟进全部';
  }
}
