# DSH Validation

The DeepSeek Harness distribution is maintained in
[datuloar/dsh-computer-use-win](https://github.com/datuloar/dsh-computer-use-win).
The separate [OpenCode distribution](https://github.com/datuloar/open-code-computer-use-win) has
its own installer, theme, documentation and release pipeline. This DSH tree has no OpenCode adapter
or dependency on an OpenCode checkout.

## Version 1.4.0

The changes retain five-second configurable announcements, client ownership, cancellation and
disconnect cleanup, safe key release, atomic broker messages and backend deadlines that include
cold startup. Control inspection preserves whitespace, bounds values and withholds password text.
Named-control waits poll without input. Exact matches are selected before enabled substrings.
The DSH plugin name, skill registration, installation and appearance keep their existing identities.

## Checks on October 19, 2026

- Static skill, command and DSH plugin contract: passed.
- Unit checks: 58 passed, zero failures.
- Isolated Windows desktop suite: 30 passed, zero failures.
- [Raw desktop report](benchmarks/2026-10-19-v1.4.0-deepseek.json), source SHA256:
  `323773987278a51354b6ef5064e123f511a9aebd9e3bd0ffdea8e97cf44feb17`.

The desktop test ran on Windows 10.0.26200, Node v24.19.0,
2560 by 1440 at 96 DPI. It checked literal Unicode/whitespace, untouched clipboard sequence,
control values, passwords, ambiguity, covered targets, readiness waits, cancellation, ownership,
cursor recovery and MCP disconnect. It drove only its dedicated fixture.

The first attempt stopped after 19 passing checks because the pointer changed position during a
read-only wait. Its failed report remains in the original test temp directory. The repeat passed
without source changes or weakened assertions. The observation does not establish its cause.

The DeepSeek Harness executable was unavailable in PATH. Skill registration is checked through
the plugin contract; an actual Harness model session was not verified. Physical ESC, elevated
broker/UAC and additional monitors still require separate checks. These results do not prove
universal reliability or a comparative task win rate against UI-TARS.
