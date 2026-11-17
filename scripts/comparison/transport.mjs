import { decodedBody, guardedFetch, digest, refuse } from '../live/guard.mjs';
const number = n => Number.isSafeInteger(n) && n >= 0 ? n : null;
export function usageVector(raw) {
  return { input: number(raw?.input_tokens), cacheRead: number(raw?.input_tokens_details?.cached_tokens), cacheWrite: number(raw?.input_tokens_details?.cache_write_tokens), output: number(raw?.output_tokens), reasoning: number(raw?.output_tokens_details?.reasoning_tokens), total: number(raw?.total_tokens) };
}
export function comparisonFetch(ledger, target, send, requestStage = ledger.stage) {
  const auditedSend = async (url, options) => {
    const row = ledger.rows.at(-1);
    ledger.finish(row, { sendInvokedMonoMs: performance.now(), sendState: 'invoked-unconfirmed', knownSent: false, serverConfirmed: false });
    const response = await send(url, options);
    ledger.finish(row, { sendState: 'response-confirmed', knownSent: true, serverConfirmed: ledger.grant.mode === 'real', responseMonoMs: performance.now() });
    if (!response.ok) {
      ledger.finish(row, { auditFailure: 'HTTP_REJECTED', transportStatus: response.status });
      await response.body?.cancel(); refuse('HTTP_REJECTED');
    }
    const decoder = new TextDecoder(); let buffer = '', terminal = false;
    const transform = new TransformStream({
      transform(chunk, controller) {
        if (row.firstChunkMonoMs === undefined) ledger.finish(row, { firstChunkMonoMs: performance.now() });
        buffer += decoder.decode(chunk, { stream: true });
        if (buffer.length > 8 * 1024 * 1024) refuse('SSE_FRAME_TOO_LARGE');
        const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ') || line.trim() === 'data: [DONE]') continue;
          const e = JSON.parse(line.slice(6));
          if (e.type === 'response.output_text.delta' && row.firstTokenMonoMs === undefined) ledger.finish(row, { firstTokenMonoMs: performance.now() });
          if (['response.completed', 'response.failed', 'response.incomplete', 'error'].includes(e.type)) {
            terminal = true;
            const rawUsage = e.response?.usage ?? null, usage = usageVector(rawUsage);
            const optional = [rawUsage?.input_tokens_details?.cached_tokens, rawUsage?.input_tokens_details?.cache_write_tokens, rawUsage?.output_tokens_details?.reasoning_tokens];
            const invalidUsage = [usage.input, usage.output, usage.total].some(v => v === null) || usage.total !== usage.input + usage.output || optional.some(v => v !== undefined && number(v) === null) || (usage.reasoning !== null && usage.reasoning > usage.output) || (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0) > usage.input;
            const failure = usage.output > 1000 ? 'SERVER_OUTPUT_CAP_EXCEEDED' : e.type !== 'response.completed' || e.response?.status !== 'completed' ? 'OUTPUT_INCOMPLETE' : invalidUsage ? 'USAGE_UNAUDITABLE' : null;
            const publicUsage = { input_tokens: usage.input, output_tokens: usage.output, total_tokens: usage.total, input_tokens_details: { cached_tokens: usage.cacheRead, cache_write_tokens: usage.cacheWrite }, output_tokens_details: { reasoning_tokens: usage.reasoning } };
            ledger.finish(row, { terminalMonoMs: performance.now(), terminalType: e.type, rawUsage: publicUsage, serverUsage: usage, auditFailure: failure });
            if (failure) refuse(failure);
          }
        }
        controller.enqueue(chunk);
      },
      flush() { if (!terminal) { ledger.finish(row, { auditFailure: 'USAGE_UNAUDITABLE' }); refuse('USAGE_UNAUDITABLE'); } },
    });
    return new Response(response.body?.pipeThrough(transform), { status: response.status, headers: response.headers });
  };
  const guarded = guardedFetch(ledger, target, auditedSend, () => `${ledger.lane?.id}:${requestStage}`);
  return async (input, options) => {
    const { body, raw } = decodedBody(options);
    if (body.reasoning?.effort !== 'none' || body.service_tier !== undefined || body.temperature !== undefined || body.stream !== true || body.max_output_tokens !== 1000) refuse('ENCODED_CONTROLS_MISMATCH');
    if (requestStage === 'continuation') {
      if (body.input?.some(i => i.type === 'compaction_trigger')) refuse('UNEXPECTED_COMPACTION_TRIGGER');
      const peer = ledger.rows.find(r => r.model === ledger.lane.model && r.task === ledger.lane.task && r.repeat === ledger.lane.repeat && r.experimentPhase === ledger.lane.phase && r.assignedArm !== ledger.lane.arm && r.stage === 'continuation' && r.encoded);
      if (peer && (peer.encoded.instructionsHash !== digest(String(body.instructions)) || peer.encoded.toolsHash !== digest(JSON.stringify(body.tools ?? [])) || peer.encoded.systemMessagesHash !== digest(JSON.stringify((body.input ?? []).filter(i => ['system', 'developer'].includes(i.role)))))) refuse('MATCHED_PAIR_WIRE_MISMATCH');
    }
    const before = ledger.rows.length;
    try { return await ledger.withRequest(requestStage, () => guarded(input, options)); }
    finally {
      if (ledger.rows.length > before) ledger.finish(ledger.rows[before], { encoded: { model: body.model, reasoning: body.reasoning, maxOutputTokens: body.max_output_tokens, stream: body.stream, inputHash: digest(JSON.stringify(body.input)), instructionsHash: digest(String(body.instructions)), systemMessagesHash: digest(JSON.stringify((body.input ?? []).filter(i => ['system', 'developer'].includes(i.role)))), toolsHash: digest(JSON.stringify(body.tools ?? [])), opaqueItems: body.input?.filter(i => i.type === 'compaction').length ?? 0, compactionTrigger: body.input?.some(i => i.type === 'compaction_trigger') ?? false, rawSHA256: digest(raw), toolNames: body.tools?.map(t => t.name) ?? [] } });
    }
  };
}
