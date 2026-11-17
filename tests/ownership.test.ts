import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertSessionFileAvailable, claimSessionFile } from '../src/pi-adapter/journal.ts';

test('dead ownership recovers, live contenders fail, and disposal permits restart', () => {
  const dir = mkdtempSync(join(process.cwd(), 'artifacts/P1/ownership-'));
  const journal = join(dir, 'state.json');
  try {
    const dead = spawnSync(process.execPath, ['-e', '']);
    assert.equal(dead.status, 0);
    assert.throws(() => process.kill(dead.pid, 0), { code: 'ESRCH' });
    writeFileSync(journal + '.lock', JSON.stringify({ pid: dead.pid, nonce: 'old' }));
    const release = claimSessionFile(journal);
    const owned = readFileSync(journal + '.lock', 'utf8');
    assert.equal(JSON.parse(owned).pid, process.pid);
    assert.throws(() => claimSessionFile(journal), /already owns/);
    assert.equal(readFileSync(journal + '.lock', 'utf8'), owned);
    assert.equal(existsSync(journal + '.lock.claim'), false);
    release();
    claimSessionFile(journal)();
    assert.equal(existsSync(journal + '.lock'), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an interrupted acquisition is preserved and blocks both claims and unmanaged access', () => {
  const dir = mkdtempSync(join(process.cwd(), 'artifacts/P1/ownership-'));
  const journal = join(dir, 'state.json');
  try {
    for (const contents of ['', JSON.stringify({ pid: 2147483647, nonce: 'interrupted' })]) {
      writeFileSync(journal + '.lock.claim', contents);
      assert.throws(() => claimSessionFile(journal), /acquisition.*interrupted/);
      assert.throws(() => assertSessionFileAvailable(journal), /acquisition.*interrupted/);
      assert.equal(readFileSync(journal + '.lock.claim', 'utf8'), contents);
      assert.equal(existsSync(journal + '.lock'), false);
    }
    rmSync(journal + '.lock.claim');
    claimSessionFile(journal)();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('invalid owner records survive rejection without stranding an acquisition claim', () => {
  const dir = mkdtempSync(join(process.cwd(), 'artifacts/P1/ownership-'));
  const journal = join(dir, 'state.json');
  try {
    writeFileSync(journal + '.lock', '{');
    assert.throws(() => claimSessionFile(journal), SyntaxError);
    assert.equal(readFileSync(journal + '.lock', 'utf8'), '{');
    assert.equal(existsSync(journal + '.lock.claim'), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
