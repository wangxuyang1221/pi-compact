# P5 symlink loader correction

The renderer now resolves each extension path before matching the registered entrypoint, as the session safety adapter already does. Direct loading and symlink loading therefore identify the same managed session.

The coordinator reproduced the independent finding before changing the product. `scripts/verify-p5-symlink.mjs` uses the installed Pi loader, a real symlink, native manual compaction, fixture transport, and a real TUI. It checks the rendered divider, absence of the native collapsed card, one summary request, one persisted checkpoint, and zero normal requests. Both variants stop their Pi and tmux processes in finally blocks.

- Before the fix: `runs/1794813716583/result.json`. Direct loading passes; symlink loading shows the native card. The runner exits 1.
- After the fix: `runs/1794813762084/result.json`. Both variants pass. The runner exits 0.
- `pnpm lint`, `pnpm typecheck`, and all 38 tests pass.
- `cleanup.json` confirms all 8 recorded Pi/pane PIDs have exited, four TUI cleanup records have no sockets or live processes, and lsof finds no listeners.

The timing observer also records the success timestamp at subscriber entry, before synchronous event logging. The two new first-frame observations use that corrected start. They are individual local observations, not a latency distribution or a new performance claim. Earlier evidence remains unchanged.

The source change is one path normalization expression. No compaction, lifecycle, or persistence implementation changed. The independent review at 0cbcdc8895171e8eaef1193d2107e26ce35ae869 remains the prior candidate's verdict; this repair is coordinator-tested and awaits final independent verification on the P4-integrated revision. P5 remote/fallback details and final ten-lane acceptance remain pending. No push, PR, merge, publication, real provider calls, or user history access occurred.
