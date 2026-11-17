import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultThresholdPercent, nativeThresholdReserve, parseThreshold, thresholdTokens } from '../src/policy.ts';
import { readSettings, saveThreshold, settingsPath } from '../src/settings.ts';

test('inclusive percentage threshold uses the first integer token at or above the percentage', () => {
  for (const [window, percent, expected] of [[10000, 90, 9000], [10001, 90, 9001], [20000, 80, 16000], [10000, 89.99, 8999]]) {
    assert.equal(thresholdTokens(window, percent), expected);
    const reserve = nativeThresholdReserve(window, percent);
    assert.equal(expected - 1 > window - reserve, false);
    assert.equal(expected > window - reserve, true);
    assert.equal(expected + 1 > window - reserve, true);
  }
  assert.equal(defaultThresholdPercent, 90);
});

test('invalid percentages cannot replace the previous project setting', () => {
  const dir = mkdtempSync(join(process.cwd(), 'artifacts/P2/settings-test-'));
  try {
    assert.deepEqual(readSettings(dir), { kind: 'valid', percent: 90, source: 'default', path: settingsPath(dir) });
    saveThreshold(dir, 80);
    const before = readFileSync(settingsPath(dir), 'utf8');
    for (const value of [0, 100, -1, NaN, Infinity, -Infinity, '90', null]) {
      assert.throws(() => parseThreshold(value));
      assert.throws(() => saveThreshold(dir, value as number));
      assert.equal(readFileSync(settingsPath(dir), 'utf8'), before);
    }
    assert.equal(readSettings(dir).kind, 'valid');
    assert.equal(parseThreshold(0.01), 0.01);
    assert.equal(parseThreshold(99.99), 99.99);
    for (const data of ['{', 'null', '[]', '{"thresholdPercent":100}', '{"thresholdPercent":"80"}']) {
      writeFileSync(settingsPath(dir), data);
      const result = readSettings(dir);
      assert.equal(result.kind, 'invalid');
      if (result.kind === 'invalid') assert.match(result.error, /Cannot read pi-compact settings/);
    }
    saveThreshold(dir, 75);
    assert.deepEqual(readSettings(dir), { kind: 'valid', percent: 75, source: 'project', path: settingsPath(dir) });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
