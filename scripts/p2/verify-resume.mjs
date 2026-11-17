import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, tui, waitFor } from '../fixture/runtime.mjs';
import { options, input, count } from './common.mjs';
export async function verifyResume(pairs = 30) {
  const dir = join(root, 'artifacts/P2/resume-perf', String(Date.now())); mkdirSync(dir, { recursive: true }); const samples = [];
  for (let index = 0; index < pairs; index++) {
    const t = await tui(join(dir, String(index)), { ...options, mode: 'delay', captureReady: false });
    try {
      await t.text('/p2-budget 9000'); await waitFor(() => count(t, 'budget'), 'resume budget');
      await t.text(input); await waitFor(() => count(t, 'native-request'), 'resume summary'); t.control({ mode: 'success' });
      await waitFor(() => count(t, 'agent_settled'), 'resume continuation');
      assert.equal(count(t, 'native-request'), 1); assert.equal(count(t, 'normal-request'), 1); assert.equal(count(t, 'network-blocked'), 0);
      const events = t.log(); const end = events.find(e => e.event === 'fixture-success'); const request = events.find(e => e.event === 'normal-request');
      assert(events.find(e => e.event === 'compaction_end').success);
      samples.push({ index, ms: request.at - end.at, normalRequests: 1, nativeRequests: 1, errors: 0 });
    } finally { await t.stop(); }
    writeFileSync(join(dir, 'samples.json'), JSON.stringify(samples, null, 2));
    if ((index + 1) % 5 === 0) console.log('Resume samples ' + (index + 1));
  }
  const values = samples.map(s => s.ms).sort((a,b) => a-b);
  const result = { path: dir, count: pairs, min: values[0], median: values[Math.floor(values.length / 2)], p95: values[Math.ceil(values.length * .95) - 1], max: values.at(-1), pass: values[Math.ceil(values.length * .95) - 1] <=500 };
  writeFileSync(join(root, 'artifacts/P2/resume-perf-results.json'), JSON.stringify(result, null, 2)); assert(result.pass, 'fixture success to continuation p95'); return result;
}
if (process.argv[1]?.endsWith('verify-resume.mjs')) console.log(JSON.stringify(await verifyResume()));
