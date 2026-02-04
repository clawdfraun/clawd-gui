import { v4 as uuid } from 'uuid';
import {
  PROTOCOL_VERSION,
  RequestFrame,
  ResponseFrame,
  EventFrame,
  GatewayFrame,
  ConnectParams,
  HelloOk,
} from '../types/gateway';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type ConnectionHealth = {
  state: ConnectionState;
  lastTickAt: number | null;
  tickIntervalMs: number | null;
  isStale: boolean;  // true if no tick received in 2x tick interval
  reconnectAttempts: number;
};

export type GatewayEventHandler = (event: EventFrame) => void;
export type ConnectionStateHandler = (state: ConnectionState) => void;
export type ConnectionHealthHandler = (health: ConnectionHealth) => void;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private backoffMs = 1000;
  private closed = false;
  private url: string;
  private token: string;
  private eventHandlers: GatewayEventHandler[] = [];
  private stateHandlers: ConnectionStateHandler[] = [];
  private healthHandlers: ConnectionHealthHandler[] = [];
  private _state: ConnectionState = 'disconnected';
  private _helloOk: HelloOk | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectSent = false;
  
  // Tick monitoring for connection health
  private lastTickAt: number | null = null;
  private tickIntervalMs: number | null = null;
  private tickCheckTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  get state() { return this._state; }
  get helloOk() { return this._helloOk; }
  get sessionDefaults() { return this._helloOk?.snapshot?.sessionDefaults; }
  
  get health(): ConnectionHealth {
    const isStale = this.isConnectionStale();
    return {
      state: this._state,
      lastTickAt: this.lastTickAt,
      tickIntervalMs: this.tickIntervalMs,
      isStale,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  private isConnectionStale(): boolean {
    if (this._state !== 'connected') return false;
    if (!this.lastTickAt || !this.tickIntervalMs) return false;
    const elapsed = Date.now() - this.lastTickAt;
    // Stale if no tick in 2.5x the expected interval (being slightly generous)
    return elapsed > this.tickIntervalMs * 2.5;
  }

  onEvent(handler: GatewayEventHandler) {
    this.eventHandlers.push(handler);
    return () => { this.eventHandlers = this.eventHandlers.filter(h => h !== handler); };
  }

  onStateChange(handler: ConnectionStateHandler) {
    this.stateHandlers.push(handler);
    return () => { this.stateHandlers = this.stateHandlers.filter(h => h !== handler); };
  }

  onHealthChange(handler: ConnectionHealthHandler) {
    this.healthHandlers.push(handler);
    return () => { this.healthHandlers = this.healthHandlers.filter(h => h !== handler); };
  }

  private setState(state: ConnectionState) {
    this._state = state;
    this.stateHandlers.forEach(h => h(state));
    this.emitHealth();
  }

  private emitHealth() {
    const health = this.health;
    this.healthHandlers.forEach(h => h(health));
  }

  private startTickMonitor() {
    this.stopTickMonitor();
    // Check connection health every 5 seconds
    this.tickCheckTimer = setInterval(() => {
      if (this.isConnectionStale()) {
        console.warn('[gateway] Connection appears stale (no tick received). Reconnecting...');
        this.emitHealth();
        // Force reconnect
        this.ws?.close(4001, 'stale connection');
      } else {
        // Emit health update for UI
        this.emitHealth();
      }
    }, 5000);
  }

  private stopTickMonitor() {
    if (this.tickCheckTimer) {
      clearInterval(this.tickCheckTimer);
      this.tickCheckTimer = null;
    }
  }

  start() {
    if (this.closed) return;
    this.setState('connecting');
    this.connectSent = false;

    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      // Wait briefly for challenge event; if none arrives, send connect
      setTimeout(() => {
        if (!this.connectSent) this.sendConnect();
      }, 500);
    };
    this.ws.onmessage = (e) => this.handleMessage(e.data as string);
    this.ws.onclose = (e) => {
      this.ws = null;
      this.stopTickMonitor();
      this.flushPendingErrors(new Error(`closed (${e.code}): ${e.reason}`));
      if (!this.closed) {
        // Don't flash error→disconnected; just show error if we had one
        if (this._state !== 'error') {
          this.setState('disconnected');
        }
        this.scheduleReconnect();
      }
    };
    this.ws.onerror = () => {
      this.setState('error');
    };
  }

  stop() {
    this.closed = true;
    this.stopTickMonitor();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.flushPendingErrors(new Error('client stopped'));
    this.setState('disconnected');
  }

  updateCredentials(url: string, token: string) {
    const changed = this.url !== url || this.token !== token;
    this.url = url;
    this.token = token;
    if (changed && this._state !== 'disconnected') {
      this.closed = false;
      this.ws?.close();
    }
  }

  // Force immediate reconnect (useful for manual recovery)
  forceReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.backoffMs = 1000; // Reset backoff
    this.reconnectAttempts = 0;
    this.closed = false;
    this.ws?.close();
    this.start();
  }

  private sendConnect() {
    if (this.connectSent) return;
    this.connectSent = true;

    const params: ConnectParams = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: 'openclaw-control-ui',
        displayName: 'OpenClaw GUI',
        version: '0.1.0',
        platform: 'web',
        mode: 'webchat',
      },
      caps: [],
      auth: { token: this.token },
      role: 'operator',
      scopes: ['operator.admin'],
    };

    this.request('connect', params)
      .then((result) => {
        this._helloOk = result as HelloOk;
        this.backoffMs = 1000;
        this.reconnectAttempts = 0;
        
        // Start tick monitoring if server provides interval
        if (this._helloOk.policy?.tickIntervalMs) {
          this.tickIntervalMs = this._helloOk.policy.tickIntervalMs;
          this.lastTickAt = Date.now(); // Initialize with connect time
          this.startTickMonitor();
        }
        
        this.setState('connected');
      })
      .catch(() => {
        this.setState('error');
        this.ws?.close(4008, 'connect failed');
      });
  }

  private handleMessage(raw: string) {
    try {
      const parsed: GatewayFrame = JSON.parse(raw);

      if (parsed.type === 'event') {
        const evt = parsed as EventFrame;
        
        // Handle challenge — sendConnect guards against double-send
        if (evt.event === 'connect.challenge') {
          this.sendConnect();
          return;
        }
        
        // Track tick events for connection health
        if (evt.event === 'tick') {
          this.lastTickAt = Date.now();
          this.emitHealth();
        }
        
        this.eventHandlers.forEach(h => h(evt));
        return;
      }

      if (parsed.type === 'res') {
        const res = parsed as ResponseFrame;
        const pending = this.pending.get(res.id);
        if (!pending) return;

        // If accepted (ack), keep waiting for final
        const payload = res.payload as Record<string, unknown> | undefined;
        if (payload?.status === 'accepted') return;

        this.pending.delete(res.id);
        if (res.ok) pending.resolve(res.payload);
        else pending.reject(new Error(res.error?.message ?? 'unknown error'));
      }
    } catch { /* parse error */ }
  }

  private scheduleReconnect() {
    if (this.closed) return;
    this.reconnectAttempts++;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, 30000);
    this.emitHealth();
    this.reconnectTimer = setTimeout(() => this.start(), delay);
  }

  private flushPendingErrors(err: Error) {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('not connected');
    }
    const id = uuid();
    const frame: RequestFrame = { type: 'req', id, method, params };

    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
    });

    this.ws.send(JSON.stringify(frame));
    return promise;
  }
}

// Singleton
let instance: GatewayClient | null = null;

export function getGateway(): GatewayClient | null {
  return instance;
}

export function createGateway(url: string, token: string): GatewayClient {
  if (instance) instance.stop();
  instance = new GatewayClient(url, token);
  return instance;
}
