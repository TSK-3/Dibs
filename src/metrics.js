// src/metrics.js — lightweight in-process counters/gauges, exposed via /stats.
// No Prometheus dependency; the JSON shape maps 1:1 to an exporter later.
export function createMetrics() {
  const counters = Object.create(null);
  const gauges = Object.create(null);
  const startedAt = Date.now();

  const keyOf = (name, labels) =>
    labels && Object.keys(labels).length ? `${name}|${JSON.stringify(labels)}` : name;

  return {
    inc(name, by = 1, labels = {}) {
      const key = keyOf(name, labels);
      counters[key] = (counters[key] ?? 0) + by;
    },
    setGauge(name, value, labels = {}) {
      gauges[keyOf(name, labels)] = value;
    },
    snapshot() {
      const countersOut = {};
      for (const [k, v] of Object.entries(counters)) {
        const [name, labelsJson] = k.split('|');
        if (labelsJson) {
          const entry = (countersOut[name] ??= { _total: 0 });
          entry._total += v;
          Object.assign(entry, JSON.parse(labelsJson));
        } else countersOut[name] = v;
      }
      const gaugesOut = {};
      for (const [k, v] of Object.entries(gauges)) {
        const [name, labelsJson] = k.split('|');
        if (labelsJson) {
          const entry = (gaugesOut[name] ??= {});
          Object.assign(entry, JSON.parse(labelsJson), { value: v });
        } else gaugesOut[name] = v;
      }
      return { uptime_ms: Date.now() - startedAt, counters: countersOut, gauges: gaugesOut };
    },
  };
}

