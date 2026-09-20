// scripts/dev.mjs — one command for local development: the Vite dev server on
// :3000 and the identity service on :8787, sharing this terminal's output.
// No extra dependency (no concurrently/wait-on) on purpose.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_WINDOWS = process.platform === 'win32';
const npm = IS_WINDOWS ? 'npm.cmd' : 'npm';

const TAGS = {
  auth: '\x1b[36m[auth]\x1b[0m',
  web: '\x1b[35m[ web]\x1b[0m',
};

const children = [];
let shuttingDown = false;

function start(name, args) {
  const child = spawn(npm, args, {
    cwd: APP_ROOT,
    shell: IS_WINDOWS, // npm.cmd is a batch shim; Node needs a shell to run it
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  const relay = (stream) => {
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) console.log(`${TAGS[name]} ${line}`);
      }
    });
  };
  relay(child.stdout);
  relay(child.stderr);

  child.on('exit', (code) => {
    if (shuttingDown) return;
    console.log(`${TAGS[name]} exited (code ${code ?? 0}) — stopping the other process`);
    shutdown(code ?? 0);
  });

  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 200);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('[dev] starting identity service (:8787) and web app (:3000) — Ctrl+C stops both');
start('auth', ['run', 'auth']);
start('web', ['run', 'dev']);
