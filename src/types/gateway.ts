// Gateway WebSocket Protocol Types

export const PROTOCOL_VERSION = 7;

// --- Frames ---

export interface RequestFrame {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

export interface ResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: ErrorShape;
}

export interface EventFrame {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: StateVersion;
}

export interface ErrorShape {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
}

export type GatewayFrame = RequestFrame | ResponseFrame | EventFrame;

// --- Connect ---

export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    displayName?: string;
    version: string;
    platform: string;
    mode: string;
    instanceId?: string;
  };
  caps?: string[];
  auth?: {
    token?: string;
    password?: string;
  };
  role?: string;
  scopes?: string[];
}

export interface HelloOk {
  type: 'hello-ok';
  protocol: number;
  server: {
    version: string;
    commit?: string;
    host?: string;
    connId: string;
  };
  features: {
    methods: string[];
    events: string[];
  };
  snapshot: Snapshot;
  canvasHostUrl?: string;
  policy: {
    maxPayload: number;
    maxBufferedBytes: number;
    tickIntervalMs: number;
  };
}

export interface StateVersion {
  presence: number;
  health: number;
}

export interface Snapshot {
  presence: PresenceEntry[];
  health: unknown;
  stateVersion: StateVersion;
  uptimeMs: number;
  configPath?: string;
  stateDir?: string;
  sessionDefaults?: {
    defaultAgentId: string;
    mainKey: string;
    mainSessionKey: string;
    scope?: string;
  };
}

export interface PresenceEntry {
  host?: string;
  ip?: string;
  version?: string;
  platform?: string;
  mode?: string;
  reason?: string;
  tags?: string[];
  text?: string;
  ts: number;
  instanceId?: string;
}

// --- Chat ---

export interface ChatSendParams {
  sessionKey: string;
  message: string;
  thinking?: string;
  deliver?: boolean;
  attachments?: ChatAttachment[];
  timeoutMs?: number;
  idempotencyKey: string;
}

export interface ChatAttachment {
  content: string; // base64
  mimeType: string;
  fileName?: string;
  type?: string;
}

export interface ChatSendResult {
  runId: string;
  status: 'started' | 'in_flight' | 'ok';
}

export interface ChatHistoryParams {
  sessionKey: string;
  limit?: number;
}

export interface ChatAbortParams {
  sessionKey: string;
  runId?: string;
}

export interface ChatInjectParams {
  sessionKey: string;
  message: string;
  label?: string;
}

export interface ChatEvent {
  runId: string;
  sessionKey: string;
  seq: number;
  state: 'delta' | 'final' | 'aborted' | 'error';
  message?: unknown;
  errorMessage?: string;
  usage?: unknown;
  stopReason?: string;
}

export interface AgentEvent {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  data: Record<string, unknown>;
}

// --- Sessions ---

export interface SessionsListParams {
  limit?: number;
  activeMinutes?: number;
  includeGlobal?: boolean;
  includeUnknown?: boolean;
  includeDerivedTitles?: boolean;
  includeLastMessage?: boolean;
  label?: string;
  spawnedBy?: string;
  agentId?: string;
  search?: string;
}

export interface SessionEntry {
  key: string;
  label?: string;
  agentId?: string;
  model?: string;
  channel?: string;
  spawnedBy?: string;
  createdAt?: string;
  lastActivityAt?: string;
  derivedTitle?: string;
  lastMessage?: string;
  thinkingLevel?: string;
  reasoningLevel?: string;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  [key: string]: unknown;
}

export interface SessionsPatchParams {
  key: string;
  label?: string | null;
  thinkingLevel?: string | null;
  model?: string | null;
}

// --- Message types from chat history ---

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
  ts?: number;
  channel?: string;
  runId?: string;
}

export interface ContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  [key: string]: unknown;
}
