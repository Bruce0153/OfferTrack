(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackStatusStateMachine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const ORDER = Object.freeze({ '已投递': 10, '筛选中': 20, '笔试/测评': 30, '面试中': 40, 'Offer': 50 });
  const TERMINAL = new Set(['已结束', '已撤回']);
  const STRONG_ENDED_RE = /(不合适|不通过|未通过|拒绝|淘汰|流程(?:已)?结束|招聘流程结束|终止流程|已终止|申请失败|投递失败)/i;
  const STRONG_WITHDRAWN_RE = /(已撤回|撤回成功|撤销申请|主动撤回)/i;

  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();

  function normalize(status) {
    const s = clean(status);
    if (!s) return '';
    if (/撤回/.test(s)) return '已撤回';
    if (/不合适|不通过|未通过|拒绝|淘汰|结束|终止|失败/.test(s)) return '已结束';
    if (/offer|录用|意向书/i.test(s) && !/未通过|不通过|拒绝/.test(s)) return 'Offer';
    if (/面试|一面|二面|三面|四面|hr面|终面/i.test(s)) return '面试中';
    if (/笔试|测评|考试|测验/.test(s)) return '笔试/测评';
    if (/筛选|评估|审核|处理中|待处理|流程中/.test(s)) return '筛选中';
    if (/投递|申请|提交/.test(s)) return '已投递';
    return s in ORDER || TERMINAL.has(s) ? s : '';
  }

  function terminalEvidence(newStatus, rawStatus, confidence = 0) {
    const next = normalize(newStatus);
    const raw = clean(rawStatus);
    if (confidence < 0.90) return { strong: false, reason: 'match_confidence_below_terminal_threshold' };
    if (next === '已撤回') return { strong: STRONG_WITHDRAWN_RE.test(raw), reason: STRONG_WITHDRAWN_RE.test(raw) ? 'explicit_withdrawn_evidence' : 'withdrawn_without_explicit_evidence' };
    if (next === '已结束') return { strong: STRONG_ENDED_RE.test(raw), reason: STRONG_ENDED_RE.test(raw) ? 'explicit_ended_evidence' : 'ended_without_explicit_evidence' };
    return { strong: false, reason: 'not_terminal' };
  }

  function decide(oldStatus, newStatus, evidence = {}) {
    const from = normalize(oldStatus);
    const to = normalize(newStatus);
    const confidence = Number(evidence.matchConfidence ?? evidence.confidence ?? 0);
    const rawStatus = evidence.rawStatus || '';

    if (!to) return { changed: false, allowed: false, from, to, reason: 'unknown_new_status' };
    if (!from) return { changed: true, allowed: confidence >= 0.86, from, to, reason: confidence >= 0.86 ? 'initial_status_with_confident_match' : 'initial_status_low_confidence' };
    if (from === to) return { changed: false, allowed: true, from, to, reason: 'same_status' };

    if (TERMINAL.has(from)) return { changed: true, allowed: false, from, to, reason: 'terminal_status_is_sticky' };

    if (TERMINAL.has(to)) {
      const terminal = terminalEvidence(to, rawStatus, confidence);
      return { changed: true, allowed: terminal.strong, from, to, reason: terminal.reason, terminalEvidence: terminal.strong };
    }

    const fromRank = ORDER[from] || 0;
    const toRank = ORDER[to] || 0;
    if (!fromRank || !toRank) return { changed: true, allowed: false, from, to, reason: 'unknown_transition' };
    if (confidence < 0.86) return { changed: true, allowed: false, from, to, reason: 'low_match_confidence' };
    if (toRank > fromRank) return { changed: true, allowed: true, from, to, reason: 'forward_progression' };
    return { changed: true, allowed: false, from, to, reason: 'backward_transition_blocked' };
  }

  function canTransition(oldStatus, newStatus, evidence = {}) {
    const d = decide(oldStatus, newStatus, evidence);
    return d.changed && d.allowed;
  }

  return { ORDER, TERMINAL, normalize, terminalEvidence, decide, canTransition };
});
