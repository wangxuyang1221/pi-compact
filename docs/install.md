# Install and remove pi-compact

Use the README commands with Pi 1.5.2. `pi install` persists a local package path in Pi settings. `pi list` shows it. Normal `pi` startup discovers `pi.extensions` in that directory. The package entry is `src/index.ts`. A Node exports map is unnecessary for this resource loader.

## Isolate an installation

To try the package without changing your normal agent configuration, set `PI_CODING_AGENT_DIR` for every Pi command. Use a separate working directory too. This starts with no authorization. Add authorization through Pi only when you intend to call a provider.

```sh
export PI_CODING_AGENT_DIR="$PWD/isolated-agent"
mkdir -p "$PI_CODING_AGENT_DIR" isolated-project
pi install "$PWD/pi-compact-release/package"
cd isolated-project
pi
```

The P6 fixture verifier uses this ordinary local-directory installation after extracting the tarball. It injects synthetic transport separately and does not need a second Pi runtime or development node_modules for product loading.

## Upgrade and reload

Stop Pi before replacing the installed package directory. Preserve the old tarball and sessions. Unpack the new release into the same registered directory, then restart Pi. Repeating `pi install /same/absolute/package` keeps one settings entry. `/reload` reloads extension resources in the running TUI. Restart after removal fully discards process adapters. An in-flight operation invalidated by reload can require explicit `/compact` retry.

P6 validates same-version replacement and repeated installation. A future version upgrade is untested until that version exists and its compatibility checks pass. Do not interpret same-version replacement as schema migration support.

## Disable and remove

First follow [opaque-session migration](recovery.md). In `pi config`, disable the package's extension resource, then `/reload` or restart. The isolated verifier also exercises the equivalent settings resource filter `extensions: []` for that package. Check that a new native text session shows Pi's original `Compacted from` card.

To remove the registered local package, stop Pi and run the same absolute path used for installation.

```sh
pi remove /absolute/path/to/pi-compact-release/package
pi list
```

Local removal unregisters the path; it does not delete your package files, project threshold file or session data. Restart Pi to discard the process adapters. New native sessions regain Pi's behavior. Native Pi cannot interpret an existing active opaque checkpoint as readable history. Do not open that session without the extension until a text checkpoint has been accepted.
