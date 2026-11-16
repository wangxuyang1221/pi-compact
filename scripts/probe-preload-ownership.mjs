import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, tui, root, waitFor } from './fixture/runtime.mjs';
const dir = join(root, 'artifacts/P1-fixes/preload-ownership', String(Date.now()));
const options = { observer: false, extensions: [join(root, 'scripts/regressions/observer.ts')] };
const owner = await tui(join(dir, 'owner'), { ...options, seed: 800 });
try {
  const file = join(owner.dir, 'session.jsonl');
  const before = readFileSync(file, 'utf8');
  const lock = readFileSync(file + '.pi-compact-state.json.lock', 'utf8');
  const contender = await cli(join(dir, 'contender'), { ...options, sessionFile: file, extraArgs: ['--name', 'synthetic-unowned-name'] });
  const after = readFileSync(file, 'utf8');
  const result = { pid: contender.pid, exit: contender.code, unchanged: before === after, appended: after.slice(before.length),
    lockUnchanged: readFileSync(file + '.pi-compact-state.json.lock', 'utf8') === lock,
    requests: contender.events.filter(e => ['normal-request', 'native-request'].includes(e.event)).length };
  writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2));
  await owner.text('CURRENT_INPUT_MARKER owner after rejected contender');
  await waitFor(() => owner.log().some(e => e.event === 'agent_settled'), 'owner continuation');
  console.log(JSON.stringify({ dir, ...result }));
  assert.equal(result.unchanged, true, 'ordinary extension cannot guard Pi writes before extension loading');
} finally { await owner.stop(); }
