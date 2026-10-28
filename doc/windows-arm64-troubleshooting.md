# Windows 10 ARM64 runtime investigation

## Verified on 2026-10-28

The test machine reports Windows 10 build 19045.6456, ARM64, Qualcomm ARMv8.
The original experimental ARM64 installer installs, but cannot reliably display
its main window. Native module load checks alone did not establish GUI support.

Tests performed on the real machine through its existing remote session:

1. `--disable-gpu`: repeated `GPU process launch failed: error_code=18`, then
   `GPU process isn't usable. Goodbye.`
2. `--disable-gpu --disable-gpu-compositing`: same failure.
3. A temporary `__COMPAT_LAYER=RunAsInvoker` environment variable: same failure.
4. A separately approved, single diagnostic run with `--no-sandbox`: the real
   Vue main window and developer tools rendered. The test process tree was
   terminated afterwards. No persistent no-sandbox configuration was installed.

This isolates a sandboxed child-process launch failure. It does not, by itself,
prove a graphics driver defect or prove the exact Windows sandbox failure cause.

The developer console also showed WebSocket handshakes to the old default
signaling endpoint returning HTTP 404. Device code and password were empty.
Successful window rendering therefore does not establish remote-control support.

## Fix under test

- Replace the executable's `requireAdministrator` manifest with `asInvoker`.
  Chromium launches restricted child processes using the same executable; a
  process-wide elevation requirement is unnecessary for ordinary desktop input.
  This is a hypothesis until tested on the affected Windows 10 machine.
- Keep the sandbox enabled. Do not make `--no-sandbox` a release default.
- Open developer tools automatically only in development builds.
- Add a packaged GUI smoke test on the Windows ARM64 CI runner: launch with a
  clean profile, assert actual rendered controls and preload API, and capture
  screenshot and logs. This checks Windows 11 ARM64; the user's Windows 10
  machine remains a separate required validation target.

## Remaining acceptance checks

- Normal launch on Windows 10 ARM64 with no sandbox-disabling flags.
- Working, compatible API and signaling service; device registration succeeds.
- A second device receives the ARM64 screen and can move/click/type on it.
- Exit and restart, then repeat the connection successfully.

Do not label a build fully working until all checks above have actually passed.
Never commit device passwords, signaling credentials, session URLs, user logs,
or unredacted remote-desktop screenshots to this public repository.
