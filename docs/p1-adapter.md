# Native compaction adapter

The P1 adapter gives Pi 1.5.2 a session-scoped failure barrier. Pi still selects the compaction cut, executes tools, generates native text summaries, and appends its checkpoint. The package loads through Pi's ordinary extension loader.

## State and requests

`CompactionController` owns `idle`, `running`, and `blocked`. Each running operation has an ID, an AbortController, and a generation. A failed, cancelled, or insufficient compaction blocks normal requests. Only the native TUI `/compact` command grants explicit retry intent. Extension calls to `ctx.compact()` retain ordinary manual behavior while idle and cannot unlock a failed session.

The adapter checks the canonical projection in `agent.prepareRequest`, after Pi records the new input. Pi's next-turn boundary still waits for the complete tool batch. The stream wrapper checks the actual message budget and state again, then checks the generation after the native provider payload callback. An extension that changes the final payload is rejected because its request budget has not been validated.

Post-run and before-settle continuation stop while blocked. Direct `agent.continue()` also checks the state before consuming a queue. Pi retains its queues. The TUI's compaction queue stays in place while blocked and participates in the successful retry budget check.

## Persistence and completion

An adjacent `*.pi-compact-state.json` file records operation start before summarization. Replacement uses a temporary file, file fsync, rename, and directory fsync. A running or blocked record restores as blocked. Native checkpoint append remains a single call. The adapter reads the exact entry ID back from the JSONL file and calls fsync before accepting it.

Native write errors keep the controller blocked. This adapter does not repair partial native JSONL writes or implement the P3 checkpoint transaction. A damaged native file needs inspection before recovery. In-memory sessions are rejected because they cannot retain the failure barrier after restart.

The native `session_compact` and successful `compaction_end` notifications are held until the operation is accepted. `session_compact` references the actual appended entry, including when several summaries contain identical text.

An adjacent process lock prevents simultaneous ownership of the same session file. Normal disposal releases it. A dead owner's PID allows recovery on the same machine. The lock is intended for local files; shared network filesystems and simultaneous cross-machine ownership are unsupported.

## Lifetime and compatibility

Private Pi access lives in `src/pi-adapter`. The adapter imports the package root supplied by the ordinary loader. It checks Pi 1.5.2 and required methods before startup. A missing startup capability terminates with exit code 78 because Pi can swallow extension factory errors.

A process registry binds controllers to actual AgentSession instances. Reload preserves the existing controller and replaces its event binding. Wrappers restore their original descriptor only if they still own it. Disposing one session leaves other managed sessions active.

The affected session's cache warmer is cancelled and disabled. Warming bypasses `prepareRequest`, so enabling it requires separate evidence. Virtual models are rejected before routing. The tested fixture transport is the built-in OpenAI Responses SSE provider; these tests do not establish real-provider reliability or acceptance of every custom provider implementation.

## Reproduce P1

Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`. Run `pnpm verify:live --pr P1` for all ten lanes, or add `--lane 6` for Escape cancellation. Run `pnpm verify:perf --pr P1` for 30 alternating baseline and head pairs.

The runner uses the installed shell shim, independent agent directories, and synthetic sessions. It supplies fake credentials and model responses. Preloading denies sockets and permits only the fixture fetch endpoint. It never invokes a real model service. Tmux drives actual keys and captures ANSI. PNG files render captured terminal text with Menlo on a dark background; they are terminal-output renderings rather than OS screenshots.

The P1 package uses native compaction settings. Percentage configuration, Codex remote checkpoints, migration, and the new completion divider belong to subsequent implementation units.
