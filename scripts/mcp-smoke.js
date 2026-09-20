// scripts/mcp-smoke.js — dev-only: drives src/mcp/mcp-stdio.js through a real
// initialize → tools/call(post_intent) → tools/call(check_intent) sequence by
// spawning it and piping bytes directly (PowerShell pipes corrupt encoding).
import { spawn } from 'node:child_process';

const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:8080/ws';
const child = spawn(process.execPath, ['src/mcp/mcp-stdio.js'], {
  env: { ...process.env, WS_URL },
  stdio: ['pipe', 'pipe', 'inherit'],
});

const send = (obj) => child.stdin.write(JSON.stringify(obj) + '\n');

let step = 0;
child.stdout.on('data', (buf) => {
  for (const line of buf.toString().split('\n').filter(Boolean)) {
    const msg = JSON.parse(line);
    if (msg.id === 1) {
      console.log('✓ initialize →', msg.result.serverInfo.name);
      send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'post_intent', arguments: { scope: 'auth', summary: 'MCP claiming auth', rationale: 'mcp smoke test' } } });
    } else if (msg.id === 2) {
      console.log('✓ post_intent →', msg.result.content[0].text.slice(0, 120));
      send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check_intent', arguments: { scope: 'auth' } } });
    } else if (msg.id === 3) {
      const parsed = JSON.parse(msg.result.content[0].text);
      console.log('✓ check_intent →', JSON.stringify({ available: parsed.available, claimed_by_others: parsed.claimed_by_others }));
      console.log('\nMCP smoke test PASSED — all 3 tools reachable end-to-end');
      child.kill();
      process.exit(0);
    }
  }
});
child.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`mcp-stdio exited ${code} before completing the sequence`);
    process.exit(1);
  }
});

send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
setTimeout(() => {
  console.error('TIMEOUT — MCP did not complete the sequence in 10s');
  child.kill();
  process.exit(1);
}, 10_000);
