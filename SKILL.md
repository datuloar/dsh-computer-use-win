---
name: dsh-computer-use
description: >-
  Windows computer use: screenshot the screen, click, type, scroll and focus
  windows, with an on-screen indicator the human can see and stop with ESC.
  Use it when the answer is not in the files, the shell or the tests — a GUI
  must be read or driven, a UI change verified visually, or window focus, DPI
  and permissions are in question.
---

# dsh-computer-use

## When to use

Use it when the answer is not in the files, the shell or the tests:

- the screen must be looked at (what an app, game, browser or error dialog shows);
- something must be clicked, typed or scrolled in a GUI with no CLI;
- a UI change must be verified visually;
- window focus, DPI or permissions are in question.

Do not use it when reading files, running builds or tests can answer the question.

## The loop

1. `dsh-cu overlay --hide-cursor` first — the human gets an 8 s countdown and ESC cancels, and the
   animated marker replaces their pointer so there is exactly one pointer on screen. Without the
   flag their own cursor stays visible next to the marker. Every input command refuses to run until
   the indicator is up, and it refuses again the moment the indicator process dies, so a killed
   indicator never leaves the human blind while you act. If the indicator is killed while it holds
   the pointer, the next command gives it back and says so.
2. `dsh-cu focus <pid>` (or `dsh-cu focus --title "part of the title"`) the target window.
3. `dsh-cu shot` and look at the image.
4. Act on coordinates taken from that screenshot; confirm a `move` with `dsh-cu pos`.
5. `dsh-cu shot` again. A step is done only when the second screenshot says so.
6. `dsh-cu overlay --stop` when finished.

`shot` writes into `%TEMP%\dsh-computer-use\` and prints `SAVED <path> <bytes>`; read that
file with the image tool. `dsh-cu doctor` reports the capture size, the DPI and whether the
indicator is up; `dsh-cu display` prints just the size and DPI.

`type` sends a newline as Enter and a tab as Tab (so in a browser a tab moves focus, exactly as it
would for a human), and every other character as a Unicode keystroke. Text is typed in chunks and
the indicator is checked between them, so if the human presses ESC a long text stops within a few
seconds. Coordinates outside ±32767 are rejected instead of being clamped to the screen edge. An
already-running `run` command line cannot be stopped by ESC.

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
    dsh-cu overlay [--announce N] [--quiet] [--hide-cursor]   on-screen indicator, ESC stops it
    dsh-cu overlay-state                      whether the indicator is running
    dsh-cu display                            primary screen size and DPI
    dsh-cu doctor                             what this machine can do
    dsh-cu self-test                          exercise every command
    dsh-cu overlay --stop                     stop the indicator and clean up
    dsh-cu overlay --restore-cursor           emergency cursor restore

## Scrolling a page

The wheel goes to whatever window is under the pointer, so give it the page:

    dsh-cu wheel -600 1280 700                  five notches down at 1280,700
    dsh-cu wheel 600 1280 700                   five notches up
    dsh-cu wheel -240 1280 700 --horizontal     sideways

One notch is 120 and a screenful is roughly 600–900. `--horizontal` sends a horizontal wheel event,
so it moves the pages that really overflow sideways and is ignored by the ones that do not. When
the page itself has focus the keyboard is often steadier: `dsh-cu key PageDown`, `dsh-cu keys
ctrl+End` for the bottom, `dsh-cu keys ctrl+Home` for the top.

Scrolling moves every coordinate you measured, so take a fresh `dsh-cu shot` before the next click
instead of reusing the old ones.

## What the human sees

- a panel at the top centre: "DeepSeek is controlling your computer" with the ESC hint;
- during the announcement the same panel counts down and the frame pulses harder;
- a soft blue frame around the whole screen edge;
- your pointer is replaced by the animated marker with `--hide-cursor`, or stays visible next to it
  without the flag.

The marker is a window, so it appears in your own screenshots — that is how you see where the
pointer is. `--quiet` draws only the marker, for pixel-accurate reads.

## Safety

- Never press anything destructive without an explicit request: deletion, installs, purchases,
  sending messages, closing other people's windows, banking or UAC dialogs.
- One step at a time against a fresh screenshot; never a blind click series.
- Never type secrets unless asked directly. `clipboard get` can expose whatever the human last
  copied — read it only when the task needs it.
- `dsh-cu run` and `dsh-cu broker start` are for windows this process cannot reach (UIPI). They
  run a command line, elevated when the broker is up, and `broker start` raises a UAC prompt the
  human must approve. Use them only on an explicit request, never as a shortcut for shell work.
- Elevated windows (UIPI) and the secure desktop (UAC, lock screen) are unreachable — say so
  instead of fighting it.
- `overlay --stop` is not optional: it kills the indicator, restores the cursor and removes its
  state files. `dsh-cu overlay-state` says whether it is still running. The indicator also stops
  itself after five minutes without a command from you.
- `--hide-cursor` blanks the system cursor so the marker is the only pointer. The tool records that
  state, `overlay --stop` restores it, and if the indicator is killed the next `dsh-cu` command
  restores it and reports that it did; `dsh-cu doctor` shows whether the pointer is replaced.

## Limits

- Windows only; every command except `doctor` and `self-test` refuses clearly elsewhere.
- Primary monitor only, in physical pixels. No browser DOM: pixels only.
- One step per tool call: "wiggle the mouse in a game" is out, "open, click, verify" is in.
- Typing runs at 12 ms per character, which is what modern text controls accept reliably.
- A screenshot is the whole screen: for a small detail, crop it before reading it.
