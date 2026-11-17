import test from 'node:test';
import assert from 'node:assert/strict';
import { CompactResponse } from '../src/codex/wire.ts';
import { compaction, done, completed, emptyTerminalEvents } from './fixtures/terminal-output.ts';

function collect(events: unknown[]) {
  const response = new CompactResponse();
  for (const event of events) response.accept(event);
  return response.result();
}

test('observed empty terminal output preserves the completed compaction and usage budget', () => {
  const events = emptyTerminalEvents();
  const before = structuredClone(events);
  const result = collect(events);
  assert.deepEqual(result.items, [compaction]);
  assert.equal(result.budget.outputTokens, 2092);
  assert(result.budget.tokens >= 4184);
  assert.deepEqual(events, before);
});

test('empty terminal output orders complete done items by index', () => {
  const message = { id: 'msg_synthetic', type: 'message', role: 'assistant', content: 'Retained metadata.' };
  assert.deepEqual(collect([done(compaction, 1), done(message, 0), completed()]).items, [message, compaction]);
});

const invalid: [string, unknown[]][] = [
  ['no done items', [completed()]],
  ['added without done', [{ type: 'response.output_item.added', output_index: 0, item: compaction }, completed()]],
  ['unfinished trailing item', [done(), { type: 'response.output_item.added', output_index: 1, item: { type: 'message' } }, completed()]],
  ['missing first index', [done(compaction, 1), completed()]],
  ['missing middle index', [done(), done({ type: 'message', role: 'assistant', content: 'tail' }, 2), completed()]],
  ['duplicate index', [done(), done(), completed()]],
  ['duplicate added index', [{ type: 'response.output_item.added', output_index: 0 }, { type: 'response.output_item.added', output_index: 0 }, done(), completed()]],
  ['added after done', [done(), { type: 'response.output_item.added', output_index: 0 }, completed()]],
  ['invalid added index', [{ type: 'response.output_item.added', output_index: '0' }, done(), completed()]],
  ['no compaction', [done({ type: 'message', role: 'assistant', content: 'summary' }), completed()]],
  ['empty encrypted content', [done({ ...compaction, encrypted_content: '' }), completed()]],
  ['unfinished item', [done({ ...compaction, status: 'in_progress' }), completed()]],
  ['multiple compactions', [done(), done({ ...compaction, id: 'cmp_two' }, 1), completed()]],
  ['unfinished tool group', [done(), done({ type: 'function_call', call_id: 'call', name: 'tool', arguments: '{}' }, 1), completed()]],
  ['unknown done item', [done(), done({ type: 'unknown' }, 1), completed()]],
  ['nonempty terminal conflict', [done(), completed([{ ...compaction, encrypted_content: 'different' }])]],
  ['nonempty terminal without done', [completed([compaction])]],
  ['null output', [done(), completed(null)]],
  ['missing output', [done(), { type: 'response.completed', response: { status: 'completed', usage: { output_tokens: 2092 } } }]],
  ['nonarray output', [done(), completed({})]],
  ['no terminal', [done()]],
];
for (const index of [undefined, null, -1, 0.5, '0', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  invalid.push([`invalid index ${String(index)}`, [{ ...done(), output_index: index }, completed()]]);
}
for (const usage of [undefined, null, {}, { output_tokens: '2092' }, { output_tokens: null }, ...[0, -1, NaN, Infinity, 1.5].map(output_tokens => ({ output_tokens }))]) {
  invalid.push([`invalid usage ${JSON.stringify(usage)}`, [done(), { ...completed(), response: { ...completed().response, usage } }]]);
}
for (const type of ['response.failed', 'response.incomplete', 'error']) {
  invalid.push([type, [done(), { type, response: { status: 'completed', output: [], usage: { output_tokens: 2092 } } }]]);
}
for (const status of ['failed', 'incomplete', 'cancelled', undefined]) {
  invalid.push([`terminal status ${String(status)}`, [done(), { ...completed(), response: { ...completed().response, status } }]]);
}
for (const event of [done(), completed(), { type: 'response.compaction.compacting' }, { type: 'response.failed' }]) {
  invalid.push([`event after terminal ${event.type}`, [done(), completed(), event]]);
}
for (const [name, events] of invalid) test(`empty terminal reconstruction rejects ${name}`, () => {
  assert.throws(() => collect(events));
});

test('nonempty terminal output still requires exact complete stream agreement', () => {
  assert.deepEqual(collect([done(), completed([compaction])]).items, [compaction]);
  const response = new CompactResponse();
  response.accept(done());
  response.accept(completed([compaction]));
  assert.throws(() => response.accept(done()), /after completion/);
});

test('nonempty terminal cannot hide an advertised unfinished tail', () => {
  assert.throws(() => collect([done(), { type: 'response.output_item.added', output_index: 1 }, completed([compaction])]), /unfinished output/);
});

test('reconstructed items retain checkpoint size and safe usage limits', () => {
  assert.throws(() => collect([done({ ...compaction, encrypted_content: 'x'.repeat(8 * 1024 * 1024) }), completed()]), /size limit/);
  assert.throws(() => collect([done(), { ...completed(), response: {
    ...completed().response, usage: { output_tokens: Number.MAX_SAFE_INTEGER + 1 },
  } }]), /usable token usage/);
});
