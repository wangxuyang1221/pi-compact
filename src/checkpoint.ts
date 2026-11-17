import { createHash } from 'node:crypto';
import type * as Pi from '@earendil-works/pi-coding-agent';
import { object, validateWire, wireBudget, type WireBudget, type WireItem } from './codex/wire.ts';

export type Compatibility = { provider: 'openai-codex'; endpoint: string; protocol: 'compaction_trigger'; account: string; model: string; capability: 'pi-1.5.2-codex-signature-v1' };
export type Coverage = { sourceLeaf: string; firstKept: string; entries: string[]; hash: string };
type Base = { schemaVersion: 1; source: Coverage };
export type Checkpoint = Base & (
  | { kind: 'text'; text: string; segments: { entries: string[]; hash: string; start: number; end: number; unit?: 'utf16' | 'wire' }[] }
  | { kind: 'opaque'; compatibility: Compatibility; items: WireItem[]; budget: WireBudget }
);
export type Message = Pi.SessionProjection['messages'][number];
export type Marker = { piCompactCheckpoint: string };

export const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function checkpoint(entry: Pi.SessionEntry): Checkpoint | undefined {
  if (entry.type !== 'compaction' || !entry.details || typeof entry.details !== 'object' || !('piCompact' in entry.details)) return undefined;
  const value = object(entry.details.piCompact);
  const source = object(value.source);
  if (value.schemaVersion !== 1 || !['text', 'opaque'].includes(String(value.kind)) || typeof source.sourceLeaf !== 'string' ||
    typeof source.firstKept !== 'string' || !Array.isArray(source.entries) || !source.entries.every(id => typeof id === 'string') || typeof source.hash !== 'string') throw new Error('Invalid pi-compact checkpoint schema.');
  if (value.kind === 'text') {
    if (typeof value.text !== 'string' || value.text !== entry.summary || 'items' in value || 'compatibility' in value || !Array.isArray(value.segments)) throw new Error('Invalid text checkpoint.');
  } else {
    if ('text' in value) throw new Error('Mixed checkpoint representations.');
    const compatibility = object(value.compatibility);
    if (compatibility.provider !== 'openai-codex' || compatibility.protocol !== 'compaction_trigger' || compatibility.capability !== 'pi-1.5.2-codex-signature-v1' ||
      !['endpoint', 'account', 'model'].every(key => typeof compatibility[key] === 'string' && compatibility[key])) throw new Error('Invalid checkpoint compatibility.');
    const items = validateWire(value.items);
    const budget = object(value.budget);
    if (JSON.stringify(budget) !== JSON.stringify(wireBudget(items, Number(budget.outputTokens)))) throw new Error('Invalid checkpoint budget.');
  }
  if (entry.parentId !== source.sourceLeaf || entry.firstKeptEntryId !== source.firstKept) throw new Error('Checkpoint does not match its native boundary.');
  return value as Checkpoint;
}

export function readableBranch(branch: Pi.SessionEntry[]): Pi.SessionEntry[] {
  if (branch.length && branch[0].parentId !== null) throw new Error('Readable history has a missing ancestor.');
  const ids = new Set(branch.map(entry => entry.id));
  for (const [index, entry] of branch.entries()) {
    if (entry.type !== 'compaction') continue;
    const value = checkpoint(entry);
    if (value?.kind === 'opaque' && value.source.entries.some(id => !ids.has(id))) throw new Error('Opaque source history is unavailable.');
    const cut = branch.findIndex(item => item.id === entry.firstKeptEntryId);
    if (cut < 0 || cut > index || !branch.slice(0, cut).some(item => item.type === 'message' || item.type === 'branch_summary')) throw new Error('Checkpoint has no reconstructable original history.');
  }
  let parentId: string | null = null;
  return branch.filter(entry => entry.type !== 'compaction').map(entry => {
    const copy = { ...entry, parentId };
    parentId = entry.id;
    return copy;
  });
}

export function coverage(host: typeof Pi, branch: Pi.SessionEntry[], firstKept: string): Coverage {
  if (!branch.length || !branch.some(entry => entry.id === firstKept)) throw new Error('Checkpoint boundary is outside the active branch.');
  const cut = branch.findIndex(entry => entry.id === firstKept);
  const ids = new Set(branch.slice(0, cut).map(entry => entry.id));
  const readable = host.buildSessionProjection(readableBranch(branch)).entries.filter(entry => ids.has(entry.sourceEntry.id) && entry.messages.length > 0);
  return { sourceLeaf: branch.at(-1)!.id, firstKept, entries: readable.map(entry => entry.sourceEntry.id), hash: digest(readable.map(entry => [entry.sourceEntry.id, entry.messages])) };
}

export function assertSource(host: typeof Pi, branch: Pi.SessionEntry[], entry: Pi.CompactionEntry, value: Checkpoint): void {
  const index = branch.findIndex(item => item.id === entry.id);
  if (index < 0 || !branch.slice(0, index).some(item => item.id === value.source.sourceLeaf)) throw new Error('Checkpoint source is outside the active branch.');
  const current = coverage(host, branch, value.source.firstKept);
  if (current.hash !== value.source.hash || JSON.stringify(current.entries) !== JSON.stringify(value.source.entries)) throw new Error('Checkpoint sources changed. Run /compact to rebuild readable history.');
}

export function marker(message: Message): string | undefined {
  if (!('piCompactCheckpoint' in message)) return undefined;
  if (message.role !== 'compactionSummary' || typeof message.piCompactCheckpoint !== 'string') throw new Error('Invalid checkpoint reference.');
  return message.piCompactCheckpoint;
}

export function markProjection(projection: Pi.SessionProjection): Pi.SessionProjection {
  const first = projection.entries[0];
  if (!first || checkpoint(first.sourceEntry)?.kind !== 'opaque') return projection;
  const entries = [{ ...first, messages: first.messages.map(message => message.role === 'compactionSummary'
    ? { ...message, piCompactCheckpoint: first.sourceEntry.id } : message) }, ...projection.entries.slice(1)];
  return { ...projection, entries, messages: entries.flatMap(entry => entry.messages) };
}

export function activeCheckpoint(branch: Pi.SessionEntry[]): Checkpoint | undefined {
  const entry = branch.findLast(entry => entry.type === 'compaction');
  return entry && checkpoint(entry);
}

export function replayReference(message: Message): string | undefined {
  if (!('piCompactReplay' in message)) return undefined;
  if (message.role !== 'assistant' || typeof message.piCompactReplay !== 'string') throw new Error('Invalid opaque replay reference.');
  return message.piCompactReplay;
}

export function replayMessage(value: Extract<Checkpoint, { kind: 'opaque' }>, timestamp: number, id: string): ReturnType<typeof Pi.convertToLlm>[number] & { piCompactReplay: string } {
  return { piCompactReplay: id, role: 'assistant', api: 'openai-codex-responses', provider: value.compatibility.provider, model: value.compatibility.model,
    content: value.items.map(item => ({ type: 'thinking', thinking: '', thinkingSignature: JSON.stringify(item) })),
    stopReason: 'stop', timestamp, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
}
