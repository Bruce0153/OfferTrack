const fs = require('fs');
const assert = require('assert');

const read = name => fs.readFileSync(name, 'utf8');
const background = read('background.js');
const content = read('content.js');
const semantic = read('semantic.js');
const followup = read('followup-background.js');
const identity = read('company-identity.js');
const contract = read('application-contract.js');

// Site Identity Resolver restored from the stable line must remain end-to-end.
assert.ok(background.includes("'RESOLVE_SITE_IDENTITY'"));
assert.ok(background.includes('resolveSiteIdentityOnce'));
assert.ok(background.includes('resolveRenderedSiteIdentity'));
assert.ok(background.includes('SITE_IDENTITY_CACHE_TTL'));
assert.ok(background.includes("chrome.tabs.create({ url: root, active: false })"));
assert.ok(content.includes('reconcileSiteIdentity'));
assert.ok(content.includes("type: 'RESOLVE_SITE_IDENTITY'"));
assert.ok(content.includes('shouldPreferResolved'));

// Keep newer parser improvements while retaining shared identity safety gates.
assert.ok(semantic.includes('isAccountUiElement'), 'account UI guard must remain');
assert.ok(semantic.includes('OfferTrackCompanyIdentity'), 'shared Company Identity must be reused');
assert.ok(semantic.includes('CompanyIdentity?.isPersonalContext'), 'personal-context rejection must remain');
assert.ok(identity.includes('isPersonalNameLike') && identity.includes('shouldPreferResolved'));

// The old inline SAFE_LEAF/SENSITIVE_KEY implementation was intentionally centralized.
// The capability, not the old identifier, is the regression contract.
assert.ok(contract.includes('SENSITIVE_KEY_RE'), 'central sensitive-key filter must remain');
assert.ok(contract.includes('SENSITIVE_CONTAINER_RE'), 'central sensitive-container filter must remain');
assert.ok(contract.includes('projectionPolicy') && contract.includes('fieldKind'), 'central allowlisted projection contract must remain');
assert.ok(followup.includes('Contract?.projectionPolicy') && followup.includes('Contract.projectionPolicy()'), 'MAIN-world copy must consume the central policy');
assert.ok(followup.includes('nodes++ >= 650'), 'final MAIN-world node budget must remain tighter than the restored 900-node version');
assert.ok(followup.includes('main-world-safe'));
assert.ok(!followup.includes('function scrub(v, depth=0)'), 'broad recursive scrub must not return');

// Cookie evidence remains advisory: no cookie may suppress API, but never page fallback.
assert.ok(followup.includes('apiSessionLikely'));
assert.ok(followup.includes("cookieEvidence.level !== 'none'"));
assert.ok(followup.includes("strategy: 'structured_state'"));
assert.ok(followup.includes("strategy: 'page_scan'"));

// Only query tabs for the current host; no broad all-HTTPS tab scan.
assert.ok(followup.includes("chrome.tabs.query({ url: [`https://${host}/*`] })"));
assert.ok(!followup.includes("chrome.tabs.query({ url: ['https://*/*'] })"));

console.log('restored advanced runtime capabilities under final architecture: PASS');
