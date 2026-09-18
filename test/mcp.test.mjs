import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, TOOLS } from '../src/mcp.js';

const request = (method, params, id = 1) => handle({ jsonrpc: '2.0', id, method, params });

test('initialize answers with the requested protocol and the server name', async () => {
  const response = await request('initialize', { protocolVersion: '2025-03-26', capabilities: {} });
  assert.equal(response.result.protocolVersion, '2025-03-26');
  assert.equal(response.result.serverInfo.name, 'dsh-cu');
  assert.ok(response.result.capabilities.tools);
  assert.ok(response.result.instructions.length > 40);
});

test('an unknown protocol version falls back to the newest one this server speaks', async () => {
  const response = await request('initialize', { protocolVersion: '1999-01-01' });
  assert.equal(response.result.protocolVersion, '2025-06-18');
});

test('tools/list publishes every tool with an object schema and no duplicates', async () => {
  const response = await request('tools/list', {});
  const names = response.result.tools.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
  for (const tool of response.result.tools) {
    assert.match(tool.name, /^[a-z_]{1,32}$/);
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(tool.description.length > 10, `${tool.name} needs a description`);
  }
  assert.ok(names.includes('ui_tree') && names.includes('tap') && names.includes('screenshot'));
});

test('the tool list stays small enough to send with every request', () => {
  const bytes = JSON.stringify(TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })))
    .length;
  assert.ok(bytes < 7000, `tool definitions grew to ${bytes} bytes`);
});

test('notifications get no answer and unknown methods get a JSON-RPC error', async () => {
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const response = await request('resources/list', {});
  assert.equal(response.error.code, -32601);
});

test('bad arguments fail as a tool error before anything touches the machine', async () => {
  const cases = [
    ['click', { x: 'abc', y: 1 }, /x must be a number/],
    ['scroll', { notches: 0 }, /must not be zero/],
    ['read_text', { x: 1, y: 2 }, /all four of x, y, width and height/],
    ['focus', {}, /exactly one of window or pid/],
    ['ui_tree', { window: 'a', pid: 1 }, /not both/],
    ['nonsense', {}, /unknown tool/],
  ];
  for (const [name, args, pattern] of cases) {
    const response = await request('tools/call', { name, arguments: args });
    assert.equal(response.result.isError, true, `${name} should fail`);
    assert.match(response.result.content[0].text, pattern);
  }
});

test('wait runs locally and reports how long it waited', async () => {
  const response = await request('tools/call', { name: 'wait', arguments: { seconds: 0.01 } });
  assert.match(response.result.content[0].text, /^WAITED 0.01s$/);
});
