import { closeSync, existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { writeJournal } from './journal.ts';

export type Pending = { kind: 'running'; operationId: string; size: number; hash: string; append: string };
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const path = (file: string) => file + '.pi-compact-pending.json';

export function beginAppend(file: string, operationId: string, entry: SessionEntry): Pending {
  if (existsSync(path(file))) throw new Error('An unfinished checkpoint append requires recovery.');
  const before = readFileSync(file);
  if (before.at(-1) !== 10) throw new Error('Session log has an incomplete entry.');
  const pending: Pending = { kind: 'running', operationId, size: before.length, hash: hash(before), append: JSON.stringify(entry) + '\n' };
  writeJournal(path(file), pending);
  return pending;
}

export function finishAppend(file: string): void {
  unlinkSync(path(file));
  const fd = openSync(dirname(file), 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

export function recoverAppend(file: string, inMemory?: Pending): boolean {
  const exists = existsSync(path(file));
  if (!exists && !inMemory) return false;
  const pending: Pending = exists ? JSON.parse(readFileSync(path(file), 'utf8')) : inMemory!;
  if (pending.kind !== 'running' || !Number.isSafeInteger(pending.size) || pending.size <= 0 || typeof pending.hash !== 'string' || typeof pending.append !== 'string') throw new Error('Invalid checkpoint recovery record.');
  const bytes = readFileSync(file);
  const suffix = bytes.subarray(pending.size);
  const expected = Buffer.from(pending.append);
  const exactPrefix = expected.subarray(0, suffix.length).equals(suffix);
  const loaderTerminatedPrefix = suffix.at(-1) === 10 && expected.subarray(0, suffix.length - 1).equals(suffix.subarray(0, -1));
  if (bytes.length < pending.size || hash(bytes.subarray(0, pending.size)) !== pending.hash || (!exactPrefix && !loaderTerminatedPrefix)) throw new Error('Session changed outside its pending checkpoint transaction.');
  if (!exists) writeJournal(path(file), pending);
  const fd = openSync(file, 'r+');
  try { ftruncateSync(fd, pending.size); fsyncSync(fd); } finally { closeSync(fd); }
  writeJournal(file + '.pi-compact-state.json', { kind: 'blocked', message: 'Interrupted checkpoint append was rolled back. Use /compact to retry.' });
  finishAppend(file);
  return true;
}
