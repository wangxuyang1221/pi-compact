import './fixture/relative-socket.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { root, tui, waitFor, sourceHashes } from './fixture/runtime.mjs';
import { options, count, entries, token } from './p3/common.mjs';
const selected = process.argv.includes('--lane') ? Number(process.argv[process.argv.indexOf('--lane') + 1]) : undefined;
if (selected === 10) { await import('./p3/faults.mjs'); process.exit(); }
const base = join(root, 'artifacts/P3/runs', String(Date.now()));
mkdirSync(base, { recursive: true });
const results = [];
for (const lane of selected ? [selected] : [1,2,3,4,5,6,7,8,9]) {
  const t = await tui(join(base, 'lane-' + lane), { ...options, ...(lane === 5 ? { configure(dir) { options.configure(dir); unlinkSync(join(dir,'agent/auth.json')); const file=join(dir,'agent/models.json'); const config=JSON.parse(readFileSync(file)); config.providers['openai-codex'].apiKey=token; writeFileSync(file,JSON.stringify(config)); } } : {}) });
  try {
    await t.text('/p3-seed 8000'); await waitFor(() => count(t, 'seed'), 'seed');
    const before = readFileSync(join(t.dir, 'session.jsonl'));
    writeFileSync(join(t.dir, 'source-before.jsonl'), before);
    const mode = lane === 4 ? 'failure' : 'success';
    t.control({ mode, remote: [3,4].includes(lane) ? 'failure' : lane === 6 ? 'half' : lane === 9 ? 'delay' : 'success' });
    await t.text('/compact KEEP_CUSTOM_MARKER');
    if (lane === 9) { await waitFor(() => count(t, 'remote-request'), 'remote entered'); t.key('Escape'); }
    await waitFor(() => count(t, 'compaction_end'), 'compact ended');
    if ([4,9].includes(lane)) {
      assert.equal(count(t, 'extension-success'), 0); assert.equal(entries(t.dir).filter(e => e.type === 'compaction').length, 0);
      assert.equal(count(t, 'native-request'), lane === 4 ? 1 : 0);
      await t.text('CURRENT_INPUT_MARKER blocked'); await t.text('/p3-state'); await waitFor(() => count(t, 'state'), 'barrier');
      assert.equal(count(t, 'normal-request'), 0);
    } else {
      assert.equal(count(t, 'extension-success'), 1);
      assert.equal(count(t, 'native-request'), [3,5,6].includes(lane) ? 1 : 0);
      if ([7,8].includes(lane)) {
        await t.text('/p3-seed 4000'); await waitFor(() => count(t, 'seed') === 2, 'second history');
        t.control({ mode: 'success', remote: lane === 8 ? 'failure' : 'success' });
        await t.text('/compact'); await waitFor(() => count(t, 'compaction_end') === 2, 'second compact');
        assert.equal(count(t, 'extension-success'), 2);
      }
      await t.text('CURRENT_INPUT_MARKER continue'); await waitFor(() => count(t, 'agent_settled'), 'continued');
      assert.equal(count(t, 'normal-request'), 1);
      const request = t.log().find(e => e.event === 'normal-request');
      const opaque = request.input.filter(item => item.type === 'compaction');
      assert.equal(opaque.length, [3,5,6,8].includes(lane) ? 0 : 1);
      if (opaque.length) {
        const checkpoint = entries(t.dir).findLast(e => e.type === 'compaction').details.piCompact;
        const start = request.input.findIndex(item => item.id === checkpoint.items[0].id);
        assert.deepEqual(request.input.slice(start, start + checkpoint.items.length), checkpoint.items);
      }
    }
    assert(readFileSync(join(t.dir, 'session.jsonl')).subarray(0, before.length).equals(before));
    assert.equal(count(t, 'network-blocked'), 0);
    await t.capture('outcome');
    results.push({ lane, pass: true, dir: t.dir, source: sourceHashes(), remote: count(t,'remote-request'), native: count(t,'native-request'), normal: count(t,'normal-request') });
  } catch (error) { await t.capture('failure'); results.push({ lane, pass: false, dir: t.dir, error: String(error), stack: error.stack }); }
  finally { await t.stop(); }
  console.log(JSON.stringify({ ...results.at(-1), source: undefined }));
  writeFileSync(join(base,'result.json'),JSON.stringify(results,null,2));
}
assert(results.every(r=>r.pass), 'P3 lanes');

if (!selected || selected === 1) await import('./p3/edges.mjs');
if (!selected) await import('./p3/faults.mjs');
