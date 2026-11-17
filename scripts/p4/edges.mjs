import '../fixture/relative-socket.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, tui, waitFor, sourceHashes } from '../fixture/runtime.mjs';
import { options, count, entries } from './common.mjs';
const base = join(root, 'artifacts/P4/edges', String(Date.now())); mkdirSync(base, { recursive: true });
const results = [];
const command = async (t, text, event) => { const before = count(t, event); await t.text(text); await waitFor(() => count(t, event) > before, text); };
const selected = process.argv[2];
for (const kind of selected ? [selected] : ['late-model','late-auth','late-source','edit','delete','source-failure','both-fail','migration-source-change','migration-auth-change','schema','inactive-schema','missing-source','tools']) {
  let t;
  const dir = join(base, kind);
  try {
    t = await tui(dir, { ...options, ...(kind === 'tools' ? { tools: true } : {}) });
    await command(t, '/p3-seed 8000', 'seed');
    await command(t, '/compact', 'compaction_end');
    const before = readFileSync(join(dir, 'session.jsonl')); writeFileSync(join(dir, 'before.jsonl'), before);
    if (kind.startsWith('late-')) {
      writeFileSync(join(dir, 'control.json.late'), JSON.stringify({ mode: kind.slice(5) }));
      t.control({ mode: 'success', late: true });
    } else if (['edit','delete'].includes(kind)) {
      await command(t, '/p3-' + kind, kind === 'edit' ? 'edited' : 'deleted');
    } else if (['schema','inactive-schema','missing-source'].includes(kind)) {
      await t.stop(); t = undefined;
      const all = entries(dir);
      const cp = all.findLast(e => e.type === 'compaction');
      if (kind.includes('schema')) cp.details.piCompact.schemaVersion = 999;
      else all.splice(all.findIndex(e => e.type === 'message'), 1);
      if (kind === 'inactive-schema') all.push({ type: 'message', id: 'safe-branch-tip', parentId: cp.parentId, timestamp: new Date().toISOString(), message: { role: 'user', content: 'SAFE_ACTIVE_BRANCH', timestamp: 0 } });
      writeFileSync(join(dir, 'session.jsonl'), all.map(e => JSON.stringify(e)).join('\n') + '\n');
      const { cli } = await import('../fixture/runtime.mjs');
      const result = await cli(join(dir, 'restart'), { ...options, sessionFile: join(dir, 'session.jsonl') });
      assert.equal(result.events.filter(e => e.event === 'normal-request').length, kind === 'inactive-schema' ? 1 : 0);
      assert.equal(result.events.filter(e => e.event === 'source-request').length, 0);
      if (kind === 'inactive-schema') assert.equal(result.code, 0);
      results.push({ kind, pass: true, dir, code: result.code, source: sourceHashes() });
      continue;
    } else if (kind === 'tools') {
      t.control({ mode: 'success', tools: true });
      await t.text('CURRENT_INPUT_MARKER execute tools'); await waitFor(() => count(t, 'agent_settled'), 'tools settled');
      assert.equal(count(t, 'tool-complete'), 3);
      await command(t, '/p4-model deepseek/deepseek-chat', 'selected');
      t.control({ mode: 'success' });
    } else {
      await command(t, '/p4-model deepseek/deepseek-chat', 'selected');
      t.control({ mode: kind === 'both-fail' ? 'failure' : 'success', source: kind.startsWith('migration-') ? 'delay' : 'failure' });
    }
    const settled = count(t, 'agent_settled');
    await t.text('CURRENT_INPUT_MARKER edge request');
    if (kind.startsWith('migration-')) {
      await waitFor(() => count(t, 'source-request'), 'source entered');
      if (kind === 'migration-source-change') await command(t, '/p3-delete', 'deleted');
      else await command(t, '/p4-auth late-account', 'auth-changed');
      t.control({ mode: 'success', source: 'success' });
    }
    await waitFor(() => count(t, 'agent_settled') > settled, 'settled');
    const blocked = kind.startsWith('late-') || kind === 'both-fail' || kind.startsWith('migration-');
    const normal = t.log().filter(e => e.event === 'actual-request' && e.phase === 'normal');
    if (blocked) {
      assert.equal(normal.length, 0);
      assert.equal(entries(dir).filter(e => e.type === 'compaction').length, 1);
    } else {
      assert.equal(normal.length, kind === 'tools' ? 3 : 1);
      const raw = JSON.stringify(normal.at(-1).body.input ?? normal.at(-1).body.messages);
      assert(!raw.includes('encrypted_content')); assert(!raw.includes('Codex remote checkpoint'));
      if (kind === 'edit' || kind === 'delete') {
        assert.equal(count(t, 'source-request'), 0);
        const all = JSON.stringify(t.log().filter(e => e.event === 'actual-request' && e.phase === 'native'));
        assert(!all.includes('database=sqlite'));
        if (kind === 'edit') assert(all.includes('EDITED_SYNTHETIC_SOURCE'));
      }
    }
    assert.equal(count(t, 'network-blocked'), 0);
    await t.capture('outcome');
    results.push({ kind, pass: true, dir, source: sourceHashes() });
  } catch (error) { if (t) await t.capture('failure'); results.push({ kind, pass: false, dir, error: String(error), stack: error.stack }); }
  finally { if (t) await t.stop(); writeFileSync(join(base, 'result.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ ...results.at(-1), source: undefined })); }
}
assert(results.every(item => item.pass), 'P4 edge cases');
