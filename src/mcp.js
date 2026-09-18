import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  cursorMayBeHidden,
  forgetHumanStop,
  humanStopSeconds,
  indicatorIsUp,
  indicatorProcessAlive,
  ps,
  serveCommand,
  sleep,
  useHost,
} from './backend.js';
import { findCommand } from './commands.js';
import { BackendHost } from './host.js';
import { ToolError } from './tool-error.js';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const HUMAN_STOP_HOLD_SECONDS = 600;
const MAX_WAIT_SECONDS = 30;

const INSTRUCTIONS =
  'Windows desktop control. Read before acting: ui_tree/find list controls with a point to click, ' +
  'read_text is OCR for windows without a tree, screenshot only when pixels matter. Act with tap ' +
  '(by name) or click (by point), then read again to verify. Input tools start the on-screen ' +
  'indicator by themselves; if the human pressed ESC, stop and ask them before continuing.';

const region = {
  x: { type: 'integer', description: 'left edge of a screen region' },
  y: { type: 'integer', description: 'top edge of a screen region' },
  width: { type: 'integer', minimum: 1 },
  height: { type: 'integer', minimum: 1 },
};

const target = {
  window: { type: 'string', description: 'part of the window title; default is the foreground window' },
  pid: { type: 'integer', description: 'process id of the window instead of a title' },
};

const point = {
  x: { type: 'integer', description: 'screen x in physical pixels' },
  y: { type: 'integer', description: 'screen y in physical pixels' },
};

function schema(properties, required = []) {
  return { type: 'object', properties, required, additionalProperties: false };
}

function round(value, name = 'value') {
  const number = typeof value === 'string' && value.trim() === '' ? Number.NaN : Number(value);
  if (!Number.isFinite(number)) throw new ToolError(`${name} must be a number, got ${JSON.stringify(value)}`);
  return String(Math.round(number));
}

function regionArgs(args, flag) {
  const values = [args.x, args.y, args.width, args.height];
  if (values.every((value) => value === undefined)) return [];
  if (values.some((value) => value === undefined)) {
    throw new ToolError('a region needs all four of x, y, width and height');
  }
  return [flag, ...values.map((value, index) => round(value, ['x', 'y', 'width', 'height'][index]))];
}

function targetArgs(args) {
  if (args.window !== undefined && args.pid !== undefined) {
    throw new ToolError('pass window or pid, not both');
  }
  if (args.window !== undefined) return ['--title', String(args.window)];
  if (args.pid !== undefined) return ['--pid', round(args.pid, 'pid')];
  return [];
}

