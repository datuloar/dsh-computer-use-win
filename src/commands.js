import { existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  backendScript,
  cursorMayBeHidden,
  exec,
  indicatorIsUp,
  input,
  isWindows,
  ps,
  requireIndicator,
  root,
  SLOW_BACKEND_TIMEOUT_MS,
  temp,
} from './backend.js';
import { ToolError } from './tool-error.js';

const DEFAULT_ANNOUNCE_SECONDS = 8;
const MAX_ANNOUNCE_SECONDS = 30;
const MIN_SCREENSHOT_BYTES = 1024;
const MAX_COORDINATE = 32767;
const ONE_SHOT_FLAGS = { '--stop': 'stop', '--restore-cursor': 'restore-cursor' };
const CLICK_MODES = ['left', 'right', 'double'];
const KEY_PHASES = ['', 'down', 'up'];
const CLIPBOARD_ACTIONS = ['get', 'set', 'clear'];
const BROKER_ACTIONS = ['start', 'stop', 'status'];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function integer(value, name) {
  if (value === undefined) throw new ToolError(`${name} is required`);
  if (!/^-?\d+$/.test(String(value).trim())) throw new ToolError(`${name} must be an integer, got "${value}"`);
  return Number.parseInt(value, 10);
}

function coordinate(value, name) {
  const number = integer(value, name);
  if (number < -MAX_COORDINATE || number > MAX_COORDINATE) {
    throw new ToolError(`${name} must be between -${MAX_COORDINATE} and ${MAX_COORDINATE}, got ${number}`);
  }
  return number;
}

function oneOf(value, allowed, name) {
  if (!allowed.includes(value)) throw new ToolError(`${name} must be ${allowed.filter(Boolean).join(', ')}, got "${value}"`);
  return value;
}

function required(value, name) {
  const text = (value ?? '').trim();
  if (!text) throw new ToolError(`${name} is required`);
  return text;
}

async function runShot(args) {
  const file = screenshotPath(args[0]);
  ps(['shot', file]);
  const size = statSync(file).size;
  if (size < MIN_SCREENSHOT_BYTES) {
    unlinkSync(file);
    throw new ToolError('capture returned an empty image — is the session locked or the display asleep?');
  }
  console.log(`SAVED ${file} ${size} bytes`);
}

function screenshotPath(target) {
  if (target) {
    const file = resolve(target);
    if (existsSync(file) && statSync(file).isDirectory()) {
      throw new ToolError(`${file} is a directory, not a file to write the screenshot to`);
    }
    mkdirSync(dirname(file), { recursive: true });
    return file;
  }
  const folder = temp('dsh-computer-use');
  mkdirSync(folder, { recursive: true });
  return join(folder, `shot-${Date.now()}.png`);
}

async function runMove(args) {
  console.log(input(['move', String(coordinate(args[0], 'x')), String(coordinate(args[1], 'y'))]));
}

async function runClick(args) {
  const mode = oneOf(args[2] ?? 'left', CLICK_MODES, 'click mode');
  console.log(input(['click', String(coordinate(args[0], 'x')), String(coordinate(args[1], 'y')), mode]));
}

async function runWheel(args) {
  const horizontal = args.includes('--horizontal');
  const position = args.filter((argument) => argument !== '--horizontal');
  const delta = integer(position[0], 'delta');
  if (delta === 0) throw new ToolError('wheel delta must not be zero');
  const [x, y] = position.slice(1);
  const target = x === undefined ? [] : [String(coordinate(x, 'x')), String(coordinate(y, 'y'))];
  console.log(input(['wheel', String(delta), ...target, ...(horizontal ? ['--horizontal'] : [])]));
}

const TYPE_CHUNK_CHARS = 200;

async function runType(args) {
  const text = required(args.join(' '), 'type text');
  for (let index = 0; index < text.length; index += TYPE_CHUNK_CHARS) {
    requireIndicator();
    console.log(input(['type', text.slice(index, index + TYPE_CHUNK_CHARS)]));
    if (index + TYPE_CHUNK_CHARS < text.length) await sleep(30);
  }
}

async function runKey(args) {
  const name = required(args[0], 'key name (Enter, Esc, Tab, Ctrl, F5, …)');
  console.log(input(['key', name, oneOf(args[1] ?? '', KEY_PHASES, 'key phase')]));
}

async function runKeys(args) {
  const combo = required(args[0], 'a combination like ctrl+shift+t');
  if (!combo.includes('+')) throw new ToolError('keys needs a combination like ctrl+shift+t');
  console.log(input(['keys', combo]));
}

