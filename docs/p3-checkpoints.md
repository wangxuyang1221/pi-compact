# Checkpoints and readable recovery

P3 adds Codex protocol support to the existing Pi 1.5.2 session controller. Pi still owns manual and automatic preparation, extension cancellation, summary execution, the single checkpoint append, and completion notifications. Normal installation continues to use native text compaction until P4 verifies provider migration.

## Development isolation

The intermediate remote path requires `PI_COMPACT_P3_DEV=fixture-only`, an active `openai-codex` model using `openai-codex-responses`, model ID `gpt-6-astra`, an effective OAuth account, and the exact synthetic endpoint `https://fixture.invalid/backend-api`. The fixture runner supplies those values in its isolated agent directory. The ordinary package never enables remote requests to real services in P3. P4 must replace this development restriction after migration acceptance. This is an implementation boundary, not a user configuration feature.

The extension asks the current ModelRuntime for effective authorization. Another provider's credentials do not change the active model. Checkpoints store a SHA-256 account identifier, provider, normalized endpoint, protocol, model, and the tested encoder capability. They never store access tokens, refresh tokens, or headers. Provider error text is not copied into remote fallback metadata.

## Persisted representation

A native compaction entry carries `details.piCompact`, with `schemaVersion: 1` and mutually exclusive `kind: text` or `kind: opaque`. Text checkpoints contain their native summary and segment coverage. Opaque checkpoints contain the complete ordered output items and a validated token budget. The native summary field contains display metadata for opaque entries. It is never used as provider context.

`source` records the source leaf, first retained entry, ordered covered entry IDs, and a hash of their effective readable projection. Active-branch traversal and context edits determine that projection. A changed covered source invalidates replay and requires readable compaction. A branch before a checkpoint has no reference to it. Original session entries remain in the JSONL log.

The managed projection marks the native compaction message with its checkpoint entry ID. P2 snapshots and occurrence reconstruction preserve that structural reference. The final conversion resolves the reference against the active branch. Pi's tested Codex encoder serializes an assistant's structured signature items in order. The adapter uses that existing encoder capability to emit every checkpoint item, then verifies the actual outgoing wire sequence. It never searches a summary string for replacement. Unsupported wire structures or lost references stop the request.

## Remote completion and budget

Remote compaction appends `compaction_trigger` to the actual Pi-encoded input. Manual compaction instructions remain in the request. Request validation accepts the SDK's developer `additional_tools` declarations; these declarations are not valid checkpoint output. A completed terminal event must agree with complete, contiguous stream items. An explicitly empty terminal `output` is reconstructed from those items, provided no advertised item remains unfinished. Missing or null terminal output is rejected. The result requires one nonempty compaction item, supported message content, unique item IDs, and complete function-call relationships. A truncated stream, unknown item, unusable usage, or malformed result fails before append.

The budget method is `codex-ciphertext-bytes-v1`. It charges the larger of the complete wire JSON's UTF-8 byte length plus 32 per item, or twice the response's positive integer output-token usage. The stored byte count and budget are recomputed on read. Unknown cost is never zero. Wire data is also limited to 8 MiB. Normal requests reserve the model's output capacity and include the opaque charge, retained messages, and current input.

This is a conservative local estimate, not an exact tokenizer result or a proved service-side upper bound. The inspected Codex reference estimates a compaction at approximately one token per twelve ciphertext bytes and explicitly notes possible underestimation for older formats. P3 charges at least one token per complete serialized byte and checks reported usage as additional evidence. Only the isolated, tested capability is enabled. P6 must validate real-service behavior before widening compatibility. Unsupported representations take the readable path or stop with a retry message.

## Readable fallback

Remote success does not request a text summary. Explicit remote failure resumes the native default-summary path within the same execution lease. Cancellation checks the combined native and controller signals and skips fallback. There is no extension timeout.

When an active branch contains opaque history, `getBranch` supplies a readable branch only within that compaction operation. It removes compaction entries, retains original source entries and branch summaries, reparents that temporary view, and lets Pi's native preparation apply context edits and select the retained boundary. Public reads and unrelated sessions keep their normal behavior. P4 can reuse `readableBranch` and `coverage`.

For large recovered history, the native conversation serializer produces a readable stream. Bounded slices are summarized sequentially through Pi's native default compaction, carrying the previous text summary. Slice boundaries preserve surrogate pairs. Each slice records its UTF-16 offsets and hash, and the final checkpoint records full ordered source coverage. Only the final result is appended. Each actual summary request is capacity checked. Failure in any slice retains the old checkpoint and original history. An unrepresentable or oversized summary stops rather than sending an opaque label to native summarization.

## Durability

The partial-write experiment found that Pi rolls back its memory after an append error but leaves partial JSONL bytes. P3 therefore adds an adjacent `*.pi-compact-pending.json` around the existing append. The record contains the operation ID, previous byte length and hash, and expected append bytes. It is atomically persisted and synced before native append. No full session rewrite is introduced.

The adapter reads back and fsyncs the exact appended entry. It validates pending capacity, persists idle state, removes the pending record, and syncs the directory before releasing successful completion events. A failure rolls back only the recorded suffix and reloads the managed projection. The in-memory record also permits rollback if pending-record deletion succeeded before reporting an error.

On restart, an unfinished append is rolled back under the session lock and restored as blocked. The original byte prefix must match. Recovery accepts only the expected append prefix, optionally followed by the single newline Pi's loader adds to an unterminated tail. An unrelated suffix is not truncated. The previous valid checkpoint remains available, and explicit `/compact` is required to resume. If the filesystem also prevents recovery, the session stays blocked and retains the pending evidence.

While append recovery is incomplete, ordinary input and direct manager writes cannot change the session log. Read-only extension commands remain available. Explicit `/compact` first restores the old bytes and reloads the manager and agent context; it starts a new summary only after recovery succeeds. Restoring filesystem access alone does not resume normal input.

These guarantees concern process interruption and the tested filesystem failures. They do not assert arbitrary hardware failure recovery or coordinate writers that bypass this extension. The existing pre-loader metadata and separate-manager limitations still apply.

## Reproduce

Run `pnpm lint`, `pnpm typecheck`, and `pnpm test`. Run `pnpm verify:p3` for all ten lanes, persistence faults, and the edge cases. `node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p3.mjs --lane 10` selects interrupted-write lane 10 and persistence faults. `scripts/p3/edges.mjs` adds a native control, disabled-default control, bad output, returned tools, context edits, branch deletion, large readable fallback, and real tool execution.

Run `pnpm verify:perf --pr P3` for 30 alternating native/head pairs with 1 MiB synthetic source messages. The local metric excludes fixture fetch work, startup, and seeding. It includes summary input handling, product serialization, and stream parsing. Preparation, commit, fixture success to actual continuation, peak RSS, failures, and source hashes are recorded separately. `P3_PAIRS=1 P3_PROFILE=1` runs a separate CPU profile for diagnosis, not a reported performance sample.

Every provider interaction is a synthetic transport fixture. The preload blocks sockets and real configuration reads. The ordinary launcher, loader, AgentSession, SessionManager, tools, and TUI remain real. The report links actual requests, JSONL, recovery records, terminal captures, package contents, and cleanup evidence. Independent review and P4 remain pending at P3 handoff.
