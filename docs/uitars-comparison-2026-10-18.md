# Comparison with ByteDance UI-TARS Desktop

Reviewed October 18, 2026. The target is dependable Windows control from DeepSeek Harness: correct targeting,
exact input, independently verified outcomes and prompt return of control to the human. Overall
superiority is unproven: UI-TARS was not installed or executed on this machine, and there is no shared
runtime task dataset for both systems yet.

## Versions and method

Source review is pinned to commit
[3ac2cb8d946d78d5ff92ad17b318eaafa18c178c](https://github.com/bytedance/UI-TARS-desktop/tree/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c).
It covered the Windows operator, SDK execution loop, stop paths, settings, browser operator and export.
No third-party code was run.

UI-TARS Desktop is an Electron application with
[version 0.2.4](https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/apps/ui-tars/package.json#L3)
in this source tree. The reviewed Windows installer release is
[v0.2.4, August 21, 2025](https://github.com/bytedance/UI-TARS-desktop/releases/tag/v0.2.4).
The monorepo's [v0.3.1 release, October 8, 2026](https://github.com/bytedance/UI-TARS-desktop/releases/tag/v0.3.1)
primarily concerns Agent TARS CLI/server. Desktop and Agent TARS must be assessed separately.
Our backend executes tools while the Harness supplies planning; Desktop has its own model loop.
Model quality and executor behavior are different measurements.

## Source-backed findings

| Area | UI-TARS Desktop at the pinned commit | Current DSH backend | Assessment |
|---|---|---|---|
| Windows targeting | The local computer operator executes coordinates predicted from visual observations; [NutJS operator](https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/packages/ui-tars/operators/nut-js/src/index.ts). | UIA tree/find/tap, ambiguity and covered-target refusal, then OCR or screenshots. | Named controls provide another targeting path; a higher task success rate has not been measured. |
| Literal text | The Windows branch trims input, temporarily replaces the clipboard and restores a text copy; [Electron operator](https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/apps/ui-tars/src/main/agent/operator.ts#L79). | Unicode SendInput preserves whitespace, Tab and Enter without replacing the clipboard. | A concrete behavioral difference; our fixture checks exact text and clipboard sequence. |
| Retry after failure | Desktop configures one execution retry and the SDK invokes the operator again; [configuration](https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/apps/ui-tars/src/main/services/runAgent.ts#L203), [execution](https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/packages/ui-tars/sdk/src/GUIAgent.ts#L359). | A broker request already taken is never retried directly. Partial typing reports progress and guidance requires inspection. | A non-idempotent action needs a fresh state check before repetition. |
| Pause and stop | Separate pauseRun/resumeRun/stopRun operations; [IPC](https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/apps/ui-tars/src/main/ipcRoutes/agent.ts#L56). | Visible announcement, physical ESC, MCP cancellation, human-stop hold and session cleanup. | Our backend guards are tested; a dedicated user pause/resume interface is missing. |
| Action history | Messages retain screenshots/predictions, click markers and HTML export; [loop](https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/apps/ui-tars/src/main/services/runAgent.ts#L54), [export](https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/docs/setting.md#L194). | Harness tool history and isolated regression reports. | Their integrated session viewer/export remains a product advantage. |
| Browser | Desktop selects a separate DefaultBrowserOperator; [operator selection](https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/apps/ui-tars/src/main/services/runAgent.ts#L119). | Windows UIA/OCR/pixels; no browser DOM/CDP operator. | A substantial feature gap. |
| Models and data | VLM endpoint, key and model family are configurable; [settings](https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/docs/setting.md#L18). | The Harness chooses the provider; optional see uses local Qwen3-VL over loopback. | Neither system is universally local. Cloud screenshot requests reach the selected provider. |
| Platforms | Windows/macOS; documentation warns about one monitor; [quick start](https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/docs/quick-start.md#L5). | Windows, primary monitor. | Their platform coverage is broader; no multi-monitor advantage is claimed. |
| Remote control | Remote operators exist, but documentation records the old service closing August 20, 2025; [quick start](https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/docs/quick-start.md#L42). | No remote backend. | A remote class does not establish service availability. |

The trimming and retry findings describe code paths, not observed UI-TARS failure rates. Our named
control protections also do not apply automatically to coordinate click: it executes the supplied point.

## Regression evidence added after review

The self-test reads only the Windows clipboard sequence before and after Unicode typing, without
reading or replacing its contents. Microsoft documents the counter in
[GetClipboardSequenceNumber](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getclipboardsequencenumber).
Another check covers the target button with a fixture window: tap must refuse, and the covering
window's decoy button must remain untouched.

Every run atomically saves report.json with individual outcomes, durations, numeric measurements,
environment and a source SHA256. Preparation/check/cleanup failures produce failed; interruption can
leave running, which is not a pass. This is backend evidence, not a user session viewer.

The current DSH validation record is maintained separately in [VALIDATION.md](VALIDATION.md).
Source findings do not establish a task win rate, comparative latency or production failure rate.

## Work required for a stronger product

| Priority | Work | Acceptance evidence |
|---|---|---|
| P0 | Preserve input, ownership and stop guarantees | Full desktop suite without critical errors; separate human physical ESC test. |
| P1 | Bind coordinate actions to fresh observations | Observation carries window, UIA/image, DPI and time; stale or different-window targets refuse before input. |
| P1 | Extend control-state coverage across applications | Version 1.4.0 reads bounded Value/TextPattern and optional toggle/selection state, with password protection. WinForms fixtures are checked; broader app coverage remains. |
| P1 | Add a browser operator | Isolated local page: navigation, element lookup, filling, scrolling and independent result checks. |
| P1 | Add a session history viewer | Observation, action, verification, errors and timing; typed text hidden by default and explicit screenshot retention. |
| P2 | Add explicit pause/resume | Pause stops input and releases keys; resume rechecks ownership and announces; ESC retains its separate hold. |
| P2 | Measure task quality and cost | Identical tasks, environment and budget; application state proves success. |

See the [validation record](VALIDATION.md) and [benchmark protocol](benchmark-protocol.md).
macOS and remote execution are outside the current Windows backend scope.
