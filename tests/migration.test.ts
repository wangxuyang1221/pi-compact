import test from 'node:test';
import assert from 'node:assert/strict';
import { sameCapability, assertSelection, selectionKey } from '../src/migration.ts';
import { codexAccess } from '../src/codex/compact.ts';
import type * as Pi from '@earendil-works/pi-coding-agent';
import type { Compatibility } from '../src/checkpoint.ts';
const source: Compatibility = { provider: 'openai-codex', endpoint: 'https://chatgpt.com/backend-api', protocol: 'compaction_trigger', account: 'same-account-hash', model: 'gpt-6-astra', capability: 'pi-1.5.2-codex-signature-v1' };
const model = { id: source.model, provider: source.provider, api: 'openai-codex-responses', baseUrl: source.endpoint, contextWindow: 20000, maxTokens: 1000 } as NonNullable<Pi.AgentSession['model']>;
test('compatibility follows account, endpoint, protocol and encoder capability across models', () => {
  assert(sameCapability(source, { ...source, model: 'gpt-6.1-sol' }));
  for (const key of ['provider', 'endpoint', 'protocol', 'account', 'capability'] as const) assert(!sameCapability(source, { ...source, [key]: 'different' }));
});
test('selection epoch rejects an A to B to A race even when final model bytes match', () => {
  const selected = { epoch: 3, model, key: selectionKey(model) };
  assert.doesNotThrow(() => assertSelection(selected, 3, { ...model }));
  assert.throws(() => assertSelection(selected, 5, model), /selection changed/);
  assert.throws(() => assertSelection(selected, 3, { ...model, baseUrl: 'https://other.invalid' }), /selection changed/);
});
test('effective OAuth capability has no environment gate and never stores credentials', async () => {
  const token = 'fixture.' + Buffer.from(JSON.stringify({ exp: 4102444800, 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture-account' } })).toString('base64url') + '.fixture';
  const runtime = { getAuth: async () => ({ auth: { apiKey: token } }), isUsingOAuth: () => true } as unknown as Pi.ModelRuntime;
  const access = await codexAccess(runtime, model);
  assert(access); assert(!JSON.stringify(access.compatibility).includes(token));
  assert.equal(access.compatibility.account.length, 64);
  assert(await codexAccess(runtime, { ...model, id: 'gpt-6.1-sol' }));
  assert.equal(await codexAccess(runtime, { ...model, provider: 'deepseek' }), undefined);
  assert.equal(await codexAccess(runtime, { ...model, api: 'openai-responses' }), undefined);
  assert.equal(await codexAccess(runtime, { ...model, baseUrl: 'https://unverified.invalid/v1' }), undefined);
});
