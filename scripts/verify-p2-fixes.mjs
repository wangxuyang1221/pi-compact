import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tui, waitFor, root, provenance } from './fixture/runtime.mjs';
import { options, input, count } from './p2/common.mjs';
const base = join(root, 'artifacts/P2-fixes/regression-' + (process.env.P2_FIX_RUN ?? Date.now()));
assert(!existsSync(base), 'Use a new output directory');
mkdirSync(base, { recursive: true });
const screen = t => t.tmux('capture-pane', '-p', '-S', '-150', '-t', 'fixture');
const config = async (t, percent) => { await t.text('/compact-config threshold ' + percent); await waitFor(() => screen(t).includes('threshold: ' + percent + '%'), 'config'); };
const seed = async t => { await t.text('/p2-budget 1000'); await waitFor(() => count(t, 'budget'), 'seed'); };
const prompt = async (t, text = input) => { const n = count(t, 'agent_settled'); await t.text(text); await waitFor(() => count(t, 'agent_settled') > n, 'settled'); };
const journal = t => JSON.parse(readFileSync(join(t.dir, 'session.jsonl.pi-compact-state.json')));
const checkpoints = t => readFileSync(join(t.dir, 'session.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter(e => e.type === 'compaction').length;
const results = [];
for (const name of ['low-1', 'low-0.1', 'tools-1', 'tools-0.1', 'system-change', 'context-change', 'system-capacity', 'context-capacity', 'failure-retry', 'cancel-retry', 'corrupt-repair']) {
  const t = await tui(join(base, name), { ...options, tools: name.startsWith('tools-'), extensions: [...options.extensions, join(root, 'scripts/p2/hooks.ts')] });
  try {
    if (name.startsWith('low-') || name.startsWith('tools-')) await config(t, Number(name.split('-')[1]));
    if (name === 'system-change' || name === 'context-change') await config(t, 50);
    await seed(t);
    const before = readFileSync(join(t.dir, 'session.jsonl'));
    if (name.startsWith('tools-')) t.control({ mode: 'success', tools: true });
    if (name === 'system-change') t.control({ mode: 'success', systemSize: 22000 });
    if (name === 'context-change') t.control({ mode: 'success', contextSize: 22000 });
    if (name === 'system-capacity') t.control({ mode: 'success', systemSize: 38000 });
    if (name === 'context-capacity') t.control({ mode: 'success', contextSize: 38000 });
    if (name === 'corrupt-repair') {
      await config(t, 80);
      const file = join(t.dir, 'cwd/.pi/pi-compact.json');
      writeFileSync(file, '{broken'); await t.text(input);
      await waitFor(() => screen(t).includes('Cannot read pi-compact settings'), 'corrupt configuration rejected');
      assert.equal(count(t, 'normal-request'), 0);
      await config(t, 80); await prompt(t);
      assert.equal(count(t, 'normal-request'), 1); assert.equal(count(t, 'native-request'), 0); assert.equal(checkpoints(t), 0);
    } else if (name.endsWith('-retry')) {
      await config(t, 1);
      t.control({ mode: name === 'cancel-retry' ? 'delay' : 'failure' });
      await t.text(input);
      await waitFor(() => count(t, 'native-request'), 'summary entered');
      if (name === 'cancel-retry') t.key('Escape');
      await waitFor(() => count(t, 'compaction_end') && screen(t).replace(/\s+/g, ' ').includes('Use /compact to retry'), 'failure visible');
      assert.equal(journal(t).kind, 'blocked'); assert.equal(count(t, 'normal-request'), 0); assert.equal(checkpoints(t), 0);
      await t.text('BLOCKED_FOLLOWUP'); await t.text('/p2-state'); await waitFor(() => count(t, 'state'), 'blocked input processed'); assert.equal(count(t, 'normal-request'), 0);
      t.control({ mode: 'success' }); await t.text('/compact'); await waitFor(() => count(t, 'extension-success'), 'explicit retry');
      assert.equal(journal(t).kind, 'idle'); assert.equal(checkpoints(t), 1);
      await prompt(t, 'RETRY_FOLLOWUP'); assert.equal(count(t, 'normal-request'), 1);
    } else if (name.startsWith('tools-')) {
      await prompt(t);
      assert.equal(count(t, 'normal-request'), 2); assert.equal(count(t, 'native-request'), 2); assert.equal(checkpoints(t), 2);
      const events = t.log(); const completions = events.filter(e => e.event === 'public-tool-complete');
      assert.deepEqual(completions.map(e => e.name), ['gamma', 'beta', 'alpha']);
      assert(events.filter(e => e.event === 'native-request')[1].at > completions.at(-1).at);
      assert.equal(journal(t).kind, 'idle');
      await prompt(t, 'AFTER_TOOLS_MARKER'); assert.equal(count(t, 'normal-request'), 3); assert.equal(journal(t).kind, 'idle');
      assert.equal(count(t, 'native-request'), 3); assert.equal(checkpoints(t), 3);
    } else {
      await prompt(t);
      assert.equal(count(t, 'native-request'), 1); assert.equal(checkpoints(t), 1);
      assert.equal(count(t, 'public-before-agent-start'), 1); assert.equal(count(t, 'public-context'), 1);
      if (name.endsWith('capacity')) {
        assert.equal(count(t, 'normal-request'), 0); assert.equal(journal(t).kind, 'blocked');
        assert(readFileSync(join(t.dir, 'session.jsonl')).subarray(0, before.length).equals(before));
      } else {
        assert.equal(count(t, 'normal-request'), 1); assert.equal(journal(t).kind, 'idle');
        if (name === 'system-change') {
          assert(JSON.stringify(t.log().find(e => e.event === 'normal-request')).includes('SYSTEM_CHANGE_MARKER'));
          assert.equal(t.log().filter(e => e.event === 'transport-context').at(-1).roles.filter(role => role === 'system').length, 1);
          const logs = t.log(); assert(logs.find(e => e.event === 'fixture-success').at < logs.find(e => e.event === 'normal-request').at);
        }
        if (name === 'context-change') assert(JSON.stringify(t.log().find(e => e.event === 'normal-request')).includes('CONTEXT_CHANGE_MARKER'));
        await prompt(t, 'FOLLOWUP_INPUT_MARKER');
        assert.equal(count(t, 'normal-request'), 2); assert.equal(journal(t).kind, 'idle');
        assert.equal(count(t, 'native-request'), 1); assert.equal(checkpoints(t), 1);
      }
    }
    assert.equal(count(t, 'extension-success'), checkpoints(t));
    if (name !== 'corrupt-repair') assert.equal(count(t, 'public-context'), count(t, 'public-before-agent-start') + (name.startsWith('tools-') ? 1 : 0));
    await t.capture(name);
    results.push({ name, status: 'PASS', native: count(t, 'native-request'), normal: count(t, 'normal-request'), checkpoints: checkpoints(t), journal: existsSync(join(t.dir, 'session.jsonl.pi-compact-state.json')) ? journal(t) : { kind: 'idle', persisted: false } });
  } catch (error) {
    await t.capture('failure'); results.push({ name, status: 'FAIL', error: String(error), stack: error.stack });
  } finally { await t.stop(); }
  writeFileSync(join(base, 'result.json'), JSON.stringify({ provenance, results }, null, 2));
  console.log(JSON.stringify(results.at(-1)));
}
assert(results.every(result => result.status === 'PASS'), 'P2 boundary regressions');
