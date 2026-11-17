import assert from 'node:assert/strict';
import { join } from 'node:path';
import { cli, root } from './fixture/runtime.mjs';
const dir = join(root, 'artifacts/P5-development/disposal', String(Date.now()));
const result = await cli(dir, { variant: 'baseline', observer: false,
  extensions: [join(root, 'scripts/p5/disposal.ts'), join(root, 'src/index.ts'), join(root, 'scripts/regressions/observer.ts')] });
const evidence = result.events.find(e => e.event === 'p5-disposed');
assert(evidence, 'real disposal callback observed');
for (const key of ['uiRegistryReleased', 'safetyRegistryReleased', 'addRestored', 'disposeRestored', 'lockReleased']) assert(evidence[key], key);
assert.equal(result.code, 0);
assert.equal(result.events.filter(e => e.event === 'normal-request').length, 1);
assert.equal(result.events.filter(e => e.event === 'native-request').length, 0);
console.log(dir);
