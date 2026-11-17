import hashlib
import json
import tarfile
from pathlib import Path
base = Path(__file__).parent
manifest = json.loads((base / 'archive-manifest.json').read_text())
expected = {m['file']: m for m in manifest}
seen = set()
with tarfile.open(base / 'evidence.tar.gz', 'r:gz') as archive:
    for member in archive:
        assert member.isfile(), member.name
        item = expected[member.name]
        contents = archive.extractfile(member).read()
        assert len(contents) == item['size'], member.name
        assert hashlib.sha256(contents).hexdigest() == item['sha256'], member.name
        assert member.name not in seen
        seen.add(member.name)
assert seen == set(expected)
receipt = {'pass': True, 'members': len(seen), 'archiveSHA256': hashlib.sha256((base / 'evidence.tar.gz').read_bytes()).hexdigest()}
(base / 'archive-audit.json').write_text(json.dumps(receipt, indent=2))
print(json.dumps(receipt))
