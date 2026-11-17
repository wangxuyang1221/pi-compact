import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { durableWrite } from './live/guard.mjs';
const dir = resolve('artifacts/P6-executor/verification', String(Date.now()));
const packageFile = resolve(process.argv[2] ?? 'artifacts/P6-executor/release/pi-compact-0.1.0.tgz');
fs.mkdirSync(dir, { recursive: true });
const results = [];
const cases = [
  [undefined, true, 9], ['implicit-retry', true, 12],
  ['retry-cap', false, 1], ['concurrent', false, 1], ['abort-after-reserve', false, 1], ['multi-slice', false, 12], ['budget', false, 1], ['input-budget', false, 0], ['output-budget', false, 0], ['expired', false, 0],
  ['persist-failure', false, 0], ['abort', false, 0], ['endpoint', false, 0], ['model', false, 0], ['cap', false, 0],
  ['http-failure', false, 1], ['redaction', false, 1], ['auth-refresh', false, 0], ['stream-failure', false, 1], ['crash-after-reserve', false, 1],
];
let failed = false;
for (const [fault, pass, count] of cases) {
  const name = fault ?? 'complete';
  const evidence = resolve('artifacts/P6-executor/runs', `${Date.now()}-${name}`);
  const run = spawnSync(process.execPath, ['scripts/live-acceptance.mjs', '--offline-fixture', '--evidence', evidence, '--package', packageFile, ...(fault ? ['--fault', fault] : [])], { encoding: 'utf8', timeout: 30000 });
  const ledger = JSON.parse(fs.readFileSync(join(evidence, 'ledger.json'), 'utf8'));
  const resultFile = join(evidence, 'result.json');
  const result = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : {};
  const cleanup = JSON.parse(fs.readFileSync(join(evidence, 'cleanup.json'), 'utf8'));
  let error;
  try {
    assert.equal(run.status, pass ? 0 : 1);
    assert.equal(ledger.rows.length, count);
    assert.equal(result.status === 'pass', pass);
    assert.equal(cleanup.alive, false); assert.equal(cleanup.listenerCount, 0);
    assert(!JSON.stringify([result, ledger, cleanup]).includes('TEST_SECRET'));
    if (pass) {
      const scores = result.scenarios.filter(s => s.scores).map(s => s.scores);
      assert.equal(scores.length, 4);
      assert.equal(result.processRestart.source, 'disk');
      assert.equal(result.processRestart.beforeReservations, name === 'complete' ? 5 : 6);
      for (const score of scores) for (const key of ['facts', 'unfinished', 'file', 'toolResult']) assert.equal(score[key], true);
      assert.equal(result.scenarios[0].managed, false);
      assert.equal(ledger.rows.find(r => r.phase === 'native-summary' && r.state === 'completed').operation, 'native');
      assert.equal(ledger.rows.find(r => r.phase === 'remote-summary').operation, 'remote');
      assert.equal(result.scenarios.find(s => s.id === 'remote-load').managed, true);
    }
    if (fault === 'crash-after-reserve') { assert(fs.existsSync(join(evidence, 'owner.lock'))); assert.equal(ledger.rows[0].state, 'reserved'); }
    else assert(!fs.existsSync(join(evidence, 'owner.lock')));
    for (const file of fs.readdirSync(join(evidence, 'raw'), { recursive: true, withFileTypes: true })) {
      const path = join(file.parentPath, file.name);
      if (file.isFile() && /\.jsonl$|auth\.json$|opaque-map/.test(path)) assert.equal(fs.statSync(path).mode & 0o077, 0);
    }
  } catch (caught) { error = caught.message; failed = true; }
  const row = { name, expectedSuccess: pass, expectedDispatches: count, status: error ? 'failed' : 'pass', ...(error ? { error } : {}), run: evidence, actualDispatches: ledger.rows.length };
  results.push(row); durableWrite(join(dir, 'results.json'), results);
  console.log(JSON.stringify(row));
}
console.log(JSON.stringify({ evidence: dir, status: failed ? 'failed' : 'pass' }));
if (failed) process.exitCode = 1;
