# Native compaction adapter

The P1 adapter gives Pi 1.5.2 a session-scoped failure barrier. Pi still selects the compaction cut, executes tools, generates native text summaries, and appends its checkpoint. The package loads through Pi's ordinary extension loader.

## State and requests

`CompactionController` owns `idle`, `running`, and `blocked`. Each running operation has an ID, an AbortController, and a generation. A failed, cancelled, or insufficient compaction blocks normal requests. Only the native TUI `/compact` command grants explicit retry intent. Extension calls to `ctx.compact()` retain ordinary manual behavior while idle and cannot unlock a failed session.

An execution lease remains held until the native promise, failure hooks, and native cleanup finish. An explicit retry during failure cleanup waits for that lease. Appends, completion events, and late failures carry the originating operation identity. A successful completion releases the execution lease before notifying the TUI to resume its queue.

The adapter checks the canonical projection in `agent.prepareRequest`, after Pi records the new input. Pi's next-turn boundary still waits for the complete tool batch. The stream wrapper checks the actual message budget and state again, then checks the generation after the native provider payload callback. An extension that changes the final payload is rejected because its request budget has not been validated.

Automatic compaction respects Pi's enabled setting and reserve threshold. The final request check reserves the model's output capacity against its context window even when automatic compaction is disabled. A disabled reserve threshold does not block safe input.

Post-run and before-settle continuation stop while blocked. Direct `agent.continue()` also checks the state before consuming a queue. Pi retains its queues. The TUI's compaction queue stays in place while blocked and participates in the successful retry budget check.

## Persistence and completion

An adjacent `*.pi-compact-state.json` file records operation start before summarization. Replacement uses a temporary file, file fsync, rename, and directory fsync. A running or blocked record restores as blocked. Native checkpoint append remains a single call. The adapter reads the exact entry ID back from the JSONL file and calls fsync before accepting it.

Native write errors keep the controller blocked. This adapter does not repair partial native JSONL writes or implement the P3 checkpoint transaction. A damaged native file needs inspection before recovery. In-memory sessions are rejected because they cannot retain the failure barrier after restart.

`block()` returns its persistence result. If the blocked record cannot be saved, the result and pause message say whether a previously confirmed non-idle record still protects recovery. Without that record, the current instance stays blocked but restart protection is not guaranteed. A failed attempt to save idle invalidates the prior durability assumption because the replacement may already have happened.

The native `session_compact` and successful `compaction_end` notifications are held until the operation is accepted. `session_compact` references the actual appended entry, including when several summaries contain identical text.

An adjacent process lock coordinates session writers after the extension loads. The adapter claims it when an AgentSession with this extension builds its runtime. Native append and rewrite operations check for an existing owner's lock before writing. Lock contention rejects startup before normal input can write. Unrelated managers do not acquire locks, and their reads and in-memory operations retain native behavior. Normal disposal releases managed ownership. A dead owner's PID allows recovery on the same machine. The lock is intended for local files; shared network filesystems and simultaneous cross-machine ownership are unsupported.

Pi 1.5.2 can write before loading extensions. In particular, `--name` appends a session entry during CLI session selection. An ordinary extension cannot protect that earlier write or coordinate a process that does not load it. Use separate session files for concurrent Pi instances. Do not rename or otherwise edit an active session from another process.

The ownership guarantee begins after the extension loads. `scripts/probe-preload-ownership.mjs` reproduces the host's earlier metadata write and intentionally fails the stronger, unsupported assertion that every startup write is protected. It is a compatibility probe, not a required passing regression. The ordinary input and compaction ownership regressions must pass.

An attached SessionManager cannot be reused by a second managed AgentSession. Runtime attachment rejects the second owner. Public reads, including `buildSessionContext()` and `buildSessionProjection()`, remain available. Embedded SDK callers must use a separate manager and file for each session; bootstrap metadata can precede runtime attachment.

## Lifetime and compatibility

Private Pi access lives in `src/pi-adapter`. The adapter imports the package root supplied by the ordinary loader. It checks Pi 1.5.2 and required methods before startup. A missing startup capability terminates with exit code 78 because Pi can swallow extension factory errors.

A process registry binds controllers to AgentSession instances whose loaded extension path matches this package. Reload preserves the existing controller and replaces its event binding. Disposal invalidates the instance, releases event bindings and file ownership, and lets active peers continue. Instance request and write guards remain attached so stale references cannot send or consume queues. The last disposal restores global dispatcher descriptors only where the adapter still owns them.

The affected session's cache warmer is cancelled and disabled. Warming bypasses `prepareRequest`, so enabling it requires separate evidence. Virtual models are rejected before routing. The tested fixture transport is the built-in OpenAI Responses SSE provider; these tests do not establish real-provider reliability or acceptance of every custom provider implementation.

## Reproduce P1

Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`. Run `pnpm verify:live --pr P1` for all ten lanes, or add `--lane 6` for Escape cancellation. Run `pnpm verify:perf --pr P1` for 30 alternating baseline and head pairs.

Run `pnpm verify:p1-fixes` for disposal, retry cleanup, disabled policy, competing processes, and shared-manager regressions. Its observer injects fixture fetch at ModelRuntime and subscribes to events without wrapping the product's prepare, stream, continuation, or compaction methods. `--output artifacts/P1-fixes/live` keeps a new live run separate from original P1 evidence. The performance runner also accepts `--output`, `--lanes`, and `--pairs 5` for a targeted budget check.

Run `pnpm verify:p1-scope` to compare native and managed behavior for unrelated in-memory and persistent SDK sessions, disposal and reopening, and public reads from an idle managed SDK session. The probes use the real Pi loader and inject only synthetic transport.

The runner uses the installed shell shim, independent agent directories, and synthetic sessions. It supplies fake credentials and model responses. Preloading denies sockets and permits only the fixture fetch endpoint. It never invokes a real model service. Tmux drives actual keys and captures ANSI. PNG files render captured terminal text with Menlo on a dark background; they are terminal-output renderings rather than OS screenshots.

The P1 package uses native compaction settings. Percentage configuration, Codex remote checkpoints, migration, and the new completion divider belong to subsequent implementation units.
