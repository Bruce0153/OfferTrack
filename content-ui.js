(() => {
  const ROOT_ID = 'offertrack-badge';
  const SUCCESS_RE = /^新增\s+\d+\s*·\s*更新\s+\d+\s*·\s*跳过\s+\d+/;
  let collapseTimer = null;

  function ensureLauncher(root) {
    if (!root || root.dataset.otUiUpgraded === '1') return;

    const oldHead = root.querySelector(':scope > .ot-head');
    const oldMain = root.querySelector(':scope > .ot-main');
    const oldSub = root.querySelector(':scope > .ot-sub');
    const oldActions = root.querySelector(':scope > .ot-actions');
    if (!oldHead || !oldMain || !oldSub || !oldActions) return;

    const launcher = document.createElement('button');
    launcher.className = 'ot-launcher';
    launcher.type = 'button';
    launcher.title = '打开 OfferTrack';
    launcher.setAttribute('aria-label', '打开 OfferTrack');
    launcher.innerHTML = '<span class="ot-launch-icon">🎯</span><span class="ot-launch-count">0</span>';

    const panel = document.createElement('div');
    panel.className = 'ot-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'OfferTrack 投递助手');

    panel.append(oldHead, oldMain, oldSub, oldActions);
    root.prepend(panel);
    root.prepend(launcher);
    root.dataset.otUiUpgraded = '1';
    root.classList.add('ot-collapsed', 'ot-ui-ready');

    const close = panel.querySelector('.ot-close');
    if (close) {
      close.type = 'button';
      close.title = '收起';
      close.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        root.classList.add('ot-collapsed');
      };
    }

    launcher.onclick = () => root.classList.remove('ot-collapsed');
    syncLauncher(root);

    const observer = new MutationObserver(() => {
      syncLauncher(root);
      const sub = root.querySelector('.ot-sub');
      if (sub && SUCCESS_RE.test((sub.textContent || '').trim())) {
        clearTimeout(collapseTimer);
        collapseTimer = setTimeout(() => {
          if (root.isConnected) root.classList.add('ot-collapsed');
        }, 2800);
      }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  function syncLauncher(root) {
    const countText = (root.querySelector('.ot-count')?.textContent || '0').trim();
    const count = Number.parseInt(countText, 10) || 0;
    const badge = root.querySelector('.ot-launch-count');
    if (!badge) return;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.toggle('ot-zero', count === 0);
  }

  function scan() {
    ensureLauncher(document.getElementById(ROOT_ID));
  }

  scan();
  const pageObserver = new MutationObserver(scan);
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
