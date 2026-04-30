# Contributing

Thanks for helping build this OpenClaw UI shell.

## Local Setup

```bash
npm install
npm run openclaw:setup
npm run check
```

## Development Guidelines

- Keep OpenClaw runtime state and credentials out of git.
- Prefer small, reviewable changes with clear docs for any new setup step.
- If a change requires a running gateway, document whether it needs manual `npm run openclaw:gateway` or an explicitly installed daemon.
- Run `npm run check` before opening a pull request.
