import type { SessionProjection } from '@earendil-works/pi-coding-agent';

type Message = SessionProjection['messages'][number];
type Occurrence = { message: Message; key: string };

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

export function snapshotContext(messages: Message[]): Occurrence[] {
  const occurrences = new Map<Message, Occurrence>();
  const snapshot = (message: Message): Occurrence => {
    let occurrence = occurrences.get(message);
    if (!occurrence) {
      occurrence = { message, key: JSON.stringify(message) };
      occurrences.set(message, occurrence);
    }
    return occurrence;
  };
  return messages.filter(message => message.role !== 'system').map(snapshot);
}

export function reconstructContext(before: Occurrence[], transformed: Message[], original: SessionProjection, projection: SessionProjection): Message[] {
  const oldIds = new Set(original.entries.map(entry => entry.sourceEntry.id));
  const checkpoints = projection.entries.filter(entry => entry.sourceEntry.type === 'compaction' && !oldIds.has(entry.sourceEntry.id));
  if (checkpoints.length === 0) return transformed;
  const retainedIds = new Set(projection.entries.map(entry => entry.sourceEntry.id));
  const keys = new Map(before.map(source => [source.message, source.key]));
  const provenance = groupBy(original.entries.flatMap(entry => entry.messages.filter(message => message.role !== 'system').map(message => ({
    key: keys.get(message) ?? JSON.stringify(message), removed: !retainedIds.has(entry.sourceEntry.id),
  }))), item => item.key);
  const summarized = new Set([...provenance].filter(([, items]) => items.every(item => item.removed)).map(([key]) => key));
  const sources = before.map(source => ({ ...source, removed: summarized.has(source.key) }));
  const outputs = transformed.map((message, index) => ({ message, index, key: JSON.stringify(message) }));
  const byIdentity = groupBy(sources, source => source.message);
  const claimed = new Set<(typeof sources)[number]>();
  const matched = new Set<number>();
  const removed = new Set<number>();
  for (const [message, occurrences] of groupBy(outputs, output => output.message)) {
    const originals = byIdentity.get(message);
    if (!originals) continue;
    originals.forEach(source => claimed.add(source));
    occurrences.forEach(output => matched.add(output.index));
    if (originals.length !== occurrences.length || !originals.every(source => source.removed)) continue;
    for (const output of occurrences) if (originals[0].key === output.key) removed.add(output.index);
  }
  const byContent = groupBy(sources.filter(source => !claimed.has(source)), source => source.key);
  const unmatched = outputs.filter(output => !matched.has(output.index) && output.message.role !== 'system');
  const uncertain = unmatched.some(output => !byContent.has(output.key));
  for (const [key, occurrences] of groupBy(unmatched, output => output.key)) {
    const originals = byContent.get(key);
    if (!uncertain && originals?.length === occurrences.length && originals.every(source => source.removed)) {
      occurrences.forEach(output => removed.add(output.index));
    }
  }
  const batches: number[][] = [];
  const calls = new Map<string, number[]>();
  for (const [index, message] of transformed.entries()) {
    if (message.role === 'assistant') {
      const toolCalls = message.content.filter(part => part.type === 'toolCall');
      if (toolCalls.length) {
        const batch = [index];
        batches.push(batch);
        for (const call of toolCalls) calls.set(call.id, batch);
      }
    } else if (message.role === 'toolResult') calls.get(message.toolCallId)?.push(index);
  }
  for (const batch of batches) if (batch.some(index => !removed.has(index))) batch.forEach(index => removed.delete(index));
  const added = checkpoints.flatMap(entry => entry.messages.filter(message => message.role !== 'system'));
  const refreshed: Message[] = [];
  let inserted = false;
  for (const [index, message] of transformed.entries()) {
    if (removed.has(index)) {
      if (!inserted) { refreshed.push(...added); inserted = true; }
    } else refreshed.push(message);
  }
  if (!inserted) {
    const index = refreshed.findIndex(message => message.role !== 'system');
    refreshed.splice(index < 0 ? refreshed.length : index, 0, ...added);
  }
  return refreshed;
}
