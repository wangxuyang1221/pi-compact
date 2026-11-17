import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, sourceHashes } from '../fixture/runtime.mjs';
const dir = join(root, 'artifacts/P4/regressions', String(Date.now())); mkdirSync(dir, { recursive: true });
const results = [];
for (const script of ['verify-p3-fixes.mjs','p3/faults.mjs','verify-p1-fixes.mjs','verify-p1-scope.mjs','verify-p2-fixes.mjs','verify-p2-reconstruction.mjs']) {
  const result = spawnSync(process.execPath, ['--import=./scripts/fixture/relative-socket.mjs', 'scripts/' + script], { cwd: root, encoding: 'utf8', maxBuffer: 32*1024*1024 });
  const log = join(dir, script.replaceAll('/', '-') + '.log'); writeFileSync(log, result.stdout + result.stderr);
  const row = { script, code: result.status, pid: result.pid, error: result.error?.message, log, source: sourceHashes() };
  results.push(row); writeFileSync(join(dir, 'result.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({...row,source:undefined}));
}
if (results.some(row=>row.code!==0)) process.exitCode=1;
