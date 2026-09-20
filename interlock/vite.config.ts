import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      // Same-origin API: the browser only ever talks to :3000, and Vite forwards
      // /api to the identity service on :8787. Cookies are scoped to the host
      // (not the port), so the session cookie set during the OAuth callback is
      // still sent here — no CORS, no third-party-cookie problems.
      proxy: {
        '/api': {
          target: process.env.AUTH_SERVER_URL ?? 'http://localhost:8787',
          changeOrigin: false,
        },
        // Live agent mesh: the root WS backend. The dev script starts it on
        // :8090 (some Windows machines reserve :8080 for WinNAT). WebSocket
        // upgrade for /ws, plain HTTP for /live/* (stats/health/config).
        '/ws': {
          target: process.env.LIVE_SERVER_URL ?? 'http://localhost:8090',
          ws: true,
          changeOrigin: false,
        },
        '/live': {
          target: process.env.LIVE_SERVER_URL ?? 'http://localhost:8090',
          changeOrigin: false,
          rewrite: (p) => p.replace(/^\/live/, ''),
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
