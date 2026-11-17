# Model changes and session recovery

pi-compact checks the active branch before each request. An incompatible opaque checkpoint becomes a readable text checkpoint before the target receives a normal request. Compatible Codex continuation does not generate an extra summary.

## Capability and authorization

The supported host is Pi 1.5.2. Remote operations require `openai-codex`, the `openai-codex-responses` encoder, effective OAuth with a usable account claim, and the ChatGPT backend endpoint. The isolated test endpoint uses the same encoder and protocol. There is no development environment switch or exact model-ID equality requirement.

Schema 1 checkpoints bind the complete wire representation to a provider, normalized endpoint, `compaction_trigger` protocol, account hash and encoder capability. Model IDs remain provenance. Compatibility compares those capabilities rather than assuming a model name proves compatibility. The installed encoder can preserve the ordered wire for another model on the same capability. Its preceding message transformer strips signatures on a model-ID change, so the adapter changes only the replay message's transient model tag after compatibility succeeds. The stored source identity and wire remain unchanged. The final payload must contain the complete ordered checkpoint.

The endpoint allowlist is `https://chatgpt.com/backend-api` and the non-routable fixture endpoint `https://fixture.invalid/backend-api`. Other endpoints use native summaries or readable recovery. Opaque requests use SSE explicitly. WebSocket, arbitrary proxy endpoints, and other encoders are not enabled for opaque traffic.

The local capability is evidence about encoding, account separation and protocol handling. It is not a claim that every service model accepts the protocol. Real service evidence remains the earlier single `gpt-6-astra` probe. P4 uses synthetic `gpt-6-astra`, `gpt-6.1-sol` and DeepSeek models through the installed provider encoders. P6 still requires separately authorized service and quality acceptance.

Opaque capacity uses the P3 full-wire byte estimate and positive output usage. This is not a proved server token bound. Unknown schemas, invalid budgets and unsupported wire representations reject before replay. The plugin does not infer a monetary price from a zero local cost field or subscription usage.

## Conversion

Pi retains its native preparation, hooks, tool boundaries, cancellation and single checkpoint append. The existing session controller runs migration through native automatic compaction before admitting the pending request. Manual retry uses the same migration decision.

If the original Codex model and account are still available, that source reads the opaque checkpoint and returns a complete readable summary. The source account and endpoint must match. Credentials are resolved through the running ModelRuntime and never saved in a checkpoint. Another account cannot be used to read the old opaque state.

The native summarizer combines that text with any newly covered messages in one history region. That region includes any newly covered turn prefix once; it does not also generate a separate prefix summary. The native retained cut and tool ordering are preserved. If the source cannot read the checkpoint, the native path reconstructs the effective original history. Context edits and deletions are applied before reconstruction. Missing source history rejects the operation. Source authorization changing during an active conversion invalidates the operation instead of committing its late result.

Large readable input is serialized through Pi and summarized in bounded sequential slices. Every slice receives the previous summary. The checkpoint records the complete effective source coverage and each slice's offsets and hash. A source-read segment records its original ordered wire and uses the `wire` unit; readable slices use UTF-16 offsets. Recent messages and tool groups remain under Pi's native cut and the existing request reconstruction rules. A segment that cannot fit stops the operation. Ordinary native summaries without opaque history retain Pi's small-window behavior.

Only the final text checkpoint is appended. Append, fsync, readback, pending recovery and rollback use the P3 transaction. Cancellation, summary failure, stale selection or failed persistence leave the old checkpoint available and prevent the target normal request. There is no plugin timeout.

## Model changes during requests

Each operation records the selected model, selection epoch and source revision. A session reload or manager mutation invalidates the running operation even when its leaf ID remains unchanged. Explicit retry captures the current source again. An A-to-B-to-A change still invalidates the old operation. A branch change, source edit or session reload also invalidates cached source verification. The cache is keyed by checkpoint, active leaf and manager mutation revision; it avoids repeatedly hashing an unchanged large source during one request.

A model change before dispatch rejects the old in-flight request. It does not redirect an already encoded request to the new provider. If it changes during migration, the operation becomes blocked. Run `/compact` to retry with the final selection. This preserves the existing rule that model changes do not clear a failed compaction.

Opaque dispatch pins effective credentials and SSE transport. After public payload hooks, the adapter rechecks the selected model, branch, source, effective account, endpoint, input capacity and ordered wire outside the hooks that Pi can swallow. The last local boundary is the validated payload handed to the provider. Once a request has been dispatched, subsequent selection or credential changes cannot retroactively unsend it. Accepted readable text is account-independent; later requests use the newly selected credentials.

## Verification

Run `node scripts/verify-p4-fixes.mjs` for same-leaf reload rejection and retry, plus split-turn source and raw fallback coverage.

Run `pnpm verify:p4` for the ten TUI lanes and `node scripts/p4/edges.mjs` for late changes, deleted context, unsupported schema, unavailable ancestry, failures and tools. Both use the ordinary installed launcher, loader, SessionManager and TUI. Only network responses and synthetic data are fixtures. No real credentials or history are read.

Run `pnpm verify:perf --pr P4` for alternating native text and head opaque restoration at 1 MiB and 10 MiB. It records actual warm disk reread, first request through provider encoding, selection, startup wall time and separate conversion work. `P4_PAIRS=1 P4_PROFILE=1` creates diagnostic profiles and is not a reported performance sample. See `artifacts/P4/REPORT.md` for the exact tested revision, failures, limits and artifacts.
