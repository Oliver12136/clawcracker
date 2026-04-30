import { spawn } from "node:child_process";
import { once } from "node:events";
import { platform } from "node:os";
import { join, resolve } from "node:path";
import { desktopEnv } from "./electron-env.mjs";
import { loadLocalEnv } from "./local-env.mjs";

const root = resolve();
const electronBin = join(
  root,
  "node_modules",
  ".bin",
  platform() === "win32" ? "electron.cmd" : "electron",
);
const viteBin = join(root, "node_modules", ".bin", platform() === "win32" ? "vite.cmd" : "vite");
const rendererUrl = "http://127.0.0.1:5173";

await loadLocalEnv(root);

const vite = spawn(viteBin, ["--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

vite.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
});

vite.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

await waitForHttp(rendererUrl);

const electron = spawn(electronBin, ["."], {
  cwd: root,
  env: desktopEnv({
    ELECTRON_RENDERER_URL: rendererUrl,
  }),
  stdio: "inherit",
});

const stop = () => {
  electron.kill("SIGTERM");
  vite.kill("SIGTERM");
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

const [code] = await once(electron, "exit");
vite.kill("SIGTERM");
process.exit(code ?? 0);

async function waitForHttp(url) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < 15000) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? "unknown error"}`);
}
