// scripts/smoke-api.mjs — boot the Vercel serverless entry (api/index.js) as a
// plain HTTP server and probe it, so the exact code that runs on Vercel can be
// verified locally before deploying. Team create/join correctness itself is
// covered by server/cloudStore.test.js.
import http from 'node:http';

const { default: handler } = await import('../api/index.js');

const server = http.createServer(handler);
server.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const failures = [];
  const probe = async (path, expect) => {
    const response = await fetch(`${base}${path}`);
    const text = await response.text();
    const ok = response.status === expect;
    if (!ok) failures.push(`GET ${path} → ${response.status} (expected ${expect})`);
    console.log(`${ok ? 'PASS' : 'FAIL'}  GET ${path} → ${response.status}  ${text.slice(0, 140)}`);
  };

  try {
    await probe('/api/health', 200);
    await probe('/api/auth/providers', 200);
    // Unauthenticated workspace access must be JSON 401 — never the SPA shell.
    await probe('/api/workspaces', 401);
    await probe('/api/does-not-exist', 404);
  } catch (err) {
    failures.push(String(err?.stack ?? err));
  }

  server.close(() => {
    if (failures.length) {
      console.error(`\n[smoke] ${failures.length} failure(s):\n  - ${failures.join('\n  - ')}`);
      process.exit(1);
    }
    console.log('\n[smoke] api entry healthy — safe to deploy');
  });
});
