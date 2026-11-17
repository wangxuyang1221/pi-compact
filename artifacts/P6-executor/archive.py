import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile

base = Path(__file__).resolve().parent
public = json.loads((base / 'public-manifest.json').read_text())
private = []
for raw in sorted((base / 'runs').glob('*/raw')):
    for path in [raw, *sorted(raw.rglob('*'))]:
        rel = path.relative_to(raw)
        if any(p in {'package', 'tmp', 'home'} for p in rel.parts) or path.name == 'auth.json':
            continue
        if path.is_symlink():
            raise ValueError('Symlink in private evidence')
        private.append(path)

def build(name, files, private_archive):
    destination = base / name
    if destination.exists():
        raise ValueError('Archive exists; retain it under another name before a new build')
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600 if private_archive else 0o644)
    with os.fdopen(fd, 'wb') as output, tarfile.open(fileobj=output, mode='w:gz') as archive:
        for source, relative in files:
            item = tarfile.TarInfo(relative)
            item.mode = 0o700 if source.is_dir() else 0o600 if private_archive else 0o644
            if source.is_dir():
                item.type = tarfile.DIRTYPE
                archive.addfile(item)
            else:
                data = source.read_bytes()
                item.size = len(data)
                archive.addfile(item, io.BytesIO(data))
    with tarfile.open(destination) as archive:
        members = archive.getmembers()
        assert not any('/._' in m.name or m.name.startswith('._') for m in members)
        assert all(set(m.pax_headers) <= {'path'} and not m.uname and not m.gname for m in members)
        if private_archive:
            assert all((m.mode & 0o077) == 0 for m in members)
            assert not any(m.name.endswith('/auth.json') for m in members)
        else:
            for row in public:
                assert hashlib.sha256(archive.extractfile('./' + row['path']).read()).hexdigest() == row['sha256']
    return {'file': name, 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'bytes': destination.stat().st_size, 'members': len(members)}

pub = build('public-evidence.tar.gz', [(base / 'public' / r['path'], './' + r['path']) for r in public], False)
priv = build('private-offline-evidence.tar.gz', [(p, str(p.relative_to(base))) for p in private], True)
priv.update({'mode': '0600', 'committed': False, 'excluded': ['auth.json', 'package', 'tmp', 'home']})
receipt = {'implementationSHA': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(), 'public': pub, 'private': priv}
(base / 'archive-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
