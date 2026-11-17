import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as host from '@earendil-works/pi-coding-agent';
import { readableBranch, coverage } from '../src/checkpoint.ts';
import { beginAppend, recoverAppend } from '../src/pi-adapter/transaction.ts';
const user = (id: string, parentId: string | null, content: string): host.SessionEntry => ({ type: 'message', id, parentId, timestamp: '2026-01-01T00:00:00.000Z', message: { role: 'user', content, timestamp: 0 } });
test('readable reconstruction applies source edits across removed compactions', () => {
  const a = user('a', null, 'secret-old');
  const b = user('b', 'a', 'tail');
  const c: host.SessionEntry = { type: 'compaction', id: 'c', parentId: 'b', timestamp: a.timestamp, summary: 'opaque UI label', firstKeptEntryId: 'b', tokensBefore: 100 };
  const e: host.SessionEntry = { type: 'context_edit', id: 'e', parentId: 'c', timestamp: a.timestamp, targetId: 'a', replacement: { content: 'edited' } };
  const branch = [a,b,c,e];
  const projection = host.buildSessionProjection(readableBranch(branch));
  assert.equal(projection.messages[0].role, 'user');
  assert(JSON.stringify(projection.messages).includes('edited'));
  assert(!JSON.stringify(projection.messages).includes('secret-old'));
  assert.notEqual(coverage(host, [a,b], 'b').hash, coverage(host, branch, 'b').hash);
  assert.throws(() => coverage(host, branch, 'other-branch'));
});
test('partial append recovery preserves exact previous bytes and blocks restart', () => {
  const dir = mkdtempSync(join(process.cwd(), 'artifacts/P3/transaction-'));
  const file = join(dir,'session.jsonl');
  const before = JSON.stringify(user('old',null,'source')) + '\n';
  const entry: host.SessionEntry = { type: 'compaction', id: 'new', parentId: 'old', timestamp: '2026-01-01', summary: 'summary', firstKeptEntryId: 'old', tokensBefore: 20 };
  try {
    writeFileSync(file,before);
    beginAppend(file,'operation',entry);
    appendFileSync(file,JSON.stringify(entry).slice(0,13) + '\n');
    assert.equal(recoverAppend(file),true);
    assert.equal(readFileSync(file,'utf8'),before);
    assert.equal(JSON.parse(readFileSync(file+'.pi-compact-state.json','utf8')).kind,'blocked');
    assert.equal(recoverAppend(file),false);
    beginAppend(file,'operation2',entry);
    appendFileSync(file,'unrelated write');
    assert.throws(()=>recoverAppend(file));
    assert(readFileSync(file,'utf8').endsWith('unrelated write'));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('readable recovery rejects missing ancestry and imported summaries without original sources', () => {
  assert.throws(() => readableBranch([user('tail','missing','retained')]));
  const entry: host.SessionEntry = { type: 'compaction', id: 'c', parentId: null, timestamp: '2026-01-01', summary: 'Only surviving old facts', firstKeptEntryId: 'c', tokensBefore: 100 };
  assert.throws(() => readableBranch([entry,user('tail','c','retained')]));
});
