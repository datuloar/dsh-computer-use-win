# AGENTS.md — dsh-computer-use

Windows computer use for the DeepSeek Harness: a CLI (`dsh-cu`), a PowerShell/C# backend, and a
skill the agent reads. No dependencies to install, no driver, no package registry: the repository
is the distribution.

## Where things live

| Path | What it is |
|---|---|
| `src/cli.js` | entry point: argv → one command call, one error path |
| `src/commands.js` | the command table (name, args, summary, `gated`, handler) and `--help` |
| `src/backend.js` | the only file that spawns a process, reads a temp path or knows the state files |
| `src/contract.js` | static checks: skill frontmatter, documented commands, plugin manifest |
| `src/verify.js` | the static contract check entry |
| `src/selftest.js` | the invasive suite that drives the real machine |
| `src/tool-error.js` | the error type whose message is meant for the operator |
| `lib/index.js` | DSH plugin entry: registers the skill |
| `lib/skill.js`, `lib/frontmatter.js` | the skill registration, read from `SKILL.md` |
| `backends/windows.ps1` | the PowerShell host: argv, dispatch, indicator lifecycle, broker |
| `backends/csharp/*.cs` | the C# the host compiles: one type per file |
| `backends/csharp/Theme.cs` | the only place colours, fonts, the tick rate and DPI scaling live |
| `backends/csharp/LayeredWindow.cs` | the per-pixel-alpha window every visual layer draws into |
| `backends/csharp/EdgeGlow.cs`, `FrameRenderer.cs` | the screen-edge glow: four strips, one bitmap each |
| `backends/csharp/PanelForm.cs`, `PanelRenderer.cs`, `PanelState.cs` | the status pill and what it shows |
| `backends/csharp/PointerRenderer.cs` | the pointer layer: ring around the real cursor (default) or the arrow that replaces it, trail, click rings |
| `src/mcp.js` | the MCP stdio server: tool table, argument mapping onto CLI commands, auto-started indicator, ESC hold |
| `src/host.js` | the warm backend: one `windows.ps1 serve` process, JSON lines in, output plus an end marker out |
| `backends/csharp/UiTree.cs` | UI Automation: window lookup, the control tree, `find`/`tap` matching, the covered-window guard |
| `SKILL.md` | what the agent reads: when to use it, the loop, the safety rules |
| `test/*.test.mjs`, `test/run.mjs` | `node:test` suite for the pure parts |

## Commands

```powershell
node src\verify.js           # static contract check, safe anywhere
node test\run.mjs            # node:test suite, in-process, no child processes
node src\cli.js self-test    # drives the real mouse and keyboard for ~40 s
node src\cli.js doctor       # what this machine can do
bin\dsh-cu.cmd <command>     # the same CLI through a shim, no PATH change needed
```

## Rules that are easy to break

- **No comments in code.** Not in `.js`, `.cs`, `.ps1` or the YAML. The reasons live here and in the
  README; when a rule needs explaining, add a line to this file instead of a comment.
