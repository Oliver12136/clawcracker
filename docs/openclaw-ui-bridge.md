# OpenClaw UI Bridge Notes

These notes capture the current integration shape for a custom UI shell.

## Gateway

- Local profile: `openui`.
- WebSocket URL: `ws://127.0.0.1:18789`.
- HTTP base URL: `http://127.0.0.1:18789`.
- Config path: `~/.openclaw-openui/openclaw.json`.
- Project workspace: `./.openclaw/workspace`.

Start the gateway manually while developing:

```bash
npm run openclaw:gateway
```

## Client Protocol

OpenClaw clients connect over WebSocket using JSON text frames. The first client
frame must be a `connect` request with role, scopes, client metadata, and auth.

Useful UI-facing RPC families include:

- `health`, `status`, and `system-presence` for shell status indicators.
- `sessions.list`, `sessions.create`, `sessions.send`, `sessions.abort`, and `chat.history` for chat/session UI.
- `models.list` and `usage.status` for model and cost/status panels.
- `config.schema` and `config.schema.lookup` for configuration screens.
- `logs.tail` for diagnostics.

## Security Shape

For an early UI shell, prefer an operator client with the narrowest scopes needed
for each screen. Avoid exposing admin-scoped config writes until the UI has clear
review and confirmation affordances.
