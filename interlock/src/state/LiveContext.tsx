// src/state/LiveContext.tsx — the live layer for the console: one WebSocket
// session per active workspace, carrying the roster, every team claim, the raw
// wire trace, and the backend's real metrics. All state here is server truth —
// no mocks anywhere.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AuthUser } from '../lib/authClient';
import { LiveClient, LiveMessage } from '../live/liveClient';
import { useWorkspace } from './WorkspaceContext';

// VITE_LIVE_WS_URL — optional absolute ws(s):// URL of an externally hosted
// live-interrupt backend (Vercel's serverless functions cannot hold WebSocket
// connections open). Unset, the console connects same-origin at /ws, which the
// Vite dev proxy forwards to the local backend exactly as before.
const LIVE_WS_URL: string | undefined = String(import.meta.env.VITE_LIVE_WS_URL ?? '').trim() || undefined;

export interface LiveAgent {
  user_id: string;
  team_id: string;
  connected_at: number;
  client: string;
}

export interface LiveClaim {
  scope: string;
  user_id: string;
  summary: string;
  rationale: string;
  timestamp: number;
  received_at?: number;
}

export interface LiveStats {
  uptime_ms: number;
  counters: Record<string, number>;
  gauges: Record<string, number>;
}

export type LiveStatus = 'idle' | 'connecting' | 'online' | 'offline';

/**
 * The product moment (PRD §2: "their phone buzzes right now"). On the web the
 * buzz is an unmissable overlay + a browser notification. Shape mirrors the
 * backend's interruptForHolder/interruptForPoster contract.
 */
export interface LiveInterrupt {
  id: string;
  from_user: string;
  scope: string;
  summary: string;
  message: string;
  at: number;
}

export interface WireTraceEntry {
  id: string;
  at: string;
  type: string;
  severity: 'info' | 'warn' | 'crit';
  payload: Record<string, unknown>;
}

export interface LiveContextValue {
  userId: string;
  status: LiveStatus;
  roster: LiveAgent[];
  claims: LiveClaim[];
  trace: WireTraceEntry[];
  stats: LiveStats | null;
  /** Most recent un-dismissed interrupt — rendered as the full-screen alert. */
  interrupt: LiveInterrupt | null;
  dismissInterrupt: () => void;
  claim: (scope: string, summary: string, rationale?: string) => void;
  release: (scope: string) => void;
  check: (scope: string) => void;
  refreshStats: () => Promise<void>;
}

const TRACE_LIMIT = 200;

const severityFor = (type: string): WireTraceEntry['severity'] => {
  if (type === 'error') return 'crit';
  if (type === 'interrupt' || type === 'claim_expired') return 'warn';
  return 'info';
};

