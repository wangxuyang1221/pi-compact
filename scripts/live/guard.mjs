import fs from 'node:fs';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';

export const digest = value => createHash('sha256').update(value).digest('hex');
export class AcceptanceError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export const refuse = code => { throw new AcceptanceError(code); };
export function privateTree(path, { create = false, seal = false } = {}) {
  const root = resolve(path);
  let existing = root;
  while (!fs.existsSync(existing)) {
    if (fs.lstatSync(existing, { throwIfNoEntry: false })) refuse('EVIDENCE_PATH_DENIED');
    existing = dirname(existing);
  }
  if (fs.realpathSync(existing) !== existing) refuse('EVIDENCE_PATH_DENIED');
  if (!fs.existsSync(root)) {
    if (!create) return;
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  }
  const paths = [];
  const inspect = entry => {
    const stat = fs.lstatSync(entry);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || (stat.isFile() && stat.nlink !== 1) || stat.uid !== process.getuid()) refuse('EVIDENCE_PATH_DENIED');
    if (!seal && (stat.mode & 0o077)) refuse('EVIDENCE_PERMISSIONS_DENIED');
    paths.push([entry, stat.isDirectory()]);
    if (stat.isDirectory()) for (const name of fs.readdirSync(entry)) inspect(join(entry, name));
  };
  inspect(root);
  if (seal) for (const [entry, directory] of paths) fs.chmodSync(entry, directory ? 0o700 : 0o600);
}

