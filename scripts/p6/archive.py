import hashlib
import io
import json
import sys
from pathlib import Path
import subprocess
import tarfile

root = Path.cwd()
base = root / 'artifacts/P6'
if '--verify' in sys.argv:
    rows = json.loads((base / 'archive-manifest.json').read_text())
    receipt = json.loads((base / 'archive-receipt.json').read_text())
    assert hashlib.sha256((base / 'evidence.tar.gz').read_bytes()).hexdigest() == receipt['sha256']
    with tarfile.open(base / 'evidence.tar.gz', 'r:gz') as archive:
        members = archive.getmembers()
        assert len(members) == len(rows) and len({m.name for m in members}) == len(rows)
        for member, row in zip(members, rows):
            assert member.isfile() and member.name == row['path']
            data = archive.extractfile(member).read()
            assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256']
    print(json.dumps({'verified': True, 'members': len(rows), 'sha256': receipt['sha256']}))
    sys.exit(0)
names = subprocess.check_output(['git', 'ls-files', '--others', '--ignored', '--exclude-standard', 'artifacts'], text=True).splitlines()
excluded = {'artifacts/P6/evidence.tar.gz', 'artifacts/P6/archive-manifest.json', 'artifacts/P6/archive-receipt.json', 'artifacts/P6/REPORT.md'}
rows = []
for name in sorted(names):
    path = root / name
    if name in excluded or any(part in {'tmp', 'node_modules', '__pycache__'} for part in path.parts) or path.name == 'auth.json' or path.is_symlink() or not path.is_file():
        continue
    body = path.read_bytes()
    rows.append({'path': name, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()})
with tarfile.open(base / 'evidence.tar.gz', 'w:gz', format=tarfile.PAX_FORMAT) as archive:
    for row in rows:
        path = root / row['path']
        data = path.read_bytes()
        assert hashlib.sha256(data).hexdigest() == row['sha256']
        info = tarfile.TarInfo(row['path'])
        info.size = len(data)
        info.mode = 0o644
        archive.addfile(info, io.BytesIO(data))
with tarfile.open(base / 'evidence.tar.gz', 'r:gz') as archive:
    members = archive.getmembers()
    assert len(members) == len(rows)
    assert len({member.name for member in members}) == len(rows)
    for member, row in zip(members, rows):
        assert member.isfile() and member.name == row['path']
        data = archive.extractfile(member).read()
        assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256']
(base / 'archive-manifest.json').write_text(json.dumps(rows, indent=2) + '\n')
receipt = {'archive': 'artifacts/P6/evidence.tar.gz', 'sha256': hashlib.sha256((base / 'evidence.tar.gz').read_bytes()).hexdigest(), 'bytes': (base / 'evidence.tar.gz').stat().st_size, 'members': len(rows), 'verifiedEachMember': True, 'excluded': sorted(excluded), 'otherExclusions': ['tmp', 'node_modules', 'auth.json', 'symlinks', 'non-regular files'], 'sourceRoot': str(root)}
(base / 'archive-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
