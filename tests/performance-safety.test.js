const fs=require('fs'), path=require('path'), assert=require('assert');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const manifest=JSON.parse(read('manifest.json'));
const contentScripts=Array.isArray(manifest.content_scripts)?manifest.content_scripts:[];
const scripts=contentScripts.flatMap(x=>x.js||[]);
assert(!contentScripts.some(x=>(x.matches||[]).includes('https://*/*')), 'global HTTPS content-script injection is forbidden');
assert(!scripts.includes('content-ui.js'));
assert(!fs.existsSync(path.join(root,'content-ui.js')));

const content=read('content.js');
assert(!/characterData\s*:\s*true/.test(content));
assert(/AUTO_SCAN_MIN_GAP\s*=\s*4000/.test(content));
assert(/isOfferTrackNode/.test(content));

const semantic=read('semantic.js');
assert(!/chrome\.runtime\.sendMessage\s*=/.test(semantic));
assert(!/setInterval\s*\(/.test(semantic));
assert(/MAX_SCRIPT_CHARS\s*=\s*900_000/.test(semantic));

const probe=read('strategy-probe.js');
assert(/budget=450_000/.test(probe));
assert(/projectStructured/.test(probe), 'script JSON must be safely projected before leaving the page');

const contract=read('application-contract.js');
assert(/SENSITIVE_KEY_RE/.test(contract), 'central structured sensitive-key guard missing');
assert(/SENSITIVE_CONTAINER_RE/.test(contract), 'central structured sensitive-container guard missing');
assert(/projectionPolicy/.test(contract), 'central MAIN-world projection policy missing');

const bg=read('followup-background.js');
assert(/Contract\.projectionPolicy\(\)/.test(bg), 'MAIN-world collection must consume the central projection policy');
assert(/nodes\+\+ >= 650/.test(bg), 'final MAIN-world projection must keep the tightened 650-node budget');
assert(/depth > 6/.test(bg), 'MAIN-world projection depth budget missing');
assert(/v\.slice\(0, 28\)/.test(bg), 'MAIN-world array budget missing');
assert(/Object\.keys\(v\)\.slice\(0, 60\)/.test(bg), 'MAIN-world object-key budget missing');
assert(/val\.slice\(0, 240\)/.test(bg), 'MAIN-world string budget missing');
assert(/sensitiveContainer/.test(bg) && /sensitiveKey/.test(bg), 'MAIN-world projection must apply centralized sensitive filters');
assert(!/chrome\.tabs\.query\(\{\}\)/.test(bg), 'unscoped tab query is forbidden');
assert(!bg.includes("chrome.tabs.query({ url: ['https://*/*'] })"), 'broad all-HTTPS tab query is forbidden');

console.log('OfferTrack final performance/privacy safety guards: PASS');
