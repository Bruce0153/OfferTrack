(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackApplicationMatcher = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const AUTO_UPDATE_MIN_CONFIDENCE = 0.86;
  const AMBIGUITY_GAP = 0.06;

  const text = v => v == null ? '' : String(v).trim();
  const norm = v => text(v).toLowerCase().replace(/\s+/g, ' ').trim();
  const normCompact = v => norm(v).replace(/[\s\-—–_·•|｜【】\[\]（）()]/g, '');

  function canonicalUrl(url) {
    try {
      const u = new URL(String(url || ''));
      const drop = /^(?:utm_|spm|share|share_token|token|tracking|track|ref|source)/i;
      for (const key of [...u.searchParams.keys()]) if (drop.test(key)) u.searchParams.delete(key);
      u.hash = u.hash ? u.hash.split('?')[0] : '';
      return `${u.origin}${u.pathname}${u.search}${u.hash}`.replace(/\/$/, '');
    } catch { return text(url); }
  }

  function hostOf(url) {
    try { return new URL(String(url || '')).hostname.toLowerCase().replace(/^www\./, ''); }
    catch { return ''; }
  }

  function first(obj, keys) {
    for (const key of keys) {
      const value = obj?.[key];
      if (value !== undefined && value !== null && text(value)) return text(value);
    }
    return '';
  }

  function ids(record = {}) {
    return {
      providerApplicationId: first(record, ['providerApplicationId','provider_application_id']),
      applicationId: first(record, ['applicationId','applyId','application_id','apply_id','uid']),
      deliveryId: first(record, ['deliveryId','delivery_id','sourceId']),
      jobId: first(record, ['jobId','positionId','job_id','position_id'])
    };
  }

  function sameNonEmpty(a, b) { return !!a && !!b && norm(a) === norm(b); }
  function conflictNonEmpty(a, b) { return !!a && !!b && norm(a) !== norm(b); }

  function bigrams(value) {
    const s = normCompact(value), out = new Set();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  }

  function similarity(a, b) {
    const x = normCompact(a), y = normCompact(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.includes(y) || y.includes(x)) return Math.min(x.length, y.length) / Math.max(x.length, y.length);
    const A = bigrams(x), B = bigrams(y);
    if (!A.size || !B.size) return 0;
    let n = 0;
    for (const token of A) if (B.has(token)) n++;
    return (2 * n) / (A.size + B.size);
  }

  function companyCompatible(a, b) {
    const x = normCompact(a), y = normCompact(b);
    if (!x || !y) return true;
    return x === y || x.includes(y) || y.includes(x) || similarity(x, y) >= 0.72;
  }

  function datePart(v) {
    const m = text(v).match(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}/);
    return m ? m[0].replace(/[年/.]/g, '-').replace('月','-').replace('日','') : '';
  }

  function candidate(target, scanned) {
    if (!target || !scanned) return { confidence: 0, method: 'none', reason: 'missing_record', strong: false };
    const tIds = ids(target), sIds = ids(scanned);

    if (conflictNonEmpty(tIds.providerApplicationId, sIds.providerApplicationId)) return { confidence: 0, method: 'id_conflict', reason: 'provider_application_id_conflict', strong: true };
    if (conflictNonEmpty(tIds.applicationId, sIds.applicationId)) return { confidence: 0.03, method: 'id_conflict', reason: 'application_id_conflict', strong: true };
    if (conflictNonEmpty(tIds.deliveryId, sIds.deliveryId)) return { confidence: 0.05, method: 'id_conflict', reason: 'delivery_id_conflict', strong: true };

    if (sameNonEmpty(tIds.providerApplicationId, sIds.providerApplicationId)) return { confidence: 1, method: 'provider_application_id', reason: 'exact_provider_application_id', strong: true };
    if (sameNonEmpty(tIds.applicationId, sIds.applicationId)) return { confidence: 0.995, method: 'application_id', reason: 'exact_application_id', strong: true };
    if (sameNonEmpty(tIds.deliveryId, sIds.deliveryId)) return { confidence: 0.99, method: 'delivery_id', reason: 'exact_delivery_id', strong: true };
    if (sameNonEmpty(tIds.jobId, sIds.jobId)) return { confidence: 0.975, method: 'job_id', reason: 'exact_job_or_position_id', strong: true };

    const targetHost = hostOf(target.url), scannedHost = hostOf(scanned.url);
    const sameHost = !!targetHost && !!scannedHost && targetHost === scannedHost;
    const targetUrl = canonicalUrl(target.url), scannedUrl = canonicalUrl(scanned.url);
    if (sameHost && targetUrl && scannedUrl && targetUrl === scannedUrl) {
      return { confidence: 0.96, method: 'canonical_url', reason: 'exact_canonical_url', strong: true };
    }

    const pSim = similarity(target.position, scanned.position);
    const tDate = datePart(target.applyTime), sDate = datePart(scanned.applyTime);
    const sameDate = !!tDate && !!sDate && tDate === sDate;
    const dateConflict = !!tDate && !!sDate && tDate !== sDate;
    const companyOk = companyCompatible(target.company, scanned.company);

    let confidence = 0;
    let method = 'semantic';
    if (pSim >= 0.995 && sameDate) { confidence = 0.94; method = 'position_date'; }
    else if (pSim >= 0.995 && !dateConflict) { confidence = 0.885; method = 'position_exact'; }
    else if (pSim >= 0.90 && sameDate) { confidence = 0.89; method = 'position_date_semantic'; }
    else if (pSim >= 0.82 && sameDate) { confidence = 0.855; method = 'semantic_date'; }
    else if (pSim >= 0.88 && sameHost && !dateConflict) { confidence = 0.84; method = 'semantic_host'; }
    else if (pSim >= 0.72 && sameDate) { confidence = 0.78; method = 'semantic_weak'; }
    else confidence = Math.max(0, Math.min(0.74, pSim * 0.78));

    if (sameHost) confidence += 0.02;
    if (companyOk && target.company && scanned.company) confidence += 0.015;
    if (!companyOk) confidence -= 0.12;
    if (dateConflict) confidence -= 0.18;
    confidence = Math.max(0, Math.min(0.97, confidence));

    return { confidence, method, reason: `position_similarity=${pSim.toFixed(3)}`, strong: confidence >= 0.95, positionSimilarity: pSim, sameDate, sameHost, companyCompatible: companyOk };
  }

  function matchScanned(targets = [], scannedRecords = [], options = {}) {
    const minConfidence = Number(options.minConfidence || AUTO_UPDATE_MIN_CONFIDENCE);
    const unused = new Set(scannedRecords.map((_, i) => i));
    const results = [];

    for (const target of targets) {
      const ranked = [];
      for (const i of unused) ranked.push({ index: i, meta: candidate(target, scannedRecords[i]) });
      ranked.sort((a, b) => b.meta.confidence - a.meta.confidence || a.index - b.index);
      const best = ranked[0] || null;
      const second = ranked[1] || null;
      const ambiguous = !!best && !!second && !best.meta.strong && best.meta.confidence >= minConfidence && (best.meta.confidence - second.meta.confidence) < AMBIGUITY_GAP;
      const accepted = !!best && !ambiguous && best.meta.confidence >= minConfidence;

      if (accepted) {
        unused.delete(best.index);
        const scanned = { ...scannedRecords[best.index], _offerTrackMatch: { ...best.meta, ambiguous: false } };
        results.push({ target, scanned, score: Math.round(best.meta.confidence * 100), matchConfidence: best.meta.confidence, matchMethod: best.meta.method, ambiguous: false, needsConfirmation: false });
      } else {
        results.push({
          target,
          scanned: null,
          score: best ? Math.round(best.meta.confidence * 100) : -100,
          matchConfidence: best?.meta.confidence || 0,
          matchMethod: best?.meta.method || 'none',
          ambiguous,
          needsConfirmation: !!best && best.meta.confidence > 0,
          candidate: best ? scannedRecords[best.index] : null
        });
      }
    }
    return results;
  }

  return {
    AUTO_UPDATE_MIN_CONFIDENCE,
    AMBIGUITY_GAP,
    canonicalUrl,
    hostOf,
    ids,
    similarity,
    candidate,
    matchScanned
  };
});