export function restrictedCredentials(authPath, targets) {
  const fd = fs.openSync(authPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let data;
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 1024 * 1024) refuse('AUTH_FORMAT_DENIED');
    data = JSON.parse(fs.readFileSync(fd, 'utf8').replace(/^\uFEFF/, ''));
  } finally { fs.closeSync(fd); }
  const selected = new Map();
  const literal = value => typeof value === 'string' && value.length > 0 && !value.trimStart().startsWith('!');
  for (const { provider } of targets) {
    const value = Object.hasOwn(data, provider) ? data[provider] : undefined;
    if (provider === 'openai-codex') {
      if (value?.type !== 'oauth' || !literal(value.access) || !Number.isFinite(value.expires)) refuse('AUTH_FORMAT_DENIED');
      selected.set(provider, { type: 'oauth', access: value.access, refresh: '', expires: value.expires });
    } else {
      if (value?.type !== 'api_key' || !literal(value.key)) refuse('AUTH_FORMAT_DENIED');
      selected.set(provider, { type: 'api_key', key: value.key });
    }
  }
  const check = value => {
    if (value?.type === 'oauth' && value.expires <= Date.now() + 60000) refuse('AUTH_EXPIRED');
    return value;
  };
  for (const value of selected.values()) check(value);
  return {
    async read(provider, options) { options?.signal?.throwIfAborted(); return structuredClone(check(selected.get(provider))); },
    async list(options) { options?.signal?.throwIfAborted(); return [...selected].map(([providerId, value]) => ({ providerId, type: check(value).type })); },
    async modify() { refuse('AUTH_MUTATION_DENIED'); },
    async delete() { refuse('AUTH_MUTATION_DENIED'); },
  };
}
export const safeFailure = error => error instanceof AcceptanceError ? error.code : 'HOST_OR_TRANSPORT_FAILURE';
const integer = (n, max) => Number.isSafeInteger(n) && n > 0 && n <= max;
export function validateGrant(grant, { mode, taskHash, packageHash, evidenceDir, now = Date.now() }) {
  if (!grant || grant.schema !== 2 || grant.authorized !== true || grant.mode !== mode || !['offline-fixture', 'real'].includes(mode)) refuse('GRANT_REQUIRED');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(grant.grantId ?? '') || !Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= now) refuse('GRANT_EXPIRED_OR_INVALID');
  if (grant.taskHash !== taskHash || grant.packageHash !== packageHash || grant.syntheticOnly !== true || grant.allowAuthRefresh !== false) refuse('GRANT_BINDING_MISMATCH');
  if (!isAbsolute(grant.evidenceDir ?? '') || resolve(grant.evidenceDir) !== resolve(evidenceDir)) refuse('GRANT_DIRECTORY_MISMATCH');
  if (!integer(grant.maxDispatches, 12) || !integer(grant.maxEstimatedInputTokens, 120000) || !integer(grant.maxReservedOutputTokens, 12000) || !integer(grant.perRequestOutputTokens, 1000)) refuse('GRANT_BUDGET_INVALID');
  if (!Array.isArray(grant.targets) || grant.targets.length !== 2) refuse('GRANT_TARGET_INVALID');
  const expected = [
    ['openai-codex', 'gpt-6.1-sol', 'openai-codex-responses', mode === 'real' ? 'https://chatgpt.com/backend-api' : 'https://fixture.invalid/backend-api', '/codex/responses'],
    ['deepseek', 'deepseek-chat', 'openai-completions', mode === 'real' ? 'https://api.deepseek.com' : 'https://fixture.invalid/v1', '/chat/completions'],
  ];
  for (const [i, [provider, model, api, baseUrl, suffix]] of expected.entries()) {
    const t = grant.targets[i];
    if (t?.provider !== provider || t.model !== model || t.api !== api || t.baseUrl !== baseUrl || t.endpoint !== baseUrl + suffix || t.transport !== 'sse') refuse('GRANT_TARGET_INVALID');
  }
  if (mode === 'real' && grant.fixtureFault) refuse('FIXTURE_FAULT_REAL_DENIED');
  if (mode === 'real' && (!isAbsolute(grant.authPath ?? '') || !grant.explicitUserAuthorization)) refuse('GRANT_AUTH_SCOPE_INVALID');
  return structuredClone(grant);
}
export function durableWrite(path, value) {
  const temp = path + '.next';
  const fd = fs.openSync(temp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, path);
  const directory = fs.openSync(dirname(path), 'r');
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}
export class DurableLedger {
  constructor(grant) {
    this.grant = grant;
    this.grantHash = digest(JSON.stringify(grant));
    this.path = join(grant.evidenceDir, 'ledger.json');
    this.lock = join(grant.evidenceDir, 'owner.lock');
    this.closed = false;
    this.poisoned = false;
    fs.mkdirSync(grant.evidenceDir, { recursive: true, mode: 0o700 });
    try { this.fd = fs.openSync(this.lock, 'wx', 0o600); } catch { refuse('LEDGER_LOCKED'); }
    try {
      fs.writeFileSync(this.fd, JSON.stringify({ pid: process.pid, grantHash: this.grantHash })); fs.fsyncSync(this.fd);
      if (fs.existsSync(this.path)) {
        this.state = JSON.parse(fs.readFileSync(this.path, 'utf8'));
        const { checksum, ...data } = this.state;
        if (checksum !== digest(JSON.stringify(data)) || data.grantHash !== this.grantHash || !Array.isArray(data.rows)) refuse('LEDGER_INVALID');
        for (const [i, r] of data.rows.entries()) if (r.dispatch !== i + 1 || !integer(r.inputTokens, grant.maxEstimatedInputTokens) || !integer(r.outputTokens, grant.perRequestOutputTokens)) refuse('LEDGER_INVALID');
        if (data.rows.length > grant.maxDispatches || this.inputUsed > grant.maxEstimatedInputTokens || this.outputUsed > grant.maxReservedOutputTokens) refuse('LEDGER_INVALID');
      } else { this.state = { schema: 1, grantHash: this.grantHash, rows: [] }; this.save(); }
    } catch (error) { this.close(); throw error; }
  }
  get rows() { return this.state.rows; }
  get inputUsed() { return this.rows.reduce((n, r) => n + r.inputTokens, 0); }
  get outputUsed() { return this.rows.reduce((n, r) => n + r.outputTokens, 0); }
  save() {
    const data = { schema: this.state.schema, grantHash: this.state.grantHash, rows: this.state.rows };
    try { durableWrite(this.path, { ...data, checksum: digest(JSON.stringify(data)) }); }
    catch { this.poisoned = true; refuse('LEDGER_PERSIST_FAILED'); }
  }
  check(signal) {
    if (this.closed || this.poisoned) refuse('LEDGER_CLOSED');
    if (this.rows.some(r => r.failure === 'SERVER_OUTPUT_CAP_EXCEEDED')) refuse('SERVER_OUTPUT_CAP_EXCEEDED');
    if (signal?.aborted) refuse('ABORTED');
    if (Date.now() >= Date.parse(this.grant.expiresAt)) refuse('GRANT_EXPIRED');
  }
  reserve(fields, signal) {
    this.check(signal);
    const { inputTokens, outputTokens } = fields;
    if (!integer(inputTokens, this.grant.maxEstimatedInputTokens) || !integer(outputTokens, this.grant.perRequestOutputTokens) || this.rows.length >= this.grant.maxDispatches || this.inputUsed + inputTokens > this.grant.maxEstimatedInputTokens || this.outputUsed + outputTokens > this.grant.maxReservedOutputTokens) refuse('BUDGET_EXHAUSTED');
    const row = { ...fields, dispatch: this.rows.length + 1, state: 'reserved', at: new Date().toISOString() };
    this.rows.push(row); this.save(); this.check(signal);
    return row;
  }
  finish(row, fields) { Object.assign(row, fields); this.save(); }
  close() {
    if (this.closed) return;
    this.closed = true;
    fs.closeSync(this.fd); fs.unlinkSync(this.lock);
  }
}
export function decodedBody(options) {
  const bytes = typeof options.body === 'string' ? Buffer.from(options.body) : Buffer.from(options.body ?? []);
  const encoding = new Headers(options.headers).get('content-encoding');
  if (encoding && encoding !== 'zstd') refuse('BODY_ENCODING_DENIED');
  const raw = encoding === 'zstd' ? zstdDecompressSync(bytes, { maxOutputLength: 8 * 1024 * 1024 }) : bytes;
  if (raw.length > 8 * 1024 * 1024) refuse('BODY_TOO_LARGE');
  return { bytes, raw, body: JSON.parse(raw.toString('utf8')) };
}
export function guardedFetch(ledger, target, send, phase = () => 'unassigned') {
  return async (input, options = {}) => {
    let row;
    try {
      ledger.check(options.signal);
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.href !== target.endpoint || url.username || url.password || url.search || url.hash || options.method !== 'POST' || (options.redirect && options.redirect !== 'error')) refuse('ENDPOINT_DENIED');
      const hostHeader = new Headers(options.headers).get('host');
      if (hostHeader && hostHeader !== url.host) refuse('ENDPOINT_DENIED');
      const { bytes, raw, body } = decodedBody(options);
      if (body.model !== target.model || body.stream !== true) refuse('MODEL_OR_TRANSPORT_DENIED');
      const cap = target.api === 'openai-codex-responses' ? body.max_output_tokens : body.max_tokens;
      if (cap !== ledger.grant.perRequestOutputTokens || (body.max_completion_tokens && body.max_completion_tokens !== cap)) refuse('OUTPUT_CAP_REQUIRED');
      const inputTokens = Math.max(1, Math.ceil(raw.length / 4));
      const operation = body.input?.some(item => item.type === 'compaction_trigger') ? 'remote' : raw.includes('Convert this checkpoint to a complete readable continuation summary.') ? 'source' : raw.includes('<conversation>') || raw.includes('# Conversation') ? 'native' : 'normal';
      row = ledger.reserve({ phase: phase(), operation, provider: target.provider, model: target.model, transport: 'sse', bodyBytes: bytes.length, decodedBytes: raw.length, bodyHash: digest(bytes), inputTokens, outputTokens: cap }, options.signal);
      const response = await send(url.href, { ...options, redirect: 'error' });
      ledger.check(options.signal);
      if (!response.ok) { await response.body?.cancel(); refuse(response.status >= 300 && response.status < 400 ? 'REDIRECT_DENIED' : 'HTTP_FAILURE'); }
      if (!response.headers.get('content-type')?.startsWith('text/event-stream')) refuse('NON_SSE_RESPONSE');
      ledger.finish(row, { state: 'response', status: response.status });
      return observeSSE(response, ledger, row, options.signal);
    } catch (error) {
      if (row && !ledger.poisoned) ledger.finish(row, { state: 'failed', failure: safeFailure(error) });
      throw new AcceptanceError(safeFailure(error));
    }
  };
}

