# Desktop Runtime

ClawCracker is intended to run as a local desktop app shell around the OpenClaw
kernel, not as a browser-hosted product.

## Development

```bash
npm install
npm run openclaw:setup
npm run app:dev
```

`app:dev` starts:

- An Electron desktop window.
- A Vite renderer dev server bound to `127.0.0.1:5173`.
- An OpenClaw Gateway child process bound to `127.0.0.1:18789`.

The Vite server is only a local renderer transport for development. The product
behavior is the Electron window.

## Production-Like Local Run

```bash
npm run app
```

This builds the renderer into `dist/` and opens the Electron app from local
files.

## Debugging

- Press the `?` button in the app header to show the debug drawer.
- The red/yellow/green controls are wired to the native desktop window.
- Submitting the prompt sends a local request through the Electron main process
  to `openclaw --profile openui infer model run --gateway --prompt ... --json`.
- To target a specific model without changing the OpenClaw profile default, set
  `OPENUI_OPENCLAW_MODEL=<provider/model>` in `.env.local` before starting the
  app.

If a model provider has not been configured yet, the debug drawer will show the
OpenClaw error. Configure a provider with:

```bash
npm run openclaw:configure -- --section model
```
