# dsh-computer-use

[![CI](https://github.com/datuloar/dsh-computer-use-win/actions/workflows/ci.yml/badge.svg)](https://github.com/datuloar/dsh-computer-use-win/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-cu)](https://www.npmjs.com/package/dsh-cu)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![platform](https://img.shields.io/badge/platform-Windows-0078D6)

Windows computer use for agents: screenshot, click, type, scroll, read windows and the
clipboard — plus an on-screen indicator the human can see and stop with **ESC**.

![The indicator the human sees while an agent drives the machine](docs/indicator.png)

Built for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness); the CLI works
with any agent or script. The npm package is `dsh-cu`, the skill it registers is
`dsh-computer-use`, and the repository is `dsh-computer-use-win` — three names, one thing.

**Nothing to install.** No npm dependencies, no driver, no SDK: the backend compiles its own C#
with the .NET Framework that ships with Windows.

## Why this one

- **The human can see it and kill it.** An on-screen panel, a frame around the screen and an
  animated pointer marker; ESC stops everything. Injected ESC is ignored, so an agent cannot
  switch off its own indicator.
- **Input is refused while the indicator is down.** `move`, `click`, `wheel`, `type`, `key`,
  `keys`, `clipboard` and `run` answer with a refusal until `dsh-cu overlay` has put the frame
  on screen. That gate lives in the tool, not in the prompt.
- **It runs on a stock Windows box.** Other computer-use plugins drive an external native driver
  (cua-driver and friends) that has to be installed first; this one needs only the PowerShell and
  .NET that Windows already has.
- **It is verified against the real machine.** `dsh-cu self-test` exercises every command and
  reports pass/fail; environment-dependent checks (Notepad window, focus) warn instead of lying.
- **Works from inside the Harness sandbox.** The Harness file sandbox blocks piped stdio for
  nested processes; the CLI falls back to file-descriptor capture, so `dsh-cu` still works where
  a naive `spawn(..., {stdio: 'pipe'})` gets `EPERM`.

What it is *not*: it has no accessibility tree (pixels only, so it needs a vision-capable path to
ground coordinates), no multi-monitor support, no browser DOM, and no per-application allowlist.

## Install

| Way | Command | What you get |
|---|---|---|
| Skill + CLI | `powershell -ExecutionPolicy Bypass -File install.ps1` | `SKILL.md` in `$DSH_HOME\skills\dsh-computer-use\` and `dsh-cu` on PATH via `npm link` |
| npm | `npm install -g dsh-cu` | the `dsh-cu` CLI only; copy `SKILL.md` yourself |
| DSH profile plugin | `dsh plugin --profile web add dsh-cu` | the bundle mounts the plugin, which registers the skill from the package |
| Straight from this repository | `dsh plugin --profile web add github:datuloar/dsh-computer-use-win` | same as above, before the npm release; no install scripts are run |

Use **one** skill delivery path: the copied `$DSH_HOME\skills\dsh-computer-use\SKILL.md` and the
plugin registration carry the same skill name.

Without any of them: `node src/cli.js <command>`.

The filesystem skill root is scanned live, so no restart is needed for the copy; the profile
plugin needs `dsh web` restarted once.

## The loop

```powershell
dsh-cu overlay                       # the human is warned for 8 s, ESC cancels
dsh-cu shot                          # capture the screen, print the path
dsh-cu click 640 380                 # click there
dsh-cu type "hello"                  # type into the focused window
dsh-cu keys ctrl+l                   # key combinations
dsh-cu overlay --stop                # stop and clean up
```

1. `dsh-cu overlay` before the first input.
2. `dsh-cu focus <pid>` (or `--title <text>`) the target window.
3. `dsh-cu shot` and look at the image.
4. Act on coordinates taken from that screenshot; confirm a `move` with `dsh-cu pos`.
5. `dsh-cu shot` again — a step is done only when the second screenshot says so.
6. `dsh-cu overlay --stop` when finished.

## Commands

    dsh-cu shot [file.png]                    capture the primary screen
    dsh-cu move <x> <y>                       move the pointer
    dsh-cu click <x> <y> [left|right|double]  click
    dsh-cu wheel <delta> [<x> <y>] [--horizontal]   scroll, 120 = one notch, at that point when x y are given
    dsh-cu type <text>                        type into the focused window
    dsh-cu key <name> [down|up]               Enter, Esc, Tab, Space, Ctrl, Alt, F1..F12, arrows
    dsh-cu keys <combo>                       ctrl+l, ctrl+shift+t, ...
    dsh-cu clipboard [get|set <text>|clear]   read or write the clipboard
    dsh-cu pos                                pointer position and foreground window
    dsh-cu windows [--json]                   visible windows with pid, title and rectangle
    dsh-cu focus <pid> | --title <text>       bring a window to the front, verified
    dsh-cu wait-window <text> [seconds]       wait for a window to appear, then focus it
    dsh-cu run <command line>                 run a command line — see the safety rules
    dsh-cu broker [start|stop|status]         elevated input broker, asks for UAC
    dsh-cu overlay [--announce N] [--quiet]   on-screen indicator, ESC stops it
    dsh-cu overlay-state                      whether the indicator is running
    dsh-cu display                            primary screen size and DPI
    dsh-cu doctor                             what this machine can do
    dsh-cu self-test                          exercise every command
    dsh-cu overlay --stop                     stop the indicator, restore the cursor
    dsh-cu overlay --restore-cursor           emergency cursor rescue

`shot` writes into `%TEMP%\dsh-computer-use\` and prints `SAVED <path> <bytes>`. `--quiet` draws
only the pointer marker, for pixel-accurate reads. Arguments are handed to the backend as a JSON
array, so typed text and window titles keep their spaces, quotes and leading dashes.

Scrolling follows the pointer, so pass it the page: `dsh-cu wheel -600 1280 700` is five notches
down at that point, `--horizontal` scrolls sideways, and `key PageDown` / `keys ctrl+End` scroll the
focused page. Every scroll moves the coordinates you measured — take a fresh shot before clicking.

## Safety model

- **Input is refused while the indicator is down** — and again the moment the indicator process
  dies, so a killed indicator cannot leave the human blind for the seconds the heartbeat stays
  fresh. Override only deliberately: `DSH_CU_ALLOW_NO_INDICATOR=1`.
- **The indicator comes up before input is allowed**, and the CLI waits out the full announcement
  (default 8 s) after the frame is confirmed on screen.
- **ESC stops it** — a physical press only; injected ESC is ignored.
- **`overlay --stop`** kills the indicator by pid file, reloads the system cursors and removes its
  state files. The indicator also stops itself after five minutes without a command.
- **The tool never hides your pointer.** The animated marker is drawn *next to* the real cursor, so
  killing the indicator — which no cleanup code can survive — cannot leave you without a pointer.
  `dsh-cu overlay --restore-cursor` reloads the system cursors anyway (safe to run any time) and is
  what repairs a machine left in the old state by version 1.1.0; `dsh-cu doctor` reports whether the
  pointer is showing.
- **`run` and `broker start` are the escape hatches.** `broker start` raises a UAC prompt and lets
  `run` execute a command line elevated, for windows this process cannot reach (UIPI). Both are
  gated behind the indicator and are meant for explicit human requests — the Harness already has a
  shell, so the only thing they add is elevation.
- **`clipboard get` is gated too**: it can expose whatever the human last copied.
- The skill instructs the agent never to press anything destructive without an explicit request.

## Running from inside a sandboxed agent session

The Harness file sandbox denies nested processes a pipe, so `node`-spawns-`powershell` with
`stdio: 'pipe'` fails with `EPERM` before PowerShell even starts. The CLI detects that exact
failure and re-runs the backend with two file descriptors instead of pipes, so every command keeps
working. If you would rather skip Node entirely, call the backend directly — it takes the same
commands:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backends\windows.ps1 shot C:\temp\shot.png
```

## Limits, stated plainly

- **Windows only.** `doctor` and `self-test` still run elsewhere; every other command refuses.
- **Elevated windows** cannot be driven from a non-elevated process (UIPI) — use `broker start`.
- **The UAC consent dialog and the lock screen are unreachable**: they run on the secure desktop,
  which is neither capturable nor clickable without a signed UIAccess binary.
- **Captchas**: there is no solver in here — no OCR, no model call, no bypass. A checkbox or a
  tile is the same click as any other target, chosen by whoever looked at the screenshot; whether
  clicking it is allowed is between you and the site.
- **Primary monitor only**, in physical pixels. The process claims per-monitor DPI awareness, so a
  screenshot is native resolution and its coordinates are the coordinates `click` expects.
- **No browser DOM, no accessibility tree** — pixels only.
- Typing runs at 12 ms per character, which is what modern text controls accept reliably; a newline
  is sent as Enter and a tab as Tab. Coordinates outside ±32767 are refused rather than clamped.
- The indicator is drawn on the physical screen. The panel also appears in remote-desktop
  streams; the layered frame does not.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `spawnSync powershell EPERM` | an old version without the file-descriptor fallback, or a different sandbox rule | update; use the direct backend call above |
| `the on-screen indicator is not running` | no `dsh-cu overlay` yet, or it was stopped/ESC'd | run `dsh-cu overlay`, or set `DSH_CU_ALLOW_NO_INDICATOR=1` deliberately |
| The cursor is invisible (only possible if you upgraded from 1.1.0, which blanked it) | that version replaced the system cursors and a killed indicator could leave them blank | `dsh-cu overlay --restore-cursor`; if that does not help, re-apply a pointer scheme in Settings → Mouse → Additional mouse options → Pointers, or sign out and back in |
| `the elevated broker took the command but did not answer` | it is still running that command | wait, then retry if needed; `dsh-cu broker stop` if it is wedged |
| `the backend was stopped after 60s` | a modal dialog or a busy machine blocked the call | look at the screen, dismiss the dialog, retry |
| `capture returned an empty image` | session locked or display asleep | unlock and retry |
| `SendInput delivered 0 of 1 events` | the focused window is elevated | `dsh-cu broker start`, then retry |
| The agent never sees the skill | `$DSH_HOME` is unset, or the skill frontmatter is invalid YAML | `dsh-cu doctor` reports the skill path; `npm run verify` validates the frontmatter |

## Development

```powershell
npm run verify      # static: skill frontmatter, documented commands, plugin manifest
npm test            # node:test suite for the pure parts (frontmatter, command table, contract)
npm run check       # both of the above, what CI runs
npm run self-test   # real machine: every command, ~40 s, takes over mouse and keyboard
npm run doctor
```

`verify` and `test` touch nothing, so a CI runner can execute them (see `.github/workflows/ci.yml`).
`self-test` is the invasive one — run it on a desktop you are willing to hand over for a minute (it
opens Notepad, types, clicks and closes Notepad again). From a sandboxed agent session Notepad
cannot start, so those three checks report a warning instead of failing.

```
src/cli.js              entry point: argv -> one command call, one error path
src/commands.js         the command table: name, args, summary, gate and handler
src/backend.js          the only file that spawns a process or reads a temp path
src/contract.js         static contract check (frontmatter, docs, plugin manifest)
src/selftest.js         checks against the real machine
src/tool-error.js       the error type whose message is meant for the operator
backends/windows.ps1    the PowerShell host: argv, dispatch, indicator lifecycle, broker
backends/csharp/        the C# it compiles, one type per file
lib/index.js            DSH plugin entry: registers the skill
lib/skill.js            the skill registration object, read from SKILL.md
lib/frontmatter.js      the two frontmatter fields the plugin needs
cordis.patch.yml        the bundle patch that mounts the plugin
test/                   node:test suite (test/run.mjs runs it in one process)
SKILL.md                agent-facing skill: when to use it, the loop, the safety rules
AGENTS.md               index for a coding agent: layout, entry points, rules easy to break
install.ps1             one-command install
```

## Publishing to the plugin market

The market is the `dshmarket` plugin (Settings → **Plugin Market**); its catalog comes from
[curated PRs](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin), and the install endpoint
rejects anything that is not in that catalog. This repository is already shaped for it
(`dsh.bundle.patch`, a Cordis plugin entry, the skill shipped in `files`, CI, `npm run check`), so
the remaining steps are publishing, not code:

| Step | State |
|---|---|
| GitHub repository | [datuloar/dsh-computer-use-win](https://github.com/datuloar/dsh-computer-use-win) — created, branch `main` |
| npm name | `dsh-cu` — free at the time of writing; `dsh-computer-use` and `dsh-computer-use-win` are taken by other plugins |
| `repository` field | set in `package.json`, so the catalog can map npm back to this repo |
| Publish | `npm publish` (the package declares `publishConfig.access: public`) |
| Repository metadata | add the `dsh-plugin` topic and a one-line description on GitHub |
| Catalog PR | one file `data/plugins/<owner>__<repo>.yml` with `url`, `name`, `category: tools` and a bilingual `description` |

CI in the catalog wants a `dsh.bundle`, real working code, a repository at least a day old and a
description that matches the code. Optional but recommended: a `screenshots.json` next to
`package.json` (1–8 GitHub-hosted images) so the card shows curated shots instead of scraping this
README — `docs/indicator.png` is the one shot this repository ships.

If the package is ever renamed, three places move together: `name` in `package.json`, the exported
`name` in `lib/index.js`, and the `id`/`name` in `cordis.patch.yml`; the skill keeps its own name
`dsh-computer-use`, which is what `$DSH_HOME\skills\` and the catalog show. `npm run verify` fails
if they disagree.

Note that `os: ["win32"]` makes pnpm refuse the install on macOS and Linux, while the catalog has
no Windows-only flag — the market will still show the card to everyone.

## License

MIT
