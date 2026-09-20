// src/live/liveClient.ts — dependency-free WebSocket client for the
// live-interrupt backend (root src/server.js), reached through the Vite proxy
// at /ws so the socket is same-origin in development. Auto-reconnects with
// exponential backoff and re-syncs via request_state after every (re)open.
export type LiveMessage = Record<string, unknown> & { type?: string };

export type LiveEventHandler = (message: any) => void;

export interface LiveClientOptions {
  userId: string;
  teamId: string;
  /** e.g. 'web-console' | 'cli-agent' — shown in the roster. */
  client?: string;
  /** Override the ws(s):// URL; default derives from window.location (/ws). */
  url?: string;
}

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

export class LiveClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<LiveEventHandler>>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  private readonly options: LiveClientOptions;

  constructor(options: LiveClientOptions) {
    this.options = options;
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): void {
    this.closedByUser = false;
    if (this.ws) return;
    this.open();
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close(1000, 'client closed');
    } catch {
      /* already gone */
    }
    this.ws = null;
  }

  send(message: Record<string, unknown>): void {
    if (!this.isOpen) return;
    try {
      this.ws!.send(JSON.stringify(message));
    } catch {
      /* socket died mid-send; the reconnect loop re-syncs state */
    }
  }

  on(type: string, handler: LiveEventHandler): () => void {
    const set = this.handlers.get(type) ?? new Set<LiveEventHandler>();
    set.add(handler);
    this.handlers.set(type, set);
    return () => {
      set.delete(handler);
      if (set.size === 0) this.handlers.delete(type);
    };
  }

  private url(): string {
    if (this.options.url) return this.options.url;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({
      user_id: this.options.userId,
      team_id: this.options.teamId,
      ...(this.options.client ? { client: this.options.client } : {}),
    });
    return `${protocol}//${window.location.host}/ws?${params.toString()}`;
  }

  private open(): void {
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.emit('open', { type: 'open' });
      this.send({ type: 'request_state' });
    };
    socket.onmessage = (event) => {
      let message: LiveMessage;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      this.emit('*', message);
      if (message?.type) this.emit(message.type, message);
    };
    socket.onclose = () => {
      this.ws = null;
      this.emit('close', { type: 'close' });
      if (!this.closedByUser) this.scheduleReconnect();
    };
    socket.onerror = () => {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.closedByUser) return;
    const attempt = Math.min(this.reconnectAttempts + 1, 8);
    const jitter = 1 + (Math.random() * 0.6 - 0.3); // ±30%
    const delay = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS) * jitter;
    this.reconnectAttempts = attempt;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByUser) this.open();
    }, delay);
  }

  private emit(type: string, message: LiveMessage): void {
    for (const handler of this.handlers.get(type) ?? []) {
      try {
        handler(message);
      } catch {
        /* a broken view must not kill the socket loop */
      }
    }
  }
}
