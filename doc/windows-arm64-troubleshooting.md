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

## Existing x86 client service settings

Read from the working v0.621.0 desktop client's Custom Settings page on
2026-10-28, without changing its configuration:

- API: `https://desk-api.hsslive.cn` (custom override disabled).
- WSS: `wss://desk-api.hsslive.cn` (custom override disabled).
- Two default relay locations selected: Chengdu and Shanghai.

These are vendor-hosted services, not a signaling server installed on the x86 PC.
The publicly served vendor web client uses Socket.IO path `/rtc`, no trailing
slash, a custom binary parser, device authentication query fields, and a newer
registration API `/desk_user/auto_register`. The old open-source client instead
uses `/socket.io/`, the default parser and `/desk_user/create`. Copying just the
hostname therefore does not establish compatibility. A 404 at `/socket.io/`
does not establish that the vendor's current `/rtc` service is unavailable.

Build 40654631215 at commit b28a769 passed native loading and packaged GUI smoke
tests on Windows 11 ARM64 with sandbox enabled. This remains separate from
Windows 10 ARM64 validation. No private relay credentials or device identifiers
are recorded here.

## Pending end-to-end validation

- Normal launch on Windows 10 ARM64 with no sandbox-disabling flags.
- Working, compatible API and signaling service; device registration succeeds.
- A second device receives the ARM64 screen and can move/click/type on it.
- Exit and restart, then repeat the connection successfully.

Do not label a build fully working until all checks above have actually passed.
Never commit device passwords, signaling credentials, session URLs, user logs,
or unredacted remote-desktop screenshots to this public repository.

## Subsequent real-machine result

The 0.0.2 installer (SHA256
`88a87e670c87f9c36b7b05187c5de82d59f272f0682ff90bb9a3a5475825581e`)
was downloaded on the affected Windows 10 ARM64 machine, checksum-verified,
and installed over the existing installation. The installer's normal launch
displayed the full main window. No sandbox-disabling arguments were supplied.
The device code/password were still empty, so remote control was not yet working.

Independent temporary test-device requests to the current official service
succeeded for automatic registration and an authenticated MessagePack Socket.IO
connection on `/rtc`, including a `joinResult` reply. No existing user device
password was used in those protocol probes.

Version 0.0.3 implements an experimental adapter for the official service's
registration, join, verification, session relay configuration and desktop input.
It targets the requested **controlled-device role, one primary display**. It is
not a feature-equivalent Pro port: Pro file operations, input drivers and using
this compatibility mode to control another device are not implemented.

The protocol signing and relay wrapping constants are public web-client protocol
constants. They are not user/account/device credentials. Decrypted session relay
authorization stays in memory. CI GUI checks block the official API hostname to
avoid registering public test devices or uploading their credentials in screenshots.
The adapter still requires real screen/input/restart testing before acceptance.

Local verification for the actual adapter source, using a temporary test device:
Windows-profile login returned 200; its authenticated MessagePack `/rtc` join
received `joinResult`. TypeScript/Vite production build passed. Mock native-input
tests cover normalized/relative coordinates, releasing held keys/buttons on
disconnect, and rejecting malformed input and non-input operations.

### Bidirectional input channel and GUI-check timing

Review of the public controller protocol found that the controlled host creates
one reliable, ordered data channel; the controller replies on that same channel.
The legacy open-source receive handler waited for a second controller-created
channel. The official adapter now publishes the host-created channel to the
receive handler and sends the `dataChannelOk` handshake when it opens. Regression
tests exercise the real WebRTC class for official and legacy channel behavior.
All five channel/input tests and the local production build pass.

The first 0.0.3 CI attempt packaged the ARM64 executable and loaded its native
input module, but failed its GUI smoke test: the checker evaluated the document
before `body` existed. The checker now tolerates that loading state and continues
waiting for the actual UI, rather than treating it as a JSON parsing failure.
No end-to-end remote-control success is claimed by these checks.
