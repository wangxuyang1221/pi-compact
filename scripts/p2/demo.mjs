import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, tui, waitFor } from '../fixture/runtime.mjs';
import { options, count } from './common.mjs';
const dir = join(root, 'artifacts/P2/review'); mkdirSync(join(dir, 'frames'), { recursive: true });
copyFileSync(join(root, 'artifacts/P2/lane-4/config.png'), join(dir, 'lane4.png'));
copyFileSync(join(root, 'artifacts/P2/lane-7/manual.png'), join(dir, 'lane7.png'));
const t = await tui(join(dir, 'session'), options);
const frames = []; const begin = performance.now();
try {
  for (let second = 0; second < 40; second++) {
    if (second === 2) await t.text('/compact-config');
    if (second === 8) await t.text('/compact-config threshold 80');
    if (second === 15) { await t.text('/p2-budget 1000'); await waitFor(() => count(t, 'budget'), 'demo seed'); }
    if (second === 20) await t.text('/compact KEEP_CUSTOM_MARKER preserve the synthetic task');
    if (second === 30) await t.text('/compact-config');
    const file = `${String(second).padStart(3, '0')}.txt`;
    writeFileSync(join(dir, 'frames', file), t.tmux('capture-pane', '-p', '-t', 'fixture'));
    frames.push({ second, at: performance.now() - begin, file });
    const remaining = (second + 1) * 1000 - (performance.now() - begin);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  }
} finally { await t.stop(); }
writeFileSync(join(dir, 'frames.json'), JSON.stringify(frames, null, 2));
writeFileSync(join(dir, 'SOURCE.md'), '# Terminal recording provenance\n\nThe PNGs and MP4 render actual tmux capture-pane text from installed Pi 1.5.2. They are terminal text renderings, not OS screenshots. Menlo font and dark background come from the renderer. No UI content was invented. The video samples the live pane once per second for 40 seconds. Raw ANSI, frame text, timings, synthetic provider events and cleanup are retained.\n');
execFileSync('conda', ['run', '--no-capture-output', '-n', 'codex-py312', 'python', join(root, 'scripts/p2/render-demo.py'), dir], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-framerate', '1', '-i', join(dir, 'frames/%03d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '25', join(dir, 'demo.mp4')], { stdio: ['ignore','ignore','pipe'] });
console.log(dir);
