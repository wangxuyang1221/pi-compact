from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont
folder = Path(sys.argv[1]) / 'frames'
font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 15)
for path in sorted(folder.glob('*.txt')):
    image = Image.new('RGB', (1100, 832), '#101418')
    draw = ImageDraw.Draw(image)
    for row, line in enumerate(path.read_text().splitlines()):
        draw.text((16, 16 + row * 20), line, font=font, fill='#d8dee9')
    image.save(path.with_suffix('.png'))
