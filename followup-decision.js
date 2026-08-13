(function(root, factory) {
  const deps = {
    Matcher: root?.OfferTrackApplicationMatcher,
    StateMachine: root?.OfferTrackStatusStateMachine,
    Review: root?.OfferTrackFollowUpReview,
    Journal: root?.OfferTrackChangeJournal
  };
  const api = factory(deps);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory({
      Matcher: require('./application-matcher.js'),
      StateMachine: require('./status-state-machine.js'),
      Review: require('./followup-review.js'),
      Journal: require('./change-journal.js')
    });
  }
  if (root) root.OfferTrackFollowUpDecision = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(deps) {
  'use strict';

  const { Matcher, StateMachine, Review, Journal } = deps || {};
  const clean = (v, max = 180) => String(v || '')
    .replace(/[\t\r\n\u00a0]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);

  function hostOf(url) {
    try { return new URL(String(url || '')).hostname.toLowerCase().replace(/^www\./, ''); }
    catch { return ''; }
  }

  function reviewPayload(target, candidate, meta = {}, reasonCode) {
    return {
      key: `${target?.recordId || ''}|${reasonCode}|${candidate?.status || ''}|${clean(candidate?.position, 80)}`,
      recordId: target?.recordId || '',
      host: hostOf(target?.url || candidate?.url),
      provider: target?.platform || candidate?.platform || '',
      company: target?.company || candidate?.company || '',
      position: target?.position || candidate?.position || '',
      currentStatus: target?.status || '',
      detectedStatus: candidate?.status || '',
      rawStatus: candidate?.rawStatus || '',
      candidateCompany: candidate?.company || '',
      candidatePosition: candidate?.position || '',
      matchMethod: meta?.method || meta?.matchMethod || '',
      confidence: Number(meta?.confidence ?? meta?.matchConfidence ?? 0),
      reasonCode
    };
  }

  async function matchScanned(targets = [], scannedRecords = []) {
    const matches = Matcher?.matchScanned ? Matcher.matchScanned(targets, scannedRecords) : [];
    for (const match of matches) {
      if (match.scanned) {
        Journal?.rememberMatch?.(match.target, match.scanned);
        continue;
      }
      if (!match.candidate || !match.needsConfirmation || !Review?.add) continue;
      const reasonCode = match.ambiguous ? 'AMBIGUOUS_MATCH' : 'LOW_CONFIDENCE';
      await Review.add(reviewPayload(match.target, match.candidate, {
        matchConfidence: match.matchConfidence,
        matchMethod: match.matchMethod
      }, reasonCode)).catch(() => null);
    }
    return matches;
  }

  function statusDecision(target, scanned, options = {}) {
    if (!scanned || !StateMachine?.decide) {
      return { changed: false, allowed: false, from: '', to: '', reason: 'missing_status_engine' };
    }
    const match = scanned._offerTrackMatch || {};
    const confidence = options.confidence == null
      ? Number(match.confidence || 0)
      : Number(options.confidence);
    return StateMachine.decide(target?.status, scanned?.status, {
      matchConfidence: confidence,
      rawStatus: scanned?.rawStatus || '',
      userConfirmed: !!options.userConfirmed
    });
  }

  async function queueStatusReview(target, scanned, decision) {
    if (!Review?.add || !target?.recordId || !scanned || !decision?.changed || decision.allowed) return null;
    const reason = String(decision.reason || '');
    let reasonCode = '';
    if (/ended_without_explicit_evidence|withdrawn_without_explicit_evidence/.test(reason)) {
      reasonCode = 'TERMINAL_REVIEW';
    } else if (/low_match_confidence|initial_status_low_confidence|match_confidence_below_terminal_threshold/.test(reason)) {
      reasonCode = 'LOW_CONFIDENCE';
    }
    if (!reasonCode) return null;
    return Review.add(reviewPayload(target, scanned, scanned._offerTrackMatch || {}, reasonCode)).catch(() => null);
  }

  async function evaluateStatus(target, scanned) {
    const decision = statusDecision(target, scanned);
    await queueStatusReview(target, scanned, decision);
    return decision;
  }

  return Object.freeze({ matchScanned, statusDecision, queueStatusReview, evaluateStatus, reviewPayload });
});
