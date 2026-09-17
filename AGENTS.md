# AGENTS.md — dsh-computer-use

Windows computer use for the DeepSeek Harness: a CLI (`dsh-cu`), a PowerShell/C# backend, and a
skill the agent reads. No npm dependencies, no driver to install.

## Where things live

| Path | What it is |
|---|---|
| `src/cli.js` | entry point: argv → one command call, one error path |
| `src/commands.js` | the command table (name, args, summary, `gated`, handler) and `--help` |
| `src/backend.js` | the only file that spawns a process, reads a temp path or knows the state files |
| `src/contract.js` | static checks: skill frontmatter, documented commands, plugin manifest |
| `src/verify.js` | `npm run verify` entry |
| `src/selftest.js` | the invasive suite that drives the real machine |
| `src/tool-error.js` | the error type whose message is meant for the operator |
| `lib/index.js` | DSH plugin entry: registers the skill |
| `lib/skill.js`, `lib/frontmatter.js` | the skill registration, read from `SKILL.md` |
| `backends/windows.ps1` | the PowerShell host: argv, dispatch, indicator lifecycle, broker |
| `backends/csharp/*.cs` | the C# the host compiles: one type per file |
| `SKILL.md` | what the agent reads: when to use it, the loop, the safety rules |
| `test/*.test.mjs`, `test/run.mjs` | `node:test` suite for the pure parts |

## Commands

```powershell
npm run verify      # static contract check, safe anywhere
npm test            # node:test suite, in-process, no child processes
npm run check       # both of the above
npm run self-test   # drives the real mouse and keyboard for ~40 s
npm run doctor      # what this machine can do
```

## Rules that are easy to break

- **No comments in code.** Not in `.js`, `.cs`, `.ps1` or the YAML. The reasons live here and in the
  README; when a rule needs explaining, add a line to this file instead of a comment.
- **Three names, one thing.** The npm package is `dsh-cu`, the skill it registers is
  `dsh-computer-use`, the repository is `dsh-computer-use-win`. Renaming the package means changing
  `name` in `package.json`, the exported `name` in `lib/index.js` and the `id`/`name` in
  `cordis.patch.yml` together; the *skill* name stays `dsh-computer-use`, because
  `$DSH_HOME\skills\dsh-computer-use\` and the agent catalog use it. `npm run verify` fails when
  they disagree.
- **Two command lists would drift.** `src/commands.js` is the only one: `--help`, the dispatcher
  and the documentation check all read `COMMANDS`. Adding a command means one table entry plus a
  line in `SKILL.md` and `README.md`; `npm run verify` fails until both mention it.
- **The gate is data, not a list in the entry point.** Set `gated: true` on a command that injects
  input or changes the machine; `cli.js` refuses to run it while the indicator is down. `broker` is
  the one command that gates inside its handler: `start` and `stop` change machine state, `status`
  does not.
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
  error formatting at the user.
- **A new C# type gets its own file** in `backends/csharp/` and its name is added to `$sources` in
  `backends/windows.ps1`, which concatenates them into one `Add-Type` unit. The `using` directives
  live in `Interop.cs`; every other file only opens `namespace DshCu`.
- **State files are the CLI ↔ indicator contract**, all in `%TEMP%`: `dsh-cu.alive` (heartbeat),
  `dsh-cu.pid` (pid plus start ticks), `dsh-cu.touch` (idle watchdog), `dsh-cu.stop`,
  `dsh-cu.cursor` (the system cursors are blanked), `dsh-cu.broker.ready|stop|req.*|res.*`. Both
  sides treat a heartbeat older than 5 s as "gone"; an indicator that never sees a touch file stops
  itself after the same five minutes, so a broken watchdog cannot leave one running forever.
- **The pointer must never stay blanked.** `SystemCursors.Hide()` writes `dsh-cu.cursor` *before*
  blanking and `Restore()` deletes it; `cli.js` repairs a stranded cursor on the next command. The
  repair checks the recorded pid, not the heartbeat: the heartbeat stays fresh for 5 s after a
  kill, and that window is exactly when the user has no pointer. Do not weaken either half, and
  keep the self-test check that covers it. The repair note goes to stderr on purpose, so it can
  never mix into a command's parsed stdout.
- **Do not solve captchas in a delivered feature.** The tool has no captcha solver and the skill
  says so; what an operator clicks on their own machine is their decision, not a product claim.

## Environment notes

- Inside the DeepSeek Harness file sandbox a nested process cannot open a pipe, so
  `spawn(..., {stdio: 'pipe'})` fails with `EPERM`. `src/backend.js` retries with file descriptors;
  `npm test` avoids `node --test` for the same reason (`npm run test:isolated` is the CI variant).
- Run `npm run self-test` from a normal PowerShell window, not from a sandboxed session: a sandboxed
  session cannot start Notepad, so the focus/typing/click checks report a warning instead.