function observeSSE(response, ledger, row, signal) {
  const reader = response.body?.getReader();
  if (!reader) refuse('MISSING_SSE_BODY');
  const decoder = new TextDecoder();
  let buffer = '', terminal = false;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        ledger.check(signal);
        const { done, value } = await reader.read();
        if (done) {
          if (!terminal) { ledger.finish(row, { state: 'failed', failure: 'INCOMPLETE_STREAM' }); }
          controller.close(); return;
        }
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 8 * 1024 * 1024) refuse('SSE_FRAME_TOO_LARGE');
        const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ') || line.trim() === 'data: [DONE]') continue;
          const event = JSON.parse(line.slice(6));
          const u = event.response?.usage ?? event.usage;
          const stop = event.response?.status ?? event.choices?.[0]?.finish_reason;
          if (u || stop || event.type === 'response.failed' || event.type === 'error') {
            const usage = u ? Object.fromEntries(Object.entries({ input: u.input_tokens ?? u.prompt_tokens, output: u.output_tokens ?? u.completion_tokens, reasoning: u.output_tokens_details?.reasoning_tokens ?? u.completion_tokens_details?.reasoning_tokens }).filter(([, v]) => Number.isFinite(v) && v >= 0)) : undefined;
            if (usage?.output > row.outputTokens) { ledger.finish(row, { usage }); refuse('SERVER_OUTPUT_CAP_EXCEEDED'); }
            if (stop || event.type === 'response.failed' || event.type === 'error') terminal = true;
            const failed = ['failed', 'cancelled'].includes(stop) || ['response.failed', 'error'].includes(event.type);
            ledger.finish(row, { ...(usage ? { usage } : {}), ...(terminal ? { state: failed ? 'failed' : 'completed', stop: failed ? 'failed' : ['completed', 'stop', 'length', 'incomplete', 'tool_calls'].includes(stop) ? stop : 'other' } : {}) });
          }
        }
        controller.enqueue(value);
      } catch (error) {
        if (!ledger.poisoned) ledger.finish(row, { state: 'failed', failure: safeFailure(error) });
        await reader.cancel().catch(() => {}); controller.error(new AcceptanceError(safeFailure(error)));
      }
    },
    async cancel() { await reader.cancel(); if (!terminal && !ledger.closed && !ledger.poisoned) ledger.finish(row, { state: 'failed', failure: 'STREAM_CANCELLED' }); },
  });
  return new Response(stream, { status: response.status, headers: response.headers });
}
