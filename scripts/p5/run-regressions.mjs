import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../fixture/runtime.mjs';
const dir = join(root, 'artifacts/P5/regressions', String(Date.now()));
mkdirSync(dir, { recursive: true });
const cases = [
  ['p4-fixes', 'scripts/verify-p4-fixes.mjs'],
  ['p4-lane3', 'scripts/verify-p4.mjs', '--lane', '3'],
  ['p4-lane6', 'scripts/verify-p4.mjs', '--lane', '6'],
  ['p4-lane10', 'scripts/verify-p4.mjs', '--lane', '10'],
  ['p3-recovery', 'scripts/verify-p3-fixes.mjs'],
  ['p3-faults', 'scripts/p3/faults.mjs'],
  ['p1-scope', 'scripts/verify-p1-scope.mjs'],
  ['p1-fixes', 'scripts/verify-p1-fixes.mjs'],
  ['p5-disposal', 'scripts/verify-p5-disposal.mjs'],
  ['p2-fixes', 'scripts/verify-p2-fixes.mjs'],
];
const results = [];
for (const [name, ...args] of cases) {
  const result = spawnSync(process.execPath, ['--import=./scripts/fixture/relative-socket.mjs', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  writeFileSync(join(dir, name + '.log'), result.stdout + result.stderr);
  results.push({ name, status: result.status, error: result.error?.message });
  writeFileSync(join(dir, 'result.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.at(-1)));
}
console.log(dir);
if (results.some(r => r.status !== 0)) process.exitCode = 1;
