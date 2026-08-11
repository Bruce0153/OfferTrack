(() => {
  'use strict';
  const compact = v => String(v || '').replace(/[\t\r\n\u00a0]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

  function classify() {
    const body = compact(document.body?.innerText || '').slice(0, 9000);
    const href = location.href;
    const loginRequired = /(手机号登录|验证码登录|扫码登录|账号登录|密码登录|请先登录|登录后查看|重新登录|立即登录|登录\/注册)/i.test(body)
      || /\/(?:login|signin|sign-in)(?:[/?#]|$)|(?:login|signin)=/i.test(href);
    const rateLimited = /(访问过于频繁|操作过于频繁|请求过于频繁|访问频繁|请求频繁|稍后再试|访问受限|请求异常|异常流量|too\s+many\s+requests|rate\s*limit)/i.test(body);
    const challenge = !loginRequired && !rateLimited && /(安全验证|人机验证|滑块验证|机器人验证|行为验证|完成验证|请完成验证|拖动滑块|验证您是真人|验证身份)/i.test(body);
    const state = loginRequired ? 'login_required' : rateLimited ? 'rate_limited' : challenge ? 'challenge' : 'unknown';
    const reason = loginRequired ? '页面要求重新登录' : rateLimited ? '页面提示访问频繁或受限' : challenge ? '页面要求安全/人机验证' : '';
    return { body, loginRequired, rateLimited, challenge, blocked: challenge || rateLimited, state, reason };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'PROBE_PAGE') return;
    const r = classify();
    sendResponse({ ok: true, loginRequired: r.loginRequired, rateLimited: r.rateLimited, challenge: r.challenge, blocked: r.blocked, sessionState: r.state, reason: r.reason, title: document.title, url: location.href });
  });
})();
