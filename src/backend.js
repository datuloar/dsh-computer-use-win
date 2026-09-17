import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { ToolError } from './tool-error.js';

const here = dirname(fileURLToPath(import.meta.url));

export const root = resolve(here, '..');

export const backendScript = join(root, 'backends', 'windows.ps1');
export const isWindows = process.platform === 'win32';

export const FRESH_SECONDS = 5;

export const BACKEND_TIMEOUT_MS = 60_000;
export const SLOW_BACKEND_TIMEOUT_MS = 300_000;

const MAX_ARGUMENT_BYTES = 30_000;
const POWERSHELL_FLAGS = ['-NoProfile', '-NonInteractive', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', backendScript];

export const temp = (name) => join(tmpdir(), name);

export function ageSeconds(name) {
  try {
    return (Date.now() - statSync(temp(name)).mtimeMs) / 1000;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function exec(file, args, extraEnv, timeoutMs = BACKEND_TIMEOUT_MS) {
  const options = {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    timeout: timeoutMs,
  };
  if (extraEnv) options.env = { ...process.env, ...extraEnv };
  try {
    return execFileSync(file, args, options).trim();
  } catch (error) {
    if (error.code === 'EPERM' && error.status == null) return execThroughFile(file, args, extraEnv, timeoutMs);
    throw backendFailure(error, timeoutMs);
  }
}

function backendFailure(error, timeoutMs) {
  const stdout = String(error.stdout ?? '').trim();
  const stderr = String(error.stderr ?? '').trim();
  if (stdout || stderr) return new ToolError(stdout || stderr);
  if (error.signal) {
    return new ToolError(
      `the backend was stopped after ${Math.round(timeoutMs / 1000)}s (${error.signal}) — the machine is busy or a dialog is waiting`,
    );
  }
  return new ToolError(`the backend failed to start (${error.code ?? 'unknown'}) and said nothing`);
}

function execThroughFile(file, args, extraEnv, timeoutMs) {
  const capture = temp(`dsh-cu.capture-${process.pid}`);
  const descriptor = openSync(capture, 'w+');
  let status = 0;
  try {
    const options = { stdio: ['ignore', descriptor, descriptor], windowsHide: true, timeout: timeoutMs };
    if (extraEnv) options.env = { ...process.env, ...extraEnv };
    execFileSync(file, args, options);
  } catch (error) {
    if (error.status == null) {
      closeSync(descriptor);
      removeQuietly(capture);
      throw backendFailure(error, timeoutMs);
    }
    status = error.status;
  }
  closeSync(descriptor);
  let output = '';
  try {
    output = readFileSync(capture, 'utf8');
  } finally {
    removeQuietly(capture);
  }
  if (status !== 0) throw new ToolError(output.trim() || `the backend exited with ${status} and said nothing`);
  return output.trim();
}

function removeQuietly(path) {
  try {
    unlinkSync(path);
  } catch {
    return;
  }
}

export function touch() {
  try {
    writeFileSync(temp('dsh-cu.touch'), new Date().toISOString());
  } catch {
    return;
  }
}

export function ps(args, timeoutMs = BACKEND_TIMEOUT_MS) {
  touch();
  const payload = JSON.stringify(args);
  if (payload.length > MAX_ARGUMENT_BYTES) {
    throw new ToolError(`this argument is too long for one call (${payload.length} bytes) — split it into smaller steps`);
  }
  return exec(process.env.DSH_CU_POWERSHELL || 'powershell', POWERSHELL_FLAGS, { DSH_CU_ARGV: payload }, timeoutMs);
}

export function indicatorIsUp() {
  return ageSeconds('dsh-cu.alive') < FRESH_SECONDS;
}

export function indicatorProcessAlive() {
  const recorded = indicatorPid();
  if (recorded === null) return indicatorIsUp();
  try {
    process.kill(recorded, 0);
    return true;
  } catch {
    return false;
  }
}

function indicatorPid() {
  try {
    const recorded = Number.parseInt(readFileSync(temp('dsh-cu.pid'), 'utf8').trim().split(/\s+/)[0], 10);
    return Number.isInteger(recorded) && recorded > 0 ? recorded : null;
  } catch {
    return null;
  }
}

export function brokerIsUp() {
  return ageSeconds('dsh-cu.broker.ready') < FRESH_SECONDS;
}

export function cursorMayBeHidden() {
  return Number.isFinite(ageSeconds('dsh-cu.cursor'));
}

export function requireIndicator() {
  if (process.env.DSH_CU_ALLOW_NO_INDICATOR === '1') return;
  if (indicatorIsUp() && indicatorProcessAlive()) return;
  throw new ToolError(
    'the on-screen indicator is not running, so the human cannot see or stop this.\n' +
      'Start it with "dsh-cu overlay" first, or set DSH_CU_ALLOW_NO_INDICATOR=1 to override.',
  );
}

function answerFromBroker(args, timeoutMs) {
  const requestFile = temp(`dsh-cu.broker.req.${process.pid}`);
  const responseFile = temp(`dsh-cu.broker.res.${process.pid}`);
  removeQuietly(responseFile);
  writeFileSync(requestFile, JSON.stringify(args));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(responseFile)) {
      const answer = readFileSync(responseFile, 'utf8');
      removeQuietly(responseFile);
      return answer.trim();
    }
  }
  if (existsSync(requestFile)) {
    removeQuietly(requestFile);
    throw new ToolError(`the elevated broker did not answer within ${Math.round(timeoutMs / 1000)}s`);
  }
  const stuck = new ToolError(
    `the elevated broker took the command but did not answer within ${Math.round(timeoutMs / 1000)}s — ` +
      'it may still be running it, so this command is not retried',
  );
  stuck.consumed = true;
  throw stuck;
}

export function brokerTimeoutMs(args, requestedMs) {
  if (requestedMs) return requestedMs;
  return Math.min(120_000, 5_000 + JSON.stringify(args).length * 30);
}

export function input(args, timeoutMs) {
  if (!brokerIsUp()) return ps(args, timeoutMs);
  return answerFromBroker(args, brokerTimeoutMs(args, timeoutMs));
}
