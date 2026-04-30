# ClawCracker

**A local-first, user-owned GUI control plane for personal AI agents.**

Most agent workflows today are trapped inside text-only chat threads or CLI
streams. This makes powerful tools hard to supervise: users cannot easily see
active tasks, understand what an agent is doing, inspect tool usage, review
permissions, or build a clear mental model of the whole system.

ClawCracker explores what a **user-owned interface** for agents could be.

Instead of treating agents as invisible text responders, it presents them as
observable and controllable execution entities: sessions, tasks, tool calls,
permissions, artifacts, risks, and audit history.

The goal is not to remove text interaction, but to go beyond it: giving users an
interface they own, understand, and control, where agent work becomes
transparent, interruptible, reviewable, and accountable.

## Current Progress

This project is currently an experimental prototype. The present milestone is to
validate whether the experience can functionally "put a shell around the
lobster": wrapping OpenClaw-style agent behavior in a more visible, guided, and
user-owned interface while improving the overall interaction experience.

The implementation is still text-dialogue based. It does not yet include a
configured physical machine, robot, or hardware control layer. The current work
focuses on the local desktop app shell, the OpenClaw bridge, observable session
UI concepts, and safe local-first development defaults.

## Open-Source Notes

This repo keeps OpenClaw local state out of git and uses a dedicated `openui`
profile so UI development does not mutate your default `~/.openclaw` setup.

## Prerequisites

- Node.js `>=22.14.0` (OpenClaw recommends Node 24; this machine is currently on Node `25.9.0`).
- npm `>=11`.

## Setup

```bash
npm install
npm run openclaw:setup
npm run openclaw:config:validate
```

`openclaw:setup` intentionally uses a conservative local profile:

- `--profile openui` isolates state from your default OpenClaw install.
- `--gateway-bind loopback` keeps the gateway bound to this machine.
- `--skip-daemon` avoids installing a background system service.
- `--auth-choice skip` avoids committing or generating model credentials during repo setup.
- `--skip-channels` avoids connecting Telegram/Discord/Slack/etc. until you choose to.
- `--skip-health` avoids failing setup just because the gateway is not already running.

The profile config lives at:

```bash
npm run openclaw:config:file
```

For this project it resolves to `~/.openclaw-openui/openclaw.json`.

## Configure Models And Gateway

Run the official guided configurator when you are ready to connect a provider:

```bash
npm run openclaw:configure -- --section model
npm run openclaw:configure -- --section gateway
```

Keep secrets in environment variables or OpenClaw secret references, not in committed files. Use `.env.example` as a local checklist only.

For local OpenAI testing with ChatGPT/Codex OAuth, this project is currently
configured to use:

```bash
npm run openclaw -- models set openai-codex/gpt-5.4
```

If you prefer direct OpenAI Platform billing/API-key auth, use `openai/gpt-5.4`
instead and put `OPENAI_API_KEY` in `.env.local` or your shell profile. Verify
the active route with:

```bash
npm run openclaw -- models status --json
```

If you want subscription/OAuth login instead of an API key, launch the desktop app,
open the `?` debug panel, and click `browser login`. The app runs the
device-code OAuth flow:

```bash
npm run openclaw -- models auth login --provider openai-codex --method device-code
```

The login URL is opened in the system browser when OpenClaw emits it. The debug
panel also prints the verification URL/code so it can be copied manually, and
the local gateway is restarted after a successful login.

## Development Commands

```bash
npm run app:dev
npm run app
npm run dev
npm run build
npm run preview
npm run openclaw:gateway
npm run openclaw:dashboard
npm run openclaw -- models status
npm run openclaw -- doctor --non-interactive
```

`npm run app:dev` is the normal development entrypoint. It launches a dedicated
local desktop window, starts the Vite renderer on loopback only, and starts the
OpenClaw gateway on `127.0.0.1:18789`.

`npm run dev` is only for inspecting the renderer in a browser during UI
debugging. It is not the product runtime.

`npm run app` builds the renderer and launches the local desktop app from
`dist/`.

## Figma Handoff

The preferred design bridge is Figma MCP. See [docs/figma-mcp.md](docs/figma-mcp.md)
for VS Code and Codex setup.

The current first-screen implementation is a runnable shell scaffold. If MCP is
not available in the active agent session, use the REST fallback once:

```bash
npm run figma:setup
```

This writes a read-only token to ignored local state in `.env.local`. After that,
pull the current first-screen node whenever the design changes:

```bash
npm run figma:pull
```

This pulls the shared design node into ignored local state under `figma/raw/` and
stores a 2x rendered snapshot under `figma/snapshots/`. No token, raw Figma
payload, or design snapshot should be committed unless the project explicitly
decides to publish those assets.

If token access is not available, export or share one of the following:

- A PNG screenshot of the target frame at 1x or 2x.
- SVG exports for custom icons/illustrations.

The shared Figma URL is tracked as the design source:

```text
https://www.figma.com/design/2zA19y0kTx79oDOOfcNRJN/OpenUI?node-id=36-6797&m=dev
https://www.figma.com/design/2zA19y0kTx79oDOOfcNRJN/OpenUI?node-id=38-8596&m=dev
```

`36:6797` is the first input screen. `38:8596` is the post-submit chat layer
that receives real OpenClaw agent responses through the local Electron bridge.

If you deliberately want OpenClaw to run as a background service later, install it explicitly:

```bash
npm run openclaw -- daemon install
npm run openclaw -- daemon start
```

## Repository Hygiene

- `.openclaw/` is ignored because it contains local workspace/runtime state.
- `~/.openclaw-openui/openclaw.json` is machine-local profile config and should not be committed.
- Commit UI source, typed API clients, docs, and reproducible scripts instead of local runtime state.
