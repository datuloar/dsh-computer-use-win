# Desktop Benchmark Protocol

Test backend correctness separately from a model's ability to complete tasks. A source review of
UI-TARS or another tool does not establish comparative task success or speed.

Run `node src/verify.js` and `node test/run.mjs` first. On an unlocked interactive Windows desktop,
run `node src/cli.js self-test`. It uses a dedicated fixture and preserves a JSON report with the
source fingerprint, environment, per-check results, durations and numeric timing measurements.
Retain failed and unfinished runs. Never replace the clipboard or test against the user's apps.

For a comparison, pin both products' commits, models, endpoints, generation settings and budgets.
Record Windows, Node, resolution, DPI and initial window state. Alternate execution order.
Use independent fixture checks for exact Unicode/whitespace, intended clicks, ambiguous targets,
covered controls, delayed readiness, cancellation, partial input and cursor recovery.

Measure completed tasks out of all attempts, wrong clicks, duplicate input, interventions, calls,
elapsed time and stop latency. Separate cold startup from warm actions and physical ESC from MCP
cancellation. Preserve raw outcomes for both products before reporting a win rate or p50/p95 times.

This repository validates the DeepSeek Harness CLI, backend, skill registration and MCP surface.
An actual Harness session is a separate integration check. OpenCode tests and installation belong
to [open-code-computer-use-win](https://github.com/datuloar/open-code-computer-use-win).
