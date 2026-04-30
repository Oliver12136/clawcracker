# Security Policy

OpenClaw can control powerful local agent workflows. Treat the gateway token,
model provider keys, channel credentials, and workspace contents as sensitive.

## Local Defaults

- The project uses the `openui` OpenClaw profile instead of the default profile.
- The gateway is configured for loopback access at `127.0.0.1:18789`.
- The setup script does not install a daemon or connect chat channels.
- `.openclaw/`, `.env`, and local runtime state are intentionally ignored by git.

## Secrets

- Do not commit API keys, gateway tokens, channel tokens, OAuth files, or generated OpenClaw state.
- Do not commit Figma personal access tokens, raw Figma API payloads, or local design snapshots unless maintainers explicitly approve publishing them.
- Prefer environment variables or OpenClaw SecretRef tooling for local credentials.
- Rotate any key immediately if it is accidentally committed or shared.

## Reporting

Until a public security contact is added, please open a private maintainer issue
or contact the project maintainers directly before publishing exploit details.
