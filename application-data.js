(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackApplicationData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const POSITION_KEY_RE = /(position|job|post|vacancy|role).*(name|title)|^(positionName|positionTitle|jobName|jobTitle|postName|postTitle|roleName|vacancyName)$/i;
  const STATUS_KEY_RE = /(apply|application|delivery|process|progress|candidate|resume)?.*(status|state|stage|result)|^(status|state|stage|result)$/i;
  const COMPANY_KEY_RE = /(company|corp|employer|organization|tenant|brand).*(name|title)|^(companyName|companyShortName|corpName|employerName|organizationName|brandName)$/i;
  const LOCATION_KEY_RE = /(work)?.*(location|city|place)|^(location|city|workLocation|workCity)$/i;
  const TIME_KEY_RE = /(apply|application|delivery|submit|create|created|applied).*(time|at|date)|^(applyTime|applicationTime|deliveryTime|submitTime|createdAt|createTime|appliedAt)$/i;
  const ID_KEY_RE = /(application|apply|delivery).*(id|no|number)|^(applicationId|applyId|deliveryId)$/i;
  const APPLICATION_PATH_RE = /(application|apply|delivery|candidate|resume|process|progress|job|position|post|vacancy)/i;
  const STATUS_VALUE_RE = /(已投递|投递成功|已申请|申请成功|待筛选|筛选中|评估中|待评估|待测评|测评中|测评完成|待笔试|笔试中|笔试完成|待面试|面试中|面试安排|AI面试|一面|二面|三面|四面|HR面|终面|已发\s*offer|offer已发放|已录用|录用|意向书|不合适|不通过|未通过|流程结束|已结束|已拒绝|拒绝|淘汰|已撤回|撤回成功|已终止|终止|待处理|处理中|流程中|简历筛选|简历评估|笔试|测评|面试)/i;
  const ROLE_RE = /(工程师|研究员|专家|科学家|架构师|产品经理|项目经理|分析师|设计师|实习生|管培生|顾问|算法|研发|开发|大模型|多模态|机器学习|AI|Agent|NLP|CV|机器人|具身)/i;
  const DATE_RE = /(20\d{2}[-/.年](?:1[0-2]|0?[1-9])[-/.月](?:3[01]|[12]\d|0?[1-9])日?(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?)/;

  function text(v) {
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
    if (Array.isArray(v)) {
      for (const x of v) { const t = text(x); if (t) return t; }
      return '';
    }
    if (typeof v === 'object') {
      for (const k of ['name','title','label','text','value','displayName','statusName','stateName']) {
        if (v[k] != null && typeof v[k] !== 'object') { const t = text(v[k]); if (t) return t; }
      }
    }
    return '';
  }

  function norm(v) { return text(v).toLowerCase().replace(/\s+/g, ' ').trim(); }
  function normPosition(v) { return norm(v).replace(/[\s\-—–_·•|｜【】\[\]（）()]/g, ''); }
  function bigrams(s) { const x = normPosition(s), out = new Set(); for (let i=0;i<x.length-1;i++) out.add(x.slice(i,i+2)); return out; }
  function similarity(a,b) {
    const x = normPosition(a), y = normPosition(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.includes(y) || y.includes(x)) return Math.min(x.length,y.length)/Math.max(x.length,y.length);
    const A=bigrams(x), B=bigrams(y); if (!A.size || !B.size) return 0;
    let n=0; for (const t of A) if (B.has(t)) n++;
    return 2*n/(A.size+B.size);
  }

  function normalizeStatus(raw) {
    const s = norm(raw);
    if (!s) return '';
    if (/撤回/.test(s)) return '已撤回';
    if (/不合适|不通过|未通过|结束|拒绝|淘汰|终止|失败/.test(s)) return '已结束';
    if (/offer|录用|意向书/.test(s) && !/未通过|不通过|拒绝/.test(s)) return 'Offer';
    if (/面试|一面|二面|三面|四面|hr面|终面/.test(s)) return '面试中';
    if (/笔试|测评|考试|测验/.test(s)) return '笔试/测评';
    if (/筛选|评估|审核|处理中|待处理|流程中/.test(s)) return '筛选中';
    if (/投递|申请|提交/.test(s)) return '已投递';
    return '';
  }

  function normalizeDate(v) {
    const s = text(v);
    const m = s.match(DATE_RE);
    if (!m) return '';
    const x = m[1].replace(/年|月/g,'-').replace(/日/g,'').replace(/\//g,'-').replace(/\./g,'-');
    const p = x.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})(.*)$/);
    return p ? `${p[1]}-${p[2].padStart(2,'0')}-${p[3].padStart(2,'0')}${p[4]||''}` : x;
  }

  function shallowEntries(obj, basePath, maxDepth=2) {
    const out = [];
    const seen = new WeakSet();
    function walk(v,path,depth) {
      if (v == null || out.length >= 240) return;
      if (typeof v !== 'object') { out.push({ path, key: path.split('.').pop() || '', value: v }); return; }
      if (seen.has(v)) return; seen.add(v);
      if (depth > maxDepth) return;
      if (Array.isArray(v)) {
        for (let i=0;i<Math.min(v.length,20);i++) walk(v[i], `${path}[${i}]`, depth+1);
        return;
      }
      for (const [k,val] of Object.entries(v).slice(0,120)) {
        const next = path ? `${path}.${k}` : k;
        if (val != null && typeof val === 'object') walk(val,next,depth+1);
        else out.push({ path: next, key: k, value: val });
      }
    }
    walk(obj, basePath || '', 0);
    return out;
  }

  function bestBy(entries, keyRe, opts={}) {
    let best = null;
    for (const e of entries) {
      const path = e.path || e.key || '';
      let score = keyRe.test(e.key) ? 7 : keyRe.test(path) ? 4 : 0;
      if (!score) continue;
      const val = text(e.value);
      if (!val || val.length > (opts.maxLen || 180)) continue;
      if (opts.filter && !opts.filter(val,path)) continue;
      if (opts.pathBonus && opts.pathBonus.test(path)) score += 2;
      if (!best || score > best.score || (score===best.score && val.length < best.value.length)) best = { value: val, score, path };
    }
    return best;
  }

  function bestPosition(entries, targets) {
    let best = null;
    for (const e of entries) {
      const path = e.path || e.key || '';
      const val = text(e.value);
      if (!val || val.length < 3 || val.length > 120) continue;
      let score = POSITION_KEY_RE.test(e.key) ? 10 : POSITION_KEY_RE.test(path) ? 6 : 0;
      if (/^(name|title)$/i.test(e.key) && APPLICATION_PATH_RE.test(path)) score += 4;
      if (ROLE_RE.test(val)) score += 3;
      let targetSim = 0;
      for (const t of targets || []) targetSim = Math.max(targetSim, similarity(t.position || t, val));
      if (targetSim >= .98) score += 16;
      else if (targetSim >= .82) score += 12;
      else if (targetSim >= .65) score += 7;
      else if ((targets||[]).length) score -= 3;
      if (/(跟进|查询|查看|记录|申请进度|应聘进度|职位收藏|招聘会)/.test(val) && !ROLE_RE.test(val)) score -= 12;
      if (score <= 0) continue;
      if (!best || score > best.score) best = { value: val, score, targetSim, path };
    }
    return best;
  }

  function recordFromObject(obj, path, targets) {
    const entries = shallowEntries(obj, path, 2);
    const position = bestPosition(entries, targets);
    if (!position || position.score < ((targets||[]).length ? 9 : 12)) return null;
    const status = bestBy(entries, STATUS_KEY_RE, { maxLen: 100, pathBonus: APPLICATION_PATH_RE, filter: v => STATUS_VALUE_RE.test(v) || !!normalizeStatus(v) });
    if (!status) return null;
    const normalizedStatus = normalizeStatus(status.value);
    if (!normalizedStatus) return null;
    const company = bestBy(entries, COMPANY_KEY_RE, { maxLen: 100 });
    const location = bestBy(entries, LOCATION_KEY_RE, { maxLen: 120 });
    const applyTime = bestBy(entries, TIME_KEY_RE, { maxLen: 80, filter: v => !!normalizeDate(v) });
    const id = bestBy(entries, ID_KEY_RE, { maxLen: 120 });
    return {
      company: company?.value || '',
      position: position.value,
      location: location?.value || '',
      applyTime: applyTime ? normalizeDate(applyTime.value) : '',
      rawStatus: status.value,
      status: normalizedStatus,
      sourceId: id?.value || '',
      _structuredPath: path,
      _structuredScore: position.score + status.score + (company?1:0) + (applyTime?1:0)
    };
  }

  function dedupe(records) {
    const out = [];
    for (const r of records) {
      const key = `${normPosition(r.position)}|${r.applyTime||''}|${norm(r.rawStatus)}`;
      const idx = out.findIndex(x => `${normPosition(x.position)}|${x.applyTime||''}|${norm(x.rawStatus)}` === key);
      if (idx < 0) out.push(r);
      else if ((r._structuredScore||0) > (out[idx]._structuredScore||0)) out[idx] = r;
    }
    return out;
  }

  function extractRecords(payloads, targets=[], options={}) {
    const roots = Array.isArray(payloads) ? payloads : [payloads];
    const out = [];
    const seen = new WeakSet();
    let nodes = 0;
    const maxNodes = Math.min(12000, Math.max(500, Number(options.maxNodes || 5000)));
    const maxDepth = Math.min(12, Math.max(3, Number(options.maxDepth || 8)));

    function visit(v,path,depth) {
      if (v == null || nodes++ >= maxNodes || depth > maxDepth) return;
      if (typeof v !== 'object') return;
      if (seen.has(v)) return; seen.add(v);
      const candidate = recordFromObject(v,path,targets);
      if (candidate) out.push(candidate);
      if (Array.isArray(v)) {
        for (let i=0;i<Math.min(v.length,250);i++) visit(v[i], `${path}[${i}]`, depth+1);
      } else {
        for (const [k,val] of Object.entries(v).slice(0,180)) {
          if (val && typeof val === 'object') visit(val, path ? `${path}.${k}` : k, depth+1);
        }
      }
    }

    roots.forEach((x,i) => visit(x, `root${i}`, 0));
    return dedupe(out).sort((a,b)=>(b._structuredScore||0)-(a._structuredScore||0)).slice(0,500);
  }

  return { text, norm, normPosition, similarity, normalizeStatus, normalizeDate, extractRecords };
});