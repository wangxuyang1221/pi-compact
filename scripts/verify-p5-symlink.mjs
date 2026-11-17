import './fixture/relative-socket.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tui, root, waitFor, provenance } from './fixture/runtime.mjs';

const dir = join(root, 'artifacts/P5-symlink-fix/runs', String(Date.now()));
mkdirSync(dir, { recursive: true });
const alias = join(dir, 'alias');
symlinkSync(join(root, 'src'), alias, 'dir');
const results = [];
for (const [name, entry] of [['direct', join(root, 'src/index.ts')], ['symlink', join(alias, 'index.ts')]]) {
  const t = await tui(join(dir, name), {
    variant: 'baseline', observer: false, seed: 800, captureReady: false,
    extensions: [join(root, 'scripts/p5/observer.ts'), entry],
  });
  try {
    await t.text('/compact');
    await waitFor(() => t.log().some(event => event.event === 'compaction_end'), 'native compaction completion');
    await waitFor(() => /Context compacted|Compacted from/.test(t.tmux('capture-pane', '-p', '-t', 'fixture')), 'completion display');
    const screen = await t.capture('completion');
    const entries = readFileSync(join(t.dir, 'session.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const events = t.log();
    const result = {
      name, managed: events.find(event => event.event === 'ready')?.managed,
      divider: screen.includes('Context compacted'), native: screen.includes('Compacted from'),
      summaries: events.filter(event => event.event === 'native-request').length,
      requests: events.filter(event => event.event === 'normal-request').length,
      checkpoints: entries.filter(entry => entry.type === 'compaction').length,
      firstFrame: events.find(event => event.event === 'p5-first-frame')?.ms,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  } finally { await t.stop(); }
}
writeFileSync(join(dir, 'result.json'), JSON.stringify({ provenance, results }, null, 2));
console.log(dir);
assert(results.every(result => result.managed && result.divider && !result.native && result.summaries === 1 && result.requests === 0 && result.checkpoints === 1), 'direct and symlink loading both render the successful checkpoint');
