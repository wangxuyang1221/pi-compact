# Recover a paused session

## Retry a recoverable failure

Keep the original session JSONL and adjacent `.pi-compact-state.json`, `.pi-compact-pending.json` and lock records together. Stop competing writers. Restore filesystem access or provider availability, then resume through the extension and run `/compact`. A successful explicit retry is required before normal continuation. Cancellation does not trigger native fallback. Do not delete a blocked-state record to bypass it.

Interrupted append recovery checks the original byte prefix under the session lock. It rolls back only the known pending suffix and retains the previous accepted checkpoint. An unrelated suffix or missing source prevents recovery. If filesystem access still fails, keep the records and stop attempting ordinary input.

## Make an opaque session readable before removal

Keep the extension enabled. Select an incompatible provider through Pi's model selector and run `/compact`. Conversion uses the original compatible account if available, or reconstructs readable original history. This can require multiple model requests for large history. If conversion fails, the session remains blocked and the original opaque checkpoint remains active.

Verify `Ctrl+O` now shows an actual readable summary. Verify the newest active compaction entry is `kind: text` under `details.piCompact` before disabling the extension. P6 fixture evidence verifies this conversion, then ordinary removal and native text-session continuation. It does not promise a readable result when source history is absent or the serializer omitted content.

## Recover from corrupt active data

A malformed active budget/provider can exit at startup before the UI is available. `/compact` cannot be used in that process. Stop Pi and preserve a byte-for-byte copy of the original JSONL and all adjacent records before further diagnosis. Work only on a separate copy. Restore a known-good backup with its matching records and resume it through the supported extension. If no known-good backup exists, automated repair is unsupported. Request offline diagnosis of the preserved copy or begin a new session using independently verified source files.

Do not hand-edit/delete opaque entries, pending suffix records or budgets. Do not claim an earlier branch is recoverable without validating that branch and its ancestry. Reopening a valid checkpoint and normal explicit retry are tested. Arbitrary corruption repair is not tested. Uninstalling is not a corruption repair operation.
