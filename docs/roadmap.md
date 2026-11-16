# Implementation roadmap

The design is approved. All implementation stages below remain open. Each stage requires tests, evidence from a real Pi runtime, and checks for local processing overhead.

## 1. Establish the extension integration

- [ ] Create the package, typed operation state, compatibility checks, and isolated test runner.
- [ ] Prove that an ordinary extension can inspect new input before the first request and coordinate with Pi's native compaction flow.
- [ ] Stop normal requests after compaction failure or cancellation, including queued input and post-run retries.
- [ ] Verify explicit retry, reload, cleanup, and unsupported-version behavior through the actual CLI.

Accept this stage when one session has one compaction owner, tool batches stay intact, failed compaction cannot silently continue, and recovery is explicit.

## 2. Add percentage-based native compaction

Depends on stage 1.

- [ ] Implement the default 90% threshold and recalculate it when the active model changes.
- [ ] Add `/compact-config` and project-local settings persistence.
- [ ] Share the execution path between automatic compaction and manual `/compact`.
- [ ] Preserve cancellation, custom instructions, and waiting without an extension-imposed timeout.

Accept this stage when exact threshold boundaries, configuration persistence, manual invocation, and non-Codex provider behavior pass real TUI checks.

## 3. Add Codex remote compaction and fallback

Depends on stage 2.

- [ ] Define versioned text and opaque checkpoint representations.
- [ ] Validate remote completion events, persist checkpoints, and replay compatible context without placeholder-string substitution.
- [ ] Fall back through Pi's complete native flow after an explicit remote failure.
- [ ] Reconstruct readable history when fallback follows an existing remote checkpoint.
- [ ] Preserve the previous state after interrupted writes, malformed responses, cancellation, or failure of both methods.

Accept this stage when repeated remote compaction, continuation, fallback, and disk recovery work without an extra text-summary request on the remote success path.

## 4. Support provider changes and history migration

Depends on stage 3.

- [ ] Convert opaque context before continuing with an incompatible provider.
- [ ] Reuse readable-history reconstruction for large or unavailable-source histories.
- [ ] Validate account changes, branch ownership, schema compatibility, and stale asynchronous results.
- [ ] Pause safely when conversion fails or is cancelled.

Accept this stage when Codex-to-DeepSeek continuation receives complete readable context, and no incompatible request contains opaque data.

## 5. Add the completion divider

Development can start after stage 1. Final acceptance depends on stage 4, with the UI changes integrated into the same tested revision.

- [ ] Replace the native completion card with the approved English divider.
- [ ] Preserve `Ctrl+O` details without another model request.
- [ ] Check narrow terminals, dark and light themes, reload, and other message renderers.
- [ ] Keep native rendering available when only the UI adapter is incompatible.

Accept this stage when manual, automatic, remote, and fallback success each show one divider, while failure and cancellation show none.

## 6. Validate and package the extension

Depends on the integrated stage 5 revision.

- [ ] Verify installation from a clean package in an isolated Pi environment.
- [ ] Run authorized real-provider tests with synthetic data, a bounded request budget, and no user conversation history.
- [ ] Compare native and remote compaction on the same tasks, recording failures and retained facts.
- [ ] Validate supported transports, long conversations, repeated compaction, provider changes, and recovery.
- [ ] Publish compatibility and installation documentation after acceptance.

Accept this stage when the package reproduces the approved behavior, supported configurations have runtime evidence, and remaining limitations are documented.

## Evidence requirements

Fixture responses may exercise real Pi orchestration and TUI behavior, but cannot prove remote service reliability or summary quality. Real-provider results must be reported separately.

Check local overhead against a measured native baseline. Network completion time is observed, not converted into an extension timeout. Never infer a performance ratio from different workloads.

Screenshots and interaction recordings should come from the tested package revision. Temporary processes and listeners must be stopped after verification.

The current repository contains design documents only. Prototype artifacts and local execution records are not part of the published repository.
