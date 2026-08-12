const fs = require('fs');
const assert = require('assert');

const read = name => fs.readFileSync(name, 'utf8');
const background = read('background.js');
const content = read('content.js');
const semantic = read('semantic.js');
const followup = read('followup-background.js');
const identity = read('company-identity.js');

// Site Identity Resolver from stable v2.5 must exist end-to-end.
assert.ok(background.includes("'RESOLVE_SITE_IDENTITY'"));
assert.ok(background.includes('resolveSiteIdentityOnce'));
assert.ok(background.includes('resolveRenderedSiteIdentity'));
assert.ok(background.includes('SITE_IDENTITY_CACHE_TTL'));
assert.ok(background.includes("chrome.tabs.create({ url: root, active: false })"));
assert.ok(content.includes('reconcileSiteIdentity'));
assert.ok(content.includes("type: 'RESOLVE_SITE_IDENTITY'"));
assert.ok(content.includes('shouldPreferResolved'));

// Keep v2.6 parser improvements, but restore shared identity safety gates.
assert.ok(semantic.includes('isAccountUiElement'), 'v2.6 account UI guard must remain');
assert.ok(semantic.includes('OfferTrackCompanyIdentity'), 'shared Company Identity must be reused');
assert.ok(semantic.includes('CompanyIdentity?.isPersonalContext'), 'personal-context rejection must be restored');
assert.ok(identity.includes('isPersonalNameLike') && identity.includes('shouldPreferResolved'));

// Structured State MAIN-world copy must be allowlisted and sensitive-key filtered.
assert.ok(followup.includes('SAFE_LEAF_RE'));
assert.ok(followup.includes('SENSITIVE_KEY_RE'));
assert.ok(followup.includes('main-world-safe'));
assert.ok(!followup.includes('function scrub(v, depth=0)'), 'broad recursive scrub must not return');
assert.ok(followup.includes('nodes++ > 900'), 'bounded node budget must remain');

// Cookie evidence is advisory: no cookie skips API but does not stop page fallback.
assert.ok(followup.includes('apiSessionLikely'));
assert.ok(followup.includes("cookieEvidence.level !== 'none'"));
assert.ok(followup.includes("strategy: 'structured_state'"));
assert.ok(followup.includes("strategy: 'page_scan'"));

// Only query tabs for the current host.
assert.ok(followup.includes("chrome.tabs.query({ url: [`https://${host}/*`] })"));
assert.ok(!followup.includes("chrome.tabs.query({ url: ['https://*/*'] })"));

console.log('v2.6.1 restored advanced runtime regression: PASS');