const clock = () => {
  const now = new Date();
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${now.toTimeString().slice(0, 8)}.${ms}`;
};

/** The backend's ID_PATTERN: 1-64 chars, letters/digits/._- , starting alphanumeric. */
const sanitizeLiveUserId = (user: AuthUser): string => {
  const base = (user.username ?? '').trim();
  const candidate = base || `${user.provider.slice(0, 1)}-${user.id.replace(/^usr_/, '').slice(0, 8)}`;
  const cleaned = candidate.replace(/[^a-zA-Z0-9._-]/g, '').replace(/^[._-]+/, '');
  return cleaned && /^[a-zA-Z0-9]/.test(cleaned) ? cleaned.slice(0, 64) : `u-${user.id.replace(/^usr_/, '').slice(0, 8)}`;
};

const LiveContext = createContext<LiveContextValue | null>(null);

export const LiveProvider: React.FC<{ user: AuthUser; children: React.ReactNode }> = ({ user, children }) => {
  const { activeWorkspace } = useWorkspace();
  const clientRef = useRef<LiveClient | null>(null);
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [roster, setRoster] = useState<LiveAgent[]>([]);
  const [claims, setClaims] = useState<LiveClaim[]>([]);
  const [trace, setTrace] = useState<WireTraceEntry[]>([]);
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [interrupt, setInterrupt] = useState<LiveInterrupt | null>(null);

  const userId = useMemo(() => sanitizeLiveUserId(user), [user]);

  const pushTrace = useCallback((message: LiveMessage) => {
    const type = typeof message?.type === 'string' ? message.type : 'message';
    setTrace((prev) => {
      const { type: _t, ...payload } = message;
      const entry: WireTraceEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: clock(),
        type,
        severity: severityFor(type),
        payload,
      };
      return [entry, ...prev].slice(0, TRACE_LIMIT);
    });
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const response = await fetch('/live/stats', { cache: 'no-store' });
      if (response.ok) setStats(await response.json());
    } catch {
      /* stats are cosmetic — never block the UI on them */
    }
  }, []);

  useEffect(() => {
    if (!activeWorkspace) {
      clientRef.current?.close();
      clientRef.current = null;
      setStatus('idle');
      setRoster([]);
      setClaims([]);
      return;
    }

    setStatus('connecting');
    const client = new LiveClient({ userId, teamId: activeWorkspace.id, client: 'web-console', url: LIVE_WS_URL });
    clientRef.current = client;
    setInterrupt(null);

    const unsubs = [
      client.on('open', () => setStatus('online')),
      client.on('close', () => setStatus('offline')),
      client.on('*', pushTrace),
      client.on('roster', (msg: any) => setRoster(Array.isArray(msg?.agents) ? msg.agents : [])),
      client.on('state', (msg: any) => {
        setClaims(Array.isArray(msg?.team_claims) ? msg.team_claims : []);
        if (Array.isArray(msg?.agents)) setRoster(msg.agents);
      }),
      // THE product moment (PRD §2): a scope collision lands on a person right
      // now. Full-screen alert + a browser notification so it reaches the user
      // even when this tab is in the background — the web equivalent of the
      // phone buzz.
      client.on('interrupt', (msg: any) => {
        const entry: LiveInterrupt = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          from_user: String(msg?.from_user ?? 'a teammate'),
          scope: String(msg?.scope ?? ''),
          summary: String(msg?.summary ?? ''),
          message: String(msg?.message ?? 'An overlapping claim just landed'),
          at: Date.now(),
        };
        setInterrupt(entry);
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('⚠ Interlock — scope collision', {
              body: entry.message,
              tag: `interlock-interrupt-${entry.scope}`,
            });
          }
        } catch {
          /* notifications are best-effort; the overlay always shows */
        }
      }),
      client.on('ack', () => client.send({ type: 'request_state' })),
      client.on('complete_ack', () => client.send({ type: 'request_state' })),
      client.on('claim_expired', () => client.send({ type: 'request_state' })),
    ];
    client.connect();

    return () => {
      for (const off of unsubs) off();
      client.close();
      clientRef.current = null;
    };
  }, [activeWorkspace?.id, userId, pushTrace]);

  useEffect(() => {
    if (!activeWorkspace) return;
    void refreshStats();
    const timer = setInterval(() => void refreshStats(), 15_000);
    return () => clearInterval(timer);
  }, [activeWorkspace?.id, refreshStats]);

  const claim = useCallback(
    (scope: string, summary: string, rationale = '') => {
      clientRef.current?.send({
        type: 'post_intent',
        user_id: userId,
        scope,
        summary,
        rationale,
        timestamp: Date.now(),
      });
    },
    [userId],
  );

  const release = useCallback(
    (scope: string) => {
      clientRef.current?.send({ type: 'complete_intent', user_id: userId, scope });
    },
    [userId],
  );

  const check = useCallback(
    (scope: string) => {
      clientRef.current?.send({ type: 'check_intent', user_id: userId, scope });
    },
    [userId],
  );

  const dismissInterrupt = useCallback(() => setInterrupt(null), []);

  const value = useMemo<LiveContextValue>(
    () => ({ userId, status, roster, claims, trace, stats, interrupt, dismissInterrupt, claim, release, check, refreshStats }),
    [userId, status, roster, claims, trace, stats, interrupt, dismissInterrupt, claim, release, check, refreshStats],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
};

export function useLive(): LiveContextValue {
  const context = useContext(LiveContext);
  if (!context) throw new Error('useLive must be used inside <LiveProvider>');
  return context;
}

