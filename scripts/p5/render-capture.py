import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import pyte

font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 16)
colors = {'black': '#000000', 'red': '#cd3131', 'green': '#0dbc79', 'brown': '#e5e510', 'blue': '#2472c8', 'magenta': '#bc3fbc', 'cyan': '#11a8cd', 'white': '#e5e5e5', 'brightblack': '#666666', 'brightwhite': '#ffffff'}

def render(path, dest, canvas=None):
    record = json.loads(path.read_text())
    cols, rows = record['cols'], record['rows']
    light = record['theme'] == 'light'
    bg, fg = ('#ffffff', '#262626') if light else ('#181c1e', '#d8dee9')
    screen = pyte.Screen(cols, rows + 1)
    stream = pyte.Stream(screen)
    stream.feed(record['ansi'].replace('\n', '\r\n'))
    size = canvas or (cols * 10 + 32, rows * 22 + 64)
    img = Image.new('RGB', size, bg)
    draw = ImageDraw.Draw(img)
    def color(value, default):
        return default if value == 'default' else colors.get(value, '#' + value if len(value) == 6 else default)
    for row in range(rows):
        for col in range(cols):
            cell = screen.buffer[row][col]
            x, y = 16 + col * 10, 12 + row * 22
            draw.rectangle((x, y, x + 10, y + 22), fill=color(cell.bg, bg))
            draw.text((x, y), cell.data, font=font, fill=color(cell.fg, fg))
    draw.text((16, size[1] - 30), 'Pi 1.5.2 | real tmux ANSI capture | Menlo 16 | ' + str(cols) + ' cells', font=font, fill=fg)
    img.save(dest)

if len(sys.argv) == 3 and sys.argv[1] == '--video':
    directory = Path(sys.argv[2])
    for i, path in enumerate(sorted(directory.glob('frame-*.json'))):
        render(path, directory / ('video-%05d.png' % i), (1232, 944))
else:
    render(Path(sys.argv[1]), sys.argv[2])
