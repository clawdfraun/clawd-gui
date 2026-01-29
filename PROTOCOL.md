# Clawdbot Gateway WebSocket Protocol

## Connection

Connect to `ws://<host>:18789` (or `wss://` with TLS).

### Frame Types

All messages are JSON. Three frame types:

**Request** (client → server):
```json
{ "type": "req", "id": "<uuid>", "method": "<method>", "params": { ... } }
```

**Response** (server → client):
```json
{ "type": "res", "id": "<uuid>", "ok": true, "payload": { ... } }
// or on error:
{ "type": "res", "id": "<uuid>", "ok": false, "error": { "code": "...", "message": "..." } }
```

**Event** (server → client, push):
```json
{ "type": "event", "event": "<event-name>", "payload": { ... }, "seq": 42 }
```

### Handshake Flow

1. Client opens WebSocket
2. Server MAY send `connect.challenge` event with `{ nonce: "..." }`
3. Client sends `connect` request with auth params
4. Server responds with `hello-ok` containing snapshot, features, policy

### Connect Params
```json
{
  "minProtocol": 7, "maxProtocol": 7,
  "client": { "id": "clawd-gui", "version": "0.1.0", "platform": "web", "mode": "webchat" },
  "caps": [],
  "auth": { "token": "<gateway-token>" },
  "role": "operator",
  "scopes": ["operator.admin"]
}
```

### hello-ok Response
Contains:
- `server.version`, `server.host`, `server.connId`
- `features.methods` — list of available RPC methods
- `features.events` — list of event types
- `snapshot` — initial state (presence, health, sessionDefaults)
- `policy.tickIntervalMs` — expected tick interval

## Event Types

| Event | Description |
|-------|-------------|
| `connect.challenge` | Nonce challenge during handshake |
| `tick` | Keepalive (server sends periodically) |
| `chat` | Chat response stream events |
| `agent` | Agent tool call/result events |
| `presence` | Instance presence updates |
| `cron` | Cron job state changes |
| `device.pair.requested` | New device pairing request |
| `device.pair.resolved` | Device pairing resolved |
| `exec.approval.requested` | Exec approval needed |
| `exec.approval.resolved` | Exec approval resolved |

## Chat Methods

### chat.history
```json
{ "sessionKey": "agent:main:webchat", "limit": 200 }
```
Returns message history for a session.

### chat.send
```json
{
  "sessionKey": "agent:main:webchat",
  "message": "Hello",
  "attachments": [{ "content": "<base64>", "mimeType": "image/png", "fileName": "screenshot.png" }],
  "idempotencyKey": "<uuid>"
}
```
**Non-blocking**: returns `{ runId, status: "started" }` immediately.
Response streams via `chat` events.

Idempotency: re-sending same key returns `{ status: "in_flight" }` while running, `{ status: "ok" }` after.

### chat.abort
```json
{ "sessionKey": "agent:main:webchat" }
```
Aborts all active runs for the session.

### chat.inject
```json
{ "sessionKey": "...", "message": "...", "label": "note" }
```
Appends assistant note to transcript (no agent run).

## Chat Event Payload
```json
{
  "runId": "<uuid>",
  "sessionKey": "...",
  "seq": 0,
  "state": "delta" | "final" | "aborted" | "error",
  "message": { ... },
  "usage": { ... },
  "stopReason": "end_turn"
}
```

## Agent Event Payload
```json
{
  "runId": "<uuid>",
  "seq": 0,
  "stream": "tool_call" | "tool_result" | "thinking" | "status",
  "ts": 1234567890,
  "data": { "name": "exec", ... }
}
```

## Session Methods

### sessions.list
```json
{
  "limit": 100,
  "includeDerivedTitles": true,
  "includeLastMessage": true,
  "activeMinutes": 5,
  "label": "...",
  "spawnedBy": "...",
  "search": "..."
}
```

### sessions.patch
```json
{ "key": "...", "label": "my-session", "model": "claude-sonnet-4-20250514" }
```

### sessions.reset / sessions.delete / sessions.compact
Manage session lifecycle.

## Attachments

Sent as array in `chat.send`:
```json
{
  "content": "<base64-encoded>",
  "mimeType": "image/png",
  "fileName": "file.png"
}
```
Max 5MB per attachment. Images are processed as Claude image content blocks.
Non-image attachments are currently dropped by the gateway.

## Protocol Version

Current: **7** (set via `minProtocol`/`maxProtocol` in connect).

## Tick / Keepalive

Server sends `tick` events at `policy.tickIntervalMs` intervals.
Client should close if no tick received for `2 × tickIntervalMs`.
