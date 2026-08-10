(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackProviderRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const APPLICATION_HINT_RE = /(mydeliver|mydelivery|myapply|my-apply|applications?|applicationcenter|deliveryrecord|delivery|candidatehome|candidate|personal\/delivery|account\/apply|position\/application|progress|process)/i;

  function safeUrl(input) {
    try { return new URL(String(input || '')); }
    catch { return null; }
  }

  function normalizeHost(host) {
    return String(host || '').toLowerCase().replace(/^www\./, '').trim();
  }

  function contextOf(input = {}) {
    if (typeof input === 'string') input = { url: input };
    const firstUrl = input.url || input.records?.find?.(r => r?.url)?.url || '';
    const u = safeUrl(firstUrl);
    const host = normalizeHost(input.host || u?.hostname || '');
    return {
      host,
      url: firstUrl,
      records: Array.isArray(input.records) ? input.records : [],
      title: String(input.title || ''),
      text: String(input.text || '')
    };
  }

  function endsWithHost(host, suffix) {
    host = normalizeHost(host);
    suffix = normalizeHost(suffix);
    return host === suffix || host.endsWith(`.${suffix}`);
  }

  const PROVIDERS = [
    {
      id: 'feishu_jobs',
      name: 'Feishu Jobs',
      family: 'ats',
      priority: 100,
      strategies: ['structured_state', 'page_scan'],
      capabilities: { structuredState: true, pageScan: true, backgroundTab: true, apiDirect: false },
      detect(ctx) {
        let score = 0;
        const hostMatch = endsWithHost(ctx.host, 'jobs.feishu.cn');
        if (hostMatch) score += 100;
        if (hostMatch && /\/(?:campusrecruitment\/)?position\/application(?:[/?#]|$)|\/campus\/position\/application/i.test(ctx.url)) score += 22;
        return score;
      },
      scoreUrl(url) {
        let score = 0;
        if (/\/(?:campusrecruitment\/)?position\/application(?:[/?#]|$)|\/campus\/position\/application/i.test(url)) score += 24;
        if (/share_token=/i.test(url)) score += 2;
        return score;
      }
    },
    {
      id: 'moka',
      name: 'Moka',
      family: 'ats',
      priority: 90,
      strategies: ['structured_state', 'page_scan'],
      capabilities: { structuredState: true, pageScan: true, backgroundTab: true, apiDirect: false },
      detect(ctx) {
        let score = 0;
        const hostMatch = endsWithHost(ctx.host, 'mokahr.com');
        if (hostMatch) score += 100;
        if (hostMatch && /(?:#\/)?candidateHome\/applications|candidate.*applications/i.test(ctx.url)) score += 22;
        return score;
      },
      scoreUrl(url) {
        let score = 0;
        if (/(?:#\/)?candidateHome\/applications/i.test(url)) score += 26;
        if (/campus-recruitment|social-recruitment/i.test(url)) score += 3;
        return score;
      }
    },
    {
      id: 'beisen_zhiye',
      name: 'Beisen / Zhiye',
      family: 'ats',
      priority: 90,
      strategies: ['structured_state', 'page_scan'],
      capabilities: { structuredState: true, pageScan: true, backgroundTab: true, apiDirect: false },
      detect(ctx) {
        let score = 0;
        const hostMatch = endsWithHost(ctx.host, 'zhiye.com');
        if (hostMatch) score += 100;
        if (hostMatch && /\/personal\/deliveryRecord(?:[/?#]|$)/i.test(ctx.url)) score += 24;
        return score;
      },
      scoreUrl(url) {
        return /\/personal\/deliveryRecord(?:[/?#]|$)/i.test(url) ? 28 : 0;
      }
    },
    {
      id: 'self_hosted_spa',
      name: 'Self-hosted SPA',
      family: 'generic',
      priority: 40,
      strategies: ['structured_state', 'page_scan'],
      capabilities: { structuredState: true, pageScan: true, backgroundTab: true, apiDirect: false },
      detect(ctx) {
        let score = 0;
        const u = safeUrl(ctx.url);
        if (u?.hash && /^#\//.test(u.hash)) score += 30;
        if (u?.hash && APPLICATION_HINT_RE.test(u.hash)) score += 22;
        if (!score && APPLICATION_HINT_RE.test(ctx.url) && !/jobs\.feishu\.cn|mokahr\.com|zhiye\.com/i.test(ctx.host)) score += 16;
        return score;
      },
      scoreUrl(url) {
        const u = safeUrl(url);
        let score = 0;
        if (u?.hash && /^#\//.test(u.hash)) score += 10;
        if (u?.hash && APPLICATION_HINT_RE.test(u.hash)) score += 18;
        return score;
      }
    },
    {
      id: 'generic_web',
      name: 'Generic Web',
      family: 'generic',
      priority: 0,
      strategies: ['page_scan'],
      capabilities: { structuredState: false, pageScan: true, backgroundTab: true, apiDirect: false },
      detect() { return 1; },
      scoreUrl() { return 0; }
    }
  ];

  function detect(input = {}) {
    const ctx = contextOf(input);
    const ranked = PROVIDERS.map(provider => {
      let score = 0;
      try { score = Number(provider.detect(ctx) || 0); } catch {}
      return { provider, score };
    }).filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || b.provider.priority - a.provider.priority);
    const top = ranked[0] || { provider: PROVIDERS[PROVIDERS.length - 1], score: 1 };
    const second = ranked[1]?.score || 0;
    const confidence = top.provider.id === 'generic_web' ? 0.2 : Math.max(0.35, Math.min(1, (top.score - Math.min(second, top.score - 1)) / 60));
    return describe(top.provider, top.score, confidence);
  }

  function describe(provider, score = 0, confidence = 0) {
    return {
      id: provider.id,
      name: provider.name,
      family: provider.family,
      score,
      confidence,
      strategies: [...provider.strategies],
      capabilities: { ...provider.capabilities }
    };
  }

  function getProvider(id) {
    return PROVIDERS.find(p => p.id === id) || PROVIDERS[PROVIDERS.length - 1];
  }

  function scoreCheckUrl(providerInfo, url, core = null) {
    const provider = getProvider(providerInfo?.id || providerInfo);
    let score = core?.urlScore ? Number(core.urlScore(url) || 0) : 0;
    try { score += Number(provider.scoreUrl(url) || 0); } catch {}
    return score;
  }

  function chooseCheckUrl(group, core = null, providerInfo = null) {
    const info = providerInfo || detect(group);
    const candidates = [...new Set((group?.records || []).map(r => r?.url).filter(Boolean))];
    if (group?.url) candidates.push(group.url);
    const unique = [...new Set(candidates)];
    unique.sort((a, b) => scoreCheckUrl(info, b, core) - scoreCheckUrl(info, a, core) || String(a).length - String(b).length);
    return unique[0] || group?.url || '';
  }

  function enrichGroup(group, core = null) {
    const provider = detect(group);
    return {
      ...group,
      url: chooseCheckUrl(group, core, provider),
      provider,
      providerId: provider.id,
      providerName: provider.name,
      providerConfidence: provider.confidence,
      strategies: provider.strategies,
      capabilities: provider.capabilities
    };
  }

  function enrichGroups(groups, core = null) {
    return (groups || []).map(group => enrichGroup(group, core));
  }

  function summarize(groups) {
    const counts = {};
    for (const g of groups || []) {
      const id = g?.providerId || g?.provider?.id || 'generic_web';
      const name = g?.providerName || g?.provider?.name || getProvider(id).name;
      counts[id] ||= { id, name, sites: 0, records: 0 };
      counts[id].sites += 1;
      counts[id].records += Array.isArray(g?.records) ? g.records.length : 0;
    }
    return Object.values(counts).sort((a, b) => b.sites - a.sites || a.name.localeCompare(b.name));
  }

  function tabScore(group, tabUrl, core = null) {
    const info = group?.provider || detect(group);
    let score = scoreCheckUrl(info, tabUrl, core);
    if (core?.canonicalUrl && group?.url && core.canonicalUrl(tabUrl) === core.canonicalUrl(group.url)) score += 20;
    return score;
  }

  return {
    PROVIDERS: PROVIDERS.map(p => describe(p)),
    contextOf,
    detect,
    getProvider,
    scoreCheckUrl,
    chooseCheckUrl,
    enrichGroup,
    enrichGroups,
    summarize,
    tabScore
  };
});