export const TOOLS = [
  {
    name: 'ui_tree',
    description:
      'List the controls of a window (UI Automation): role, name and a clickable point each. ' +
      'Works for native apps and Chrome/Edge pages. Cheapest way to see a window.',
    inputSchema: schema({
      ...target,
      depth: { type: 'integer', minimum: 1, maximum: 20, description: 'tree depth, default 6; web pages need 10-14' },
    }),
    cli: (args) => ['tree', ...targetArgs(args), ...(args.depth ? ['--depth', round(args.depth, 'depth')] : [])],
  },
  {
    name: 'find',
    description: 'Controls in a window whose name contains the text, each with a clickable point.',
    inputSchema: schema({ text: { type: 'string' }, ...target }, ['text']),
    cli: (args) => ['find', String(args.text), ...targetArgs(args)],
  },
  {
    name: 'tap',
    description:
      'Click the one control whose name matches the text. Refuses and lists candidates when the name ' +
      'is ambiguous, and refuses when another window covers the control.',
    inputSchema: schema({ text: { type: 'string' }, ...target }, ['text']),
    gated: true,
    cli: (args) => ['tap', String(args.text), ...targetArgs(args)],
  },
  {
    name: 'read_text',
    description:
      'Read the screen or a region as text with Windows OCR; every line comes with the point to ' +
      'click. Use for games, canvases and apps without a control tree.',
    inputSchema: schema({ ...region, lang: { type: 'string', description: 'en-US, ru, ...; default user language' } }),
    cli: (args) => ['read', ...regionArgs(args, '--region'), ...(args.lang ? ['--lang', String(args.lang)] : [])],
  },
  {
    name: 'screenshot',
    description:
      'Capture the screen or a region as a PNG. Use a region; a full screen is expensive. Returns ' +
      'the image and its file path.',
    inputSchema: schema(region),
    image: true,
    cli: (args) => ['shot', ...regionArgs(args, '--region')],
  },
  {
    name: 'click',
    description: 'Click at a screen point.',
    inputSchema: schema(
      { ...point, button: { type: 'string', enum: ['left', 'right', 'middle', 'double', 'triple'] } },
      ['x', 'y'],
    ),
    gated: true,
    cli: (args) => ['click', round(args.x, 'x'), round(args.y, 'y'), args.button ?? 'left'],
  },
  {
    name: 'move',
    description: 'Move the pointer to a point, for hover menus and tooltips.',
    inputSchema: schema(point, ['x', 'y']),
    gated: true,
    cli: (args) => ['move', round(args.x, 'x'), round(args.y, 'y')],
  },
  {
    name: 'drag',
    description: 'Press at one point, glide to another, release: sliders, selections, drag and drop.',
    inputSchema: schema(
      { ...point, to_x: { type: 'integer' }, to_y: { type: 'integer' } },
      ['x', 'y', 'to_x', 'to_y'],
    ),
    gated: true,
    cli: (args) => ['drag', round(args.x, 'x'), round(args.y, 'y'), round(args.to_x, 'to_x'), round(args.to_y, 'to_y')],
  },
  {
    name: 'scroll',
    description:
      'Scroll by notches at a point: negative scrolls down (or right), positive up (or left). ' +
      'A screenful is about 5 notches.',
    inputSchema: schema(
      { notches: { type: 'integer' }, ...point, horizontal: { type: 'boolean' } },
      ['notches'],
    ),
    gated: true,
    cli: (args) => {
      const notches = Number(round(args.notches, 'notches'));
      if (notches === 0) throw new ToolError('notches must not be zero');
      const at = args.x === undefined || args.y === undefined ? [] : [round(args.x, 'x'), round(args.y, 'y')];
      return ['wheel', String(notches * 120), ...at, ...(args.horizontal ? ['--horizontal'] : [])];
    },
  },
  {
    name: 'type',
    description: 'Type text into the focused control. A newline is Enter, a tab is Tab.',
    inputSchema: schema({ text: { type: 'string' } }, ['text']),
    gated: true,
    cli: (args) => ['type', String(args.text)],
  },
  {
    name: 'press',
    description: 'Press a key (Enter, Esc, Tab, PageDown, F5, ...) or a combination (ctrl+l, ctrl+shift+t).',
    inputSchema: schema({ keys: { type: 'string' } }, ['keys']),
    gated: true,
    cli: (args) => {
      const keys = String(args.keys).trim();
      return keys.includes('+') && keys.length > 1 ? ['keys', keys] : ['key', keys];
    },
  },
  {
    name: 'windows',
    description: 'Visible windows with pid, title and rectangle.',
    inputSchema: schema({}),
    cli: () => ['windows', '--json'],
  },
  {
    name: 'focus',
    description: 'Bring a window to the front and verify it is in front.',
    inputSchema: schema(target),
    cli: (args) => {
      if (args.window !== undefined && args.pid === undefined) return ['focus', '--title', String(args.window)];
      if (args.pid !== undefined && args.window === undefined) return ['focus', round(args.pid, 'pid')];
      throw new ToolError('pass exactly one of window or pid');
    },
  },
  {
    name: 'wait',
    description: 'Wait for an animation, a page load or a game round, up to 30 seconds.',
    inputSchema: schema({ seconds: { type: 'number', minimum: 0, maximum: MAX_WAIT_SECONDS } }, ['seconds']),
    local: async (args) => {
      const seconds = Math.max(0, Math.min(MAX_WAIT_SECONDS, Number(args.seconds) || 0));
      await sleep(seconds * 1000);
      return `WAITED ${seconds}s`;
    },
  },
  {
    name: 'indicator',
    description:
      'Start or stop the on-screen indicator. Input tools start it themselves; call stop when the ' +
      'task is done so the human gets the screen back.',
    inputSchema: schema(
      {
        action: { type: 'string', enum: ['start', 'stop'] },
        hide_cursor: { type: 'boolean', description: 'replace the human pointer with the drawn marker' },
      },
      ['action'],
    ),
    local: async (args) => {
      if (args.action === 'stop') return runCli(['overlay', '--stop']);
      if (args.action !== 'start') throw new ToolError('action must be start or stop');
      refuseAfterHumanStop();
      return startIndicator(Boolean(args.hide_cursor));
    },
  },
];

