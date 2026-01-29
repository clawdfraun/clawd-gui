# Clawd GUI

Custom web interface for [Clawdbot](https://github.com/clawdfraun/clawdbot) gateway.

## Features

- **Chat Interface** — Send messages, stream responses, view tool calls live
- **Session Management** — List, switch, and manage sessions
- **File Uploads** — Attach any file to chat messages
- **Working On Pane** — See active agent sessions in real-time
- **Waiting For You Pane** — Track items awaiting your input
- **Dark Theme** — Matches the Clawdbot aesthetic

## Setup

```bash
npm install
npm run dev    # → http://localhost:3000
```

## Configuration

On first load, click the connection status indicator (top-right) and enter:
- **Gateway URL**: `ws://127.0.0.1:18789` (default)
- **Token**: Your gateway auth token (from `clawdbot dashboard`)

Credentials are stored in localStorage.

## Build

```bash
npm run build  # outputs to dist/
```

## Protocol

See [PROTOCOL.md](./PROTOCOL.md) for the gateway WebSocket protocol reference.
