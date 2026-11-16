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

export function claimSessionFile(journal: string): () => void {
  const file = journal + '.lock';
  const identity = JSON.stringify({ pid: process.pid, nonce: randomUUID() });
  const create = () => {
    const fd = openSync(file, 'wx', 0o600);
    try { writeFileSync(fd, identity); } finally { closeSync(fd); }
  };
  try { create(); } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') throw error;
    const owner: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!owner || typeof owner !== 'object' || !('pid' in owner) || !Number.isSafeInteger(owner.pid) || Number(owner.pid) <= 0) throw new Error('Invalid session lock.');
    let alive = true;
    try { process.kill(Number(owner.pid), 0); } catch (probe) {
      if (probe && typeof probe === 'object' && 'code' in probe && probe.code === 'ESRCH') alive = false;
    }
    if (alive) throw new Error('Another process already owns this session file.');
    unlinkSync(file);
    create();
  }
  return () => { if (readFileSync(file, 'utf8') === identity) unlinkSync(file); };
}
