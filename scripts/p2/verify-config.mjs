import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { tui, root, waitFor, provenance } from '../fixture/runtime.mjs';
import { options, count } from './common.mjs';
const ns = () => process.hrtime.bigint().toString();
const delta = (end, start) => Number(BigInt(end) - BigInt(start)) / 1e6;
export const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1) };
};
export async function verifyConfig(base, rounds = 15) {
  mkdirSync(base, { recursive: true });
  const samples = [], readiness = [];
  writeFileSync(join(base, 'method.json'), JSON.stringify({ provenance, rounds, sizes: [1000, 10000],
    timing: 'hrtime.bigint before send-keys Enter through first stdout write containing unique current result; handler and capture separate',
    readiness: 'perf-seed completed, native editor visible, then public ready command acknowledged in terminal before measured commands',
    source: 'Adapted from independent P2-perf-investigation probe and trace. No startup samples are scored.' }, null, 2));
  for (const size of [1000, 10000]) {
    const dir = join(base, String(size));
    const traceFile = join(dir, 'trace.json');
    const t = await tui(dir, { ...options, captureReady: false,
      extensions: [...options.extensions, join(root, 'scripts/p2/perf-observer.ts'), join(root, 'scripts/p2/config-observer.ts')],
      extraEnv: { PI_P2_MESSAGES: String(size), PI_CONFIG_TRACE: traceFile,
        NODE_OPTIONS: `--import=${join(root, 'scripts/fixture/preload.mjs')} --import=${join(root, 'scripts/p2/config-trace.mjs')}` },
      configure(path) { options.configure(path); const file = join(path, 'agent/models.json'); const data = JSON.parse(readFileSync(file)); data.providers.fixture.models[0].contextWindow = 200000; writeFileSync(file, JSON.stringify(data)); },
    });
    const rows = [];
    try {
      await waitFor(() => count(t, 'perf-seed'), 'complete synthetic seed');
      assert.equal(t.log().find(e => e.event === 'perf-seed').messages, size);
      const start = ns();
      await t.text('/p2-perf-ready');
      await waitFor(() => t.tmux('capture-pane', '-p', '-t', 'fixture').includes('P2_PERF_INITIALIZED'), 'native initialization acknowledged');
      readiness.push({ size, start, acknowledged: ns(), screen: t.tmux('capture-pane', '-p', '-t', 'fixture') });
      for (let index = 0; index < rounds; index++) for (const kind of ['set', 'view']) {
        const percent = Number((60 + (samples.length + rows.length) / 100).toFixed(2));
        if (kind === 'view') writeFileSync(join(dir, 'cwd/.pi/pi-compact.json'), JSON.stringify({ thresholdPercent: percent }));
        const command = kind === 'set' ? `/compact-config threshold ${percent}` : '/compact-config';
        writeFileSync(join(dir, 'input.txt'), command);
        t.tmux('load-buffer', '-b', 'input', join(dir, 'input.txt'));
        t.tmux('paste-buffer', '-p', '-b', 'input', '-t', 'fixture');
        const enterStart = ns(); t.key('Enter'); const enterReturn = ns();
        let screen;
        await waitFor(() => { screen = t.tmux('capture-pane', '-p', '-t', 'fixture'); return screen.includes(`threshold: ${percent}%`); }, 'unique current configuration');
        const observed = ns();
        rows.push({ size, index, kind, percent, enterStart, enterReturn, observed });
        writeFileSync(join(dir, `screen-${index}-${kind}.txt`), screen);
      }
      assert.equal(count(t, 'normal-request') + count(t, 'native-request') + count(t, 'network-blocked'), 0);
    } finally { await t.stop(); }
    const trace = JSON.parse(readFileSync(traceFile));
    for (const row of rows) {
      const eligible = event => BigInt(event.ns) >= BigInt(row.enterStart) && BigInt(event.ns) <= BigInt(row.observed);
      const handlers = trace.filter(event => event.event === 'handler-entry' && eligible(event));
      assert.equal(handlers.length, 1);
      const notify = trace.find(event => event.event === 'notify' && eligible(event));
      assert.equal(notify.type, 'info'); assert(notify.message.includes(`threshold: ${row.percent}%`));
      const returned = trace.find(event => event.event === 'handler-return' && eligible(event));
      const frame = trace.find(event => event.event === 'stdout-entry' && BigInt(event.ns) >= BigInt(notify.ns) && stripVTControlCharacters(event.text).includes(`threshold: ${row.percent}%`));
      assert(frame); assert(BigInt(frame.ns) <= BigInt(row.observed));
      const stdin = trace.filter(event => event.event === 'stdin' && event.text.includes('\r') && BigInt(event.ns) <= BigInt(handlers[0].ns)).at(-1);
      assert(stdin);
      samples.push({ ...row, outputNs: frame.ns, stdinNs: stdin.ns, handlerMs: delta(returned.ns, handlers[0].ns),
        enterToOutputMs: delta(frame.ns, row.enterStart), enterIpcMs: delta(row.enterReturn, row.enterStart),
        enterToStdinMs: delta(stdin.ns, row.enterStart), captureMs: delta(row.observed, frame.ns), enterToCaptureMs: delta(row.observed, row.enterStart) });
    }
    writeFileSync(join(base, 'samples.json'), JSON.stringify(samples, null, 2));
  }
  const byKind = ['set', 'view'].map(kind => ({ kind, enterToOutput: stats(samples.filter(row => row.kind === kind).map(row => row.enterToOutputMs)),
    handler: stats(samples.filter(row => row.kind === kind).map(row => row.handlerMs)), capture: stats(samples.filter(row => row.kind === kind).map(row => row.enterToCaptureMs)) }));
  const result = { readiness, byKind, samples: samples.length, errors: 0, pass: byKind.every(row => row.enterToOutput.p95 <= 100) };
  writeFileSync(join(base, 'result.json'), JSON.stringify(result, null, 2));
  return result;
}
