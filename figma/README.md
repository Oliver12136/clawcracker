# Figma Integration

This directory documents the design import pipeline.

Ignored local outputs:

- `raw/`: Figma API node JSON payloads.
- `snapshots/`: rendered PNG snapshots for visual comparison.

Set up local access once:

```bash
npm run figma:setup
```

Then pull the target first-screen node whenever the design changes:

```bash
npm run figma:pull
```

The default design source is:

```text
https://www.figma.com/design/2zA19y0kTx79oDOOfcNRJN/OpenUI?node-id=36-6797&m=dev
```