async function runClipboard(args) {
  const action = oneOf(args[0] ?? 'get', CLIPBOARD_ACTIONS, 'clipboard action');
  if (action !== 'set') {
    console.log(input(['clipboard', action]));
    return;
  }
  console.log(input(['clipboard', 'set', required(args.slice(1).join(' '), 'clipboard text')]));
}

async function runWindows(args) {
  if (args[0] !== undefined && args[0] !== '--json') throw new ToolError(`windows takes --json or nothing, got "${args[0]}"`);
  console.log(ps([args[0] === '--json' ? 'windows-json' : 'windows']));
}

async function runFocus(args) {
  if (args[0] === '--title') {
    console.log(ps(['focus-title', required(args.slice(1).join(' '), 'a title substring')]));
    return;
  }
  console.log(ps(['focus', String(integer(args[0], 'pid'))]));
}

async function runWaitWindow(args) {
  const title = required(args[0], 'a title substring');
  const seconds = args[1] ? integer(args[1], 'seconds') : 15;
  console.log(ps(['wait-window', title, String(seconds)]));
}

async function runBroker(args) {
  const action = oneOf(args[0] ?? 'status', BROKER_ACTIONS, 'broker action');
  if (action !== 'status') requireIndicator();
  console.log(ps([action === 'status' ? 'broker-state' : `broker-${action}`]));
}

async function runRun(args) {
  console.log(input(['run', required(args.join(' '), 'a command line')], SLOW_BACKEND_TIMEOUT_MS));
}

function parseOverlayFlags(args) {
  const flags = new Set();
  let announce = DEFAULT_ANNOUNCE_SECONDS;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--announce') {
      announce = integer(args[++index], 'announce seconds');
      if (announce < 0 || announce > MAX_ANNOUNCE_SECONDS) {
        throw new ToolError(`announce seconds must be between 0 and ${MAX_ANNOUNCE_SECONDS}`);
      }
      continue;
    }
    if (argument !== '--quiet' && !(argument in ONE_SHOT_FLAGS)) {
      throw new ToolError(`unknown overlay flag "${argument}"`);
    }
    flags.add(argument);
  }
  const oneShotFlags = [...flags].filter((flag) => flag in ONE_SHOT_FLAGS);
  if (oneShotFlags.length > 1) throw new ToolError('overlay takes either --stop or --restore-cursor, not both');
  if (oneShotFlags.length === 1 && flags.has('--quiet')) {
    throw new ToolError('--quiet only applies while starting the indicator');
  }
  return {
    announce,
    quiet: flags.has('--quiet'),
    oneShot: oneShotFlags.length === 1 ? ONE_SHOT_FLAGS[oneShotFlags[0]] : null,
  };
}

async function runOverlay(args) {
  const options = parseOverlayFlags(args);
  if (options.oneShot) {
    console.log(ps(['overlay', options.oneShot]));
    return;
  }
  const extra = options.quiet ? ['-Quiet'] : [];
  const state = ps(['overlay-start', '-Announce', String(options.announce), ...extra]);
  if (!state.includes('RUNNING')) throw new ToolError('the indicator did not come up — refusing to start input without it');

  await sleep(options.announce * 1000);
  console.log(`OVERLAY on (frame up, announced for ${options.announce}s)`);
}

function runDoctor() {
  const report = (label, value) => console.log(`${label.padEnd(12)}${value}`);
  const installed = (name) => {
    try {
      exec('where', [name]);
      return true;
    } catch {
      return false;
    }
  };
  report('platform:', `${process.platform} ${process.arch}${isWindows ? '' : '  (unsupported)'}`);
  report('node:', process.version);
  report('root:', root);
  report('powershell:', installed('powershell') ? 'ok' : 'MISSING (required)');
  report('backend:', existsSync(backendScript) ? 'present' : 'MISSING');
  report('indicator:', indicatorIsUp() ? 'RUNNING' : 'stopped');
  report('cursor:', describeCursor());
  report('display:', describeDisplay());
  report('skill:', describeSkillInstall());
  report('installs:', 'none — the backend compiles itself with the bundled .NET Framework');
  report('limits:', 'elevated windows (UIPI) and the secure desktop (UAC, lock screen)');
}

