(() => {
  'use strict';
  const LOGIN_RE = /(手机号登录|短信验证码|验证码登录|扫码登录|账号登录|密码登录|请先登录|重新登录|登录后查看|立即登录|sign\s*in|log\s*in)/i;
  const BLOCK_RE = /(滑块验证|人机验证|安全验证|访问过于频繁|操作频繁|验证码|captcha|verify you are human|访问受限|risk control)/i;
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'PROBE_PAGE') return;
    const text = String(document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 50000);
    const url = location.href;
    sendResponse({
      ok: true,
      url,
      title: document.title,
      loginRequired: /\/(?:login|signin|sign-in)(?:[/?#]|$)/i.test(url) || LOGIN_RE.test(text.slice(0, 12000)),
      blocked: BLOCK_RE.test(text.slice(0, 16000)),
      bodyLength: text.length
    });
  });
})();
