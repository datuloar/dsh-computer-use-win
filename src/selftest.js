import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { checkContract } from './contract.js';
import { indicatorIsUp, humanStopSeconds } from './backend.js';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(check) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (check()) return;
    await sleep(50);
  }
  throw new Error('timed out waiting for the test fixture');
}

export async function runSelfTest({ root, cli, exec }) {
  assert.equal(process.platform, 'win32', 'interactive self-test requires Windows');
  assert.ok(!indicatorIsUp(), 'stop the current computer-use session before self-test');
  assert.ok(humanStopSeconds() >= 600, 'the human pressed ESC recently; self-test will not restart control');
  const folder = mkdtempSync(join(tmpdir(), 'dsh-cu-test-'));
  const state = (name) => join(tmpdir(), `dsh-cu.${name}`);
  const callCli = (args) => exec(process.execPath, [cli, ...args]);
  const fixture = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'test', 'desktop-fixture.ps1'), folder], { stdio: 'ignore', windowsHide: true });
  const server = spawn(process.execPath, [cli, 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let sequence = 0;
  let buffer = '';
  const pending = new Map();
  server.stdout.setEncoding('utf8');
  server.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      try {
        const reply = JSON.parse(line);
        pending.get(reply.id)?.(reply);
      } catch {
        for (const resolve of pending.values()) resolve({ error: { message: `invalid protocol output: ${line}` } });
      }
    }
  });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP ${method} timed out`)); }, 60000);
    pending.set(id, (reply) => { clearTimeout(timer); pending.delete(id); resolve(reply); });
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const tool = async (name, args = {}, error = false) => {
    const reply = await rpc('tools/call', { name, arguments: args });
    assert.ok(reply.result, JSON.stringify(reply.error));
    const text = reply.result.content.filter((item) => item.type === 'text').map((item) => item.text).join('\n');
    assert.equal(Boolean(reply.result.isError), error, text);
    return text;
  };
  let passed = 0;
  const check = async (name, action) => {
    assert.ok(humanStopSeconds() >= 600, 'the human pressed ESC; self-test stops here');
    const detail = await action();
    passed++;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  };
  console.log(`self-test: isolated workspace ${folder}`);
  try {
    await until(() => existsSync(join(folder, 'ready.json')));
    const target = JSON.parse(readFileSync(join(folder, 'ready.json'), 'utf8'));
    const init = await rpc('initialize', { protocolVersion: '2025-06-18' });
    assert.equal(init.result.serverInfo.name, 'dsh-cu');
    await check('documentation and command surface agree', () => assert.deepEqual(checkContract(root), []));
    await check('input and focus refuse before the indicator starts', () => {
      for (const args of [['move', '100', '100'], ['focus', String(target.pid)]]) assert.throws(() => callCli(args), /indicator is not running/);
    });
    await check('invalid MCP arguments never start the indicator', async () => {
      assert.match(await tool('type', {}, true), /text is required/);
      assert.match(await tool('click', { x: 99999, y: 0 }, true), /32767/);
      assert.ok(!indicatorIsUp());
    });
    await check('MCP focus starts a countdown and blocks concurrent input', async () => {
      const start = Date.now();
      const focusing = tool('focus', { pid: target.pid });
      await until(() => existsSync(state('alive')));
      assert.ok(!existsSync(state('ready')));
      assert.throws(() => callCli(['move', '100', '100']), /countdown/);
      assert.throws(() => exec('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'backends', 'windows.ps1'), 'move', '100', '100']), /countdown/);
      await focusing;
      assert.ok(Date.now() - start >= 8000);
      assert.ok(existsSync(state('ready')));
      assert.ok(!existsSync(state('cursor')));
      return `${Date.now() - start} ms including cold startup`;
    });
    await check('warm backend reads controls and recovers after an error', async () => {
      assert.match(await tool('ui_tree', { pid: target.pid }), /Test editor/);
      await tool('ui_tree', { pid: 2147483647 }, true);
      const start = Date.now();
      assert.match(await tool('ui_tree', { pid: target.pid }), /Test action/);
      return `${Date.now() - start} ms for the warm tree`;
    });
    await check('off-screen move and drag fail before changing the pointer', async () => {
      const display = /DISPLAY (\d+)x(\d+)/.exec(callCli(['display']));
      assert.ok(display);
      const x = Number(display[1]);
      const before = callCli(['pos']).split('\n')[0];
      assert.match(await tool('move', { x, y: 100 }, true), /outside the primary screen/);
      assert.match(await tool('drag', { x: 100, y: 100, to_x: x, to_y: 100 }, true), /outside the primary screen/);
      assert.equal(callCli(['pos']).split('\n')[0], before);
    });
    await check('typing preserves Unicode, whitespace, tabs and newlines', async () => {
      await tool('tap', { pid: target.pid, text: 'Test editor' });
      const text = '  Привет "Minecraft" 😀\tmods\nsecond line  ';
      await tool('type', { text });
      await until(() => {
        try { return readFileSync(join(folder, 'text.txt'), 'utf8').replaceAll('\r', '') === text; }
        catch { return false; }
      });
      assert.equal(readFileSync(join(folder, 'text.txt'), 'utf8').replaceAll('\r', ''), text);
      assert.match(readFileSync(state('action'), 'utf8'), /^type \d+ chars$/);
    });
    await check('a named button click reaches the fixture', async () => {
      await tool('tap', { pid: target.pid, text: 'Test action' });
      await until(() => existsSync(join(folder, 'clicked.txt')));
    });
    await check('typed flag names and whitespace remain literal text', async () => {
      await tool('tap', { pid: target.pid, text: 'Test editor' });
      await tool('press', { keys: 'ctrl+End' });
      await tool('type', { text: '-Quiet' });
      await tool('type', { text: '  ' });
      await until(() => readFileSync(join(folder, 'text.txt'), 'utf8').endsWith('-Quiet  '));
    });
    await check('screenshot returns PNG pixels', async () => {
      const display = /DISPLAY (\d+)x(\d+)/.exec(callCli(['display']));
      assert.ok(display);
      const width = Math.min(1800, Number(display[1]));
      const height = Math.min(150, Number(display[2]));
      const x = Math.floor((Number(display[1]) - width) / 2);
      const result = await rpc('tools/call', { name: 'screenshot', arguments: { x, y: 0, width, height } });
      assert.ok(!result.result.isError);
      const data = Buffer.from(result.result.content.find((item) => item.type === 'image').data, 'base64');
      assert.equal(data.readUInt32BE(16), width);
      assert.equal(data.readUInt32BE(20), height);
      writeFileSync(join(folder, 'indicator.png'), data);
    });
    await check('invalid key combinations release held modifiers', async () => {
      await tool('tap', { pid: target.pid, text: 'Test editor' });
      await tool('press', { keys: 'ctrl+NotAKey' }, true);
      await tool('press', { keys: 'End' });
      await tool('type', { text: 'z' });
      await until(() => readFileSync(join(folder, 'text.txt'), 'utf8').endsWith('  z'));
      assert.ok(readFileSync(join(folder, 'text.txt'), 'utf8').endsWith('  z'));
    });
    await check('stop removes state and leaves the cursor alone', async () => {
      await tool('indicator', { action: 'stop' });
      for (const name of ['alive', 'pid', 'ready', 'cursor']) assert.ok(!existsSync(state(name)), name);
    });
    await check('stopping during the countdown never reports control ready', async () => {
      const starting = tool('indicator', { action: 'start' }, true);
      await until(() => existsSync(state('alive')));
      writeFileSync(state('stop'), 'self-test');
      assert.match(await starting, /stopped during the announcement/);
      assert.ok(!existsSync(state('ready')));
    });
    await check('a stop interrupts text within the current chunk', async () => {
      callCli(['overlay', '--announce', '0']);
      await tool('focus', { pid: target.pid });
      await tool('tap', { pid: target.pid, text: 'Test editor' });
      await tool('press', { keys: 'ctrl+End' });
      const before = readFileSync(join(folder, 'text.txt'), 'utf8').length;
      const typing = tool('type', { text: 'x'.repeat(1200) }, true);
      await until(() => readFileSync(join(folder, 'text.txt'), 'utf8').length >= before + 5);
      const stoppedAt = Date.now();
      writeFileSync(state('stop'), 'self-test');
      await typing;
      const elapsed = Date.now() - stoppedAt;
      assert.ok(elapsed < 2000, `stop took ${elapsed} ms`);
      assert.ok(readFileSync(join(folder, 'text.txt'), 'utf8').length < before + 200);
      return `${elapsed} ms from stop request to MCP refusal`;
    });
    await check('cursor replacement is opt-in and restored on stop', async () => {
      callCli(['overlay', '--announce', '0', '--hide-cursor']);
      assert.ok(existsSync(state('cursor')));
      callCli(['overlay', '--stop']);
      assert.ok(!existsSync(state('cursor')));
    });
    await check('killing an indicator refuses input and repairs its hidden cursor', async () => {
      callCli(['overlay', '--announce', '0', '--hide-cursor']);
      const owner = Number(readFileSync(state('pid'), 'utf8').split(' ')[0]);
      process.kill(owner);
      await sleep(150);
      assert.throws(() => callCli(['move', '100', '100']), /indicator is not running/);
      assert.ok(!existsSync(state('cursor')));
    });
    await check('a stale pid record cannot kill the fixture', () => {
      writeFileSync(state('pid'), `${target.pid} 1`);
      callCli(['overlay', '--stop']);
      process.kill(target.pid, 0);
    });
    console.log(`${passed}/${passed} checks passed; artifacts: ${folder}`);
    console.log('Physical ESC and model decision quality require a separate interactive check.');
  } finally {
    writeFileSync(join(folder, 'stop'), 'stop');
    try { callCli(['overlay', '--stop']); } finally { server.stdin.end(); server.kill(); }
    await sleep(300);
    if (fixture.exitCode === null) fixture.kill();
  }
}
