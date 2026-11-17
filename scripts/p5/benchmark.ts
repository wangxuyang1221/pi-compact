import * as host from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1) };
};
export function benchmark(mode, output, profile = false) {
  const component = mode.chatContainer.children.findLast(child => child instanceof host.CompactionSummaryMessageComponent);
  assert(component, 'benchmark uses actual CLI component');
  component.setExpanded(false);
  const message = { ...component.message };
  assert.equal(message.summary, 'Synthetic native summary.');
  const baseline = new host.CompactionSummaryMessageComponent(message, host.getMarkdownTheme(), mode.outputPad);
  const records = [];
  let checksum = 0;
  for (const width of [20, 90, 120]) {
    for (const operation of ['render', 'resize']) {
      const invoke = (target, cols) => { if (operation === 'resize') target.invalidate(); return target.render(cols); };
      for (let group = 0; group < (profile ? 1 : 5); group++) {
        for (let warm = 0; warm < 200; warm++) { invoke(baseline, width); invoke(component, width); }
        const samples = { baseline: [], head: [], added: [] };
        for (let iteration = 0; iteration < (profile ? 10000 : 1000); iteration++) {
          const cols = operation === 'resize' && iteration % 2 ? width - 1 : width;
          const pair = {};
          for (const side of (iteration + group) % 2 ? ['head', 'baseline'] : ['baseline', 'head']) {
            const start = performance.now();
            const lines = invoke(side === 'head' ? component : baseline, cols);
            const duration = performance.now() - start;
            samples[side].push(duration);
            pair[side] = duration;
            assert(lines.every(line => visibleWidth(line) <= cols), `${side} output fits ${cols}`);
            assert(lines.join('').includes(side === 'head' ? 'Context compacte' : '[compaction]'), `${side} did real work`);
            checksum += lines.reduce((total, line) => total + line.length, 0);
          }
          samples.added.push(pair.head - pair.baseline);
        }
        records.push({ width, operation, group, baseline: stats(samples.baseline), head: stats(samples.head), added: stats(samples.added), samples });
      }
    }
  }
  const pass = records.every(r => r.head.p95 - r.baseline.p95 <= 2 && r.added.p95 <= 2);
  writeFileSync(output, JSON.stringify({ pass, errors: 0, checksum, samplesPerSide: profile ? 10000 : 1000, groups: profile ? 1 : 5, records }));
  assert(pass, 'render and resize added p95 <= 2ms');
}
