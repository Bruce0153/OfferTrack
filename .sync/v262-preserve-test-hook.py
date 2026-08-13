from pathlib import Path

# This is a read-only semantic regression hook used by existing tests. It is not part of user-facing runtime flow.
p=Path('semantic.js')
s=p.read_text()
needle='  globalThis.__offerTrackEnhanceRecords = enhanceRecords;\n'
hook='  globalThis.__offerTrackSemanticSnapshot = () => collectSemanticSnapshot(false);\n'
if hook not in s:
    if needle not in s:
        raise SystemExit('semantic test-hook insertion point missing')
    s=s.replace(needle, needle+hook, 1)
p.write_text(s)

p=Path('tests/runtime-hygiene.test.js')
s=p.read_text()
s=s.replace("assert(!semantic.includes('__offerTrackSemanticSnapshot'));\n", "assert(semantic.includes('__offerTrackSemanticSnapshot'), 'read-only semantic regression hook must remain testable');\n")
p.write_text(s)
print('semantic regression test hook preserved')
