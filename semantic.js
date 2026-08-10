(() => {
  'use strict';

  const COMPANY_NOISE_RE = /^(?:相关公司|关联公司|推荐公司|相似公司|其他公司|更多公司|热门公司|合作公司|公司信息|公司介绍|企业信息|企业介绍|所属公司|招聘公司|雇主信息|关于我们|招聘|校园招聘|校招|社招|应届|应届生|实习|职位|岗位|投递记录|申请记录|我的申请|我的投递|logo|icon|brand)$/i;
  const COMPANY_KEY_RE = /^(?:company(?:name|shortname|fullname|displayname)?|company_name|company_short_name|company_full_name|corp(?:name|shortname|fullname)?|corp_name|enterprise(?:name|shortname|fullname)?|employer(?:name|shortname|fullname)?|organization(?:name|shortname|fullname)?|organisation(?:name|shortname|fullname)?|orgname|org_name|brandname|brand_name|tenantname|tenant_name|sitename|site_name|publisher)$/i;
  const COMPANY_PARENT_RE = /(company|corp|enterprise|employer|organization|organisation|tenant|brand|site|career|recruit|hr)/i;
  const COMPANY_CONTEXT_BAD_RE = /(related|recommend|similar|other|partner|supplier|customer|competitor|affiliate|suggest|history|hot|search|list|关联|相关|推荐|相似|其他|合作|供应商|客户|竞品|搜索|列表)/i;
  const COMPANY_WORD_RE = /(有限公司|集团|科技|网络|智能|银行|证券|研究院|实验室|大学|股份|公司|汽车|机器人|控股|实业|电子|信息|通信)/;

  const STRONG_ROLE_RE = /(工程师|研究员|研究岗|专家|科学家|架构师|产品经理|项目经理|算法岗|研发岗|技术岗|开发岗|测试岗|运营岗|设计岗|数据岗|实习生|管培生|管理培训生|顾问|分析师|数据科学家|测试工程师|设计师|专员|主管|经理|总监|负责人|博士后|研究助理)/i;
  const TECH_RE = /(大模型|多模态|机器学习|深度学习|计算机视觉|视觉|NLP|LLM|Agent|AI|CV|算法|研发|开发|后端|前端|客户端|Infra|基础架构|平台|搜索|推荐|机器人|具身|模型|数据)/i;
  const JOB_CODE_RE = /(?:\(|（|\[|【)\s*[A-Za-z]{0,6}\d{3,}\s*(?:\)|）|\]|】)|\b[A-Za-z]{1,6}\d{4,}\b/;
  const POSITION_KEY_RE = /^(?:position(?:name|title)?|position_name|position_title|job(?:name|title)?|job_name|job_title|post(?:name|title)?|post_name|post_title|rolename|role_name|recruitpositionname|recruit_position_name|recruitjobname|recruit_job_name|vacancyname|vacancy_name|职位名称|岗位名称|应聘职位|申请职位)$/i;
  const POSITION_PARENT_RE = /(position|job|post|role|vacancy|recruit|application|apply|delivery)/i;
  const POSITION_NOISE_RE = /(跟进应聘进度|查询暂存投递记录|暂存投递记录|查看(?:我的)?(?:应聘|申请|投递)(?:记录|进度)?|查询(?:应聘|申请|投递)(?:记录|进度)?|管理(?:我的)?(?:申请|投递)|完善简历|修改简历|编辑简历|我的简历|职位搜索|岗位搜索|职位推荐|岗位推荐|相关职位|相关岗位|更多职位|更多岗位|投递记录|申请记录|应聘记录|候选人中心|个人中心|返回首页|招聘首页|招聘职位|社会招聘|校园招聘|实习招聘|人才项目)/i;
  const SENTENCE_HINT_RE = /(点击|查询|查看|跟进|管理|完善|修改|请|您|可在|用于|了解|获取|关注|操作|进入|跳转|暂存|记录)/;
  const STATUS_RE = /(已投递|投递成功|申请成功|筛选中|评估中|待测评|测评中|笔试中|待面试|面试中|已结束|未通过|不通过|淘汰|已录用|offer)/i;

  const MAX_SCRIPT_CHARS = 3_000_000;
  let cache = null;
  let cacheAt = 0;
  let cacheHref = '';

  const cleanText = value => String(value ?? '')
    .replace(/[\t\r\n\u00a0]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  function normalizeCompany(value) {
    let s = cleanText(value);
    if (!s) return '';
    s = s.replace(/^(?:(?:欢迎|诚邀)(?:您)?(?:加入|来到|关注|选择)?|加入(?:我们|本公司|公司)?|走进)\s*/i, '').trim();
    s = s.replace(/[！!]+$/g, '').trim();
    s = s.replace(/(?:20\d{2}|\d{2})(?:届)?(?:应届生?)?(?:秋季|春季)?(?:校园招聘|校招|招聘)/gi, ' ').trim();
    s = s.replace(/[·•|｜\-—–\s]*(?:(?:秋季|春季)?(?:校园招聘|校招官网|校招|社会招聘|社招官网|社招|应届招聘|实习招聘)|人才招聘|招聘官网|招聘平台|招聘中心|招聘网站|招聘主页|Campus\s*Recruitment|Careers?|Jobs?|招聘)\s*$/i, '').trim();
    s = s.replace(/^[·•|｜\-—–\s]+|[·•|｜\-—–\s]+$/g, '');
    if (!s || COMPANY_NOISE_RE.test(s)) return '';
    if (/^[\d*+()\-\s]{4,}$/.test(s) || /\*{2,}/.test(s)) return '';
    if (STATUS_RE.test(s) || POSITION_NOISE_RE.test(s)) return '';
    if (/(投递|申请|应聘|岗位|职位|个人中心|候选人|详情|收藏|流程)/.test(s)) return '';
    if (STRONG_ROLE_RE.test(s) && s.length > 24) return '';

    const bilingual = s.match(/^(?:[A-Za-z][A-Za-z0-9.&+\-]{1,24}\s+)([\u4e00-\u9fff]{2,8})$/);
    if (bilingual) s = bilingual[1];
    return s.slice(0, 80);
  }

  function normalizePosition(value) {
    let s = cleanText(value);
    if (!s) return '';
    s = s.replace(/^(?:岗位名称|职位名称|应聘职位|申请职位|岗位|职位)\s*[：:]?\s*/i, '');
    s = s.replace(/(?:第\s*\d+\s*志愿|第[一二三四五六七八九十]+志愿|官网投递|网申投递|校园投递|社会招聘|校招投递|社招投递)/ig, ' ');
    s = s.replace(/\s{2,}/g, ' ').trim();
    return s.slice(0, 120);
  }

  function positionScore(value, source = '') {
    const s = normalizePosition(value);
    if (!s || s.length < 3 || s.length > 120) return -100;
    if (POSITION_NOISE_RE.test(s)) return -100;
    if (/^(?:职位|岗位|招聘|校园招聘|社会招聘|投递|投递记录|申请|申请记录|应聘|应聘记录|相关公司|相关职位)$/i.test(s)) return -100;
    let score = 0;
    if (STRONG_ROLE_RE.test(s)) score += 11;
    if (JOB_CODE_RE.test(s)) score += 8;
    if (TECH_RE.test(s)) score += 2.5;
    if (/^(?:\[|【)?(?:20\d{2}|\d{2})届|校招|应届/.test(s)) score += 1.5;
    if (s.length >= 5 && s.length <= 68) score += 2;
    if (/structured|json|runtime/.test(source)) score += 4;
    if (/dom-heading|dom-title/.test(source)) score += 3;
    if (document.body?.innerText?.includes(s)) score += 2;
    const punct = (s.match(/[，。；！!？?：:]/g) || []).length;
    if (punct >= 2) score -= 9;
    if (SENTENCE_HINT_RE.test(s) && !STRONG_ROLE_RE.test(s)) score -= 12;
    if (/(进度|记录|查询|查看|跟进|暂存)/.test(s) && !STRONG_ROLE_RE.test(s)) score -= 14;
    return score;
  }

  function companyScore(value, source = '', context = '') {
    const s = normalizeCompany(value);
    if (!s) return -100;
    if (COMPANY_CONTEXT_BAD_RE.test(context || '')) return -100;
    let score = 0;
    if (COMPANY_WORD_RE.test(s)) score += 4;
    if (/[\u4e00-\u9fff]/.test(s) && s.length <= 18) score += 4;
    if (/^[A-Za-z][A-Za-z0-9 .&+\-]{1,30}$/.test(s)) score += 1.5;
    if (/[\u4e00-\u9fff].*[A-Za-z0-9]|[A-Za-z0-9].*[\u4e00-\u9fff]/.test(s) && s.length <= 28) score += 2;
    if (/structured|json|runtime/.test(source)) score += 6;
    if (/header|brand|meta/.test(source)) score += 5;
    if (hostAffinity(s)) score += 4;
    if (s.length > 40) score -= 3;
    return score;
  }

  function hostTokens() {
    const ignore = new Set(['www','jobs','job','career','careers','campus','recruit','recruiting','recruitment','talent','hr','api','wx','m','account','apply','app','cn','com','net','org','io','co','feishu','mokahr','zhiye']);
    return location.hostname.toLowerCase().split('.').filter(p => p.length >= 3 && !ignore.has(p) && !/^\d+$/.test(p));
  }

  function hostAffinity(value) {
    const s = cleanText(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
    return hostTokens().some(token => token.length >= 3 && s.includes(token.replace(/[^a-z0-9]/g, '')));
  }

  function collectSemanticSnapshot(force = false) {
    const now = Date.now();
    if (!force && cache && cacheHref === location.href && now - cacheAt < 2500) return cache;

    const companies = [];
    const positions = [];
    const companySeen = new Set();
    const positionSeen = new Set();

    const addCompany = (value, source, context = '') => {
      const cleaned = normalizeCompany(value);
      if (!cleaned) return;
      const sig = cleaned.toLowerCase();
      if (companySeen.has(sig) || COMPANY_CONTEXT_BAD_RE.test(context || '')) return;
      companySeen.add(sig);
      companies.push({ value: cleaned, source, context, score: companyScore(cleaned, source, context) });
    };
    const addPosition = (value, source, context = '') => {
      const cleaned = normalizePosition(value);
      if (!cleaned) return;
      const sig = cleaned.toLowerCase();
      if (positionSeen.has(sig)) return;
      positionSeen.add(sig);
      positions.push({ value: cleaned, source, context, score: positionScore(cleaned, source) });
    };

    collectStructured(addCompany, addPosition);
    collectRuntimeScripts(addCompany, addPosition);
    collectDeclaredDom(addCompany, addPosition);
    collectVisibleBrand(addCompany);
    collectVisiblePositions(addPosition);

    companies.sort((a, b) => b.score - a.score || a.value.length - b.value.length);
    positions.sort((a, b) => b.score - a.score || a.value.length - b.value.length);

    cache = {
      companies: companies.filter(x => x.score >= 6).slice(0, 30),
      positions: positions.filter(x => x.score >= 8).slice(0, 80),
      bestCompany: companies.find(x => x.score >= 8)?.value || '',
      at: now,
      href: location.href
    };
    cacheAt = now;
    cacheHref = location.href;
    return cache;
  }

  function collectStructured(addCompany, addPosition) {
    const visit = (value, path = [], depth = 0, seen = new WeakSet()) => {
      if (value == null || depth > 10 || typeof value !== 'object') return;
      if (seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        for (let i = 0; i < Math.min(value.length, 100); i++) visit(value[i], [...path, String(i)], depth + 1, seen);
        return;
      }
      const pathText = path.join('.');
      const type = Array.isArray(value['@type']) ? value['@type'].join(' ') : String(value['@type'] || '');
      if (/JobPosting/i.test(type)) {
        addPosition(value.title || value.name, 'structured-jobposting', `${pathText}.title`);
        const org = value.hiringOrganization;
        if (typeof org === 'string') addCompany(org, 'structured-jobposting', `${pathText}.hiringOrganization`);
        else if (org && typeof org === 'object') {
          addCompany(org.name, 'structured-jobposting', `${pathText}.hiringOrganization.name`);
          addCompany(org.alternateName, 'structured-jobposting', `${pathText}.hiringOrganization.alternateName`);
        }
      }
      if (/(Organization|Corporation|LocalBusiness)/i.test(type)) {
        addCompany(value.name, 'structured-organization', `${pathText}.name`);
        addCompany(value.alternateName, 'structured-organization', `${pathText}.alternateName`);
      }
      for (const [key, val] of Object.entries(value).slice(0, 500)) {
        const normalizedKey = key.replace(/[-_\s]/g, '').toLowerCase();
        const nextPath = [...path, key];
        const nextPathText = nextPath.join('.');
        if (COMPANY_CONTEXT_BAD_RE.test(nextPathText)) continue;
        if (typeof val === 'string' || typeof val === 'number') {
          if (COMPANY_KEY_RE.test(key) || (normalizedKey === 'name' && COMPANY_PARENT_RE.test(pathText))) {
            addCompany(String(val), 'runtime-json', nextPathText);
          }
          if (POSITION_KEY_RE.test(key) || (normalizedKey === 'title' && POSITION_PARENT_RE.test(pathText)) || (normalizedKey === 'name' && POSITION_PARENT_RE.test(pathText) && !COMPANY_PARENT_RE.test(pathText))) {
            addPosition(String(val), 'runtime-json', nextPathText);
          }
        } else if (val && typeof val === 'object') {
          visit(val, nextPath, depth + 1, seen);
        }
      }
    };

    for (const script of [...document.querySelectorAll('script[type="application/ld+json"], script[type="application/json"], script#__NEXT_DATA__, script#__NUXT_DATA__')].slice(0, 80)) {
      const raw = script.textContent || '';
      if (!raw || raw.length > 1_800_000) continue;
      try { visit(JSON.parse(raw), [script.id || script.type || 'json']); } catch {}
    }
  }

  function collectRuntimeScripts(addCompany, addPosition) {
    const companyKeys = '(?:company(?:Name|ShortName|FullName|DisplayName)?|company_name|company_short_name|company_full_name|corpName|corp_name|enterpriseName|employerName|organizationName|organisationName|orgName|org_name|brandName|brand_name|tenantName|tenant_name|siteName|site_name)';
    const positionKeys = '(?:position(?:Name|Title)?|position_name|position_title|job(?:Name|Title)?|job_name|job_title|post(?:Name|Title)?|post_name|post_title|roleName|role_name|recruitPositionName|recruit_position_name|recruitJobName|recruit_job_name|vacancyName|vacancy_name)';
    const companyRe = new RegExp(`["']?(${companyKeys})["']?\\s*[:=]\\s*["']([^"'\\n\\r]{2,120})["']`, 'gi');
    const positionRe = new RegExp(`["']?(${positionKeys})["']?\\s*[:=]\\s*["']([^"'\\n\\r]{3,160})["']`, 'gi');

    let budget = 0;
    for (const script of [...document.scripts].filter(s => !s.src).slice(0, 140)) {
      const raw = script.textContent || '';
      if (!raw || raw.length > 2_000_000) continue;
      budget += raw.length;
      if (budget > MAX_SCRIPT_CHARS) break;
      let m, hit = 0;
      companyRe.lastIndex = 0;
      while ((m = companyRe.exec(raw)) && hit++ < 100) {
        const around = raw.slice(Math.max(0, m.index - 180), Math.min(raw.length, companyRe.lastIndex + 100));
        if (!COMPANY_CONTEXT_BAD_RE.test(around)) addCompany(unescapeJsString(m[2]), 'runtime-regex', m[1]);
      }
      hit = 0;
      positionRe.lastIndex = 0;
      while ((m = positionRe.exec(raw)) && hit++ < 150) {
        addPosition(unescapeJsString(m[2]), 'runtime-regex', m[1]);
      }
    }
  }

  function collectDeclaredDom(addCompany, addPosition) {
    addCompany(document.querySelector('meta[property="og:site_name"]')?.content, 'meta', 'og:site_name');
    addCompany(document.querySelector('meta[name="application-name"]')?.content, 'meta', 'application-name');
    addCompany(document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content, 'meta', 'apple-title');
    addCompany(document.querySelector('meta[name="publisher"]')?.content, 'meta', 'publisher');

    const companyAttrs = ['data-company-name','data-company','data-corp-name','data-enterprise-name','data-employer-name','data-organization-name','data-org-name','data-brand-name','data-tenant-name','data-site-name'];
    for (const el of [...document.querySelectorAll(companyAttrs.map(x => `[${x}]`).join(','))].slice(0, 180)) {
      for (const attr of companyAttrs) if (el.getAttribute(attr)) addCompany(el.getAttribute(attr), 'declared-dom', attr);
    }
    const positionAttrs = ['data-position-name','data-position-title','data-job-name','data-job-title','data-post-name','data-role-name','data-vacancy-name'];
    for (const el of [...document.querySelectorAll(positionAttrs.map(x => `[${x}]`).join(','))].slice(0, 300)) {
      for (const attr of positionAttrs) if (el.getAttribute(attr)) addPosition(el.getAttribute(attr), 'declared-dom', attr);
    }
  }

  function collectVisibleBrand(addCompany) {
    const selectors = [
      'header [class*="brand"]','header [class*="logo"]','nav [class*="brand"]','nav [class*="logo"]',
      '[class*="header"] [class*="brand"]','[class*="header"] [class*="logo"]',
      'header img[alt]','[class*="logo"] img[alt]','img[class*="logo"][alt]'
    ];
    for (const selector of selectors) {
      for (const el of [...document.querySelectorAll(selector)].slice(0, 120)) {
        const value = el.innerText || el.alt || el.getAttribute?.('aria-label') || el.getAttribute?.('title');
        addCompany(value, 'header-brand', selector);
      }
    }
    const title = cleanText(document.title);
    for (const p of [title, ...title.split(/[-_|｜·—–]/)]) addCompany(p, 'meta-title', 'document.title');

    for (const el of [...document.querySelectorAll('body *')].slice(0, 2200)) {
      if (!visible(el)) continue;
      const rect = safeRect(el);
      if (rect.top < -5 || rect.top > 125 || rect.left < -5 || rect.left > Math.min(650, innerWidth * .48)) continue;
      const text = cleanText(el.innerText || el.textContent || '');
      if (!text || text.length < 2 || text.length > 42 || !leafish(el, text)) continue;
      const style = safeStyle(el);
      const fs = parseFloat(style?.fontSize || '0');
      if (fs >= 16 || /logo|brand/i.test(String(el.className || ''))) addCompany(text, 'header-visual', 'top-left');
    }
  }

  function collectVisiblePositions(addPosition) {
    const selectors = [
      'h1','h2','h3','[role="heading"]',
      '[class*="job-title"]','[class*="jobTitle"]','[class*="position-title"]','[class*="positionTitle"]',
      '[class*="job-name"]','[class*="jobName"]','[class*="position-name"]','[class*="positionName"]',
      '[data-testid*="job"]','[data-testid*="position"]','[itemprop="title"]'
    ];
    let order = 0;
    for (const selector of selectors) {
      for (const el of [...document.querySelectorAll(selector)].slice(0, 400)) {
        if (!visible(el)) continue;
        const text = cleanText(el.innerText || el.textContent || el.getAttribute?.('aria-label') || '');
        if (!text || text.length > 150) continue;
        addPosition(text, /H[1-3]/.test(el.tagName) || el.getAttribute?.('role') === 'heading' ? 'dom-heading' : 'dom-title', `${selector}#${order++}`);
      }
    }

    for (const el of [...document.querySelectorAll('body *')].slice(0, 8000)) {
      if (!visible(el)) continue;
      const text = cleanText(el.innerText || el.textContent || '');
      if (!text || text.length < 5 || text.length > 120 || !leafish(el, text)) continue;
      if (JOB_CODE_RE.test(text) && STRONG_ROLE_RE.test(text)) addPosition(text, 'dom-jobcode', 'visible-job-code');
    }
  }

  function enhanceRecords(input) {
    const records = Array.isArray(input) ? input.map(r => ({ ...r })) : [];
    if (!records.length) {
      setSemanticState([], collectSemanticSnapshot());
      return records;
    }
    const snap = collectSemanticSnapshot();
    const goodExistingPositions = new Set(records
      .filter(r => !isSuspiciousPosition(r.position) && positionScore(r.position, 'existing') >= 9)
      .map(r => semanticText(r.position)));
    const unusedPositionCandidates = snap.positions.filter(c => !goodExistingPositions.has(semanticText(c.value)));

    for (const r of records) {
      const cleanedCompany = normalizeCompany(r.company);
      if (!cleanedCompany || isSuspiciousCompany(r.company)) {
        if (snap.bestCompany) r.company = snap.bestCompany;
      } else {
        r.company = cleanedCompany;
        const best = snap.companies[0];
        if (best && best.score >= 14 && companyAffinity(r.company, best.value) >= 2 && displayPreference(best.value, r.company) > 0) {
          r.company = best.value;
        }
      }

      const current = normalizePosition(r.position);
      const currentScore = positionScore(current, 'existing');
      const suspicious = isSuspiciousPosition(current) || currentScore < 7;
      if (suspicious) {
        const replacement = choosePositionReplacement(current, records.length, unusedPositionCandidates);
        if (replacement) r.position = replacement.value;
      } else {
        r.position = current;
      }
    }

    const merged = dedupeEnhanced(records);
    for (const r of merged) recomputeUid(r);
    setSemanticState(merged, snap);
    return merged;
  }

  function choosePositionReplacement(current, recordCount, candidates) {
    if (!candidates.length) return null;
    const scored = candidates.map(c => ({ ...c, affinity: textAffinity(current, c.value) }))
      .sort((a, b) => (b.affinity * 8 + b.score) - (a.affinity * 8 + a.score));
    if (current && scored[0].affinity >= .35 && scored[0].score >= 10) return scored[0];
    if (recordCount === 1 && scored[0].score >= 12 && (!scored[1] || scored[0].score >= scored[1].score + 2 || scored[0].source.includes('jobcode'))) return scored[0];
    const strong = scored.filter(x => x.score >= 15);
    return strong.length === 1 ? strong[0] : null;
  }

  function isSuspiciousCompany(value) {
    const raw = cleanText(value);
    return !normalizeCompany(raw) || COMPANY_NOISE_RE.test(raw) || /^(?:相关|关联|推荐|相似|其他|所属|招聘)公司/.test(raw);
  }

  function isSuspiciousPosition(value) {
    const s = normalizePosition(value);
    if (!s) return true;
    if (POSITION_NOISE_RE.test(s)) return true;
    if (/(进度|记录|查询|查看|跟进|暂存)/.test(s) && !STRONG_ROLE_RE.test(s)) return true;
    if (SENTENCE_HINT_RE.test(s) && !STRONG_ROLE_RE.test(s) && s.length >= 12) return true;
    return false;
  }

  function companyAffinity(a, b) {
    const x = companyCore(a), y = companyCore(b);
    if (!x || !y) return 0;
    if (x === y) return 4;
    if (x.includes(y) || y.includes(x)) return 3;
    const cjkA = (x.match(/[\u4e00-\u9fff]+/g) || []).join('');
    const cjkB = (y.match(/[\u4e00-\u9fff]+/g) || []).join('');
    let i = 0;
    while (i < cjkA.length && i < cjkB.length && cjkA[i] === cjkB[i]) i++;
    return i >= 2 ? 2 : 0;
  }

  function companyCore(value) {
    return normalizeCompany(value).toLowerCase()
      .replace(/(?:科技股份有限公司|股份有限公司|有限责任公司|有限公司|集团股份有限公司|集团有限公司|集团|公司)$/g, '')
      .replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
  }

  function displayPreference(a, b) {
    const x = normalizeCompany(a), y = normalizeCompany(b);
    if (!x || !y) return 0;
    if (/有限公司|股份有限公司/.test(y) && !/有限公司|股份有限公司/.test(x) && x.length <= 20) return 2;
    if (x.length + 3 < y.length && companyAffinity(x, y) >= 2) return 1;
    return 0;
  }

  function textAffinity(a, b) {
    const x = semanticText(a), y = semanticText(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.includes(y) || y.includes(x)) return Math.min(x.length, y.length) / Math.max(x.length, y.length);
    const bigrams = s => new Set([...Array(Math.max(0, s.length - 1))].map((_, i) => s.slice(i, i + 2)));
    const A = bigrams(x), B = bigrams(y);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    return (2 * inter) / (A.size + B.size);
  }

  function semanticText(v) {
    return cleanText(v).toLowerCase().replace(/[\s\-—–_|｜·•（）()\[\]【】,，.:：;；/\\]+/g, '');
  }

  function dedupeEnhanced(records) {
    const out = [];
    for (const r of records) {
      const keyPosition = semanticText(r.position);
      let found = -1;
      for (let i = 0; i < out.length; i++) {
        const o = out[i];
        if (semanticText(o.position) !== keyPosition || String(o.platform || '') !== String(r.platform || '')) continue;
        if (o.applyTime && r.applyTime && o.applyTime !== r.applyTime) continue;
        found = i;
        break;
      }
      if (found < 0) out.push(r);
      else out[found] = richerRecord(out[found], r);
    }
    return out;
  }

  function richerRecord(a, b) {
    const score = r => (r.company ? 2 : 0) + (r.position ? 4 : 0) + (r.location ? 2 : 0) + (r.applyTime ? 3 : 0) + (r.rawStatus ? 2 : 0) + (r.status && r.status !== '已投递' ? 2 : 0);
    const primary = score(b) > score(a) ? { ...b } : { ...a };
    const secondary = primary === b ? a : b;
    for (const k of ['company','position','location','applyTime','rawStatus','url','platform']) if (!primary[k] && secondary[k]) primary[k] = secondary[k];
    if ((!primary.status || primary.status === '已投递') && secondary.status && secondary.status !== '已投递') primary.status = secondary.status;
    return primary;
  }

  function recomputeUid(r) {
    if (!r || r._sourceId) return;
    const platform = r.platform || location.hostname;
    const stable = `semantic-v3|${platform}|${normalizePosition(r.position)}|${r.applyTime || ''}|${canonicalPage(r.url || location.href)}`;
    r.uid = `${location.hostname.replace(/^www\./, '')}-${hash32(stable)}`;
  }

  function canonicalPage(url) {
    try {
      const u = new URL(url, location.href);
      for (const key of [...u.searchParams.keys()]) if (/^(?:utm_|share_token|token|recommendCode|spm|track)/i.test(key)) u.searchParams.delete(key);
      return `${u.origin}${u.pathname}${u.hash ? u.hash.split('?')[0] : ''}`;
    } catch { return String(url || ''); }
  }

  function hash32(input) {
    let h = 2166136261;
    const s = String(input || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function setSemanticState(records, snap) {
    globalThis.__offerTrackSemanticState = {
      records: Array.isArray(records) ? records : [],
      company: snap?.bestCompany || '',
      companies: snap?.companies?.slice(0, 5) || [],
      positions: snap?.positions?.slice(0, 8) || [],
      at: Date.now(),
      href: location.href
    };
  }

  function unescapeJsString(s) {
    try {
      return JSON.parse(`"${String(s).replace(/"/g, '\\"')}"`);
    } catch {
      return String(s || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\n|\\r|\\t/g, ' ');
    }
  }

  function leafish(el, text) {
    if (!el?.children?.length) return true;
    const children = [...el.children].map(c => cleanText(c.innerText || '')).filter(Boolean);
    return !children.length || children.join(' ').length < text.length * .82;
  }
  function visible(el) {
    try {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    } catch { return false; }
  }
  function safeRect(el) { try { return el.getBoundingClientRect(); } catch { return { top: 0, left: 0 }; } }
  function safeStyle(el) { try { return getComputedStyle(el); } catch { return null; } }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'ENHANCE_RECORDS') {
      try {
        const records = enhanceRecords(msg.records || []);
        sendResponse({ ok: true, records, semantic: globalThis.__offerTrackSemanticState });
      } catch (e) {
        sendResponse({ ok: false, records: msg.records || [], error: e?.message || String(e) });
      }
    }
  });

  try {
    const originalSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = function(message, ...rest) {
      if (message && typeof message === 'object') {
        if (message.type === 'SYNC_RECORDS' && Array.isArray(message.records)) {
          message = { ...message, records: enhanceRecords(message.records) };
        } else if (message.type === 'PAGE_SCAN_RESULT' && Array.isArray(message.payload?.records)) {
          const records = enhanceRecords(message.payload.records);
          message = { ...message, payload: { ...message.payload, records } };
        }
      }
      return originalSendMessage(message, ...rest);
    };
  } catch {}

  collectSemanticSnapshot(true);
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      cache = null;
      setTimeout(() => collectSemanticSnapshot(true), 700);
      setTimeout(() => collectSemanticSnapshot(true), 2200);
    }
  }, 700);

  globalThis.__offerTrackEnhanceRecords = enhanceRecords;
  globalThis.__offerTrackSemanticSnapshot = () => collectSemanticSnapshot(true);
})();