let sink = null;

function captureConsole() {
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    console[level] = (...parts) => {
      if (sink) sink.push(parts.map((part) => (typeof part === 'string' ? part : String(part))).join(' '));
    };
  }
}

async function runCli(argv) {
  const [name, ...args] = argv;
  const command = findCommand(name);
  const previous = sink;
  sink = [];
  try {
    await command.run(args);
    return sink.join('\n').trim();
  } finally {
    sink = previous;
  }
}

function refuseAfterHumanStop() {
  const seconds = humanStopSeconds();
  if (seconds < HUMAN_STOP_HOLD_SECONDS) {
    throw new ToolError(
      `The human pressed ESC ${Math.round(seconds)}s ago to take the computer back. Do not continue ` +
        'with mouse or keyboard input; tell the user where you stopped and ask before trying again.',
    );
  }
}

async function startIndicator(hideCursor) {
  forgetHumanStop();
  return runCli(['overlay', ...(hideCursor ? ['--hide-cursor'] : [])]);
}

async function ensureIndicator() {
  if (cursorMayBeHidden() && !indicatorProcessAlive()) await ps(['overlay', 'restore-cursor']);
  if (indicatorIsUp() && indicatorProcessAlive()) return '';
  refuseAfterHumanStop();
  return `${await startIndicator(false)}\n`;
}

async function callTool(name, args) {
  const tool = TOOLS.find((entry) => entry.name === name);
  if (!tool) throw new ToolError(`unknown tool "${name}"`);
  const input = args && typeof args === 'object' ? args : {};
  if (tool.local) return { content: [{ type: 'text', text: await tool.local(input) }] };
  const argv = tool.cli(input);
  const preface = tool.gated ? await ensureIndicator() : '';
  const text = `${preface}${await runCli(argv)}`.trim();
  const content = [{ type: 'text', text }];
  if (tool.image) {
    const saved = /^SAVED (.+) \d+ bytes$/m.exec(text);
    if (saved) content.push({ type: 'image', data: readFileSync(saved[1]).toString('base64'), mimeType: 'image/png' });
  }
  return { content };
}

let queue = Promise.resolve();

function serial(task) {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

export async function handle(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    if (message && message.id !== undefined) return failure(message.id, -32600, 'invalid request');
    return null;
  }
  const { id, method, params } = message;
  if (id === undefined) return null;
  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      return success(id, {
        protocolVersion: PROTOCOLS.includes(requested) ? requested : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'dsh-cu', version: VERSION },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return success(id, {});
    case 'tools/list':
      return success(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });
    case 'tools/call':
      return serial(async () => {
        try {
          return success(id, await callTool(params?.name, params?.arguments));
        } catch (error) {
          const text = error instanceof ToolError ? error.message : `${error.message}`;
          return success(id, { content: [{ type: 'text', text }], isError: true });
        }
      });
    default:
      return failure(id, -32601, `method not found: ${method}`);
  }
}

function success(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function failure(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export function serve() {
  captureConsole();
  const host = new BackendHost(serveCommand());
  useHost(host);
  const write = (response) => {
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  };
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on('line', (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      write(failure(null, -32700, 'parse error'));
      return;
    }
    Promise.resolve(handle(message)).then(write, (error) => write(failure(message.id ?? null, -32603, error.message)));
  });
  lines.on('close', () => {
    host.kill();
    process.exit(0);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) serve();
