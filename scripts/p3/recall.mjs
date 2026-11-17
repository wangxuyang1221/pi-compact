import '../fixture/relative-socket.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, tui, waitFor, sourceHashes } from '../fixture/runtime.mjs';
import { options, count } from './common.mjs';
const base = join(root, 'artifacts/P3/recall', String(Date.now()));
mkdirSync(base, { recursive: true });
const results = [];
for (const variant of ['baseline', 'head']) {
  const t = await tui(join(base, variant), { ...options, variant, extraEnv: { ...options.extraEnv, NODE_OPTIONS: '--import=' + join(root, 'scripts/p3/recall-preload.mjs') } });
  try {
    await t.text('/p3-seed 8000'); await waitFor(() => count(t, 'seed'), 'same source');
    await t.text('/compact'); await waitFor(() => count(t, 'compaction_end'), 'compact');
    await t.text('CURRENT_INPUT_MARKER recall database, retry, file and timezone'); await waitFor(() => count(t, 'agent_settled'), 'recall answer');
    const answer = t.log().find(event => event.event === 'recall-evidence' && event.phase === 'answer');
    assert.equal(answer.answer, 'database=sqlite retry=3 file=ledger.csv timezone=Asia/Shanghai');
    assert.equal(answer.via, variant === 'head' ? 'opaque-token-map' : 'text-summary');
    assert(readFileSync(join(t.dir, 'session.jsonl'), 'utf8').includes(answer.answer));
    assert.equal(count(t, 'native-request'), variant === 'head' ? 0 : 1);
    assert.equal(count(t, 'remote-request'), variant === 'head' ? 1 : 0);
    assert.equal(count(t, 'network-blocked'), 0);
    await t.capture('recall');
    results.push({ variant, pass: true, dir: t.dir, source: sourceHashes(), answer });
  } finally { await t.stop(); }
}
writeFileSync(join(base, 'result.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ pass: true, base, variants: results.map(({ variant, answer }) => ({ variant, answer })) }));
