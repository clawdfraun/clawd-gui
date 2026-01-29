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

export type GatewayEventHandler = (event: EventFrame) => void;
export type ConnectionStateHandler = (state: ConnectionState) => void;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private backoffMs = 1000;
  private closed = false;
  private url: string;
  private token: string;
  private eventHandlers: GatewayEventHandler[] = [];
  private stateHandlers: ConnectionStateHandler[] = [];
  private _state: ConnectionState = 'disconnected';
  private _helloOk: HelloOk | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  get state() { return this._state; }
  get helloOk() { return this._helloOk; }
  get sessionDefaults() { return this._helloOk?.snapshot?.sessionDefaults; }

  onEvent(handler: GatewayEventHandler) {
    this.eventHandlers.push(handler);
    return () => { this.eventHandlers = this.eventHandlers.filter(h => h !== handler); };
  }

  onStateChange(handler: ConnectionStateHandler) {
    this.stateHandlers.push(handler);
    return () => { this.stateHandlers = this.stateHandlers.filter(h => h !== handler); };
  }

  private setState(state: ConnectionState) {
    this._state = state;
    this.stateHandlers.forEach(h => h(state));
  }

  start() {
    if (this.closed) return;
    this.setState('connecting');

    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      // Wait briefly for challenge, then send connect
      setTimeout(() => this.sendConnect(), 500);
    };
    this.ws.onmessage = (e) => this.handleMessage(e.data as string);
    this.ws.onclose = (e) => {
      this.ws = null;
      this.flushPendingErrors(new Error(`closed (${e.code}): ${e.reason}`));
      if (!this.closed) {
        this.setState('disconnected');
        this.scheduleReconnect();
      }
    };
    this.ws.onerror = () => {
      this.setState('error');
    };
  }

  stop() {
    this.closed = true;
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

  private sendConnect() {
    const params: ConnectParams = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: 'clawd-gui',
        displayName: 'Clawd GUI',
        version: '0.1.0',
        platform: 'web',
        mode: 'control-ui',
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
        this.setState('connected');
      })
      .catch(() => {
        this.setState('error');
        this.ws?.close(1008, 'connect failed');
      });
  }

  private handleMessage(raw: string) {
    try {
      const parsed: GatewayFrame = JSON.parse(raw);

      if (parsed.type === 'event') {
        const evt = parsed as EventFrame;
        // Handle challenge
        if (evt.event === 'connect.challenge') {
          this.sendConnect();
          return;
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
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, 30000);
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
