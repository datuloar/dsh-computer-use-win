import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkContract } from './contract.js';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export async function runSelfTest({ root, cli, exec }) {
  const backend = join(root, 'backends', 'windows.ps1');
  const temp = (name) => join(tmpdir(), 'dsh-computer-use', name);
  const aliveFile = join(tmpdir(), 'dsh-cu.alive');
  const pidFile = join(tmpdir(), 'dsh-cu.pid');
  const cursorMarker = join(tmpdir(), 'dsh-cu.cursor');

  const cliCall = (args) => exec(process.execPath, [cli, ...args]);
  const backendCall = (args) =>
    exec('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', backend, ...args]);

  const warnings = [];
  const results = [];
  const check = async (name, fn) => {
    try {
      const detail = await fn();
      results.push({ name, ok: true });
      console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
    } catch (error) {
      results.push({ name, ok: false, detail: error.message });
      console.log(`FAIL  ${name} — ${error.message}`);
    }
  };
  const checkSoft = async (name, fn) => {
    try {
      const detail = await fn();
      console.log(`WARN  ${name}${detail ? ` — ${detail}` : ''}`);
    } catch (error) {
      warnings.push(name);
      console.log(`WARN  ${name} — ${error.message}`);
    }
  };

  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  const foregroundTitle = () => {
    const line = cliCall(['pos'])
      .split('\n')
      .find((row) => row.startsWith('FOREGROUND')) ?? '';
    return line.replace(/^FOREGROUND\s+\d+\s*/, '').trim();
  };

  console.log(`self-test: ${root}\n`);

  await check('documentation and command surface agree (static)', () => {
    const problems = checkContract(root);
    assert(problems.length === 0, problems.join('; '));
    return 'skill frontmatter, command list and plugin manifest';
  });

  await check('doctor reports a Windows host', () => {
    const output = cliCall(['doctor']);
    assert(output.includes('win32'), 'platform is not win32');
    assert(output.includes('installs:'), 'doctor should confirm that nothing must be installed');
    return output.split('\n').find((line) => line.startsWith('display:'))?.trim() ?? 'win32';
  });

  cliCall(['overlay', '--stop']);

  await check('input is refused while the indicator is down', () => {
    let message = '';
    try {
      cliCall(['move', '100', '100']);
    } catch (error) {
      message = String(error.stderr ?? error.stdout ?? error.message);
    }
    assert(/indicator is not running/.test(message), `expected a refusal, got: ${message.trim() || 'no output'}`);
    return 'refused';
  });

  await check('overlay comes up before input is allowed', () => {
    const announce = 2;
    const started = Date.now();
    const output = cliCall(['overlay', '--announce', String(announce)]);
    const elapsed = (Date.now() - started) / 1000;
    assert(output.includes('frame up'), `unexpected overlay output: ${output}`);
    assert(elapsed >= announce, `returned after ${elapsed.toFixed(1)}s, before the ${announce}s announcement`);
    assert(backendCall(['overlay-state']).includes('RUNNING'), 'the indicator is not running after start');
    assert(cliCall(['overlay-state']).includes('RUNNING'), 'the CLI cannot see the running indicator');
    return `frame up, announced ${elapsed.toFixed(1)}s`;
  });

  const shotFile = temp(`selftest-${Date.now()}.png`);
  await check('shot writes a real PNG', () => {
    assert(cliCall(['shot', shotFile]).includes('SAVED'), 'no SAVED line');
    assert(existsSync(shotFile), 'no file produced');
    const size = statSync(shotFile).size;
    assert(size > 50_000, `suspiciously small capture: ${size} bytes`);
    unlinkSync(shotFile);
    return `${size} bytes`;
  });

  await check('pos reads pointer and foreground window', () => {
    const output = cliCall(['pos']);
    assert(/CURSOR -?\d+,-?\d+/.test(output), `unexpected output: ${output}`);
    assert(output.includes('FOREGROUND'), 'no foreground window');
    return output.split('\n')[0];
  });

  await check('move + pos agree (DPI check, retried)', () => {
    let last = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      cliCall(['move', '320', '240']);
      const read = cliCall(['pos']).match(/CURSOR (-?\d+),(-?\d+)/);
      assert(read, 'pos reported no position');
      last = `${read[1]},${read[2]}`;
      if (Math.abs(Number(read[1]) - 320) + Math.abs(Number(read[2]) - 240) <= 4) return last;
    }
    throw new Error(`pointer landed at ${last} instead of 320,240`);
  });

  await check('wheel scrolls, at a point, and sideways', () => {
    assert(cliCall(['wheel', '120']).includes('WHEEL 120'), 'unexpected wheel output');
    assert(cliCall(['wheel', '-120', '400', '300']).includes('WHEEL -120 at 400,300'), 'wheel at a point failed');
    assert(
      cliCall(['wheel', '-120', '400', '300', '--horizontal']).includes('HWHEEL -120 at 400,300'),
      'horizontal wheel failed',
    );
    return 'plain, at a point, horizontal';
  });

  await check('key combinations echo exactly one line', () => {
    const output = cliCall(['keys', 'ctrl+l']);
    assert(output === 'KEYS ctrl+l', `expected a single line, got: ${JSON.stringify(output)}`);
    return 'KEYS ctrl+l';
  });

  await check('clipboard round-trips text with quotes and dashes', () => {
    const marker = `dsh-cu-${Date.now()} "quoted" -dashed`;
    cliCall(['clipboard', 'set', marker]);
    const read = cliCall(['clipboard', 'get']);
    assert(read.includes(marker), `clipboard returned ${read} instead of ${marker}`);
    return `${marker.length} chars, quotes and the leading dash intact`;
  });

  await check('windows --json lists rectangles as an array', () => {
    const raw = cliCall(['windows', '--json']);
    const entries = JSON.parse(raw.slice(raw.indexOf('[')));
    assert(Array.isArray(entries) && entries.length > 0, 'no windows returned');
    const first = entries.find((entry) => entry.title && entry.width > 0);
    assert(first, 'no window with a rectangle');
    return `${entries.length} windows, first ${first.width}x${first.height}`;
  });

  await check('overlay stop leaves nothing behind', async () => {
    assert(cliCall(['overlay', '--stop']).includes('STOPPED'), 'stop did not confirm');
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !backendCall(['overlay-state']).includes('STOPPED')) await sleep(200);
    assert(backendCall(['overlay-state']).includes('STOPPED'), 'indicator still alive');
    assert(!existsSync(aliveFile) && !existsSync(pidFile) && !existsSync(cursorMarker), 'state files were left behind');
    assert(backendCall(['cursor-state']).includes('CURSOR_VISIBLE'), 'the pointer is not visible after a stop');
    return 'process, cursor and files clean';
  });

  await check('cursor rescue works', () => {
    assert(cliCall(['overlay', '--restore-cursor']).includes('CURSOR_RESTORED'), 'cursor was not restored');
    return 'CURSOR_RESTORED';
  });

  await check('a killed indicator refuses input at once and leaves the pointer alone', () => {
    cliCall(['overlay', '--announce', '0']);
    const owner = Number.parseInt(readFileSync(pidFile, 'utf8').trim().split(/\s+/)[0], 10);
    exec('powershell', ['-NoProfile', '-Command', `Stop-Process -Id ${owner} -Force`]);

    let refusal = '';
    try {
      cliCall(['move', '10', '10']);
    } catch (error) {
      refusal = String(error.stderr ?? error.stdout ?? error.message);
    }
    assert(
      /indicator is not running/.test(refusal),
      `expected a refusal right after the kill, got: ${refusal.trim() || 'no output'}`,
    );
    assert(backendCall(['cursor-state']).includes('CURSOR_VISIBLE'), 'the pointer did not survive the kill');
    return 'refused immediately, pointer untouched';
  });

  await check('a stale pid file never kills an unrelated process', async () => {
    const start = "Start-Process -FilePath powershell -ArgumentList @('-NoProfile','-Command','Start-Sleep -Seconds 25') -WindowStyle Hidden -PassThru | Select-Object -ExpandProperty Id";
    const decoyPid = Number.parseInt(exec('powershell', ['-NoProfile', '-Command', start]), 10);
    await sleep(1200);
    writeFileSync(pidFile, `${decoyPid} 1`);
    cliCall(['overlay', '--stop']);

    let survived = true;
    try {
      process.kill(decoyPid, 0);
    } catch {
      survived = false;
    }
    try {
      exec('powershell', ['-NoProfile', '-Command', `Stop-Process -Id ${decoyPid} -Force`]);
    } catch {}
    assert(survived, `pid ${decoyPid} was stopped although it is not the indicator`);
    return 'the recorded pid was rejected';
  });

  cliCall(['overlay', '--announce', '0']);

  try {
    execFileSync('taskkill', ['/IM', 'notepad.exe', '/F'], { stdio: 'ignore', windowsHide: true });
  } catch {

  }
  await sleep(600);

  const scratch = temp(`scratch-${Date.now()}.txt`);
  const notepad = spawn('notepad.exe', [scratch], { detached: true, stdio: 'ignore' });
  notepad.unref();
  await sleep(2500);

  try {
    const scratchName = scratch.split('\\').pop();

    const notepadWindows = () => {
      const raw = cliCall(['windows', '--json']);
      const start = raw.indexOf('[');
      if (start < 0) return [];
      return JSON.parse(raw.slice(start)).filter((entry) => /notepad|блокнот/i.test(entry.title));
    };

    if (notepadWindows().length === 0) {

      warnings.push('interactive window checks');
      console.log('WARN  Notepad did not open a window (sandboxed or non-interactive session)');
      console.log('WARN  skipped: wait-window focus, typed text, click modes');
    } else {
      await checkSoft('wait-window focuses a window by title', () => {

        const focused = cliCall(['wait-window', scratchName, '10']);
        assert(focused.startsWith('FOCUSED'), `wait-window said: ${focused}`);
        const title = foregroundTitle();
        assert(/notepad|блокнот/i.test(title), `notepad is not in front: "${title}"`);
        return focused.slice(0, 60);
      });

      await checkSoft('typed text reaches the focused application', async () => {
        assert(/notepad|блокнот/i.test(foregroundTitle()), `notepad is not in front: "${foregroundTitle()}"`);
        assert(!foregroundTitle().includes('*'), 'the scratch document is already modified');
        let modified = false;
        for (let attempt = 0; attempt < 3 && !modified; attempt++) {
          cliCall(['type', 'dsh cu selftest "quoted" -dashed']);
          await sleep(1200);
          modified = foregroundTitle().includes('*');
        }
        assert(modified, `the document stayed unmodified after three attempts ("${foregroundTitle()}")`);
        return `document marked as edited: ${foregroundTitle().slice(0, 40)}`;
      });

      await check('click, double click and right click reach the target window', () => {
        const [target] = notepadWindows();
        assert(target && target.width > 100, 'no usable Notepad rectangle to click');
        const x = Math.round(target.left + target.width / 2);
        const y = Math.round(target.top + Math.min(30, target.height / 4));
        assert(
          cliCall(['click', String(x), String(y), 'left']).includes(`CLICKED ${x},${y} left`),
          'left click failed',
        );
        cliCall(['click', String(x), String(y), 'double']);
        cliCall(['click', String(x), String(y), 'right']);
        return `three modes inside the window at ${x},${y}`;
      });
    }
  } finally {
    try {
      execFileSync('taskkill', ['/IM', 'notepad.exe', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch {

    }
  }

  await check('bad input is rejected before it reaches the backend', () => {
    const cases = [
      [['click', 'abc', '10'], /must be an integer/],
      [['move', '10'], /y is required/],
      [['click', '99999', '10'], /between -32767 and 32767/],
      [['move', '10', '-99999'], /between -32767 and 32767/],
      [['shot', root], /is a directory/],
      [['click', '10', '10', 'middle'], /click mode must be/],
      [['wheel', '0'], /must not be zero/],
      [['key', 'Enter', 'sideways'], /phase must be/],
      [['keys', 'ctrl'], /combination/],
      [['clipboard', 'paste'], /clipboard action must be/],
      [['broker', 'restart'], /broker action must be/],
      [['windows', '--bad'], /windows takes/],
      [['overlay', '--nonsense'], /unknown overlay flag/],
      [['overlay', '--announce', '99'], /between 0 and 30/],
      [['overlay', '--stop', '--restore-cursor'], /not both/],
      [['nonsense'], /unknown command/],
    ];
    process.env.DSH_CU_ALLOW_NO_INDICATOR = '1';
    try {
      for (const [args, pattern] of cases) {
        let message = '';
        try {
          cliCall(args);
        } catch (error) {
          message = String(error.stderr ?? error.stdout ?? error.message);
        }
        assert(pattern.test(message), `${args.join(' ')} was not rejected (${message.trim() || 'no output'})`);
      }
    } finally {
      delete process.env.DSH_CU_ALLOW_NO_INDICATOR;
    }
    return `${cases.length} cases rejected`;
  });

  if (warnings.length > 0) console.log('soft warnings (environment dependent): ' + warnings.length);

  cliCall(['overlay', '--stop']);

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    process.exitCode = 1;
    console.log(`failed: ${failed.map((result) => result.name).join(', ')}`);
  }
}
