import fs from 'node:fs';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { ComparisonLedger, GRANT_SCHEMA } from '../../scripts/comparison/budget.mjs';
import { DurableLedger } from '../../scripts/live/guard.mjs';
import { comparisonFetch } from '../../scripts/comparison/transport.mjs';
import { models, schedule, targetFor } from '../../scripts/comparison/spec.mjs';
process.umask(0o077);
const root = resolve(process.argv[2]);
assert(!fs.existsSync(root)); fs.mkdirSync(root, { mode: 0o700 });
class Before extends ComparisonLedger {
  check(signal) {
    DurableLedger.prototype.check.call(this, signal);
    if (this.rows.some(r => ['USAGE_UNAUDITABLE', 'OUTPUT_INCOMPLETE', 'SERVER_OUTPUT_CAP_EXCEEDED', 'HTTP_REJECTED'].includes(r.auditFailure))) throw new Error('COMPARISON_AUDIT_STOP');
  }
}
const terminal = (type = 'response.completed', status = 'completed', usage = { input_tokens: 10, output_tokens: 5, total_tokens: 15 }) => 'data: ' + JSON.stringify({ type, response: { status, usage } }) + '\n\n';
const sse = body => new Response(body, { headers: { 'content-type': 'text/event-stream' } });
const cases = [
  ['non-sse', () => new Response('{}', { headers: { 'content-type': 'application/json' } })],
  ['missing-content-type', () => new Response(new Uint8Array())],
  ['malformed', () => sse('data: {broken}\n\n')],
  ['send-throw', () => { throw new Error('synthetic'); }],
  ['empty-body', () => sse(null)],
  ['missing-terminal', () => sse('data: {"type":"response.created"}\n\n')],
  ['read-error', () => sse(new ReadableStream({ start(c) { c.error(new Error('synthetic read')); } }))],
  ['cancel-stream', () => sse(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"type":"response.created"}\n\n')); } }))],
  ['http400', () => new Response('{}', { status: 400 })],
  ['http429', () => new Response('{}', { status: 429 })],
  ['incomplete', () => sse(terminal('response.incomplete', 'incomplete'))],
  ['bad-usage', () => sse(terminal('response.completed', 'completed', { input_tokens: 10, output_tokens: 5, total_tokens: 16 }))],
  ['cap', () => sse(terminal('response.completed', 'completed', { input_tokens: 10, output_tokens: 1001, total_tokens: 1011 }))],
  ['valid', () => sse(terminal())],
];
const results = [];
for (const version of ['before', 'after']) for (const [name, response] of cases) {
  const C = version === 'before' ? Before : ComparisonLedger;
  const grant = { schema: GRANT_SCHEMA, mode: 'offline-fixture', authorized: true, grantId: version + '-' + name, expiresAt: new Date(Date.now() + 3600000).toISOString(), syntheticOnly: true, allowAuthRefresh: false, profile: 'compatibility-only', binding: {}, evidenceDir: join(root, version + '-' + name), targets: models.map(targetFor), maxDispatches: 8, maxEstimatedInputTokens: 512000, maxReservedOutputTokens: 8000, perRequestOutputTokens: 1000 };
  let ledger = new C(grant), sends = 0; const errors = [];
  for (const [i, lane] of schedule(grant.profile).slice(0, 2).entries()) {
    ledger.setLane(lane, 'compact');
    try {
      const responseValue = await comparisonFetch(ledger, targetFor(lane.model), async () => { sends++; return i === 0 ? response() : sse(terminal()); })(targetFor(lane.model).endpoint, { method: 'POST', body: JSON.stringify({ model: lane.model, stream: true, max_output_tokens: 1000, reasoning: { effort: 'none' }, input: [], tools: [] }) });
      if (i === 0 && name === 'cancel-stream') await responseValue.body.cancel(); else await responseValue.text();
      errors.push(null);
    } catch (e) { errors.push(e.message); }
    if (i === 0) { const count = ledger.rows.length; ledger.close(); ledger = new C(grant); assert.equal(ledger.rows.length, count); }
  }
  results.push({ version, name, sends, errors, rows: ledger.rows.map(({ state, failure, auditFailure }) => ({ state, failure, auditFailure })) });
  ledger.close();
}
fs.writeFileSync(join(root, 'results.json'), JSON.stringify({ fixture: true, realRequests: 0, results }, null, 2));
for (const r of results.filter(r => r.version === 'after')) assert.equal(r.sends, r.name === 'valid' ? 2 : 1, r.name);
for (const name of ['non-sse', 'missing-content-type', 'malformed', 'send-throw', 'cancel-stream', 'read-error']) assert.equal(results.find(r => r.version === 'before' && r.name === name).sends, 2, name);
console.log(JSON.stringify({ passed: 28, currentCases: 14, realRequests: 0 }));