- **Three names, one thing.** The CLI and the `bin` name are `dsh-cu`, the skill it registers is
  `dsh-computer-use`, the repository is `dsh-computer-use-win`. Renaming the CLI means changing
  `bin` in `package.json`, the exported `name` in `lib/index.js` and the `id`/`name` in
  `cordis.patch.yml` together; the *skill* name stays `dsh-computer-use`, because
  `$DSH_HOME\skills\dsh-computer-use\` and the agent catalog use it. `node src\verify.js` fails when
  they disagree.
- **No package registry.** The repository is the distribution: `install.ps1` (skill copy plus a
  `dsh-cu` shim under `%LOCALAPPDATA%\dsh-cu\bin` on the user PATH), `dsh plugin --profile web add
  github:datuloar/dsh-computer-use-win`, or plain `node src\cli.js`. Do not reintroduce
  npm/pnpm publishing instructions; `package.json` carries only what the DSH loader reads
  (`dsh.bundle.patch`, `main`, `bin`, `files`, peer dependency).
- **Two command lists would drift.** `src/commands.js` is the only one: `--help`, the dispatcher
  and the documentation check all read `COMMANDS`. Adding a command means one table entry plus a
  line in `SKILL.md` and `README.md`; `node src\verify.js` fails until both mention it.
- **The gate is data, not a list in the entry point.** Set `gated: true` on a command that injects
  input or changes the machine; `cli.js` refuses to run it while the indicator is down. `broker` is
  the one command that gates inside its handler: `start` and `stop` change machine state, `status`
  does not.
- **The C# is compiled by the .NET Framework compiler, so it is C# 5 and ASCII.** No string
  interpolation, no expression-bodied members, no `out var`, no tuples; a non-ASCII glyph goes in
  as `(char)0x2026`, because `Get-Content` would otherwise have to guess the file encoding.
- **Layered windows take premultiplied bitmaps.** `Theme.Canvas` returns `Format32bppPArgb` and
  `Theme.Surface` sets the smoothing modes; `UpdateLayeredWindow` with `AC_SRC_ALPHA` blends
  straight-alpha pixels too brightly, which is what the old frame looked like. Draw through those
  two helpers and the halos stay away.
- **Nothing visual carries a raw pixel constant.** Sizes are design units passed through
  `Theme.Px` / `Theme.Pxf`, so the panel, the marker and the glow keep their proportions at 125 %
  and 150 % scaling; colours and fonts come from `Theme` so one edit restyles the whole indicator.
  `DSH_CU_UI_SCALE` multiplies that scale, which is also how the scaling path gets exercised on a
  96 dpi development machine.
- **The glow is four strips, not one full-screen window.** A layered window the size of the screen
  re-blits ~14 MB every frame; `EdgeGlow` presents four thin strips instead and skips the present
  when the pulse alpha has not changed, which is why `Indicator.PulseAlpha` quantises it.
- **The panel label comes from the backend, once.** `Get-ActionLabel` in `backends/windows.ps1`
  turns the dispatched command into the line the pill shows and writes `dsh-cu.action`; every
  caller (CLI, direct backend call, elevated broker) goes through that one place. `type` is
  reported as a character count on purpose: the panel is on screen, and typed text can be a
  secret.
- **Arguments never travel as PowerShell parameters.** `backend.js` sends a JSON array in
  `DSH_CU_ARGV`; the host parses it and then deletes it, because `overlay-start` and `broker-start`
  launch a new PowerShell that must not inherit it. `-File` argument parsing drops embedded quotes
  and reads a leading dash as a parameter name. The payload rides an environment variable, so
  `MAX_ARGUMENT_BYTES` refuses an oversized argument instead of letting Windows truncate it.
- **Input waits for the announcement.** `overlay` sleeps the announced seconds after the frame is
  confirmed on screen, so nothing is injected before the human has seen the panel.
- **Every state-file read is a race.** The indicator deletes its own files while it exits, so reads
  go through `Get-StateAge` / `Get-StateText`, which treat a missing or unreadable file as normal
  state. A bare `Get-Content` after `Test-Path` used to break `overlay --stop`.
- **Never stop a process on a pid alone.** `dsh-cu.pid` holds `<pid> <start ticks>`; `Clear-Indicator`
  only stops it when the process is a PowerShell whose start time matches within five seconds, so a
  recycled pid can never kill an unrelated program. Keep both halves of that check.
- **One broker request per caller.** Requests are `dsh-cu.broker.req.<pid>` and answers
  `dsh-cu.broker.res.<pid>`, so two agents running commands at once cannot swap payloads. A request
  the broker already took is never retried directly — that would inject the same input twice; if
  the broker is wedged, stop it with `dsh-cu broker stop` instead.
- **The wheel follows the pointer.** `wheel` without coordinates scrolls whatever is under the
  pointer, which is why the command takes an optional point; `--horizontal` sends `MOUSEEVENTF_HWHEEL`.
- **Coordinates are bounded** to ±32767 (the Windows virtual-screen limit): `SetCursorPos` would
  clamp a typo to the screen edge and click the wrong thing instead of failing.
- **`type` sends `\n` as Enter and `\t` as Tab**, and skips `\r`; every other character goes out as
  `KEYEVENTF_UNICODE`. Newlines used to be silently dropped. Long text goes out in
  `TYPE_CHUNK_CHARS` chunks with an indicator check between them, so the human's ESC stops a long
  paste within a few seconds instead of letting it type for minutes.
- **Every backend call has a timeout** (60 s, 5 min for `run`) so a wedged dialog or a busy machine
  cannot hang an agent forever; the error names the timeout. The broker timeout scales with the
  payload, because a long `type` legitimately takes longer than a click.
- **The backend prints one `ERROR <message>` line** for a failure (see the `trap` in
  `backends/windows.ps1`); `src/backend.js` turns that into a `ToolError`. Do not print PowerShell
  error formatting at the user. The `run` branch is the exception that proves it: with
  `$ErrorActionPreference = 'Stop'`, `2>&1` on a native command turns any stderr line into a
  terminating error, so `run` lowers the preference around the call and reports `EXIT <code>`.
- **Operands arrive as a list.** `backends/windows.ps1` collects them into `$operands` and reads
  them with `Arg <n>`, so a command can take four coordinates (`drag`) or five (`shot --region`)
  without growing another `$A<n>` parameter.
- **A new C# type gets its own file** in `backends/csharp/` and its name is added to `$sources` in
  `backends/windows.ps1`, which concatenates them into one `Add-Type` unit. The `using` directives
  live in `Interop.cs`; every other file only opens `namespace DshCu`.
- **State files are the CLI ↔ indicator contract**, all in `%TEMP%`: `dsh-cu.alive` (heartbeat),
  `dsh-cu.pid` (pid plus start ticks), `dsh-cu.touch` (idle watchdog), `dsh-cu.stop`,
  `dsh-cu.action` (what the pill shows), `dsh-cu.cancelled` (the human pressed ESC), `dsh-cu.cursor` (present while `--hide-cursor` holds the
  pointer; the CLI heals leftover state), `dsh-cu.broker.ready|stop|req.*|res.*`. `StateFiles.cs`
  owns the paths and the PowerShell host reads them from there, so a name is written once. Both sides treat a heartbeat older than 5 s as "gone"; an
  indicator that never sees a touch file stops itself after the same five minutes, so a broken
  watchdog cannot leave one running forever.
- **MCP tools are CLI commands.** Every tool in `src/mcp.js` builds a CLI argv and runs the same
  `COMMANDS` handler, so validation, gating and output never drift between the two front ends. A
  new tool that needs new behaviour gets a CLI command first. Tool definitions travel with every
  model request: keep descriptions to one or two sentences (`test/mcp.test.mjs` caps the bytes).
- **stdout belongs to the protocol.** `serve()` redirects every `console.*` into a per-call buffer;
  a stray write to stdout would corrupt the JSON-RPC stream. Tool calls run one at a time.
- **The warm backend never runs a blocking command.** `Invoke-Dispatch` refuses the indicator
  loop, `broker-loop` and `serve` while serving; those start their own process. Nothing inside
  `Invoke-Dispatch` may call `exit` — it would kill the warm host — so branches `return`.
- **Validate before the indicator.** MCP input tools start the indicator on first use, which takes
  the announcement seconds; `round()` rejects bad numbers before that, so a typo fails at once.
- **ESC is a human decision.** The indicator writes `dsh-cu.cancelled` when the human presses ESC;
  for ten minutes MCP input tools and the `indicator start` tool refuse and tell the agent to ask.
  `dsh-cu overlay` run by hand clears it.
- **One pointer, never two.** The default pointer layer is a ring drawn *around* the real cursor;
  the drawn arrow only exists together with `--hide-cursor`, which blanks the system cursor. An
  arrow next to a visible cursor was the old default and read as a second pointer chasing the
  first — do not bring that combination back.
- **The UIA reference set is fixed.** `Add-Type` references `UIAutomationClient`,
  `UIAutomationTypes` and `WindowsBase`; never add `using System.Windows;` because its `Point`,
  `Size` and `Rect` collide with `System.Drawing` — spell `System.Windows.Rect` in full.
- **Chromium keeps its accessibility tree asleep.** `UiTree.Warmup` sends `WM_GETOBJECT` to every
  `Chrome_RenderWidgetHostHWND` and waits until the document has children; without it the first
  `tree` of a browser shows only the tab strip. A minimised window reports bogus rectangles, so
  `UiTree.Usable` refuses it instead of printing coordinates that are not on screen.
- **`tap` never clicks blind.** It clicks only a single match (exact names win over substrings) and
  only after `EnsureVisibleAt` confirms the point belongs to the target window.
- **OCR is WinRT and lives in PowerShell.** `Windows.Media.Ocr` has no projection for the .NET
  Framework compiler, so `Read-ScreenText` in `backends/windows.ps1` does it with the
  `ContentType = WindowsRuntime` type syntax and an `AsTask` awaiter. Small regions are upscaled
  2x before recognition and every coordinate is mapped back to the screen.
- **Cursor hiding is opt-in and always recoverable.** `overlay --hide-cursor` blanks the system
  cursors with `SetSystemCursor` (the only API that hides the pointer for the whole desktop —
  `ShowCursor` from a background process does nothing, verified); a bare `overlay` leaves the
  pointer alone. Whenever cursors are blanked, `StateFiles.CursorHidden` records it, every stop path
  restores them, and `cli.js` repairs a stranded pointer on the next command because a killed
  process cannot clean up after itself. Version 1.1.0 hid the pointer unconditionally and the user
  lost it twice, so: never make this the default, never drop the marker, and keep the self-test
  checks for `CURSOR_REPLACED` / "given back on stop" / "not left replaced by a kill".
- **`cursor-state` reports our own state first.** `CURSOR_REPLACED` comes from the marker file;
  `CURSOR_HIDDEN_BY_OTHER` means something else on the machine holds the pointer (the user runs
  DinoRemote, which does the same trick) — do not "repair" that case, it is not ours.
- **Do not solve captchas in a delivered feature.** The tool has no captcha solver and the skill
  says so; what an operator clicks on their own machine is their decision, not a product claim.

## Environment notes

- Inside the DeepSeek Harness file sandbox a nested process cannot open a pipe, so
  `spawn(..., {stdio: 'pipe'})` fails with `EPERM`. `src/backend.js` retries with file descriptors.
  `test/run.mjs` imports the test files instead of using `node --test` for the same reason (the
  runner isolates each file in a child process); `node --test test/` is the variant for a machine
  without that restriction.
- Run `node src\cli.js self-test` from a normal PowerShell window, not from a sandboxed session: a
  sandboxed session cannot start Notepad, so the focus/typing/click checks report a warning instead.
