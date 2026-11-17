import fs from 'node:fs';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { ComparisonLedger, GRANT_SCHEMA } from './comparison/budget.mjs';
import { comparisonFetch } from './comparison/transport.mjs';
import { models, schedule, targetFor } from './comparison/spec.mjs';
import { privateTree } from './live/guard.mjs';

process.umask(0o077);
const root = resolve(process.argv[2]);
assert.equal(fs.existsSync(root), false);
privateTree(root, { create: true });
const terminal = 'data: ' + JSON.stringify({ type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } }) + '\n\n';
const sse = body => new Response(body, { headers: { 'content-type': 'text/event-stream' } });
const cases = [
  ['non-sse', () => new Response('{}', { headers: { 'content-type': 'application/json' } })],
  ['missing-content-type', () => new Response(new Uint8Array())],
  ['malformed-sse', () => sse('data: {invalid}\n\n')],
  ['missing-terminal', () => sse('data: {"type":"response.created"}\n\n')],
  ['send-failure', () => { throw new Error('synthetic transport failure'); }],
  ['http-rejected', () => new Response('{}', { status: 400 })],
  ['valid-sse', () => sse(terminal)],
];
const results = [];
for (const [name, response] of cases) {
  const grant = { schema: GRANT_SCHEMA, mode: 'offline-fixture', authorized: true, grantId: name, expiresAt: new Date(Date.now() + 3600000).toISOString(), syntheticOnly: true, allowAuthRefresh: false, profile: 'compatibility-only', binding: {}, evidenceDir: join(root, name), targets: models.map(targetFor), maxDispatches: 8, maxEstimatedInputTokens: 512000, maxReservedOutputTokens: 8000, perRequestOutputTokens: 1000 };
  let ledger = new ComparisonLedger(grant), sends = 0;
  const errors = [];
  for (const [i, lane] of schedule(grant.profile).slice(0, 2).entries()) {
    ledger.setLane(lane, 'compact');
    try {
      const result = await comparisonFetch(ledger, targetFor(lane.model), async () => { sends++; return i === 0 ? response() : sse(terminal); })(targetFor(lane.model).endpoint, { method: 'POST', body: JSON.stringify({ model: lane.model, stream: true, max_output_tokens: 1000, reasoning: { effort: 'none' }, input: [], tools: [] }) });
      await result.text();
      errors.push(null);
    } catch (error) { errors.push(error.message); }
    if (i === 0) { ledger.close(); ledger = new ComparisonLedger(grant); }
  }
  results.push({ name, sends, errors, rows: ledger.rows.map(({ state, failure, auditFailure }) => ({ state, failure, auditFailure })) });
  ledger.close();
}
fs.writeFileSync(join(root, 'results.json'), JSON.stringify({ fixture: true, realRequests: 0, realAuthReads: 0, results }, null, 2) + '\n');
for (const result of results) {
  assert.equal(result.sends, result.name === 'valid-sse' ? 2 : 1, result.name);
  if (result.name !== 'valid-sse') assert.equal(result.errors[1], 'COMPARISON_AUDIT_STOP', result.name);
}
console.log(JSON.stringify({ passed: results.length, realRequests: 0, realAuthReads: 0 }));
