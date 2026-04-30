# Figma MCP

This project uses Figma MCP as the preferred long-lived design bridge.

## VS Code

The VS Code user MCP config lives at:

```text
~/.config/Code/User/mcp.json
```

Expected server shape:

```json
{
  "servers": {
    "figma": {
      "url": "https://mcp.figma.com/mcp",
      "type": "http"
    }
  },
  "inputs": []
}
```

## Codex

Codex stores MCP servers in:

```text
~/.codex/config.toml
```

The Figma server can be configured with:

```bash
codex mcp add figma --url https://mcp.figma.com/mcp
codex mcp login figma
codex mcp list
```

Expected status:

```text
figma  https://mcp.figma.com/mcp  enabled  OAuth
```

After adding or authenticating MCP servers, restart the Codex/ChatGPT agent
session so newly available MCP tools are injected into the tool list.

## Fallback

If MCP is unavailable in a session, use the REST fallback:

```bash
npm run figma:setup
npm run figma:pull
```

The fallback stores raw Figma payloads and snapshots under ignored local paths:

- `figma/raw/`
- `figma/snapshots/`
