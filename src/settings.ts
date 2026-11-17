import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultThresholdPercent, parseThreshold } from './policy.ts';

export type ProjectSettings = { kind: 'valid'; percent: number; source: 'default' | 'project'; path: string }
  | { kind: 'invalid'; path: string; error: string };

export function settingsPath(cwd: string): string {
  return join(cwd, '.pi', 'pi-compact.json');
}

export function readSettings(cwd: string): ProjectSettings {
  const path = settingsPath(cwd);
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected a settings object.');
    const value = (data as Record<string, unknown>).thresholdPercent;
    return { kind: 'valid', percent: value === undefined ? defaultThresholdPercent : parseThreshold(value), source: value === undefined ? 'default' : 'project', path };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'valid', percent: defaultThresholdPercent, source: 'default', path };
    return { kind: 'invalid', path, error: `Cannot read pi-compact settings at ${path}: ${String(error)} Repair the file or run /compact-config threshold <percent>.` };
  }
}

export function saveThreshold(cwd: string, percent: number): void {
  parseThreshold(percent);
  const path = settingsPath(cwd);
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(temporary, JSON.stringify({ thresholdPercent: percent }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
