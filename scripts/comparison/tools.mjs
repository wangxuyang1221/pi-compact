import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { hashJSON } from './spec.mjs';
import { refuse, privateTree } from '../live/guard.mjs';
const object = properties => ({ type: 'object', properties, additionalProperties: false, required: Object.keys(properties) });
const string = { type: 'string' };
export const toolSchema = { version: 'comparison-tools/v2', tools: [
  { name: 'record_checkpoint', description: 'First operation, exactly once, before workspace access. Record recalled facts, pending task IDs and state at compaction. Unknown values may be null. No answers returned.', parameters: object({ facts: { type: 'object', additionalProperties: { anyOf: [string, { type: 'number' }, { type: 'boolean' }, { type: 'null' }] } }, pending: { type: 'array', items: string }, state: { type: 'object', additionalProperties: { anyOf: [string, { type: 'integer' }, { type: 'boolean' }, { type: 'null' }] } } }) },
  { name: 'workspace_read', description: 'Read one existing regular file within this task workspace.', parameters: object({ path: string }) },
  { name: 'workspace_write', description: 'Replace the business module only, with complete JavaScript module source (maximum 64000 characters).', parameters: object({ path: string, content: string }) },
  { name: 'workspace_edit', description: 'Replace one unique exact text span in the business module only.', parameters: object({ path: string, oldText: string, newText: string }) },
  { name: 'run_regression', description: 'Fixed host regression runner. No shell command. Executes the current module in an OS sandbox and returns aggregate passed/total only, never test inputs, expected values or oracle source.', parameters: object({}) },
] };
export function createTools({ workspace, truth, score }) {
  let record = null, attempted = false, violated = false, accesses = 0, firstRecordCall, firstRecordArguments;
  const observed = [];
  const observeCalls = content => {
    for (const call of Array.isArray(content) ? content.filter(p => p.type === 'toolCall') : []) {
      observed.push({ name: call.name, id: call.id });
      if (call.name === 'record_checkpoint') {
        if (firstRecordCall !== undefined) violated = true;
        else { firstRecordCall = call.id; firstRecordArguments = hashJSON(call.arguments); }
      } else if (firstRecordCall === undefined && !record) violated = true;
    }
  };
  const log = [];
  const ensureRecord = () => { if (!record) { violated = true; refuse('CHECKPOINT_FIRST_REQUIRED'); } };
  const pathFor = (path, writable) => {
    privateTree(workspace);
    if (typeof path !== 'string' || path.includes('..') || path.startsWith('/') || path.includes('\\') || resolve(workspace, path) !== join(workspace, path) || (!truth.protectedFiles.includes(path) && path !== truth.module) || (writable && path !== truth.module)) refuse('WORKSPACE_PATH_DENIED');
    return join(workspace, path);
  };
  const perform = async (name, input, callId) => {
    log.push({ name, sequence: log.length + 1 });
    if (name === 'record_checkpoint') {
      if (firstRecordCall !== undefined && (callId !== firstRecordCall || hashJSON(input) !== firstRecordArguments)) { violated = true; refuse('CHECKPOINT_FIRST_ATTEMPT_LOCKED'); }
      if (attempted) { violated = true; refuse('CHECKPOINT_ALREADY_ATTEMPTED'); }
      attempted = true;
      if (!input || Object.keys(input).sort().join(',') !== 'facts,pending,state' || ![input.facts, input.state].every(v => v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(x => x === null || ['string', 'boolean', 'number'].includes(typeof x))) || !Array.isArray(input.pending) || !input.pending.every(x => typeof x === 'string')) { violated = true; refuse('CHECKPOINT_TYPE_INVALID'); }
      record = structuredClone(input); return { recorded: true };
    }
    ensureRecord(); accesses++;
    if (name === 'workspace_read') return { content: fs.readFileSync(pathFor(input.path, false), 'utf8') };
    if (name === 'workspace_write' || name === 'workspace_edit') {
      const path = pathFor(input.path, true);
      let content = input.content;
      if (name === 'workspace_edit') {
        const old = fs.readFileSync(path, 'utf8');
        if (!input.oldText || old.split(input.oldText).length !== 2) refuse('EDIT_UNIQUE_MATCH_REQUIRED');
        content = old.replace(input.oldText, input.newText);
      }
      if (typeof content !== 'string' || content.length > 64000) refuse('SOURCE_LIMIT');
      fs.writeFileSync(path, content, { mode: 0o600 }); return { written: true };
    }
    if (name === 'run_regression') { const result = await score(fs.readFileSync(pathFor(truth.module, false), 'utf8')); return { passed: result.passed, total: result.total, ...(result.error ? { error: result.error } : {}) }; }
    refuse('TOOL_NOT_ALLOWED');
  };
  return { get record() { return record; }, get capturedFirst() { return !!record && !violated && log[0]?.name === 'record_checkpoint'; }, get log() { return log; }, get observed() { return observed; }, observeCalls, get accesses() { return accesses; }, perform, definitions: toolSchema.tools.map(t => ({ ...t, label: t.name, execute: async (id, input) => ({ content: [{ type: 'text', text: JSON.stringify(await perform(t.name, input, id)) }], details: {} }) })) };
}
