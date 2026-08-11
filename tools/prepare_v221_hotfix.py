from pathlib import Path

p = Path('content.js')
s = p.read_text(encoding='utf-8')
start = s.find('  function renderBadge(records, rejectedCount) {')
end = s.find('  function updateBadgeSync(res) {', start)
if start < 0 or end < 0:
    raise RuntimeError('renderBadge block not found')

block = r'''  function renderBadge(records, rejectedCount) {
    if (!badge || !badge.isConnected) {
      badge = document.createElement('div');
      badge.id = 'offertrack-badge';
      badge.classList.add('ot-collapsed');
      badge.innerHTML = `
        <button class="ot-launcher" type="button" title="打开 OfferTrack" aria-label="打开 OfferTrack">
          <span class="ot-launch-icon">🎯</span>
          <span class="ot-launch-count">0</span>
        </button>
        <div class="ot-panel" role="dialog" aria-label="OfferTrack 投递助手">
          <div class="ot-head"><strong>🎯 OfferTrack</strong><button class="ot-close" type="button" title="收起">×</button></div>
          <div class="ot-main"><span class="ot-count">0</span> 条投递记录</div>
          <div class="ot-sub">已自动解析</div>
          <div class="ot-actions"><button class="ot-sync" type="button">同步到飞书</button><button class="ot-settings" type="button">设置</button></div>
        </div>`;
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
    if (mainCount) mainCount.textContent = count;
    if (launchCount) {
      launchCount.textContent = records.length > 99 ? '99+' : count;
      launchCount.classList.toggle('ot-zero', records.length === 0);
    }
    const sub = badge.querySelector('.ot-sub');
    if (sub) {
      sub.textContent = records.length
        ? `已解析${rejectedCount ? ` · 忽略 ${rejectedCount} 条低置信项` : ''}`
        : '未识别到可用投递记录';
    }
  }

'''
s = s[:start] + block + s[end:]
p.write_text(s, encoding='utf-8')
print('prepared integrated collapsed badge for v2.2.1')
