import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, findCommand, renderHelp } from '../src/commands.js';

test('command names are unique, kebab-case and documented for --help', () => {
  const names = COMMANDS.map((command) => command.name);
  assert.equal(new Set(names).size, names.length, 'two commands share a name');
  for (const command of COMMANDS) {
    assert.match(command.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(typeof command.run, 'function', `${command.name} has no handler`);
    assert.ok(command.summary, `${command.name} has no summary`);
  }
});

test('the help lists every command and no command that does not exist', () => {
  const help = renderHelp();
  const names = new Set(COMMANDS.map((command) => command.name));
  for (const name of names) {
    assert.ok(help.includes(`dsh-cu ${name}`), `${name} is missing from --help`);
  }
  for (const [, mentioned] of help.matchAll(/dsh-cu ([a-z][a-z-]*)/g)) {
    assert.ok(names.has(mentioned), `--help mentions "dsh-cu ${mentioned}", which does not exist`);
  }
});

test('only the command that injects input is gated', () => {
  const gated = COMMANDS.filter((command) => command.gated).map((command) => command.name).sort();
  assert.deepEqual(gated, ['click', 'clipboard', 'key', 'keys', 'move', 'run', 'type', 'wheel']);
});

test('doctor and self-test are the only commands that run off Windows', () => {
  const portable = COMMANDS.filter((command) => command.windowsOnly === false).map((command) => command.name).sort();
  assert.deepEqual(portable, ['doctor', 'self-test']);
});

test('findCommand rejects an unknown name with a helpful message', () => {
  assert.throws(() => findCommand('nope'), /unknown command "nope"/);
});

test('findCommand returns the table entry', () => {
  assert.equal(findCommand('shot').name, 'shot');
});
