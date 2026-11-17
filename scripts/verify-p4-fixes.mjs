import './fixture/relative-socket.mjs';
import assert from 'node:assert/strict';
import * as host from '@earendil-works/pi-coding-agent';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, tui, waitFor, sourceHashes, provenance } from './fixture/runtime.mjs';
import { options, count, entries } from './p4/common.mjs';
const base = join(root, 'artifacts/P4-fixes/runs', String(Date.now()));
mkdirSync(base, { recursive: true });
writeFileSync(join(base, 'provenance.json'), JSON.stringify({ ...provenance, source: sourceHashes() }, null, 2));
const results = [];
const command = async (t, text, event) => { const before = count(t, event); await t.text(text); await waitFor(() => count(t, event) > before, text); };
const requests = t => t.log().filter(event => event.event === 'actual-request');
const checkpoints = dir => entries(dir).filter(entry => entry.type === 'compaction');
const matches = (text, fact) => text.split(fact).length - 1;
const modes = process.argv.slice(2);
for (const mode of modes.length ? modes : ['reload-source', 'reload-native', 'reload-source-unchanged', 'reload-native-unchanged', 'split-source', 'split-multi-source', 'split-raw', 'split-multi-raw', 'split-failure', 'split-multi-failure']) {
  const dir = join(base, mode); let t;
  try {
    t = await tui(dir, { ...options, extensions: [...options.extensions, join(root, 'scripts/p4/fixes-observer.ts')] });
    await command(t, '/p3-seed 8000', 'seed'); await command(t, '/compact', 'compaction_end');
    if (mode.includes('multi')) { await command(t, '/p3-seed 4000', 'seed'); await command(t, '/compact', 'compaction_end'); }
    const before = checkpoints(dir).length;
    if (mode.startsWith('split')) await command(t, '/p4-split-tools', 'split-seeded');
    if (mode.includes('raw')) await command(t, '/p4-auth missing', 'auth-changed');
    await command(t, '/p4-model deepseek/deepseek-chat', 'selected');
    if (mode.startsWith('reload')) {
      const source = mode.includes('source');
      t.control({ mode: source ? 'success' : 'delay', source: source ? 'delay' : 'success' });
      let settled = count(t, 'agent_settled');
      await t.text('CURRENT_INPUT_MARKER reload boundary');
      await waitFor(() => count(t, source ? 'source-request' : 'native-request') > 0, 'migration held');
      await command(t, '/p4-reload-source' + (mode.includes('unchanged') ? ' unchanged' : ''), 'source-reloaded');
      const reloaded = t.log().find(event => event.event === 'source-reloaded');
      assert.equal(reloaded.beforeLeaf, reloaded.afterLeaf);
      t.control({ mode: 'success', source: 'success' });
      await waitFor(() => count(t, 'agent_settled') > settled, 'stale migration settled');
      assert.equal(checkpoints(dir).length, before, 'stale migration must not commit');
      assert.equal(requests(t).filter(event => event.phase === 'normal').length, 0, 'stale migration must not send normal input');
      const reloadedBytes = readFileSync(join(dir, 'control.json.after-reload.jsonl'));
      const settledBytes = readFileSync(join(dir, 'session.jsonl'));
      assert.deepEqual(settledBytes.subarray(0, reloadedBytes.length), reloadedBytes, 'reloaded history bytes remain intact');
      const diagnostics = settledBytes.subarray(reloadedBytes.length).toString().trim().split('\n').filter(Boolean).map(JSON.parse);
      assert.ok(diagnostics.every(entry => entry.type === 'message' && entry.message.role === 'assistant' && entry.message.stopReason === 'error' && entry.message.usage.totalTokens === 0), 'only native error diagnostics may follow rejected migration');
      assert.equal(JSON.parse(readFileSync(join(dir, 'session.jsonl.pi-compact-state.json'))).kind, 'blocked');
      const retryStart = requests(t).length;
      await command(t, '/compact', 'compaction_end');
      await waitFor(() => !existsSync(join(dir, 'session.jsonl.pi-compact-pending.json')), 'retry commit settled');
      assert.equal(checkpoints(dir).length, before + 1);
      const latest = checkpoints(dir).at(-1);
      assert.equal(latest.details.piCompact.kind, 'text');
      if (!mode.includes('unchanged')) {
        assert.equal(latest.details.method, 'history');
        assert.equal(matches(latest.summary, 'FACT_RELOADED=corrected_value'), 1);
        assert.equal(requests(t).slice(retryStart).filter(event => event.phase === 'source').length, 0, 'invalid old source must not be replayed on retry');
      }
      settled = count(t, 'agent_settled'); await t.text('CURRENT_INPUT_MARKER recovered history');
      await waitFor(() => count(t, 'agent_settled') > settled, 'retry normal settled');
      const normal = requests(t).findLast(event => event.phase === 'normal'); assert.ok(normal);
      if (!mode.includes('unchanged')) assert.ok(JSON.stringify(normal.body).includes('FACT_RELOADED=corrected_value'));
    } else {
      if (mode.includes('failure')) t.control({ mode: 'success', source: 'failure' });
      await command(t, '/compact', 'compaction_end');
      assert.equal(checkpoints(dir).length, before + 1);
      const preparation = t.log().filter(event => event.event === 'fix-preparation').at(-1).preparation;
      assert.equal(preparation.isSplitTurn, true, 'exercise a real native split-turn');
      const prefix = preparation.turnPrefixMessages;
      assert.equal(prefix.filter(message => message.role === 'toolResult').length, 4);
      const nativeBodies = requests(t).filter(event => event.phase === 'native').map(event => JSON.stringify(event.body));
      const serializedPrefix = JSON.stringify(host.serializeConversation(host.convertToLlm(prefix))).slice(1, -1);
      assert.equal(nativeBodies.reduce((sum, body) => sum + matches(body, serializedPrefix), 0), 1, 'complete ordered tool prefix is summarized once');
      const latest = checkpoints(dir).at(-1);
      assert.equal(latest.details.method, mode.includes('raw') || mode.includes('failure') ? 'history' : 'source');
      for (const fact of ['FACT_TURN=unique_turn_begin', ...Array.from({ length: 4 }, (_, i) => 'FACT_T' + i + '=unique_result_' + i)]) {
        assert.equal(nativeBodies.reduce((sum, body) => sum + matches(body, fact), 0), 1, 'actual summary inputs cover each tool-turn fact once');
        assert.equal(matches(latest.summary, fact), 1, 'persisted summary contains each fact once');
      }
      assert.equal(nativeBodies.reduce((sum, body) => sum + matches(body, 'FACT_LAST=retained_answer'), 0), 0, 'retained tail is outside summary inputs');
      const settled = count(t, 'agent_settled'); await t.text('CURRENT_INPUT_MARKER after split');
      await waitFor(() => count(t, 'agent_settled') > settled, 'split continuation settled');
      const normal = requests(t).findLast(event => event.phase === 'normal'); assert.ok(normal);
      for (const fact of ['FACT_TURN=unique_turn_begin', ...Array.from({ length: 4 }, (_, i) => 'FACT_T' + i + '=unique_result_' + i), 'FACT_LAST=retained_answer']) assert.equal(matches(JSON.stringify(normal.body), fact), 1);
      assert.equal(count(t, 'tool_execution_start'), 0, 'historical tools are not executed again');
    }
    const latest = checkpoints(dir).at(-1), byId = new Map(entries(dir).map(entry => [entry.id, entry]));
    const branch = [];
    for (let id = latest.parentId; id;) { const entry = byId.get(id); assert.ok(entry); branch.unshift(entry); id = entry.parentId; }
    const cut = branch.findIndex(entry => entry.id === latest.firstKeptEntryId), prefixIds = new Set(branch.slice(0, cut).map(entry => entry.id));
    let parentId = null;
    const readable = branch.filter(entry => entry.type !== 'compaction').map(entry => { const copy = { ...entry, parentId }; parentId = entry.id; return copy; });
    const covered = host.buildSessionProjection(readable).entries.filter(entry => prefixIds.has(entry.sourceEntry.id) && entry.messages.length);
    assert.deepEqual(latest.details.piCompact.source.entries, covered.map(entry => entry.sourceEntry.id));
    assert.equal(latest.details.piCompact.source.hash, createHash('sha256').update(JSON.stringify(covered.map(entry => [entry.sourceEntry.id, entry.messages]))).digest('hex'));
    assert.equal(t.log().filter(event => event.event === 'network-blocked').length, 0);
    results.push({ mode, dir, pass: true, requests: requests(t).map(({ phase, model }) => ({ phase, model })) });
  } catch (error) {
    results.push({ mode, dir, pass: false, error: String(error), stack: error.stack });
  } finally {
    if (t) results.at(-1).cleanup = await t.stop();
    writeFileSync(join(base, 'result.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results.at(-1)));
  }
}
assert.ok(results.every(result => result.pass && !result.cleanup.alive.length && !result.cleanup.socketExists && !result.cleanup.listenerCheck.stdout), 'all P4 fixes and cleanup checks pass');
