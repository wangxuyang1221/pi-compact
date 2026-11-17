import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { root, tui, waitFor, provenance } from '../../scripts/fixture/runtime.mjs';
import { options, input, count } from '../../scripts/p2/common.mjs';
const dir = join(root, 'artifacts/P2-fixes/capacity-recovery', String(Date.now()));
const t = await tui(dir, { ...options, extensions: [...options.extensions, join(root, 'scripts/p2/hooks.ts')] });
try {
  await t.text('/p2-budget 1000'); await waitFor(() => count(t, 'budget'), 'seed');
  t.control({ mode: 'success', systemSize: 34000 });
  await t.text(input); await waitFor(() => count(t, 'agent_settled'), 'settled');
  assert.equal(count(t, 'native-request'), 1); assert.equal(count(t, 'normal-request'), 1);
  assert.equal(count(t, 'public-before-agent-start'), 1); assert.equal(count(t, 'public-context'), 1);
  const actual = t.log().filter(e => e.event === 'transport-context').at(-1);
  assert(actual.tokens <= 9000); assert.equal(actual.roles.filter(role => role === 'system').length, 1);
  await t.capture('capacity-recovered');
  const result = { pass: true, native: 1, normal: 1, actual, provenance };
  writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ pass: true, dir, tokens: actual.tokens }));
} finally { await t.stop(); }
