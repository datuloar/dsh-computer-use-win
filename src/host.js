import { spawn } from 'node:child_process';
import { ToolError } from './tool-error.js';

const END = 'DSH-CU-END';
const START_TIMEOUT_MS = 30_000;

export class BackendHost {
  constructor({ command, args }) {
    this.command = command;
    this.args = args;
    this.child = null;
    this.buffer = '';
    this.pending = null;
    this.ready = null;
    this.queue = Promise.resolve();
  }

  call(argv, timeoutMs) {
    const run = this.queue.then(() => this.send(argv, timeoutMs));
    this.queue = run.catch(() => undefined);
    return run;
  }

  async send(argv, timeoutMs) {
    await this.start();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        this.kill();
        reject(
          new ToolError(
            `the backend was stopped after ${Math.round(timeoutMs / 1000)}s — the machine is busy or a dialog is waiting`,
          ),
        );
      }, timeoutMs);
      this.pending = {
        lines: [],
        finish: (status) => {
          clearTimeout(timer);
          const output = this.pending.lines.join('\n').trim();
          this.pending = null;
          if (status === '0') resolve(output);
          else reject(new ToolError(output || `the backend failed with status ${status} and said nothing`));
        },
        fail: (error) => {
          clearTimeout(timer);
          this.pending = null;
          reject(error);
        },
      };
      this.child.stdin.write(`${JSON.stringify(argv)}\n`);
    });
  }

  start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const child = spawn(this.command, this.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      this.child = child;
      this.buffer = '';
      const timer = setTimeout(() => {
        this.kill();
        reject(new ToolError('the backend did not start within 30s'));
      }, START_TIMEOUT_MS);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => this.receive(chunk, () => {
        clearTimeout(timer);
        resolve();
      }));
      child.stderr.on('data', () => undefined);
      child.on('error', (error) => {
        clearTimeout(timer);
        this.reset(new ToolError(`the backend could not start: ${error.message}`));
        reject(new ToolError(`the backend could not start: ${error.message}`));
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        this.reset(new ToolError(`the backend exited (${code ?? 'killed'}) in the middle of a command`));
      });
    });
    return this.ready;
  }

  receive(chunk, onReady) {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newline + 1);
      if (line.startsWith(END)) {
        const status = line.slice(END.length).trim();
        if (status === 'READY') onReady();
        else this.pending?.finish(status);
      } else {
        this.pending?.lines.push(line);
      }
      newline = this.buffer.indexOf('\n');
    }
  }

  reset(error) {
    this.child = null;
    this.ready = null;
    this.pending?.fail(error);
  }

  kill() {
    const child = this.child;
    this.child = null;
    this.ready = null;
    if (!child) return;
    try {
      child.stdin.end();
      child.kill();
    } catch {
      return;
    }
  }
}
