import test from 'node:test';
import assert from 'node:assert/strict';
import { CompactionController, type StoredState } from '../src/state.ts';

for (const begin of [true, false]) {
  test(`failed block persistence reports recovery guarantee with begin=${begin}`, () => {
    let durable: StoredState = { kind: 'idle' };
    const controller = new CompactionController(state => {
      if (state.kind === 'blocked') throw new Error('synthetic EIO');
      durable = structuredClone(state);
    }, durable);
    if (begin) controller.begin(false);
    const outcome = controller.block('failed', 'synthetic failure');
    assert.throws(() => controller.assertIdle());
    assert.deepEqual(outcome, { kind: 'failed', error: 'Error: synthetic EIO', recoveryBlocked: begin });
    const restored = new CompactionController(() => {}, durable);
    assert.equal(restored.state.kind, begin ? 'blocked' : 'idle');
    assert.match(controller.message(), begin ? /previous durable/ : /not durable/);
  });
}

import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readJournal, writeJournal } from '../src/pi-adapter/journal.ts';
mkdirSync(join(process.cwd(), 'artifacts/P1-fixes'), { recursive: true });

for (const begin of [true, false]) {
  test(`unwritable journal keeps a truthful recovery result with begin=${begin}`, () => {
    const dir = mkdtempSync(join(process.cwd(), 'artifacts/P1-fixes/persistence-'));
    try {
      const file = join(dir, 'state.json');
      writeJournal(file, { kind: 'idle' });
      const controller = new CompactionController(state => writeJournal(file, state), readJournal(file));
      if (begin) controller.begin(false);
      mkdirSync(`${file}.${process.pid}.tmp`);
      const outcome = controller.block('failed', 'synthetic durable write fault');
      assert.throws(() => controller.assertIdle());
      assert.equal(outcome.kind, 'failed');
      if (outcome.kind !== 'failed') throw new Error('Expected persistence failure');
      assert.equal(outcome.recoveryBlocked, begin);
      assert.match(outcome.error, /EISDIR/);
      assert.equal(readJournal(file)?.kind, begin ? 'running' : 'idle');
      assert.equal(new CompactionController(() => {}, readJournal(file)).state.kind, begin ? 'blocked' : 'idle');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
