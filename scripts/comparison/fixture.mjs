import fs from 'node:fs';
import { join } from 'node:path';
import { decodedBody } from '../live/guard.mjs';
export function fixtureTransport(getLane, getData, fault) {
  const turns = new Map(); let seq = 0;
  return async (_url, options) => {
    const lane = getLane(), data = getData(), { body } = decodedBody(options);
    if (fault === 'http') return new Response('', { status: 400 });
    const compact = body.input?.some(i => i.type === 'compaction_trigger');
    const native = JSON.stringify(body).includes('<conversation>');
    let output;
    const call = (name, args) => ({ type: 'function_call', id: 'fc_' + ++seq, call_id: 'call_' + seq, name, arguments: JSON.stringify(args), status: 'completed' });
    const message = text => ({ type: 'message', id: 'msg_' + ++seq, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] });
    if (compact) output = (fault === 'no-opaque' || (fault === 'comparison-no-opaque' && lane.phase === 'comparison')) ? [message('Fixture missing opaque.')] : [{ type: 'compaction', id: 'cmp_' + ++seq, encrypted_content: 'FIXTURE_NOT_REAL_OPAQUE_' + seq + '_'.repeat(256) }];
    else if (native) output = [message('FIXTURE summary, authored from oracle for flow verification only: ' + JSON.stringify({ facts: data.truth.facts, pending: data.truth.pending, state: data.truth.state }))];
    else if (lane.phase === 'pilot') output = [message('Fixture ready.')];
    else {
      const turn = turns.get(lane.id) ?? 0; turns.set(lane.id, turn + 1);
      output = [turn === 0 ? call('record_checkpoint', fault === 'checkpoint-retry' ? { facts: {} } : { facts: data.truth.facts, pending: data.truth.pending, state: data.truth.state }) : turn === 1 ? fault === 'checkpoint-retry' ? call('record_checkpoint', { facts: data.truth.facts, pending: data.truth.pending, state: data.truth.state }) : call('workspace_read', { path: data.truth.module }) : turn === 2 ? call('workspace_write', { path: data.truth.module, content: fs.readFileSync(join(data.base, 'oracle/reference', data.truth.module), 'utf8') }) : turn === 3 ? call('run_regression', {}) : fault === 'hidden-round' ? call('workspace_read', { path: data.truth.module }) : message('Fixture implementation complete.')];
    }
    const events = output.flatMap((item, output_index) => item.type === 'compaction' ? [{ type: 'response.output_item.done', output_index, item }] : item.type === 'function_call' ? [
      { type: 'response.output_item.added', output_index, item: { ...item, arguments: '' } }, { type: 'response.function_call_arguments.delta', output_index, delta: item.arguments }, { type: 'response.output_item.done', output_index, item },
    ] : [{ type: 'response.output_item.added', output_index, item: { ...item, content: [] } }, { type: 'response.output_text.delta', output_index, content_index: 0, delta: item.content[0].text }, { type: 'response.output_item.done', output_index, item }]);
    events.push({ type: 'response.completed', response: { id: 'fixture', status: 'completed', output, ...(fault === 'no-usage' ? {} : { usage: { input_tokens: 100, output_tokens: fault === 'cap' ? 1001 : 50, total_tokens: fault === 'cap' ? 1101 : 150, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } }) } });
    return new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
  };
}
