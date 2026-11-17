import { digest } from './guard.mjs';
export const task = {
  id: 'ledger-recovery-v2',
  turns: 12,
  fillerCharactersPerTurn: 7000,
  facts: ['database=sqlite', 'retry=3', 'timezone=Asia/Shanghai'],
  unfinished: 'FACT_PENDING=idempotency_test',
  files: { 'ledger.csv': 'id,status\nA1,pending\n' },
  toolResult: 'FACT_FILE=ledger.csv FACT_ROW=A1_pending',
  continuation: 'Return only the original FACT_ markers and database, retry, timezone values, using marker=value syntax. Include all facts, unfinished work, ledger.csv state and tool results recalled from history. Do not edit files or call tools.',
};
export const taskHash = digest(JSON.stringify(task));
export function seed(session) {
  const model = session.model;
  for (let i = 0; i < task.turns; i++) {
    session.sessionManager.appendMessage({ role: 'user', content: `FACT_${i}=value_${i} ${task.unfinished} ${task.toolResult} ${task.facts.join(' ')} ` + 'x'.repeat(task.fillerCharactersPerTurn), timestamp: i });
    session.sessionManager.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id: 't' + i, name: 'alpha', arguments: {} }], api: model.api, provider: model.provider, model: model.id, stopReason: 'toolUse', timestamp: i, usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 120, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
    session.sessionManager.appendMessage({ role: 'toolResult', toolCallId: 't' + i, toolName: 'alpha', content: [{ type: 'text', text: `FACT_TOOL_${i}=result_${i} ${task.toolResult}` }], isError: false, timestamp: i });
  }
  session.sessionManager.appendMessage({ role: 'user', content: 'RETAINED_COMPLETE_TAIL', timestamp: 12 });
  session.refreshContext();
}
export function score(text, file) {
  return {
    facts: task.facts.every(f => text.includes(f)) && Array.from({ length: 12 }, (_, i) => `FACT_${i}=value_${i}`).every(f => text.includes(f)),
    unfinished: text.includes(task.unfinished) && !/idempotency.{0,32}\b(completed|finished|done)\b/i.test(text),
    file: file === task.files['ledger.csv'] && text.includes('FACT_FILE=ledger.csv') && text.includes('FACT_ROW=A1_pending'),
    toolResult: Array.from({ length: 12 }, (_, i) => `FACT_TOOL_${i}=result_${i}`).every(f => text.includes(f)),
    fileSHA256: digest(file),
  };
}