function describeCursor() {
  if (cursorMayBeHidden()) return 'HIDDEN until restored — run "dsh-cu overlay --restore-cursor"';
  try {
    return ps(['cursor-state']).includes('CURSOR_HIDDEN') ? 'HIDDEN — run "dsh-cu overlay --restore-cursor"' : 'visible';
  } catch {
    return 'unknown';
  }
}

function describeDisplay() {  if (!isWindows || !existsSync(backendScript)) return 'unknown (not a Windows host)';
  try {
    return ps(['display']).replace(/^DISPLAY\s+/, '');
  } catch (error) {
    return `unknown (${String(error.message).split('\n')[0]})`;
  }
}

function describeSkillInstall() {
  if (!process.env.DSH_HOME) return 'DSH_HOME is not set';
  const path = join(process.env.DSH_HOME, 'skills', 'dsh-computer-use', 'SKILL.md');
  return existsSync(path) ? `installed (${path})` : `not installed (${path}) — run install.ps1`;
}

async function runSelfTest() {
  const { runSelfTest: run } = await import('./selftest.js');

  const cli = fileURLToPath(new URL('./cli.js', import.meta.url));
  await run({ root, cli, exec });
}

export const COMMANDS = [
  { name: 'shot', args: '[file.png]', summary: 'capture the primary screen', run: runShot },
  { name: 'move', args: '<x> <y>', summary: 'move the pointer', gated: true, run: runMove },
  { name: 'click', args: '<x> <y> [left|right|double]', summary: 'click', gated: true, run: runClick },
  { name: 'wheel', args: '<delta> [<x> <y>] [--horizontal]', summary: 'scroll, 120 = one notch, at that point when x y are given', gated: true, run: runWheel },
  { name: 'type', args: '<text>', summary: 'type into the focused window', gated: true, run: runType },
  { name: 'key', args: '<name> [down|up]', summary: 'Enter, Esc, Tab, Space, Ctrl, Alt, F1..F12, arrows', gated: true, run: runKey },
  { name: 'keys', args: '<combo>', summary: 'ctrl+l, ctrl+shift+t, ...', gated: true, run: runKeys },
  { name: 'clipboard', args: '[get|set <text>|clear]', summary: 'read or write the clipboard', gated: true, run: runClipboard },
  { name: 'pos', args: '', summary: 'pointer position and foreground window', run: async () => console.log(ps(['pos'])) },
  { name: 'windows', args: '[--json]', summary: 'visible windows with pid, title and rectangle', run: runWindows },
  { name: 'focus', args: '<pid> | --title <text>', summary: 'bring a window to the front, verified', run: runFocus },
  { name: 'wait-window', args: '<text> [seconds]', summary: 'wait for a window to appear, then focus it', run: runWaitWindow },
  { name: 'run', args: '<command line>', summary: 'run a command line (elevated when the broker is up)', gated: true, run: runRun },
  { name: 'broker', args: '[start|stop|status]', summary: 'elevated input broker, asks for UAC', run: runBroker },
  { name: 'overlay', args: '[--announce N] [--quiet]', summary: 'on-screen indicator, ESC stops it', run: runOverlay },
  { name: 'overlay-state', args: '', summary: 'whether the indicator is running', run: async () => console.log(ps(['overlay-state'])) },
  { name: 'display', args: '', summary: 'primary screen size and DPI', run: async () => console.log(ps(['display'])) },
  { name: 'doctor', args: '', summary: 'what this machine can do', windowsOnly: false, run: runDoctor },
  { name: 'self-test', args: '', summary: 'exercise every command, report pass/fail', windowsOnly: false, run: runSelfTest },
];

export function renderHelp() {
  const lines = COMMANDS.map((command) => `  dsh-cu ${command.name} ${command.args}`.trimEnd());
  const width = Math.max(...lines.map((line) => line.length));
  const rows = COMMANDS.map((command, index) => `${lines[index]}${' '.repeat(width - lines[index].length + 4)}${command.summary}`);
  return `dsh-cu — computer use for agents (Windows)

${rows.join('\n')}

Also:
  dsh-cu overlay --stop                     stop the indicator, restore the cursor
  dsh-cu overlay --restore-cursor           emergency cursor rescue

Nothing to install: the backend compiles its own C# with the .NET Framework that ships with
Windows. Elevated windows (UIPI) and the secure desktop (UAC, lock screen) are unreachable.`;
}

export function findCommand(name) {
  const command = COMMANDS.find((entry) => entry.name === name);
  if (!command) throw new ToolError(`unknown command "${name}" — run dsh-cu --help`);
  return command;
}
