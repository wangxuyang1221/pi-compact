from pathlib import Path
from PIL import Image
import json
base = Path(__file__).parent
native = Path(json.loads((base / 'audit.json').read_text())['paths']['native'])
a = Image.open(native / 'baseline/native.png')
b = Image.open(native / 'manual/dark-90.png')
canvas = Image.new('RGB', (a.width + b.width, max(a.height, b.height)), '#181c1e')
canvas.paste(a, (0, 0))
canvas.paste(b, (a.width, 0))
canvas.save(base / 'review/lane1-before-after.png')
