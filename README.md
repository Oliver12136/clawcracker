# ClawCracker

**A task workspace for ordinary users to control personal AI agents beyond chat
and CLI.**

ClawCracker is a local-first, user-friendly task workspace for OpenClaw. It is
an experience layer for everyday users, not a developer dashboard, log viewer,
or admin console.

OpenClaw is powerful because it can route messages across channels, agents,
sessions, subagents, and tools. But for everyday users, this structure is often
exposed through chat commands, CLI streams, session keys, and agent IDs.
ClawCracker translates that complexity into a visual workspace centered on
tasks.

Instead of asking users to manage agents through command syntax, ClawCracker
lets them start a task, choose or reuse the right context, follow what is
happening, steer the agent while it runs, review risky actions, and save
successful work as reusable routines.

Text interaction remains useful for expressing intent, but real agent work needs
more than a text box. It needs structure, progress, decisions, control, and
reuse.

ClawCracker explores how personal AI agents can become not only more
transparent, but more usable, efficient, teachable, and accountable for ordinary
users.

## Vision

Most personal AI agents are still controlled through text-only chat or
command-line interfaces. This makes them hard to use for ordinary users,
especially when tasks involve multiple agents, sessions, tools, approvals, or
background subagents.

ClawCracker is built around a different mental model:

- Users think in tasks, not session keys.
- Users follow progress, not raw logs.
- Users make decisions, not command-line corrections.
- Users reuse routines, not repeated prompts.
- Users stay in control, without needing to understand the full agent
  infrastructure upfront.

Ordinary users should not have to think in agents, sessions, routes, and command
syntax. They should be able to think in tasks, progress, decisions, and
routines.

```text
OpenClaw technical model:
Gateway -> Route -> Agent -> Session -> Subagent -> Tool call

ClawCracker user model:
Task -> Plan -> Progress -> Decision -> Result -> Routine
```

The goal is not to hide OpenClaw's power, but to make it approachable.
ClawCracker brings OpenClaw's agent system into a visual task workspace where
automation is easier to start, easier to guide, easier to inspect, and easier to
trust.

The interface should reveal technical detail progressively. Ordinary users begin
with tasks, progress, decisions, and routines. When needed, they can expand into
agents, sessions, tool calls, permissions, artifacts, risks, and raw logs.

## Design Principles

### Task first, infrastructure second

Everyday users should start from what they want to get done, not from agent IDs,
session keys, routes, or command syntax.

### Text for intent, GUI for control

Text is useful for describing a goal. A visual interface is better for choosing
context, checking progress, reviewing decisions, and controlling execution.

### Make background work visible

When an agent or subagent is running, it should appear as a visible task with
status, progress, logs, and controls.

### Steer, don't restart

Users should be able to guide an agent while it is working, instead of stopping
everything and rewriting a prompt from scratch.

### Review before risk

Actions such as sending messages, deleting files, modifying data, or using
sensitive tools should be surfaced clearly and require user review.

### Reuse successful work

Good one-off tasks should be easy to turn into reusable routines.

## Current Progress

This project is currently an experimental prototype. The present milestone is to
validate whether OpenClaw-style agent work can be wrapped in an ordinary-user
task experience: more visible, guided, steerable, reviewable, and reusable than
a raw chat thread or CLI stream.

The implementation is still text-dialogue based. It does not yet include a
configured physical machine, robot, or hardware control layer. The current work
focuses on the local desktop app shell, the OpenClaw bridge, task-centered UI
concepts, and safe local-first development defaults.

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
