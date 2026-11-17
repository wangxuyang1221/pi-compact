// Synthetic content with the terminal shape and usage observed in formal-terminal-failure-input-001.
export const compaction = { id: 'cmp_synthetic', type: 'compaction', encrypted_content: 'SYNTHETIC_OPAQUE_'.repeat(80) };
export const usage = { input_tokens: 83757, output_tokens: 2092, total_tokens: 85849,
  input_tokens_details: { cached_tokens: 83584 }, output_tokens_details: { reasoning_tokens: 0 } };
export const done = (item: unknown = compaction, output_index: unknown = 0) => ({ type: 'response.output_item.done', output_index, item });
export const completed = (output: unknown = []) => ({ type: 'response.completed', response: { status: 'completed', output, usage } });
export const emptyTerminalEvents = () => [
  { type: 'response.created', response: { status: 'in_progress', output: [], usage: null } },
  { type: 'response.in_progress', response: { status: 'in_progress', output: [], usage: null } },
  { type: 'response.output_item.added', output_index: 0, item: compaction },
  done(), completed(),
];
