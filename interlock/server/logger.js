// server/logger.js — same structured logger as the live-interrupt backend
// (../src/logger.js) so both processes emit comparable log lines.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger({ level = 'info', json = false, sink = console, base = {} } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  const emit = (lvl, args) => {
    if (LEVELS[lvl] < threshold) return;
    const ts = new Date().toISOString();
    if (json) {
      const [msg, ...rest] = args;
      sink[lvl === 'log' ? 'log' : lvl]?.(
        JSON.stringify({ ts, level: lvl, msg: typeof msg === 'string' ? msg : JSON.stringify(msg), ...base, extra: rest.length ? rest : undefined }),
      );
    } else {
      const prefix = `${ts} ${lvl.toUpperCase().padEnd(5)}`;
      sink[lvl === 'log' ? 'log' : lvl]?.(prefix, ...args);
    }
  };

  return {
    debug: (...a) => emit('debug', a),
    log: (...a) => emit('info', a), // backwards-compatible alias
    info: (...a) => emit('info', a),
    warn: (...a) => emit('warn', a),
    error: (...a) => emit('error', a),
    child: (extra) => createLogger({ level, json, sink, base: { ...base, ...extra } }),
  };
}
