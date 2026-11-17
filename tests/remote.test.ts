import test from 'node:test';
import assert from 'node:assert/strict';
import { CompactResponse, validateRequestWire, validateWire, wireBudget } from '../src/codex/wire.ts';
const item = { type: 'compaction', id: 'c1', encrypted_content: 'synthetic'.repeat(80) };
const output = [{ type: 'message', id: 'm1', role: 'assistant', content: [{ type: 'output_text', text: 'Before' }] }, item,
  { type: 'message', id: 'm2', role: 'assistant', content: [{ type: 'output_text', text: 'After' }] }];
const terminal = { type: 'response.completed', response: { status: 'completed', output, usage: { output_tokens: 123 } } };
test('complete ordered output survives stream validation with nonzero budget', () => {
  const response = new CompactResponse();
  output.forEach((item, output_index) => response.accept({ type: 'response.output_item.done', output_index, item }));
  response.accept(terminal);
  assert.deepEqual(response.result().items, output);
  assert(response.result().budget.tokens >= Buffer.byteLength(JSON.stringify(output)));
});
test('half streams, false termination and conflicting terminal output fail', () => {
  const response = new CompactResponse();
  response.accept({ type: 'response.output_item.done', output_index: 0, item });
  assert.throws(() => response.result());
  assert.throws(() => response.accept(terminal));
  assert.throws(() => new CompactResponse().accept({ type: 'response.incomplete' }));
});
test('wire rejects unknown items, empty opaque, duplicate IDs and unfinished tool groups', () => {
  for (const items of [[{ type: 'surprise' }], [{ ...item, encrypted_content: '' }], [item, item], [item, { type: 'function_call', call_id: 'x', name: 'alpha', arguments: '{}' }],
    [item, { type: 'function_call_output', call_id: 'x', output: 'result' }]]) assert.throws(() => validateWire(items));
  assert.deepEqual(validateWire([item, { type: 'function_call', call_id: 'x', name: 'alpha', arguments: '{}' }, { type: 'function_call_output', call_id: 'x', output: 'result' }]).length, 3);
});
test('unknown or corrupt usage cannot produce a free opaque checkpoint', () => {
  for (const usage of [0, -1, NaN, Infinity, 1.5]) assert.throws(() => wireBudget([item], usage));
});
test('string-valued token usage is rejected at the protocol boundary', () => {
  const response = new CompactResponse();
  output.forEach((item, output_index) => response.accept({ type: 'response.output_item.done', output_index, item }));
  assert.throws(() => response.accept({ ...terminal, response: { ...terminal.response, usage: { output_tokens: '123' } } }));
});

test('request tools survive opaque replay without becoming valid checkpoint output', async () => {
  const { convertResponsesMessages } = await import(new URL('../../pi-ai/dist/api/openai-responses-shared.js', import.meta.resolve('@earendil-works/pi-coding-agent')).href);
  const model = { id: 'gpt-6.1-terra', api: 'openai-codex-responses', provider: 'openai-codex', input: ['text'], compat: { supportsAdditionalTools: true, supportsMidConvoSystemMessages: true } };
  const tools = [{ name: 'read', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }];
  const encoded = convertResponsesMessages(model, { messages: [{ role: 'system', content: 'Use the available tools.', toolsAdded: tools, timestamp: 0 }, { role: 'user', content: 'Continue.', timestamp: 1 }] }, new Set(['openai-codex']), { supportsAdditionalTools: true, supportsMidConvoSystemMessages: true, toolOptions: { strict: null } });
  const declaration = encoded.find((value: { type?: string }) => value.type === 'additional_tools');
  assert(declaration);
  assert.deepEqual(validateRequestWire([item, ...encoded]), [item, ...encoded]);
  assert.deepEqual(validateRequestWire(encoded, false), encoded);
  assert.throws(() => validateWire([item, declaration]));
  for (const invalid of [{ ...declaration, role: 'user' }, { ...declaration, tools: {} }, { ...declaration, tools: [{ type: 'function', name: 'read', parameters: null }] }, { type: 'unknown' }]) assert.throws(() => validateRequestWire([item, invalid]));
});

test('request declarations retain function schemas and output rejection boundaries', () => {
  const tool = { type: 'function', name: 'read', description: 'Read a file', parameters: { type: 'object' } };
  const declaration = { type: 'additional_tools', role: 'developer', tools: [tool] };
  for (const strict of [undefined, null, true, false]) {
    const input = [item, { ...declaration, tools: [{ ...tool, strict }] }];
    const before = structuredClone(input);
    assert.deepEqual(validateRequestWire(input), input);
    assert.deepEqual(input, before);
    assert.throws(() => validateWire(input));
  }
  const invalid = [
    { ...declaration, role: 'user' }, { ...declaration, role: undefined },
    ...[undefined, null, {}, []].map(tools => ({ ...declaration, tools })),
    ...[null, {}, { ...tool, type: 'custom' }, { ...tool, name: '' }, { ...tool, name: 1 },
      { ...tool, description: undefined }, { ...tool, description: null },
      ...[undefined, null, [], 'object'].map(parameters => ({ ...tool, parameters })),
      ...[0, '', 'true', {}].map(strict => ({ ...tool, strict })),
    ].map(value => ({ ...declaration, tools: [value] })),
    { ...declaration, tools: [tool, tool] },
  ];
  for (const value of invalid) assert.throws(() => validateRequestWire([item, value]));
  assert.deepEqual(validateRequestWire([item, declaration, declaration]), [item, declaration, declaration]);
  const response = new CompactResponse();
  response.accept({ type: 'response.output_item.done', output_index: 0, item });
  response.accept({ type: 'response.output_item.done', output_index: 1, item: declaration });
  assert.throws(() => response.accept({ type: 'response.completed', response: {
    status: 'completed', output: [item, declaration], usage: { output_tokens: 123 },
  } }));
});
