import fs from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { discoverHost } from './host.mjs';
import { DESIGN, ARTIFACT, readJSON, normalizeHistory, models, controls, hashJSON } from './spec.mjs';
import { networkBoundary } from '../live/network.mjs';
const installed = discoverHost();
const network = networkBoundary('offline-fixture');
try {
  const { prepareCompaction } = await import(pathToFileURL(join(installed.installed, 'dist/core/compaction/compaction.js')).href);
  const rows = [];
  for (const model of models) for (const stem of ['settlement', 'redirect']) for (const version of [1, 2]) {
    const task = `${stem}-v${version}`, base = version === 1 ? DESIGN : ARTIFACT;
    const history = readJSON(join(base, 'datasets', task, 'history.json')), entries = normalizeHistory(history, model);
    const prepared = prepareCompaction(entries, controls.compaction);
    assert.equal(prepared.firstKeptEntryId, version === 1 ? 'e226' : 'e227'); assert.equal(prepared.isSplitTurn, version === 1);
    rows.push({ task, model, rawHistoryHash: hashJSON(history), normalizedMessageHash: hashJSON(entries.map(e => e.message)), firstKeptEntryId: prepared.firstKeptEntryId, isSplitTurn: prepared.isSplitTurn, prefixEntries: prepared.messagesToSummarize.length, turnPrefixEntries: prepared.turnPrefixMessages.length, longestToolResultCharacters: Math.max(...history.filter(m => m.role === 'toolResult').map(m => m.content[0].text.length)), priorSummary: prepared.previousSummary ?? null, settings: prepared.settings });
  }
  const evidence = { realMeasurements: false, providerRequests: 0, authReads: 0, installedHostHash: installed.sourceHash, rows, cleanup: await network.close() };
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(evidence));
} finally { await network.close(); }
