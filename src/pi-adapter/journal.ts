import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import type { StoredState } from '../state.ts';

export function readJournal(file: string): StoredState | undefined {
  if (!existsSync(file)) return undefined;
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || !('kind' in value) || !['idle', 'running', 'blocked'].includes(String(value.kind))) {
    throw new Error('Invalid pi-compact recovery state.');
  }
  return value as StoredState;
}

export function writeJournal(file: string, state: StoredState): void {
  const temporary = `${file}.${process.pid}.tmp`;
  const fd = openSync(temporary, 'w', 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(state)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, file);
  const directory = openSync(dirname(file), 'r');
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

export function confirmEntry(file: string, entry: { id: string }): void {
  const fd = openSync(file, 'r');
  try {
    const lines = readFileSync(fd, 'utf8').trimEnd().split('\n');
    const persisted: unknown = lines.map(line => JSON.parse(line)).find(value => value.id === entry.id);
    if (JSON.stringify(persisted) !== JSON.stringify(entry)) throw new Error('Native compaction entry failed readback.');
    fsyncSync(fd);
  } finally { closeSync(fd); }
}

export function assertSessionFileAvailable(journal: string): void {
  if (existsSync(journal + '.lock.claim')) throw new Error('Session lock acquisition is in progress or was interrupted. Stop all session writers before removing ' + journal + '.lock.claim');
  assertOwnerInactive(journal);
}

function assertOwnerInactive(journal: string): void {
  let contents: string;
  try { contents = readFileSync(journal + '.lock', 'utf8'); } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
  const owner: unknown = JSON.parse(contents);
  if (!owner || typeof owner !== 'object' || !('pid' in owner) || !Number.isSafeInteger(owner.pid) || Number(owner.pid) <= 0) throw new Error('Invalid session lock.');
  try { process.kill(Number(owner.pid), 0); } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH') return;
  }
  throw new Error('Another process already owns this session file.');
}

export function claimSessionFile(journal: string): () => void {
  const file = journal + '.lock';
  const identity = JSON.stringify({ pid: process.pid, nonce: randomUUID() });
  const create = () => {
    const fd = openSync(file, 'wx', 0o600);
    try { writeFileSync(fd, identity); } finally { closeSync(fd); }
  };
  let claim: number;
  try { claim = openSync(file + '.claim', 'wx', 0o600); } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      throw new Error('Session lock acquisition is in progress or was interrupted. Stop all session writers before removing ' + file + '.claim');
    }
    throw error;
  }
  try {
    writeFileSync(claim, identity);
    try { create(); } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') throw error;
      assertOwnerInactive(journal);
      unlinkSync(file);
      create();
    }
  } finally {
    closeSync(claim);
    unlinkSync(file + '.claim');
  }
  return () => { if (readFileSync(file, 'utf8') === identity) unlinkSync(file); };
}
