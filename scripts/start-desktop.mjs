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

await loadLocalEnv(root);

const electron = spawn(electronBin, ["."], {
  cwd: root,
  env: desktopEnv(),
  stdio: "inherit",
});

const [code] = await once(electron, "exit");
process.exit(code ?? 0);
