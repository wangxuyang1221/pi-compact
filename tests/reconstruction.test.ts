import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionProjection } from '@earendil-works/pi-coding-agent';
import { snapshotContext as snapshot, reconstructContext as reconstruct } from '../src/pi-adapter/reconstruction.ts';
type Message = SessionProjection['messages'][number];
const user = (content: string): Extract<Message, { role: 'user' }> => ({ role: 'user', content, timestamp: 0 });
function projection(messages: Message[], ids = messages.map((_, i) => String(i))): SessionProjection {
  return { messages, entries: messages.map((message, i) => ({ sourceEntry: { type: 'message', id: ids[i], parentId: null, timestamp: '', message }, messages: [message] })), model: null, thinkingLevel: 'off' };
}
function compacted(retained: Message[] = [], ids: string[] = []): SessionProjection {
  const result = projection(retained, ids);
  const summary: Message = { role: 'compactionSummary', summary: 'summary', tokensBefore: 10, timestamp: 1 };
  result.messages.unshift(summary);
  result.entries.unshift({ sourceEntry: { type: 'compaction', id: 'checkpoint', parentId: null, timestamp: '', summary: 'summary', firstKeptEntryId: ids[0] ?? null, tokensBefore: 10 }, messages: [summary] });
  return result;
}
const snapshotContext = (messages: Message[], original: SessionProjection) => ({ sources: snapshot(messages), original });
const reconstructContext = (before: ReturnType<typeof snapshotContext>, transformed: Message[], after: SessionProjection) => reconstruct(before.sources, transformed, before.original, after);
const withoutSummary = (messages: Message[]) => messages.filter(m => m.role !== 'compactionSummary');

test('identity anchoring preserves an added byte-equal clone while summarizing the original', () => {
  const old = user('old'), current = user('current');
  const before = snapshotContext([old, current], projection([old, current]));
  const clone = structuredClone(old);
  assert.deepEqual(withoutSummary(reconstructContext(before, [old, current, clone], compacted([current], ['1']))), [current, clone]);
});

test('ambiguous cloned additions and cross-cut duplicates keep all hook output', () => {
  const a = user('duplicate'), b = structuredClone(a), current = user('current');
  const source = [a, b, current];
  const before = snapshotContext(source, projection(source));
  const output = structuredClone([b, current, a]);
  assert.deepEqual(withoutSummary(reconstructContext(before, output, compacted([b, current], ['1', '2']))), output);
  const added = structuredClone([a, a, current]);
  assert.deepEqual(withoutSummary(reconstructContext(snapshotContext([a, current], projection([a, current])), added, compacted([current], ['1']))), added);
});

test('in-place content and array mutations survive the pre-hook snapshot', () => {
  const a = user('old'), b = user('recent'), current = user('current');
  const source = [a, b, current], before = snapshotContext(source, projection(source));
  a.content = 'modified'; source.splice(1, 1);
  assert.deepEqual(withoutSummary(reconstructContext(before, source, compacted([b, current], ['1', '2']))), [a, current]);
});

test('equal clone arrays compact unchanged history and preserve reorder and deletes', () => {
  const a = user('old'), b = user('recent'), current = user('current');
  const before = snapshotContext([a, b, current], projection([a, b, current]));
  assert.deepEqual(withoutSummary(reconstructContext(before, structuredClone([current, a]), compacted([b, current], ['1', '2']))), [current]);
  const unchanged = structuredClone([a, b, current]);
  assert.equal(reconstructContext(before, unchanged, projection([a, b, current])), unchanged);
});

test('a retained tool member preserves every call and result in its batch and their hook order', () => {
  const calls: Message = { role: 'assistant', content: ['a', 'b', 'c'].map(id => ({ type: 'toolCall', id, name: id, arguments: {} })), api: 'openai-responses', provider: 'fixture', model: 'fixture', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'toolUse', timestamp: 0 };
  const results: Message[] = ['c', 'b', 'a'].map(id => ({ role: 'toolResult', toolCallId: id, toolName: id, content: [{ type: 'text', text: id }], isError: false, timestamp: 0 }));
  const source = [calls, ...results], before = snapshotContext(source, projection(source));
  const output = structuredClone(source);
  assert.equal(output[2].role, 'toolResult');
  if (output[2].role === 'toolResult') output[2].content = [{ type: 'text', text: 'modified' }];
  assert.deepEqual(withoutSummary(reconstructContext(before, output, compacted())), output);
  assert.deepEqual(withoutSummary(reconstructContext(before, structuredClone(source), compacted())), []);
});

test('a modified clone cannot cause an added original-content clone to be summarized', () => {
  const old = user('original'), current = user('current');
  const before = snapshotContext([old, current], projection([old, current]));
  const output = structuredClone([old, current, old]);
  output[0].content = 'modified';
  assert.deepEqual(withoutSummary(reconstructContext(before, output, compacted([current], ['1']))), output);
});
