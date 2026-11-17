import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, symlinkSync, rmdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tui, root, waitFor, provenance } from './fixture/runtime.mjs';
import { options, input, count } from './p2/common.mjs';
const flags = process.argv.slice(2);
const selected = flags.includes('--lane') ? Number(flags[flags.indexOf('--lane') + 1]) : undefined;
const base = join(root, 'artifacts/P2');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const screen = t => t.tmux('capture-pane', '-p', '-S', '-120', '-t', 'fixture');
const textSeen = (t, text) => waitFor(() => screen(t).includes(text), text);
const seed = async (t, tokens) => { await t.text('/p2-budget ' + tokens); await waitFor(() => count(t, 'budget'), 'budget seed'); assert.equal(t.log().find(e => e.event === 'budget').actual, tokens); };
const prompt = async t => { await t.text(input); await waitFor(() => count(t, 'agent_settled'), 'prompt settles'); };
const compact = async t => { await t.text('/compact KEEP_CUSTOM_MARKER'); await waitFor(() => count(t, 'compaction_end'), 'manual compact'); };
const checkpoint = t => assert.equal(t.log().findLast(e => e.event === 'compaction_end')?.success, true);
const lanes = {
  async 1(dir) {
    const results = [];
    for (const variant of ['baseline', 'head']) for (const tokens of [7999, 8000, 8001, 8999, 9000]) {
      const t = await tui(join(dir, `${variant}-${tokens}`), { ...options, variant, compaction: { reserveTokens: 2000 } });
      try { t.control({ mode: 'success', usageTokens: tokens }); await seed(t, tokens); await prompt(t); const n = count(t, 'native-request'); assert.equal(n, variant === 'baseline' ? Number(tokens > 8000) : Number(tokens >= 9000));
        assert.equal(count(t, 'normal-request'), 1); results.push({ variant, tokens, compactions: n }); await t.capture('threshold');
      } finally { await t.stop(); }
    }
    writeFileSync(join(dir, 'thresholds.json'), JSON.stringify(results, null, 2));
    copyFileSync(join(dir, 'head-9000/threshold.png'), join(dir, 'threshold.png'));
  },
  async 2(dir) {
    const t = await tui(dir, options);
    try { await seed(t, 8999); await prompt(t); assert.equal(count(t, 'native-request'), 0); assert.equal(count(t, 'normal-request'), 1); await t.capture('below'); }
    finally { await t.stop(); }
  },
  async 3(dir) {
    const t = await tui(dir, options);
    try { await seed(t, 9000); await prompt(t); checkpoint(t); assert.equal(count(t, 'native-request'), 1); assert.equal(count(t, 'normal-request'), 1); await t.capture('exact'); }
    finally { await t.stop(); }
  },
  async 4(dir) {
    const first = await tui(join(dir, 'configure'), options);
    try { await first.text('/compact-config'); await textSeen(first, '90%'); await first.text('/compact-config threshold 80'); await textSeen(first, '80%'); await first.capture('config'); }
    finally { await first.stop(); }
    const restart = await tui(join(dir, 'restart'), { ...options, configure(path) { options.configure(path); rmdirSync(join(path, 'cwd')); symlinkSync(join(first.dir, 'cwd'), join(path, 'cwd')); }, sessionFile: join(first.dir, 'session.jsonl') });
    try { await restart.text('/compact-config'); await textSeen(restart, '80%'); await textSeen(restart, '8000 tokens'); await seed(restart, 8000); await prompt(restart); checkpoint(restart); await restart.capture('config'); copyFileSync(join(restart.dir, 'config.png'), join(dir, 'config.png')); }
    finally { await restart.stop(); }
  },
  async 5(dir) {
    const t = await tui(dir, options);
    try {
      await t.text('/compact-config threshold 80'); await textSeen(t, '80%');
      const file = join(dir, 'cwd/.pi/pi-compact.json'); const before = readFileSync(file);
      for (const bad of ['0', '100', '-1', 'NaN', 'Infinity', 'nope', '90 extra']) {
        await t.text('/compact-config threshold ' + bad); await pause(80); assert(readFileSync(file).equals(before));
      }
      await t.capture('invalid-values'); writeFileSync(file, '{broken');
      await t.text('/compact-config'); await textSeen(t, 'Cannot read pi-compact settings');
      await t.text(input); await waitFor(() => count(t, 'agent_settled'), 'corrupt config request'); assert.equal(count(t, 'normal-request'), 0); assert.equal(readFileSync(file, 'utf8'), '{broken');
      await t.capture('invalid'); await t.text('/compact-config threshold 80'); await textSeen(t, '80%'); assert.equal(JSON.parse(readFileSync(file)).thresholdPercent, 80);
    } finally { await t.stop(); }
  },
  async 6(dir) {
    const t = await tui(dir, options);
    try {
      await t.text('/compact-config'); await textSeen(t, '9000 tokens');
      await t.text('/model fixture/fixture-wide'); await waitFor(() => count(t, 'model-select'), 'model switch');
      await t.text('/compact-config'); await textSeen(t, '18000 tokens'); await seed(t, 9000); await prompt(t); assert.equal(count(t, 'native-request'), 0); await t.capture('window');
    } finally { await t.stop(); }
  },
  async 7(dir) {
    const t = await tui(dir, options);
    try { await seed(t, 1000); await compact(t); checkpoint(t); assert.equal(count(t, 'native-request'), 1); assert.equal(t.log().find(e => e.event === 'native-request').instructions, true); assert.equal(count(t, 'normal-request'), 0); await t.capture('manual'); }
    finally { await t.stop(); }
  },
  async 8(dir) {
    const t = await tui(dir, { ...options, extraArgs: ['--provider', 'deepseek', '--model', 'deepseek-chat'] });
    try { await seed(t, 1000); await compact(t); checkpoint(t); const requests = t.log().filter(e => e.event === 'native-request'); assert.equal(requests.length, 1); assert.equal(requests[0].model, 'deepseek-chat'); assert(requests[0].url.includes('/chat/completions')); assert.equal(count(t, 'normal-request'), 0); await t.capture('deepseek'); }
    finally { await t.stop(); }
  },
  async 9(dir) {
    const t = await tui(dir, { ...options, mode: 'delay' });
    try { await seed(t, 9000); await t.text(input); await waitFor(() => count(t, 'native-request'), 'delayed native request');
      const began = Date.now(); while (Date.now() - began < 62000) { await pause(1000); if (Math.round((Date.now() - began) / 1000) % 15 === 0) console.log('Lane 9 remains pending after ' + Math.round((Date.now() - began) / 1000) + ' seconds'); assert.equal(count(t, 'compaction_end'), 0); assert.equal(count(t, 'normal-request'), 0); }
      await t.capture('pending'); t.control({ mode: 'success' }); await waitFor(() => count(t, 'agent_settled'), 'delayed success'); checkpoint(t); assert.equal(count(t, 'native-request'), 1); assert.equal(count(t, 'normal-request'), 1); await t.capture('wait');
      const logs = t.log(); assert(logs.find(e => e.event === 'fixture-success').at - logs.find(e => e.event === 'native-request').at > 60000);
    } finally { await t.stop(); }
  },
  async 10(dir) {
    const t = await tui(dir, { ...options, mode: 'delay' });
    try { await t.text('/compact-config threshold 80'); await textSeen(t, '80%'); await seed(t, 8000); const file = join(dir, 'session.jsonl'); const before = readFileSync(file);
      writeFileSync(join(dir, 'before.jsonl'), before); await t.text(input); await waitFor(() => count(t, 'native-request'), 'cancel pending'); const cancelled = performance.now(); t.key('Escape');
      await waitFor(() => count(t, 'compaction_end'), 'cancelled compaction'); assert(performance.now() - cancelled < 2000); assert.equal(t.log().findLast(e => e.event === 'compaction_end').success, false); assert.equal(count(t, 'normal-request'), 0);
      const after = readFileSync(file); writeFileSync(join(dir, 'after.jsonl'), after); assert(after.subarray(0, before.length).equals(before)); assert.equal(JSON.parse(readFileSync(join(dir, 'cwd/.pi/pi-compact.json'))).thresholdPercent, 80); await t.capture('cancel');
    } finally { await t.stop(); }
  },
};
mkdirSync(base, { recursive: true }); const results = [];
for (const [number, run] of Object.entries(lanes)) {
  if (selected && Number(number) !== selected) continue;
  const dir = join(base, 'lane-' + number);
  if (existsSync(dir)) { mkdirSync(join(base, 'attempts'), { recursive: true }); renameSync(dir, join(base, 'attempts', Date.now() + '-lane-' + number)); }
  mkdirSync(dir, { recursive: true });
  try { await run(dir); results.push({ lane: Number(number), status: 'PASS' }); }
  catch (error) { results.push({ lane: Number(number), status: 'FAIL', error: String(error), stack: error.stack }); }
  const verdict = { ...results.at(-1), provenance, head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() };
  writeFileSync(join(dir, 'verdict.json'), JSON.stringify(verdict, null, 2)); console.log(JSON.stringify(results.at(-1)));
}
writeFileSync(join(base, selected ? `lane-${selected}-run.json` : 'live-results.json'), JSON.stringify(results, null, 2));
assert(results.every(r => r.status === 'PASS'), 'P2 live lanes');
