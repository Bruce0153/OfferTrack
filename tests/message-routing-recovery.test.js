const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const bg = read('background.js');
const popup = read('popup.js');
const follow = read('followup-background.js');
const content = read('content.js');
const semantic = read('semantic.js');
const contract = read('application-contract.js');

assert(bg.includes('BACKGROUND_MESSAGE_TYPES'));
assert(!bg.includes("error: 'unknown_message'"));
assert(popup.includes('ensurePageBridge') && popup.includes('sendPageMessage'));
assert(popup.includes("'application-contract.js'"), 'popup recovery bridge must load the shared application contract');
assert(follow.includes('injectPageBridge') && follow.includes('sendTabMessage'));
assert(follow.includes("'application-contract.js'"), 'follow-up recovery bridge must load the shared application contract');

assert(content.includes('ApplicationContract') && content.includes('APP_ROUTE_RE'), 'content parser must keep route recovery while consuming the central contract');
assert(content.includes('DOM_LABELS'), 'DOM field labels must come from the central contract');
assert(contract.includes('STRUCTURED_PATTERNS') && contract.includes('DOM_LABELS'), 'field semantics must live in one application contract');
assert(semantic.includes('runtime-json') && semantic.includes('data-company-name'), 'generic structured/company recovery must remain available in semantic parser');

console.log('message routing and centralized generic recovery PASS');
