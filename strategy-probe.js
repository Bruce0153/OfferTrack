(() => {
  'use strict';
  if (globalThis.__offerTrackStrategyProbeInstalled) return;
  globalThis.__offerTrackStrategyProbeInstalled = true;
  const Contract = globalThis.OfferTrackApplicationContract;
  const URL_POLICY = Contract?.URL_PATTERNS;

  const API_HINT_RE = /(application|apply|delivery|candidate|resume|process|progress|job.*apply|position.*apply|my.*apply|my.*deliver)/i;
  const API_BAD_RE = /(logout|signout|delete|remove|withdraw|cancel|submit|create|update|modify|save|upload|track|analytics|collect|report|metric|beacon|captcha|verify|sms|sendcode)/i;

  function safeJson(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  function collectJsonSnapshots() {
    const out=[];
    let budget=450_000;
    const scripts=[...document.querySelectorAll('script[type="application/ld+json"],script[type="application/json"],script#__NEXT_DATA__,script#__NUXT_DATA__,script[data-state],script[id*="STATE"],script[id*="DATA"]')].slice(0,20);
    for (const el of scripts) {
      if (budget<=0) break;
      const raw=String(el.textContent||'').trim();
      if (!raw || raw.length>180_000) continue;
      budget-=raw.length;
      const parsed=safeJson(raw);
      if (parsed == null || !Contract?.projectStructured) continue;
      const projected=Contract.projectStructured(parsed,{ rootName:el.id||el.type||'json', maxNodes:650, maxDepth:6, maxArray:32, maxKeys:64, maxString:240 });
      if (projected && (Array.isArray(projected) ? projected.length : Object.keys(projected).length)) {
        out.push({ source:`script#${el.id||el.type||'json'}`, data:projected });
      }
    }
    return out.slice(0,12);
  }

  function safeResourceUrl(value) {
    if (!URL_POLICY) return '';
    let u;
    try { u = new URL(String(value || ''), location.href); } catch { return ''; }
    if (u.protocol !== 'https:' || u.origin !== location.origin) return '';
    for (const [key, val] of [...u.searchParams.entries()]) {
      if (URL_POLICY.sensitiveQuery.test(key) || URL_POLICY.sensitiveQuery.test(val) || String(val).length > 96) return '';
      if (URL_POLICY.cacheBuster.test(key)) u.searchParams.delete(key);
    }
    u.hash = '';
    return u.toString();
  }

  function collectResources() {
    const out=[];
    const seen=new Set();
    let entries=[];
    try { entries=performance.getEntriesByType('resource')||[]; } catch {}
    for (const e of entries.slice(-320)) {
      const raw=String(e?.name||'');
      if (!raw || seen.has(raw)) continue;
      const safeUrl = safeResourceUrl(raw);
      if (!safeUrl) continue;
      const u = new URL(safeUrl);
      const key=`${u.pathname}${u.search}`;
      if (!API_HINT_RE.test(key) || API_BAD_RE.test(key)) continue;
      seen.add(raw);
      out.push({ url:safeUrl, initiatorType:String(e?.initiatorType||''), duration:Number(e?.duration||0) });
      if (out.length>=30) break;
    }
    return out;
  }

  chrome.runtime.onMessage.addListener((msg,_sender,sendResponse) => {
    if (msg?.type !== 'COLLECT_STRATEGY_PROBE') return;
    try {
      sendResponse({ ok:true, page:{ url:location.href,title:document.title,origin:location.origin }, jsonSnapshots:collectJsonSnapshots(), resources:collectResources() });
    } catch (e) {
      sendResponse({ ok:false,error:e?.message||String(e),page:{url:location.href,title:document.title} });
    }
    return true;
  });
})();