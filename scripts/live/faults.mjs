import fs from 'node:fs';
import { guardedFetch, decodedBody } from './guard.mjs';
export const faults = ['implicit-retry', 'retry-cap', 'concurrent', 'abort-after-reserve', 'multi-slice', 'budget', 'input-budget', 'output-budget', 'expired', 'persist-failure', 'abort', 'endpoint', 'model', 'cap', 'http-failure', 'redaction', 'auth-refresh', 'stream-failure', 'crash-after-reserve'];
export function faultFetch({ name, ledger, target, send, phase }) {
  let attempts = 0;
  const controller = new AbortController();
  const actual = guardedFetch(ledger, target, async (url, options) => {
    attempts++;
    if (name === 'abort-after-reserve') controller.abort();
    if (name === 'crash-after-reserve') process.exit(42);
    if (name === 'redaction') throw new Error('Bearer TEST_SECRET cookie=TEST_SECRET account=TEST_SECRET https://example.invalid?token=TEST_SECRET');
    if (name === 'http-failure' || (['implicit-retry', 'retry-cap'].includes(name) && attempts === 1)) return new Response('Synthetic failure', { status: 503, headers: { 'retry-after-ms': '1' } });
    if (name === 'stream-failure' || (name === 'multi-slice' && decodedBody(options).raw.includes('Convert this checkpoint to a complete readable continuation summary.'))) return new Response('data: {"type":"response.failed","response":{"error":{"message":"TEST_SECRET"}}}\n\n', { headers: { 'content-type': 'text/event-stream' } });
    return send(url, options);
  }, phase);
  return async (url, options) => {
    if (name === 'expired') ledger.grant.expiresAt = '2000-01-01';
    if (name === 'persist-failure' && !fs.existsSync(ledger.path + '.next')) fs.mkdirSync(ledger.path + '.next');
    if (name === 'abort') options = { ...options, signal: AbortSignal.abort() };
    if (name === 'endpoint') url = 'https://evil.invalid?token=TEST_SECRET';
    if (name === 'auth-refresh') return globalThis.fetch('https://auth.openai.com/oauth/token', { method: 'POST', body: 'TEST_SECRET' });
    if (name === 'abort-after-reserve') options = { ...options, signal: controller.signal };
    if (name === 'concurrent') {
      const results = await Promise.allSettled([actual(url, options), actual(url, options)]);
      const success = results.find(r => r.status === 'fulfilled');
      if (success) return success.value;
      throw results[0].reason;
    }
    return actual(url, options);
  };
}
