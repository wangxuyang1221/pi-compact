import sys
from PIL import Image, ImageDraw, ImageFont
text = open(sys.argv[1]).read()
font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 15)
lines = text.splitlines()
image = Image.new('RGB', (1100, max(100, len(lines) * 20 + 32)), '#101418')
draw = ImageDraw.Draw(image)
for row, line in enumerate(lines):
    draw.text((16, 16 + row * 20), line, font=font, fill='#d8dee9')
image.save(sys.argv[2])
