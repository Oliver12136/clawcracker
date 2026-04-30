import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadLocalEnv } from "./local-env.mjs";

await loadLocalEnv();

const fileKey = process.env.FIGMA_FILE_KEY ?? "2zA19y0kTx79oDOOfcNRJN";
const nodeId = process.env.FIGMA_NODE_ID ?? "36:6797";
const token = process.env.FIGMA_ACCESS_TOKEN;
const safeNodeId = nodeId.replace(":", "-");
const outFile = resolve(
  process.env.FIGMA_OUT_FILE ?? `figma/raw/${fileKey}-${nodeId.replace(":", "-")}.json`,
);
const snapshotFile = resolve(
  process.env.FIGMA_SNAPSHOT_FILE ?? `figma/snapshots/${fileKey}-${safeNodeId}@2x.png`,
);

if (!token) {
  console.error("Missing FIGMA_ACCESS_TOKEN.");
  console.error("Run `npm run figma:setup` once, or expose FIGMA_ACCESS_TOKEN in your shell.");
  process.exit(1);
}

const url = new URL(`https://api.figma.com/v1/files/${fileKey}/nodes`);
url.searchParams.set("ids", nodeId);

const response = await fetch(url, {
  headers: {
    "X-Figma-Token": token,
  },
});

if (!response.ok) {
  const body = await response.text();
  console.error(`Figma API request failed: ${response.status} ${response.statusText}`);
  console.error(body.slice(0, 1200));
  process.exit(1);
}

const payload = await response.json();
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`);
await pullSnapshot({ fileKey, nodeId, token, snapshotFile });

const node = payload.nodes?.[nodeId]?.document;
const size = node?.absoluteBoundingBox
  ? `${Math.round(node.absoluteBoundingBox.width)}x${Math.round(node.absoluteBoundingBox.height)}`
  : "unknown size";

console.log(`Pulled Figma node ${nodeId} (${node?.name ?? "unnamed"}, ${size})`);
console.log(outFile);
console.log(snapshotFile);

async function pullSnapshot({ fileKey, nodeId, token, snapshotFile }) {
  const imageUrl = new URL(`https://api.figma.com/v1/images/${fileKey}`);
  imageUrl.searchParams.set("ids", nodeId);
  imageUrl.searchParams.set("format", "png");
  imageUrl.searchParams.set("scale", process.env.FIGMA_SNAPSHOT_SCALE ?? "2");

  const imageResponse = await fetch(imageUrl, {
    headers: {
      "X-Figma-Token": token,
    },
  });

  if (!imageResponse.ok) {
    const body = await imageResponse.text();
    console.warn(`Figma snapshot request failed: ${imageResponse.status} ${imageResponse.statusText}`);
    console.warn(body.slice(0, 1200));
    return;
  }

  const imagePayload = await imageResponse.json();
  const renderedUrl = imagePayload.images?.[nodeId];

  if (!renderedUrl) {
    console.warn(`Figma did not return a rendered image for node ${nodeId}.`);
    return;
  }

  const renderedResponse = await fetch(renderedUrl);

  if (!renderedResponse.ok) {
    console.warn(
      `Figma rendered image download failed: ${renderedResponse.status} ${renderedResponse.statusText}`,
    );
    return;
  }

  const buffer = Buffer.from(await renderedResponse.arrayBuffer());
  await mkdir(dirname(snapshotFile), { recursive: true });
  await writeFile(snapshotFile, buffer);
}
