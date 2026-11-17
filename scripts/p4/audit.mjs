import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, provenance, sourceHashes, events } from '../fixture/runtime.mjs';
import { checkpoint, coverage, digest, readableBranch } from '../../src/checkpoint.ts';
const installed = resolve(provenance.target, '../../..');
const host = await import(pathToFileURL(join(installed, 'dist/index.js')));
const { prepareCompaction } = await import(pathToFileURL(join(installed, 'dist/core/compaction/compaction.js')));
const latest = name => join(root, 'artifacts/P4', name, readdirSync(join(root, 'artifacts/P4', name)).sort().at(-1));
const run = process.env.P4_RUN ?? latest('runs');
const edge = process.env.P4_EDGES ?? latest('edges');
const json = file => JSON.parse(readFileSync(file));
const local = path => join(root, 'artifacts', path.split('/artifacts/')[1]);
const lines = file => readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const product = value => Object.fromEntries(Object.entries(value).filter(([name]) => name.startsWith('src/')));
const source = product(sourceHashes());
const rows = [...json(join(run, 'result.json')), ...json(join(edge, 'result.json'))];
const audited = [];
for (const row of rows) {
  row.dir = local(row.dir);
  assert(row.pass, 'runner outcome');
  assert.deepEqual(product(row.source), source, 'tested product hashes');
  const all = lines(join(row.dir, 'session.jsonl'));
  const log = events(row.dir);
  const byId = new Map(all.filter(entry => entry.id).map(entry => [entry.id, entry]));
  const branch = leaf => { const result = []; for (let id = leaf; id;) { const entry = byId.get(id); assert(entry, 'branch ancestry'); result.unshift(entry); id = entry.parentId; } return result; };
  const special = ['schema','inactive-schema','missing-source'].includes(row.kind);
  const checkpoints = special ? [] : all.filter(entry => entry.type === 'compaction' && checkpoint(entry));
  const successes = log.filter(event => event.event === 'extension-success');
  assert.equal(new Set(successes.map(event => event.id)).size, successes.length, 'one success per commit');
  for (const event of successes) {
    const entry = all.find(entry => entry.id === event.id);
    assert(entry?.type === 'compaction', 'success references durable checkpoint');
    if (event.checkpoint) assert.deepEqual(checkpoint(entry), event.checkpoint);
  }
  for (const event of log.filter(event => event.event === 'compaction_end' && event.success)) if (row.variant !== 'baseline') assert.equal(event.journal.kind, 'idle');
  for (const entry of checkpoints) {
    const value = checkpoint(entry);
    assert.deepEqual(value.source, coverage(host, branch(entry.parentId), value.source.firstKept), 'durable source coverage');
    assert(!JSON.stringify(value).includes('synthetic-refresh-unused'));
  }
  for (const event of log.filter(event => event.event === 'actual-request')) {
    const input = event.body.input ?? event.body.messages;
    const opaque = input.filter(item => item.type === 'compaction');
    for (const item of opaque) {
      const value = checkpoints.map(checkpoint).find(value => value.kind === 'opaque' && value.items.some(candidate => JSON.stringify(candidate) === JSON.stringify(item)));
      assert(value, 'opaque must come from durable checkpoint');
      const start = input.findIndex(candidate => JSON.stringify(candidate) === JSON.stringify(value.items[0]));
      assert.deepEqual(input.slice(start, start + value.items.length), value.items, 'ordered wire retained');
      assert.equal(value.compatibility.account, createHash('sha256').update(event.account).digest('hex'), 'same fixture account');
      assert(event.model.startsWith('gpt-6'), 'only constrained Codex transport');
    }
    if (event.model.startsWith('deepseek') || event.phase === 'native') {
      assert(!JSON.stringify(input).includes('encrypted_content'));
      assert(!JSON.stringify(input).includes('Codex remote checkpoint'));
    }
  }
  if (existsSync(join(row.dir, 'before-migration.jsonl'))) {
    const before = readFileSync(join(row.dir, 'before-migration.jsonl'));
    assert(readFileSync(join(row.dir, 'session.jsonl')).subarray(0, before.length).equals(before), 'old log byte prefix preserved');
  }
  const journal = join(row.dir, 'session.jsonl.pi-compact-state.json');
  if (row.lane && row.lane !== 7 && row.variant !== 'baseline') assert.equal(json(journal).kind, 'idle');
  assert(!existsSync(join(row.dir, 'session.jsonl.pi-compact-pending.json')), 'no unsettled pending');
  if (row.lane === 6) {
    const entry = checkpoints.at(-1); const value = checkpoint(entry);
    const preparation = prepareCompaction(readableBranch(branch(entry.parentId)), { enabled: true, reserveTokens: 1001, keepRecentTokens: 40 });
    assert.equal(preparation.firstKeptEntryId, entry.firstKeptEntryId);
    const serialized = host.serializeConversation(host.convertToLlm([...preparation.messagesToSummarize, ...preparation.turnPrefixMessages]));
    const requests = log.filter(event => event.event === 'actual-request' && event.phase === 'native');
    assert.equal(requests.length, value.segments.length);
    let end = 0; let previous;
    for (const [index, segment] of value.segments.entries()) {
      assert.equal(segment.start, end); end = segment.end;
      const chunk = serialized.slice(segment.start, segment.end);
      assert.equal(segment.hash, digest(chunk));
      assert.deepEqual(segment.entries, value.source.entries);
      const prompt = requests[index].body.messages.flatMap(message => typeof message.content === 'string' ? [message.content] : message.content.map(part => part.text ?? '')).join('\n');
      assert(prompt.includes('<conversation>\n[User]: ' + chunk + '\n</conversation>'), 'actual segment equals original serialized slice');
      if (previous) assert(prompt.includes('<previous-summary>\nReadable continuation. ' + previous + '\n</previous-summary>'), 'previous segment summary carried forward');
      previous = log.find(event => event.event === 'recall-evidence' && event.phase === 'native' && event.at > requests[index].at).recovered;
    }
    assert.equal(end, serialized.length, 'full range, not last fragment');
    const sourceMessages = host.buildSessionProjection(readableBranch(branch(entry.parentId))).messages;
    const calls = sourceMessages.flatMap(message => message.role === 'assistant' ? message.content.filter(part => part.type === 'toolCall').map(part => part.id) : []);
    const results = sourceMessages.filter(message => message.role === 'toolResult').map(message => message.toolCallId);
    for (const id of calls) assert(results.includes(id), 'complete source tool group');
    audited.push({ lane: 6, serializedUtf16: serialized.length, segments: value.segments.length, tools: calls.length, coverageEntries: value.source.entries.length });
  }
  audited.push({ lane: row.lane, variant: row.variant, kind: row.kind, checkpoints: checkpoints.map(entry => ({ id: entry.id, kind: checkpoint(entry).kind, source: checkpoint(entry).source })), events: log.filter(event => ['compaction_start','compaction_end','extension-success','actual-request'].includes(event.event)).map(event => ({ at: event.at, event: event.event, phase: event.phase, model: event.model, account: event.account, id: event.id, success: event.success, journal: event.journal })) });
}
const report = { pass: true, role: 'owner evidence audit, not independent acceptance', run, edge, product: source, audited };
writeFileSync(join(root, 'artifacts/P4/evidence-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: true, run, edge, rows: rows.length }));
