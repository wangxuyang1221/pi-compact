# pi-compact

Context compaction for Pi 1.5.2. Install it as an ordinary extension and keep your existing Pi launcher, providers and authorization.

The extension compacts at 90% of the active model window by default. It checks the pending input after a complete tool batch and before the next model request. Compatible Codex sessions use remote checkpoints. Other providers, including DeepSeek, use Pi's native summarization with the selected model. An explicit remote failure falls back to native summarization. Native summarization can itself call a remote model.

## Install

Use Node 22.19 or later and Pi **1.5.2**. Download the reviewed `pi-compact-0.1.0.tgz`, verify its published SHA-256, and unpack it into a permanent directory.

```sh
mkdir -p ./pi-compact-release
tar -xzf ./pi-compact-0.1.0.tgz -C ./pi-compact-release
pi install "$PWD/pi-compact-release/package"
pi
```

Pi 1.5.2 registers local directories; it does not unpack a local tarball. Keep that directory after installation. To limit installation to a project, use `pi install -l /absolute/path/to/package` in a trusted project. See [installation and lifecycle](docs/install.md) for isolation, upgrade, disable and removal. The package has no runtime dependencies and uses the host's Pi classes. Do not install another Pi inside it.

## Use

Run `/compact-config` to show the percentage, configuration source and active model boundary. Run `/compact-config threshold 80` to atomically save `{ "thresholdPercent": 80 }` in the project's `.pi/pi-compact.json`. Valid percentages are greater than 0 and less than 100. A missing setting uses 90%. A malformed configuration stops normal requests until repaired.

Run `/compact` to compact immediately. Custom instructions such as `/compact preserve the pending migration` are forwarded. Pi's automatic compaction enabled setting still applies to automatic work.

There is no extension-imposed timeout. A slow response keeps waiting. Escape cancels compaction without starting fallback. Cancellation, failure of both methods, or failed persistence blocks normal continuation and preserves the history. Resolve the cause and run an explicit `/compact` retry. Only a successful retry clears the barrier. See [recovery](docs/recovery.md).

Successful compaction replaces the collapsed card with an English divider.

```text
──────────────── ↗↙ Context compacted ────────────────
```

`Ctrl+O` expands the text summary or safe opaque checkpoint metadata. Expansion does not call a model. It does not generate a readable summary for an opaque checkpoint.

Sessions persist checkpoints and adjacent recovery records. Restart and branch selection validate their source history. Provider, model capability, endpoint and account determine compatibility. Before an incompatible provider or account continues, the extension commits a readable text summary. Failed conversion pauses the task. Original source entries must remain available for readable recovery. Convert active opaque sessions before disabling or uninstalling the extension.

## Support and acceptance

[Compatibility](docs/compatibility.md) lists tested paths and limits. Opaque traffic is SSE only. WebSocket and arbitrary proxies are unsupported for opaque traffic. Local tests use the actual Pi loader, SDK, encoders and TUI with synthetic network responses.

Real Pi 1.5.2 tests with Terra and Luna completed 20 paired file-maintenance comparisons, including checkpoint persistence, process restart and default-tool continuation. Remote and native groups each passed 20/20 task checks. This limited experiment found no remote quality advantage; it does not establish statistical equivalence or general reliability. Visual review is approved. Cross-provider migration and other-provider service behavior remain covered by fixtures rather than this real comparison.

[Live acceptance preparation](docs/live-acceptance.md) describes the disarmed dry-run and proposed shared request budget. It does not authorize requests.

## Develop and verify

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm pack
pnpm verify:p6
pnpm verify:perf --pr P6
pnpm acceptance:plan
```

Runtime verification requires tmux, conda environment `codex-py312`, Pillow/pyte and ffmpeg for ANSI captures. Each run uses isolated synthetic auth and sessions and denies real network. See [P6 local report](artifacts/P6/REPORT.md) in the source checkout for exact hashes and pending gates. The published package contains user documentation, not test artifacts.
