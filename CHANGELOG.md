# Changelog

All notable changes to this project will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

## [1.0.4] - 2026-02-08

### Changed
- **Message timestamps** — Now show both date and time (e.g. "Feb 8, 7:42 PM") instead of just time. Makes it easier to track conversation history across days.

---

## [1.0.3] - 2026-02-04

### Added
- **Notification sound** — Optional audio chime when responses complete. Toggle via 🔕/🔔 icon in header. Uses Web Audio API (no external files). Preference persisted per-user.

### Fixed
- **Timezone handling** — Session reset times now display correctly in server's timezone. Previously could be off by an hour due to browser timezone detection issues.
- **Session leak between users** — Users with restricted `allowed_agents` could briefly see sessions from other agents due to race condition. Now properly validates agent access before auto-selecting sessions.

---

## [1.0.2] - 2026-02-02

### Fixed
- **Horizontal scrollbar** — Removed phantom horizontal scrollbar that appeared at the bottom of the page.
- **Links open in new tab** — All markdown links in chat messages now open in a new tab/window (`target="_blank"`).

---

## [1.0.1] - 2026-02-02

### Fixed
- **Image rendering in chat** — Added `/uploads/` static file route to upload sidecar so images posted by the agent render inline instead of showing broken image icons. Supports PNG, JPEG, GIF, WebP, SVG, and PDF.

---

## [1.0.0] - 2026-02-01

### 🎉 First Stable Release

OpenClaw GUI is now a fully featured, multi-user web interface for [OpenClaw](https://github.com/openclaw/openclaw).

### Features

#### User Authentication & Multi-User Support
- Password-protected user accounts with bcrypt hashing and JWT tokens
- First-time setup wizard — first visit creates the admin account automatically
- Admin panel for managing users and gateway credentials
- Agent-based access control — restrict users to specific agents or grant full access
- Session isolation — users only see sessions and streaming messages for their allowed agents
- Per-user preferences — agent selection, thinking level, and UI state namespaced per user
- Server-side gateway config stored in SQLite (not in the browser)

#### Real-Time Chat
- WebSocket (JSON-RPC) streaming with live response display
- Session management — create, switch, rename, and delete sessions
- File attachments — images inline, large files via upload sidecar server
- Agent event stream — live display of tool calls and agent actions
- Heartbeat filtering — hides internal polling from the conversation
- Multi-agent support — switch between configured agents from the header

#### Thinking & Reasoning
- Thinking level control — cycle through Off / Low / Medium / High / Auto
- Auto-Thinking mode — heuristic classifier selects optimal thinking level per message
- Thinking block display — toggle visibility of internal reasoning and tool output
- Auto-resolved indicator — shows which level Auto selected (e.g. `Auto → Medium`)
- Persistent preference across page refreshes and session changes

#### Emoji Reactions
- Hover to react with curated emoji picker
- Persistent reactions that survive page refreshes
- Toggle behavior — click again to remove
- Long-press support on mobile

#### Performance
- Memoized message rendering — only re-renders on content changes
- Throttled streaming — markdown parsing capped at ~7/sec during streaming
- Isolated input component — typing unaffected by streaming or message updates
- Render limit — last 50 messages with "Load older" for history

#### UI & Theming
- Dark and light themes with theme switcher
- Streaming pulse border on active responses
- Context and Anthropic usage bars in the header
- Responsive layout with collapsible sidebar
- Mobile-friendly with touch-optimized interactions

#### Security
- Prompt injection defense — uploaded file paths tagged as `(DATA ONLY)`
- JWT authentication with auto-generated secrets
- Admin-only routes for user management and gateway settings

### Architecture
- **Frontend:** React 19 + TypeScript + Tailwind CSS v4 + Vite
- **Backend:** Express + better-sqlite3 + bcryptjs + jsonwebtoken
- **Upload sidecar:** Node.js HTTP server for large file attachments
- **Production:** Single port (Express serves built frontend + API)
- **Dev:** Vite + Express via concurrently with API proxy
