import fs from 'node:fs';
import { join } from 'node:path';
import { DESIGN, ARTIFACT, tasks, readJSON, fileManifest } from './spec.mjs';
const changes = [];
for (const id of tasks) {
  const old = id.replace('-v2', '-v1'), source = join(DESIGN, 'datasets', old), dest = join(ARTIFACT, 'datasets', id);
  if (fs.existsSync(dest)) throw new Error('Version exists; refuse to overwrite frozen dataset');
  fs.cpSync(source, dest, { recursive: true });
  const raw = readJSON(join(dest, 'history.json'));
  for (const m of raw) if (m.role === 'assistant' && typeof m.content === 'string') m.content = [{ type: 'text', text: m.content }];
  raw.at(-1).content += '\nCompleted maintenance audit indices: ' + Array.from({ length: 17 }, (_, i) => i).join(', ');
  const continuation = readJSON(join(dest, 'continuation.json'));
  continuation.prompt = continuation.prompt.replace('read/edit/write/bash', 'workspace_read/workspace_edit/workspace_write/run_regression');
  continuation.toolPolicy = 'record_checkpoint first and once, before any workspace read/edit/write/test; workspace_read/edit/write allowlisted regular files only; run_regression fixed host scorer in OS sandbox, aggregate scores only; no shell; oracle/history inaccessible';
  const truth = readJSON(join(dest, 'oracle/groundtruth.json')); truth.id = id;
  for (const [name, value] of [['history.json', raw], ['continuation.json', continuation], ['oracle/groundtruth.json', truth]]) fs.writeFileSync(join(dest, name), JSON.stringify(value, null, 2) + '\n');
  changes.push({ from: old, to: id, reason: 'Before model results: valid Pi assistant blocks produce v1 cut e226 with isSplitTurn=true. Add a truthful noncritical maintenance audit-index note (0..16) to retained final user message; v2 cut e227 is a user boundary. Critical contracts and workspace/oracle cases unchanged. Restricted tool names replace generic bash; no arbitrary commands.', v1UnnormalizedDiagnostic: { cut: 'e222', isSplitTurn: true }, v1Normalized: { cut: 'e226', isSplitTurn: true }, requiredV2: { cut: 'e227', isSplitTurn: false } });
}
fs.writeFileSync(join(ARTIFACT, 'dataset-revisions.json'), JSON.stringify({ schema: 2, beforeAnyModelResult: true, changes }, null, 2) + '\n');
fs.writeFileSync(join(ARTIFACT, 'dataset-manifest.json'), JSON.stringify({ schema: 2, files: fileManifest(join(ARTIFACT, 'datasets')) }, null, 2) + '\n');
