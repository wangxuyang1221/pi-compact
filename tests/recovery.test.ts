import test from 'node:test';
import assert from 'node:assert/strict';
import * as host from '@earendil-works/pi-coding-agent';
import { checkpoint, coverage, readableBranch } from '../src/checkpoint.ts';
import { inspectMigration, selectionKey } from '../src/migration.ts';
import { wireBudget } from '../src/codex/wire.ts';
const model = { id: 'deepseek-chat', provider: 'deepseek', api: 'openai-completions', baseUrl: 'https://fixture.invalid/v1', contextWindow: 20000, maxTokens: 1000 } as NonNullable<host.AgentSession['model']>;
const user = (id: string, parentId: string | null, content: string): host.SessionEntry => ({ type: 'message', id, parentId, timestamp: '2026-01-01', message: { role: 'user', content, timestamp: 0 } });
const a = user('a', null, 'deleted-fact'); const b = user('b', 'a', 'retained');
const items = [{ type: 'compaction', id: 'opaque', encrypted_content: 'synthetic-only' }];
const entry: host.CompactionEntry = { type: 'compaction', id: 'c', parentId: 'b', timestamp: '2026-01-01', summary: 'display-only', firstKeptEntryId: 'b', tokensBefore: 100,
  details: { piCompact: { schemaVersion: 1, kind: 'opaque', source: coverage(host, [a,b], 'b'), items, budget: wireBudget(items, 10),
    compatibility: { provider: 'openai-codex', model: 'gpt-6-astra', endpoint: 'https://fixture.invalid/backend-api', protocol: 'compaction_trigger', account: 'hash', capability: 'pi-1.5.2-codex-signature-v1' } } } };
const selected = { epoch: 0, model, key: selectionKey(model) };
test('branch selection finds only its own opaque checkpoint and deleted sources disable source replay', () => {
  assert.equal(inspectMigration(host, [a,b], selected), undefined);
  assert.equal(inspectMigration(host, [a,b,entry], selected)?.checkpointId, 'c');
  const deleted: host.SessionEntry = { type: 'context_edit', id: 'edit', parentId: 'c', timestamp: '2026-01-01', targetId: 'a', replacement: null };
  const branch = [a,b,entry,deleted];
  assert.equal(inspectMigration(host, branch, selected)?.sourceValid, false);
  assert(!JSON.stringify(host.buildSessionProjection(readableBranch(branch)).messages).includes('deleted-fact'));
  assert.equal(coverage(host, branch, 'b').entries.length, 0);
});
test('unknown schema and mixed representations reject rather than replaying a display label', () => {
  for (const change of [{ schemaVersion: 999 }, { kind: 'future' }, { text: 'invalid mix' }]) {
    const altered = structuredClone(entry);
    Object.assign((altered.details as { piCompact: object }).piCompact, change);
    assert.throws(() => checkpoint(altered));
  }
  assert.throws(() => readableBranch([b,entry]), /missing ancestor/);
});
