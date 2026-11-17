export type WireItem = Record<string, unknown>;
export type WireBudget = { method: 'codex-ciphertext-bytes-v1'; tokens: number; bytes: number; outputTokens: number };

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Codex object.');
  return value as Record<string, unknown>;
}

function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }

export function validateWire(value: unknown, requireCompaction = true): WireItem[] {
  return validateItems(value, requireCompaction, 'output');
}

export function validateRequestWire(value: unknown, requireCompaction = true): WireItem[] {
  return validateItems(value, requireCompaction, 'input');
}

function validateItems(value: unknown, requireCompaction: boolean, direction: 'input' | 'output'): WireItem[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Codex returned no items.');
  const items = value.map(object);
  const calls = new Set<string>();
  const answered = new Set<string>();
  const ids = new Set<string>();
  let compact = 0;
  for (const item of items) {
    if (item.id !== undefined) {
      if (!text(item.id) || ids.has(item.id)) throw new Error('Invalid or duplicate Codex item ID.');
      ids.add(item.id);
    }
    if (item.status !== undefined && item.status !== 'completed') throw new Error('Incomplete Codex item.');
    switch (item.type ?? (item.role ? 'message' : undefined)) {
      case 'additional_tools': {
        if (direction !== 'input' || item.role !== 'developer' || !Array.isArray(item.tools) || item.tools.length === 0) throw new Error('Invalid Codex tool declaration.');
        const names = new Set<string>();
        for (const value of item.tools) {
          const tool = object(value);
          if (tool.type !== 'function' || !text(tool.name) || names.has(tool.name) || typeof tool.description !== 'string' || ![undefined, null, true, false].includes(tool.strict as undefined | null | boolean)) throw new Error('Invalid Codex function declaration.');
          object(tool.parameters);
          names.add(tool.name);
        }
        break;
      }
      case 'compaction':
        if (!text(item.encrypted_content)) throw new Error('Empty Codex checkpoint.');
        compact++;
        break;
      case 'reasoning':
        if (!text(item.encrypted_content) || !Array.isArray(item.summary)) throw new Error('Invalid Codex reasoning.');
        break;
      case 'message':
        if (!['user', 'assistant', 'system', 'developer'].includes(String(item.role))) throw new Error('Invalid Codex message role.');
        if (typeof item.content === 'string') break;
        if (!Array.isArray(item.content) || item.content.length === 0 || item.content.some(part => {
          const content = object(part);
          return !['input_text', 'output_text', 'summary_text'].includes(String(content.type)) || typeof content.text !== 'string';
        })) throw new Error('Unsupported Codex message content.');
        break;
      case 'function_call':
        if (!text(item.call_id) || calls.has(item.call_id) || !text(item.name) || typeof item.arguments !== 'string') throw new Error('Invalid Codex tool call.');
        object(JSON.parse(item.arguments));
        calls.add(item.call_id);
        break;
      case 'function_call_output':
        if (!text(item.call_id) || !calls.has(item.call_id) || answered.has(item.call_id) || typeof item.output !== 'string') throw new Error('Unpaired Codex tool output.');
        answered.add(item.call_id);
        break;
      default: throw new Error('Unsupported Codex wire item.');
    }
  }
  if (calls.size !== answered.size) throw new Error('Codex returned an unfinished tool batch.');
  if (requireCompaction && compact !== 1) throw new Error('Expected exactly one Codex checkpoint.');
  return structuredClone(items);
}

export function wireBudget(items: WireItem[], outputTokens: number): WireBudget {
  if (!Number.isSafeInteger(outputTokens) || outputTokens <= 0) throw new Error('Codex checkpoint has no usable token usage.');
  const bytes = Buffer.byteLength(JSON.stringify(items));
  if (bytes > 8 * 1024 * 1024) throw new Error('Codex checkpoint exceeds the transport size limit.');
  return { method: 'codex-ciphertext-bytes-v1', tokens: Math.max(bytes + items.length * 32, outputTokens * 2), bytes, outputTokens };
}

export class CompactResponse {
  private items = new Map<number, WireItem>();
  private pending = new Set<number>();
  private completed?: { items: WireItem[]; budget: WireBudget };
  accept(value: unknown): void {
    const event = object(value);
    if (this.completed) throw new Error('Codex sent events after completion.');
    if (event.type === 'response.output_item.added') {
      const index = event.output_index;
      if (!Number.isSafeInteger(index) || Number(index) < 0 || this.pending.has(Number(index)) || this.items.has(Number(index))) throw new Error('Invalid Codex output order.');
      this.pending.add(Number(index));
    }
    if (event.type === 'response.output_item.done') {
      const index = event.output_index;
      if (!Number.isSafeInteger(index) || Number(index) < 0 || this.items.has(Number(index))) throw new Error('Invalid Codex output order.');
      this.items.set(Number(index), object(event.item));
      this.pending.delete(Number(index));
    }
    if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error') throw new Error('Codex compaction explicitly failed.');
    if (event.type !== 'response.completed') return;
    const response = object(event.response);
    if (response.status !== 'completed') throw new Error('Codex compaction did not complete.');
    if (this.pending.size) throw new Error('Codex returned unfinished output items.');
    const items = validateWire(Array.isArray(response.output) && response.output.length === 0
      ? Array.from({ length: this.items.size }, (_, index) => this.items.get(index))
      : response.output);
    if (items.length !== this.items.size || items.some((item, index) => JSON.stringify(item) !== JSON.stringify(this.items.get(index)))) throw new Error('Codex terminal output disagrees with its stream.');
    const outputTokens = object(response.usage).output_tokens;
    if (typeof outputTokens !== 'number') throw new Error('Codex usage is not numeric.');
    const budget = wireBudget(items, outputTokens);
    this.completed = { items, budget };
  }
  result(): { items: WireItem[]; budget: WireBudget } {
    if (!this.completed) throw new Error('Codex stream ended without a complete checkpoint.');
    return this.completed;
  }
}
