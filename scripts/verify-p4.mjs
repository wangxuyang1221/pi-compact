import './fixture/relative-socket.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, tui, waitFor, sourceHashes } from './fixture/runtime.mjs';
import { options, count, entries } from './p4/common.mjs';
const selected = process.argv.includes('--lane') ? Number(process.argv[process.argv.indexOf('--lane') + 1]) : undefined;
const base = join(root, 'artifacts/P4/runs', String(Date.now()));
mkdirSync(base, { recursive: true });
const results = [];
const command = async (t, text, event) => { const before = count(t, event); await t.text(text); await waitFor(() => count(t, event) > before, text); };
const normal = async t => { const before = count(t, 'agent_settled'); await t.text('CURRENT_INPUT_MARKER recall all facts'); await waitFor(() => count(t, 'agent_settled') > before, 'normal request settled'); };
for (const lane of selected ? [selected] : [1,2,3,4,5,6,7,8,9,10]) {
  for (const variant of lane === 1 ? ['baseline', 'head'] : ['head']) {
    const dir = join(base, `lane-${lane}-${variant}`);
    let t = await tui(dir, { ...options, variant });
    try {
      await command(t, '/p3-seed 8000', 'seed');
      if (lane === 9) await command(t, '/p4-mark root', 'marked');
      await command(t, '/compact', 'compaction_end');
      assert.equal(count(t, 'extension-success'), 1);
      const initial = entries(dir).findLast(e => e.type === 'compaction');
      if (variant === 'head') { assert.equal(initial.details.piCompact.kind, 'opaque'); assert.equal(count(t, 'native-request'), 0); }
      if (lane === 9) {
        await command(t, '/p4-mark A', 'marked');
        await command(t, '/p4-branch root', 'branch-selected');
        await command(t, '/p3-seed 7000', 'seed');
        await command(t, '/compact', 'compaction_end');
        await command(t, '/p4-mark B', 'marked');
        const second = entries(dir).findLast(e => e.type === 'compaction');
        for (const [name, checkpoint] of [['A', initial], ['B', second], ['A', initial]]) {
          await command(t, '/p4-branch ' + name, 'branch-selected'); await normal(t);
          const body = t.log().findLast(e => e.event === 'actual-request').body;
          assert(body.input.some(item => item.encrypted_content === checkpoint.details.piCompact.items.find(item => item.type === 'compaction').encrypted_content));
        }
        assert.equal(count(t, 'source-request'), 0);
      } else if (lane === 3) {
        await command(t, '/p4-model openai-codex/gpt-6.1-sol', 'selected'); await normal(t);
        assert.equal(count(t, 'native-request'), 0); assert.equal(count(t, 'source-request'), 0);
        assert.equal(t.log().findLast(e => e.event === 'actual-request').body.model, 'gpt-6.1-sol');
      } else {
        if ([4,5,6].includes(lane)) await command(t, '/p4-auth ' + (lane === 4 ? 'changed-account' : 'missing'), 'auth-changed');
        if (lane === 6) await command(t, '/p4-seed 12', 'distributed-seed');
        if (lane !== 4) await command(t, '/p4-model deepseek/deepseek-chat', 'selected');
        if (lane === 10) {
          await t.stop();
          for (const file of ['events.jsonl', 'cleanup.json', 'raw.ansi']) copyFileSync(join(dir, file), join(dir, 'first-' + file));
          t = await tui(dir, { ...options, extraArgs: ['--provider', 'deepseek', '--model', 'deepseek-chat'] });
        }
        const prefix = readFileSync(join(dir, 'session.jsonl')); writeFileSync(join(dir, 'before-migration.jsonl'), prefix);
        if ([7,8].includes(lane)) {
          t.control({ mode: 'success', source: 'delay' });
          await t.text('CURRENT_INPUT_MARKER migration'); await waitFor(() => count(t, 'source-request'), 'source migration entered');
          await t.capture('waiting');
          if (lane === 7) t.key('Escape');
          else {
            await command(t, '/p4-model openai-codex/gpt-6.1-sol', 'selected');
            await command(t, '/p4-model deepseek/deepseek-reasoner', 'selected');
            t.control({ mode: 'success', source: 'success' });
          }
          await waitFor(() => count(t, 'agent_settled'), 'cancelled/stale request settled');
          assert.equal(entries(dir).filter(e => e.type === 'compaction').length, 1);
          assert.equal(count(t, 'normal-request'), 0);
          if (lane === 8) {
            await command(t, '/compact', 'compaction_end'); await normal(t);
            assert.equal(entries(dir).filter(e => e.type === 'compaction').length, 2);
            assert.equal(entries(dir).findLast(e => e.type === 'compaction').details.migration.target.model, 'deepseek-reasoner');
          }
        } else await normal(t);
        if (lane !== 7) {
          const latest = entries(dir).findLast(e => e.type === 'compaction');
          if (variant === 'head') assert.equal(latest.details.piCompact.kind, 'text');
          const target = t.log().filter(e => e.event === 'actual-request' && e.phase === 'normal');
          assert.equal(target.length, 1);
          const raw = JSON.stringify(target[0].body.input ?? target[0].body.messages);
          assert(!raw.includes('encrypted_content')); assert(!raw.includes('SYNTHETIC_OPAQUE')); assert(!raw.includes('Codex remote checkpoint'));
          for (const fact of ['database=sqlite', 'retry=3', 'file=ledger.csv', 'timezone=Asia/Shanghai']) assert(raw.includes(fact), fact);
          if ([4,5,6].includes(lane)) assert.equal(count(t, 'source-request'), 0);
          if (lane === 6) {
            for (let i = 0; i < 12; i++) { assert(raw.includes(`FACT_${i}=value_${i}`)); assert(raw.includes(`FACT_TOOL_${i}=result_${i}`)); }
            assert(latest.details.piCompact.segments.length > 1);
          }
        }
        assert(readFileSync(join(dir, 'session.jsonl')).subarray(0, prefix.length).equals(prefix));
      }
      assert.equal(count(t, 'network-blocked'), 0);
      await t.capture('outcome');
      results.push({ lane, variant, pass: true, dir, source: sourceHashes(), remote: count(t, 'remote-request'), native: count(t, 'native-request'), sourceRequests: count(t, 'source-request'), normal: count(t, 'normal-request') });
    } catch (error) { await t.capture('failure'); results.push({ lane, variant, pass: false, dir, error: String(error), stack: error.stack }); }
    finally { await t.stop(); }
    writeFileSync(join(base, 'result.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ ...results.at(-1), source: undefined }));
  }
}
assert(results.every(item => item.pass), 'P4 lanes');
