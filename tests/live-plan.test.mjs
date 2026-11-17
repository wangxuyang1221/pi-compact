import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DurableLedger, guardedFetch, validateGrant, digest } from '../scripts/live/guard.mjs';
import { plan, fixtureGrant } from '../scripts/live-acceptance.mjs';
let sequence = 0;
const setup = overrides => {
  const dir = resolve('artifacts/P6-executor/tests', `${process.pid}-${++sequence}`);
  const grant = { ...fixtureGrant(dir, 'a'.repeat(64)), ...overrides };
  const ledger = new DurableLedger(grant);
  return { dir, grant, ledger };
};
const options = { method: 'POST', body: JSON.stringify({ model: 'gpt-6.1-sol', stream: true, max_output_tokens: 1000, input: [] }) };
const response = () => new Response('data: {}\n\n', { headers: { 'content-type': 'text/event-stream' } });
const send = ledger => guardedFetch(ledger, ledger.grant.targets[0], response);
const url = 'https://fixture.invalid/backend-api/codex/responses';
test('dry-run/help and missing grant never load host or access auth', () => {
  for (const args of [[], ['--help'], ['--execute']]) {
    const result = spawnSync(process.execPath, ['scripts/live-acceptance.mjs', ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: '/unavailable-auth' } });
    assert.equal(result.status, args[0] === '--execute' ? 1 : 0);
    if (!args.length) assert.deepEqual(JSON.parse(result.stdout), plan);
    if (args[0] === '--execute') assert.match(result.stderr, /GRANT_REQUIRED/);
  }
});
test('fixture grants cannot activate real and binding/expiry/allowlist is enforced', () => {
  const { grant, ledger, dir } = setup(); ledger.close();
  const binding = { mode: 'offline-fixture', taskHash: grant.taskHash, packageHash: grant.packageHash, evidenceDir: dir };
  assert.deepEqual(validateGrant(grant, binding), grant);
  for (const [change, context] of [[{}, { mode: 'real' }], [{ expiresAt: '2000-01-01' }, {}], [{ taskHash: 'bad' }, {}], [{ allowAuthRefresh: true }, {}], [{ targets: [] }, {}], [{ maxDispatches: 13 }, {}]]) assert.throws(() => validateGrant({ ...grant, ...change }, { ...binding, ...context }));
});
test('send reservations persist before response and survive restart without refunds', async () => {
  const { grant, ledger } = setup({ maxDispatches: 2 });
  let sent = 0;
  const fetch = guardedFetch(ledger, grant.targets[0], () => { assert.equal(JSON.parse(fs.readFileSync(ledger.path)).rows.length, ++sent); return response(); });
  await fetch(url, options); ledger.close();
  const restored = new DurableLedger(grant);
  await send(restored)(url, options);
  await assert.rejects(send(restored)(url, options), /BUDGET_EXHAUSTED/);
  assert.equal(restored.rows.length, 2); restored.close();
});
test('concurrent fetch attempts and simulated implicit retries share hard cap', async () => {
  const { ledger } = setup({ maxDispatches: 2 });
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => send(ledger)(url, options)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2);
  assert.equal(ledger.rows.length, 2); ledger.close();
});
test('single owner prevents another process and crash leaves fail-closed lock', () => {
  const { grant, ledger, dir } = setup();
  const grantFile = dir + '/grant.json'; fs.writeFileSync(grantFile, JSON.stringify(grant));
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import {DurableLedger} from './scripts/live/guard.mjs'; import fs from 'node:fs'; new DurableLedger(JSON.parse(fs.readFileSync(process.argv[1])));`, grantFile], { encoding: 'utf8' });
  assert.notEqual(child.status, 0); assert.match(child.stderr, /LEDGER_LOCKED/); ledger.close();
  const crashed = spawnSync(process.execPath, ['--input-type=module', '-e', `import {DurableLedger} from './scripts/live/guard.mjs'; import fs from 'node:fs'; const l=new DurableLedger(JSON.parse(fs.readFileSync(process.argv[1]))); l.reserve({inputTokens:10,outputTokens:1000}); process.exit(42);`, grantFile], { encoding: 'utf8' });
  assert.equal(crashed.status, 42);
  assert.equal(JSON.parse(fs.readFileSync(dir + '/ledger.json')).rows.length, 1);
  assert.throws(() => new DurableLedger(grant), /LEDGER_LOCKED/);
});
test('abort, expiry and input/output budget reject before actual send', async () => {
  for (const override of [{ maxEstimatedInputTokens: 1 }, { maxReservedOutputTokens: 999 }, {}]) {
    const { ledger } = setup(override);
    await assert.rejects(send(ledger)(url, { ...options, ...(!Object.keys(override).length ? { signal: AbortSignal.abort() } : {}) }));
    assert.equal(ledger.rows.length, 0); ledger.close();
  }
  const { ledger } = setup({ expiresAt: '2000-01-01' });
  await assert.rejects(send(ledger)(url, options), /GRANT_EXPIRED/); ledger.close();
});
test('actual storage failure poisons owner and cannot cause an unrecorded send', async () => {
  const { ledger } = setup(); fs.mkdirSync(ledger.path + '.next');
  let calls = 0;
  const fetch = guardedFetch(ledger, ledger.grant.targets[0], () => { calls++; return response(); });
  await assert.rejects(fetch(url, options), /LEDGER_PERSIST_FAILED/);
  await assert.rejects(fetch(url, options), /LEDGER_CLOSED/);
  assert.equal(calls, 0); ledger.close();
});
test('endpoint, model, transport, redirect and missing cap are rejected', async () => {
  const { ledger } = setup();
  for (const bad of [url + '?token=secret', 'https://evil.invalid/a', url.replace('https', 'wss')]) await assert.rejects(send(ledger)(bad, options));
  for (const patch of [{ model: 'unapproved' }, { stream: false }, { max_output_tokens: undefined }]) await assert.rejects(send(ledger)(url, { ...options, body: JSON.stringify({ ...JSON.parse(options.body), ...patch }) }));
  assert.equal(ledger.rows.length, 0);
  await assert.rejects(guardedFetch(ledger, ledger.grant.targets[0], () => new Response('', { status: 302, headers: { location: 'https://evil.invalid?token=secret' } }))(url, options), /REDIRECT_DENIED/);
  assert.equal(ledger.rows.length, 1); ledger.close();
});
test('public ledger contains allowlisted metadata, never headers, body or exception text', async () => {
  const { ledger } = setup();
  const fetch = guardedFetch(ledger, ledger.grant.targets[0], () => { throw new Error('Bearer secret account=user cookie=x https://x?token=secret'); });
  await assert.rejects(fetch(url, { ...options, headers: { authorization: 'Bearer secret', cookie: 'secret' }, body: JSON.stringify({ ...JSON.parse(options.body), input: 'secret encrypted_content=secret' }) }), /HOST_OR_TRANSPORT_FAILURE/);
  const saved = fs.readFileSync(ledger.path, 'utf8'); assert(!/secret|Bearer|cookie|encrypted_content/.test(saved)); ledger.close();
});

test('preflight CLI denies missing/expired/mismatched grants with side-effect audit', () => {
  const { grant, ledger, dir } = setup(); ledger.close();
  const log = dir + '/effects.log'; fs.writeFileSync(log, '');
  const pkg = dir + '/package.tgz'; fs.writeFileSync(pkg, 'synthetic archive never opened');
  const grantPath = dir + '/invalid-grant.json';
  for (const args of [[], ['--help'], ['--execute']]) {
    spawnSync(process.execPath, ['--import=./tests/fixtures/live-preflight.mjs', 'scripts/live-acceptance.mjs', ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: '/missing', ACCEPTANCE_PREFLIGHT_LOG: log } });
  }
  for (const change of [{ authorized: false }, { expiresAt: '2000-01-01' }, { taskHash: 'mismatch' }]) {
    fs.writeFileSync(grantPath, JSON.stringify({ ...grant, mode: 'real', targets: plan.targets, packageHash: digest(fs.readFileSync(pkg)), evidenceDir: resolve('artifacts/P6-executor/runs/preflight-invalid'), authPath: '/unavailable/auth.json', explicitUserAuthorization: 'INVALID TEST ONLY', ...change }));
    const run = spawnSync(process.execPath, ['--import=./tests/fixtures/live-preflight.mjs', 'scripts/live-acceptance.mjs', '--execute', '--grant', grantPath, '--package', pkg, '--evidence', resolve('artifacts/P6-executor/runs/preflight-invalid')], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: '/missing', ACCEPTANCE_PREFLIGHT_LOG: log } });
    assert.equal(run.status, 1); assert.match(run.stderr, /GRANT_/);
  }
  assert.equal(fs.readFileSync(log, 'utf8'), '');
});

test('reserved-but-unsent requests are not refunded after reopening the ledger', async () => {
  const { grant, ledger } = setup({ maxDispatches: 1 });
  ledger.reserve({ inputTokens: 10, outputTokens: 1000 }); ledger.close();
  const restored = new DurableLedger(grant);
  await assert.rejects(send(restored)(url, options), /BUDGET_EXHAUSTED/);
  assert.equal(restored.rows[0].state, 'reserved'); restored.close();
});

test('continuation prompt does not supply expected unfinished status', async () => {
  const { task, score } = await import('../scripts/live/task.mjs');
  assert(!task.continuation.includes('unfinished.'));
  assert(!task.continuation.includes(task.unfinished));
  assert.equal(score('FACT_PENDING=idempotency_test. The idempotency test is completed.', task.files['ledger.csv']).unfinished, false);
});
