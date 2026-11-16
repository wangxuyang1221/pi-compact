import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, root, provenance } from './fixture/runtime.mjs';

const dir = join(root, 'artifacts/P1-scope/runs', String(Date.now()));
mkdirSync(dir, { recursive: true });
const results = [];
for (const probe of ['scope', 'managed-read']) {
  for (const variant of ['baseline', 'head']) {
    const run = await cli(join(dir, probe, variant), {
      variant, observer: false, extensions: [join(root, 'scripts/regressions', probe + '.ts')],
    });
    const checks = probe === 'scope'
      ? run.events.filter(event => event.event === 'scope-result')
      : run.events.filter(event => event.event === 'sdk-read-result');
    const locks = run.events.filter(event => ['unmanaged-owner', 'unmanaged-disposed-lock'].includes(event.event));
    const requests = run.events.filter(event => event.event === 'normal-request').length;
    const pass = run.code === 0 && requests === (probe === 'scope' ? 2 : 1) && (probe === 'scope'
      ? checks.length === 8 && checks.every(check => check.ok) && locks.length === 2 && locks.every(lock => !lock.lock && !lock.managed)
      : checks.length === 1 && !checks[0].error && checks[0].fileUnchanged && checks[0].messages === checks[0].projectionMessages && (variant === 'baseline' || checks[0].managed && checks[0].state === 'idle'));
    results.push({ probe, variant, pass, code: run.code, requests, checks, locks });
    writeFileSync(join(dir, 'result.json'), JSON.stringify({ provenance, results }, null, 2));
    console.log(JSON.stringify({ probe, variant, pass }));
  }
}
console.log(dir);
assert(results.every(result => result.pass), 'unmanaged sessions and public reads preserve native behavior');
