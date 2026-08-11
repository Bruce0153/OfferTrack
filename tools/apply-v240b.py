from pathlib import Path
import base64
import hashlib
import io
import zipfile

ROOT = Path('.')
PAYLOAD_DIR = ROOT / 'tools' / 'v240-payload'
EXPECTED = {
    '00.txt': '9b657d5944623250108302bd2b73197c204b2eb2d1aaa25beeb9a8994424fd90',
    '02.txt': '5051242929aa09e3a680ea21bbb0e41ccbd1b0f678d5b7f3f82edb5be09d5dfb',
    '03.txt': '79f175c2aa2a4fed4ef9aa93ba4625ff195b4479db23f545cf8025c35c5fc395',
    '04.txt': '2ebaa61fe84235e925221d70ca51c9ead090ed92dbc48e9eac076fd9301e2a16',
    '05.txt': '3f91701e91cded6474fb4bf6aa417f18b7314cdcfb3490255152fd7f5bcb24bf',
    '06.txt': '35d3f8d11a1799065b50247db5103771d4787888863082e904bab9c6a3982578',
    '07.txt': '70ce97d824df639d3ee27798520ea82ae5d5e5ff18428d5281931ab25fe71ea4',
    '08.txt': '1ec0a88f8b44ae0b20dcb88fd88958a427c1bc98a67449d8de7a70c2147c7563',
    '09.txt': 'f7cf46acc8d9ca22f0f138443b6cc17ad1ec07765c56e04cd2a309aa0ea59b21',
    '10.txt': '6128159237f9996296ace10394ad848334317a20767779b858f4d07f1d3ea02b',
    '11.txt': 'cd05ca974410c634de38263099162962493b9ee9e8dc12f3e3c7a6e6640a90e9',
    '13.txt': '13c7715a7e9f066cc3ef210740e1dd1c85ce27dc7517e0c0be2332322865e685',
}
CHUNK01_SHA = '7806d80a053776f60a4c21c33a074512033a437d7a70d4aef8392a8541702398'
FULL12 = '69a452dcd154d2e2cb296d58053e64153d3dbff794bb8e61a354a492f6bc85bd'
HALF12A = 'e34f0299358fbe8a724de9c537cf64514937fecb56662d48eb0cb1eda7c46b42'
HALF12B = '798a5273334c8cc62a28efb06d33708057a8443885841d32fe4d49b99b710e6d'
PAYLOAD_SHA = '152fbd8923435698b5789fe71f043efa37a256871c8346d50b949f42a4fcfe71'

sha = lambda s: hashlib.sha256(s.encode('ascii')).hexdigest()

def read_checked(name, expected):
    data = (PAYLOAD_DIR / name).read_text(encoding='ascii').strip()
    got = sha(data)
    print(f'{name}: len={len(data)} sha256={got} expected={expected}')
    if got != expected:
        raise RuntimeError(f'payload chunk hash mismatch: {name}: {got}')
    return data

parts = [read_checked('00.txt', EXPECTED['00.txt'])]
part01 = (PAYLOAD_DIR / '01a.txt').read_text(encoding='ascii').strip() + (PAYLOAD_DIR / '01b.txt').read_text(encoding='ascii').strip()
print(f'01 reconstructed: len={len(part01)} sha256={sha(part01)} expected={CHUNK01_SHA}')
if sha(part01) != CHUNK01_SHA:
    raise RuntimeError('payload chunk hash mismatch: reconstructed 01.txt')
parts.append(part01)
for i in range(2, 12):
    name=f'{i:02d}.txt'
    parts.append(read_checked(name, EXPECTED[name]))
raw12=(PAYLOAD_DIR/'12.txt').read_text(encoding='ascii').strip()
raw12b=(PAYLOAD_DIR/'12b.txt').read_text(encoding='ascii').strip() if (PAYLOAD_DIR/'12b.txt').exists() else ''
if sha(raw12)==FULL12:
    parts.append(raw12)
elif sha(raw12)==HALF12A and raw12b and sha(raw12b)==HALF12B:
    parts.append(raw12+raw12b)
else:
    print('12.txt', len(raw12), sha(raw12), '12b.txt', len(raw12b), sha(raw12b) if raw12b else 'MISSING')
    raise RuntimeError('payload chunk hash mismatch: 12/12b')
parts.append(read_checked('13.txt', EXPECTED['13.txt']))
payload=base64.b64decode(''.join(parts))
got=hashlib.sha256(payload).hexdigest()
print('payload sha256', got, 'expected', PAYLOAD_SHA)
if got != PAYLOAD_SHA:
    raise RuntimeError('v2.4 payload SHA256 mismatch')
with zipfile.ZipFile(io.BytesIO(payload)) as z:
    z.extractall(ROOT)
for rel in ['INSTALL_EDGE.bat','PROVIDER_REGISTRY.md','SESSION_MANAGER.md','TEST_REPORT.md','V2_ROADMAP.md','tests/generic-company-quality.test.js','tests/message-routing-recovery.test.js','tests/v230-safety.test.js']:
    p=ROOT/rel
    if p.exists(): p.unlink()
print('v2.4.0 exact tested payload applied and verified')
