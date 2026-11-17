import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tui, waitFor, root, provenance } from './fixture/runtime.mjs';
import { options, count, input } from './p2/common.mjs';
const base = join(root, 'artifacts/P2-reconstruction/run-' + Date.now());
mkdirSync(base, { recursive: true });
const kinds = process.argv.includes('--mixed') ? ['modify-and-copy'] : process.argv.includes('--minimal') ? ['duplicate', 'tool-modify'] :
  ['duplicate', 'tool-modify', 'modify-and-copy', 'clone', 'clone-duplicate', 'same-reference', 'in-place', 'in-place-array', 'multi-tool', 'tool-call-modify', 'tool-reorder', 'modify', 'remove', 'reorder', 'system', 'retained-delete', 'cross-cut', 'tool-capacity'];
const results = [];
for (const kind of kinds) {
  const t = await tui(join(base, kind), { ...options, extensions: [...options.extensions, join(root, 'scripts/p2/reconstruction-hooks.ts')],
    ...(kind === 'retained-delete' || kind === 'cross-cut' ? { compaction: { keepRecentTokens: 200 } } : {}) });
  try {
    t.control({ mode: 'success', probe: kind });
    await t.text('/compact-config threshold 1');
    await waitFor(() => t.tmux('capture-pane', '-p', '-t', 'fixture').includes('threshold: 1%'), 'config');
    await t.text('/ind-seed'); await waitFor(() => count(t, 'ind-seeded'), 'seed');
    const history = readFileSync(join(t.dir, 'session.jsonl'));
    await t.text(input); await waitFor(() => count(t, 'agent_settled'), 'settled');
    const events = t.log();
    const journal = JSON.parse(readFileSync(join(t.dir, 'session.jsonl.pi-compact-state.json')));
    const checkpoints = readFileSync(join(t.dir, 'session.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter(e => e.type === 'compaction');
    assert.equal(count(t, 'network-blocked'), 0);
    assert.equal(count(t, 'ind-hook'), 1);
    assert.equal(count(t, 'ind-before'), 1);
    assert.equal(count(t, 'native-request'), 1);
    assert.equal(checkpoints.length, 1);
    assert.equal(count(t, 'extension-success'), 1);
    const entries = readFileSync(join(t.dir, 'session.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const cut = entries.findIndex(e => e.id === checkpoints[0].firstKeptEntryId);
    if (kind === 'retained-delete') assert(entries.slice(cut).some(e => e.type === 'message' && JSON.stringify(e.message).includes('RECENT_HOOK_MARKER')), 'deletion covers canonical retained message');
    if (kind === 'cross-cut') {
      const duplicates = entries.flatMap((e, i) => e.type === 'message' && JSON.stringify(e.message).includes('OLD_HOOK_MARKER') ? [i] : []);
      assert.equal(duplicates.length, 2);
      assert(duplicates[0] < cut && duplicates[1] >= cut, 'identical sources straddle compaction cutoff');
    }
    const normal = events.filter(e => e.event === 'normal-request');
    if (kind === 'tool-capacity') {
      assert.equal(normal.length, 0);
      assert.equal(journal.kind, 'blocked');
      assert(readFileSync(join(t.dir, 'session.jsonl')).subarray(0, history.length).equals(history));
    } else {
      assert.equal(normal.length, 1);
      assert.equal(journal.kind, 'idle');
      const body = normal[0].input, text = JSON.stringify(body);
      assert(text.includes('CURRENT_INPUT_MARKER'));
      assert.equal(text.split('Synthetic native summary.').length - 1, 1);
      if (['duplicate', 'same-reference', 'clone-duplicate', 'cross-cut'].includes(kind)) assert(text.includes('OLD_HOOK_MARKER'), 'preserve added or ambiguous occurrence');
      if (kind === 'clone') assert(!text.includes('OLD_HOOK_MARKER'), 'unchanged cloned history can compact');
      if (kind === 'modify-and-copy') assert(text.includes('OLD_HOOK_MARKER') && text.includes('MODIFIED_HOOK_MARKER'), 'preserve modified source and added clone together');
      if (['modify', 'in-place', 'in-place-array'].includes(kind)) assert(text.includes('MODIFIED_HOOK_MARKER'));
      if (['remove', 'retained-delete'].includes(kind)) assert(!text.includes('RECENT_HOOK_MARKER'), 'do not restore hook deletion');
      if (kind === 'system') assert(text.includes('INDEPENDENT_SYSTEM'));
      if (kind === 'reorder') {
        assert(text.indexOf('ADDED_FIRST') < text.indexOf('CURRENT_INPUT_MARKER'));
        assert(JSON.stringify(body.at(-1)).includes('ADDED_LAST'));
      }
      const calls = body.filter(m => m.type === 'function_call'), outputs = body.filter(m => m.type === 'function_call_output');
      for (const output of outputs) {
        const call = calls.find(m => m.call_id === output.call_id);
        assert(call, 'actual transport result must have call ' + output.call_id);
        assert(body.indexOf(call) < body.indexOf(output), 'call precedes result');
      }
      for (const call of calls) assert.equal(outputs.filter(m => m.call_id === call.call_id).length, 1, 'complete tool batch');
      if (['tool-modify', 'multi-tool', 'tool-reorder'].includes(kind)) assert(text.includes('MODIFIED_TOOL_MARKER'));
      if (kind === 'tool-call-modify') assert(text.includes('MODIFIED_ARGUMENT_MARKER'));
      if (['multi-tool', 'tool-call-modify', 'tool-reorder'].includes(kind)) assert.equal(calls.length, 3);
    }
    results.push({ kind, status: 'PASS', native: count(t, 'native-request'), normal: normal.length, checkpoints: checkpoints.length, journal });
  } catch (error) {
    results.push({ kind, status: 'FAIL', error: String(error), stack: error.stack });
    await t.capture('failure');
  } finally { await t.stop(); }
  writeFileSync(join(base, 'result.json'), JSON.stringify({ provenance, results }, null, 2));
  console.log(JSON.stringify(results.at(-1)));
}
console.log(base);
assert(results.every(r => r.status === 'PASS'), 'request reconstruction');
