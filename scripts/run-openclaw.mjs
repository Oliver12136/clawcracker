import { spawn } from "node:child_process";
import { once } from "node:events";
import { platform } from "node:os";
import { join, resolve } from "node:path";
import { loadLocalEnv } from "./local-env.mjs";

const root = resolve();
const openclawBin = join(
  root,
  "node_modules",
  ".bin",
  platform() === "win32" ? "openclaw.cmd" : "openclaw",
);

await loadLocalEnv(root);

const child = spawn(openclawBin, ["--profile", "openui", ...process.argv.slice(2)], {
  cwd: root,
  env: {
    ...process.env,
    OPENCLAW_PROFILE: "openui",
  },
  stdio: "inherit",
});

const forwardSignal = (signal) => {
  child.kill(signal);
};

process.on("SIGINT", forwardSignal);
process.on("SIGTERM", forwardSignal);

const [code, signal] = await once(child, "exit");

if (signal) {
  process.kill(process.pid, signal);
} else {
  process.exit(code ?? 0);
}
