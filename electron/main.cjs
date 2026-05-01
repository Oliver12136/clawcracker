const { app, BrowserWindow, ipcMain, nativeImage, shell } = require("electron");
const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const openclawBin = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  isWindows ? "openclaw.cmd" : "openclaw",
);
const appDisplayName = "ClawCracker";
const appDesktopFileName = "ClawCracker.desktop";
const appLinuxClass = "ClawCracker";
const appLinuxIconName = "clawcracker";
const appIconPath = path.join(projectRoot, "ClawCracker-icon.png");
const appIcon = nativeImage.createFromPath(appIconPath);

loadLocalEnv();

const openuiModelId = process.env.OPENUI_OPENCLAW_MODEL || "";

app.setName(appDisplayName);

if (process.platform === "win32") {
  app.setAppUserModelId("ai.openclaw.clawcracker");
}

if (process.platform === "linux") {
  app.commandLine.appendSwitch("class", appLinuxClass);
  app.setDesktopName(appDesktopFileName);
}

let mainWindow;
let gatewayProcess;
let gatewayStartPromise;
let authLoginProcess;
let authLoginRunId = 0;
let didLogExternalCliOauthBootstrap = false;
let gatewayState = {
  running: false,
  starting: false,
  ready: false,
  message: "Gateway idle",
};

function createWindow() {
  ensureLinuxDesktopEntry();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 1024,
    minWidth: 960,
    minHeight: 684,
    backgroundColor: "#030304",
    frame: false,
    icon: appIcon.isEmpty() ? appIconPath : appIcon,
    show: false,
    title: appDisplayName,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.setTitle(appDisplayName);
    mainWindow.show();
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;

  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(projectRoot, "dist", "index.html"));
  }
}

function ensureLinuxDesktopEntry() {
  if (process.platform !== "linux") {
    return;
  }

  const home = process.env.HOME;

  if (!home) {
    return;
  }

  const applicationsDir = path.join(home, ".local", "share", "applications");
  const iconThemeDir = path.join(home, ".local", "share", "icons", "hicolor", "512x512", "apps");
  const iconThemePath = path.join(iconThemeDir, `${appLinuxIconName}.png`);
  const desktopPath = path.join(applicationsDir, appDesktopFileName);
  const execCommand = `${desktopExecQuote(process.execPath)} ${desktopExecQuote(projectRoot)}`;
  const content = [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${appDisplayName}`,
    `StartupWMClass=${appLinuxClass}`,
    `Exec=${execCommand}`,
    `Icon=${appLinuxIconName}`,
    "Terminal=false",
    "Categories=Development;Utility;",
    "",
  ].join("\n");

  try {
    fs.mkdirSync(applicationsDir, { recursive: true });
    fs.mkdirSync(iconThemeDir, { recursive: true });
    fs.copyFileSync(appIconPath, iconThemePath);

    let previous = "";

    try {
      previous = fs.readFileSync(desktopPath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    if (previous !== content) {
      fs.writeFileSync(desktopPath, content, "utf8");
    }
  } catch (error) {
    logGateway(`Could not install desktop entry for app identity: ${error.message}`);
  }
}

function emit(channel, payload) {
  mainWindow?.webContents.send(channel, payload);
}

function logGateway(message) {
  if (!message) {
    return;
  }

  emit("openui:gateway-log", {
    at: new Date().toISOString(),
    message,
  });
}

function logGatewayOutput(text) {
  const message = formatGatewayOutput(text);

  if (message) {
    logGateway(message);
  }
}

function logAuth(message) {
  if (!message) {
    return;
  }

  emit("openui:auth-log", {
    at: new Date().toISOString(),
    message,
  });
}

function runOpenClaw(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      openclawBin,
      ["--profile", "openui", ...args],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          OPENCLAW_PROFILE: "openui",
        },
        maxBuffer: options.maxBuffer ?? 1024 * 1024 * 12,
        timeout: options.timeout ?? 0,
      },
      (error, stdout, stderr) => {
        const result = {
          ok: !error,
          code: error?.code ?? 0,
          stdout,
          stderr,
        };

        if (error) {
          reject(Object.assign(error, result));
          return;
        }

        resolve(result);
      },
    );

    if (options.stdin) {
      child.stdin?.end(options.stdin);
    }
  });
}

function runOpenClawStreaming(args, options = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const openedUrls = new Set();
    let didTimeout = false;
    const command = options.forceTty ? buildPseudoTtyCommand(args) : undefined;

    if (options.forceTty && !command) {
      resolve({
        ok: false,
        message: "No pseudo-TTY helper found. Install util-linux `script` or use a terminal login.",
      });
      return;
    }

    const child = spawn(command?.bin ?? openclawBin, command?.args ?? ["--profile", "openui", ...args], {
      cwd: projectRoot,
      env: {
        ...process.env,
        COLUMNS: "120",
        FORCE_COLOR: "0",
        LINES: "40",
        NO_COLOR: "1",
        OPENCLAW_PROFILE: "openui",
        TERM: "xterm-256color",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    options.onStart?.(child);

    const timeout = options.timeout
      ? setTimeout(() => {
          didTimeout = true;
          terminateProcess(child);
        }, options.timeout)
      : undefined;

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      const cleanText = cleanTerminalOutput(text);
      stdout += text;
      options.onOutput?.(cleanText);
      openAuthUrls(cleanText, openedUrls);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      const cleanText = cleanTerminalOutput(text);
      stderr += text;
      options.onOutput?.(cleanText);
      openAuthUrls(cleanText, openedUrls);
    });

    child.once("error", (error) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      resolve({
        ok: false,
        code: error.code,
        stdout,
        stderr,
        message: error.message,
      });
    });

    child.once("exit", (code, signal) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      resolve({
        ok: code === 0,
        code: code ?? undefined,
        stdout,
        stderr,
        message:
          didTimeout
            ? "OpenClaw auth command timed out"
            : code === 0
            ? "OpenClaw auth command completed"
            : `OpenClaw auth command stopped (${signal ?? code ?? "unknown"})`,
      });
    });
  });
}

function terminateProcess(child) {
  if (!child || child.killed) {
    return;
  }

  child.kill("SIGTERM");

  setTimeout(() => {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }, 2000).unref();
}

function buildPseudoTtyCommand(args) {
  if (isWindows) {
    return undefined;
  }

  const scriptBin = findExecutable("script");

  if (!scriptBin) {
    return undefined;
  }

  const openclawCommand = [
    openclawBin,
    "--profile",
    "openui",
    ...args,
  ].map(shellQuote).join(" ");

  return {
    bin: scriptBin,
    args: ["-qfec", `stty cols 120 rows 40; ${openclawCommand}`, "/dev/null"],
  };
}

async function gatewayHealth(timeoutMs = 5000) {
  try {
    const result = await runOpenClaw(["gateway", "health", "--json", "--timeout", String(timeoutMs)], {
      timeout: timeoutMs + 1000,
    });

    gatewayState = {
      running: true,
      starting: false,
      ready: true,
      message: "Gateway ready",
      detail: parseJson(result.stdout) ?? result.stdout.trim(),
    };
  } catch (error) {
    const wasReady = gatewayState.ready;

    gatewayState = {
      running: wasReady || Boolean(gatewayProcess),
      starting: Boolean(gatewayProcess) && !wasReady,
      ready: wasReady,
      message: wasReady ? "Gateway ready" : gatewayProcess ? "Gateway starting" : "Gateway offline",
      detail: (error.stderr || error.stdout || error.message || "").trim(),
    };
  }

  return gatewayState;
}

async function getGatewayStatus() {
  if (gatewayState.ready) {
    return gatewayState;
  }

  if (gatewayProcess) {
    if (await areGatewayPortsOpen()) {
      markGatewayReady("Gateway ready");
    }

    return gatewayState;
  }

  return gatewayHealth();
}

async function startGateway() {
  if (gatewayStartPromise) {
    return gatewayStartPromise;
  }

  gatewayStartPromise = startGatewayInternal().finally(() => {
    gatewayStartPromise = undefined;
  });

  return gatewayStartPromise;
}

async function startGatewayInternal() {
  if (gatewayProcess) {
    return waitForGatewayReady();
  }

  if (await isTcpPortOpen("127.0.0.1", 18789, 300)) {
    const health = await gatewayHealth(8000);

    if (health.ready) {
      return health;
    }
  }

  gatewayState = {
    running: false,
    starting: true,
    ready: false,
    message: "Starting local OpenClaw gateway",
  };
  emit("openui:gateway-status", gatewayState);

  gatewayProcess = spawn(
    openclawBin,
    [
      "--profile",
      "openui",
      "gateway",
      "run",
      "--port",
      "18789",
      "--bind",
      "loopback",
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        OPENCLAW_PROFILE: "openui",
        NO_COLOR: "1",
        FORCE_COLOR: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  gatewayProcess.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    noteGatewayReady(text);
    logGatewayOutput(text);
  });

  gatewayProcess.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    noteGatewayReady(text);
    logGatewayOutput(text);
  });

  gatewayProcess.once("exit", (code, signal) => {
    gatewayProcess = undefined;
    gatewayState = {
      running: false,
      starting: false,
      ready: false,
      message: `Gateway stopped (${signal ?? code ?? "unknown"})`,
    };
    emit("openui:gateway-status", gatewayState);
  });

  return waitForGatewayReady();
}

async function stopGateway() {
  if (!gatewayProcess) {
    return { running: false, starting: false, message: "Gateway not owned by this app" };
  }

  gatewayProcess.kill("SIGTERM");
  gatewayProcess = undefined;
  await wait(250);
  gatewayState = {
    running: false,
    starting: false,
    ready: false,
    message: "Gateway stopped",
  };
  emit("openui:gateway-status", gatewayState);
  return gatewayState;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractOpenClawReplyText(value) {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  if (Array.isArray(value)) {
    const parts = value.map(extractOpenClawReplyText).filter(Boolean);
    return parts.length > 0 ? parts.join("\n\n") : undefined;
  }

  const record = value;

  if (Array.isArray(record.outputs)) {
    const outputText = record.outputs
      .map((item) => extractOpenClawReplyText(item))
      .filter(Boolean)
      .join("\n\n");

    if (outputText) {
      return outputText;
    }
  }

  for (const key of [
    "replyText",
    "reply",
    "answer",
    "final",
    "response",
    "message",
    "text",
    "content",
    "output",
    "result",
  ]) {
    const text = extractOpenClawReplyText(record[key]);

    if (text) {
      return text;
    }
  }

  return undefined;
}

function attachReplyText(data, replyText) {
  if (!replyText) {
    return data;
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    return {
      ...data,
      replyText,
    };
  }

  return {
    raw: data,
    replyText,
  };
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForGatewayReady(maxWaitMs = 30000) {
  const started = Date.now();
  let last = gatewayState;

  while (Date.now() - started < maxWaitMs) {
    if (gatewayState.ready) {
      last = gatewayState;
      emit("openui:gateway-status", last);
      return last;
    }

    if (await areGatewayPortsOpen()) {
      markGatewayReady("Gateway ready");
      return gatewayState;
    }

    emit("openui:gateway-status", {
      ...gatewayState,
      running: Boolean(gatewayProcess),
      starting: Boolean(gatewayProcess),
      ready: false,
      message: gatewayProcess ? "Gateway starting" : gatewayState.message,
    });
    await wait(750);
  }

  return gatewayState;
}

function noteGatewayReady(text) {
  if (!/(?:\[gateway\]\s+)?gateway\s+ready\b/i.test(text)) {
    return;
  }

  markGatewayReady("Gateway ready");
}

function markGatewayReady(message) {
  gatewayState = {
    ...gatewayState,
    running: true,
    starting: false,
    ready: true,
    message,
  };
  emit("openui:gateway-status", gatewayState);
}

async function areGatewayPortsOpen() {
  const [gatewayPort, browserPort] = await Promise.all([
    isTcpPortOpen("127.0.0.1", 18789, 250),
    isTcpPortOpen("127.0.0.1", 18791, 250),
  ]);

  return gatewayPort && browserPort;
}

function isTcpPortOpen(host, port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function openAuthUrls(text, openedUrls) {
  const urls = text.match(/https?:\/\/[^\s"'<>]+/g) ?? [];

  for (const rawUrl of urls) {
    const url = rawUrl.replace(/[),.;]+$/, "");

    if (!openedUrls.has(url)) {
      openedUrls.add(url);
      logAuth(`Login URL: ${url}`);
      shell
        .openExternal(url)
        .then(() => {
          logAuth("Opened browser login URL");
        })
        .catch((error) => {
          const xdgOpen = findExecutable("xdg-open");

          if (xdgOpen) {
            spawn(xdgOpen, [url], {
              cwd: projectRoot,
              detached: true,
              stdio: "ignore",
            }).unref();
            logAuth("Opened browser login URL with xdg-open");
            return;
          }

          logAuth(`Failed to open browser URL: ${error.message}`);
        });
    }
  }
}

function formatAuthOutput(text) {
  const lines = text
    .split(/\n/)
    .map((line) =>
      line
        .replace(/^[\s│├╰╮╯─◇◒◐◓◑]+/, "")
        .replace(/[\s│├╰╮╯─]+$/, "")
        .trim(),
    )
    .filter(Boolean);
  const useful = [];
  let sawWaiting = false;

  for (const line of lines) {
    if (/^Waiting for device authorization/i.test(line)) {
      sawWaiting = true;
      continue;
    }

    if (
      /^(OpenAI Codex device code|Open this URL|URL:|Code:|Code expires|Open:|Open manually:|OpenAI device code|Trouble with device code|OAuth help)/i.test(
        line,
      )
    ) {
      useful.push(line);
    }
  }

  if (useful.length > 0) {
    return useful.join("\n").slice(0, 1600);
  }

  if (sawWaiting) {
    return "Waiting for device authorization...";
  }

  return "";
}

function formatGatewayOutput(text) {
  const lines = cleanTerminalOutput(text)
    .split(/\n/)
    .map((line) => line.replace(/^\d{4}-\d{2}-\d{2}T[^\s]+\s+/, "").trim())
    .filter(Boolean);
  const visible = [];

  for (const line of lines) {
    if (line.includes("used external cli oauth bootstrap because local oauth was missing or unusable")) {
      if (!didLogExternalCliOauthBootstrap) {
        didLogExternalCliOauthBootstrap = true;
        visible.push("OpenAI/Codex OAuth loaded through CLI bootstrap; login is still stored locally.");
      }

      continue;
    }

    visible.push(line);
  }

  return visible.join("\n").slice(0, 4000);
}

function cleanTerminalOutput(text) {
  return stripAnsi(text)
    .replace(/\r/g, "\n")
    .replace(/\u0008/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripAnsi(text) {
  return text
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(/\u001B[@-Z\\-_]|\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

function findExecutable(name) {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) {
      continue;
    }

    const candidate = path.join(dir, name);

    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Keep searching PATH.
    }
  }

  return undefined;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function desktopExecQuote(value) {
  return `"${String(value).replace(/["\\`$]/g, "\\$&")}"`;
}

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    const envPath = path.join(projectRoot, file);
    let content;

    try {
      content = fs.readFileSync(envPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }

      throw error;
    }

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      const equals = line.indexOf("=");

      if (equals === -1) {
        continue;
      }

      const key = line.slice(0, equals).trim();
      const value = line.slice(equals + 1).trim();

      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && process.env[key] === undefined) {
        process.env[key] = unquoteEnvValue(value);
      }
    }
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const quote = value[0];
    const inner = value.slice(1, -1);

    if (quote === '"') {
      return inner.replace(/\\(["\\nrt])/g, (_match, escaped) => {
        switch (escaped) {
          case "n":
            return "\n";
          case "r":
            return "\r";
          case "t":
            return "\t";
          default:
            return escaped;
        }
      });
    }

    return inner;
  }

  return value.replace(/\s+#.*$/, "");
}

ipcMain.handle("openui:window-action", (_event, action) => {
  if (!mainWindow) {
    return undefined;
  }

  if (action === "close") {
    mainWindow.close();
  }

  if (action === "minimize") {
    mainWindow.minimize();
  }

  if (action === "toggle-fullscreen") {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }

  return undefined;
});

ipcMain.handle("openui:gateway-start", () => startGateway());
ipcMain.handle("openui:gateway-stop", () => stopGateway());
ipcMain.handle("openui:gateway-status", () => getGatewayStatus());

ipcMain.handle("openui:models-status", async () => {
  try {
    const result = await runOpenClaw(["models", "status", "--json"], { timeout: 8000 });
    return {
      ok: true,
      data: parseJson(result.stdout),
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    return {
      ok: false,
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr,
      message: error.message,
    };
  }
});

ipcMain.handle("openui:kernel-ping", async () => {
  const started = Date.now();

  try {
    const gateway = await startGateway();
    const portsReady = await areGatewayPortsOpen();
    const durationMs = Date.now() - started;

    return {
      ok: Boolean(gateway.ready || portsReady),
      data: {
        durationMs,
        gateway,
        portsReady,
      },
      message: `Core ping ${durationMs}ms`,
    };
  } catch (error) {
    return {
      ok: false,
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr,
      message: error.message,
    };
  }
});

ipcMain.handle("openui:auth-login-openai", async () => {
  if (authLoginProcess) {
    return {
      ok: false,
      message: "OpenAI web login is already running",
    };
  }

  const runId = ++authLoginRunId;
  logAuth("Starting OpenAI/Codex device-code login");

  let lastAuthMessage = "";

  const result = await runOpenClawStreaming(
    ["models", "auth", "login", "--provider", "openai-codex", "--method", "device-code"],
    {
      forceTty: true,
      timeout: 10 * 60 * 1000,
      onStart(child) {
        authLoginProcess = child;
      },
      onOutput(text) {
        const message = formatAuthOutput(text);

        if (message && message !== lastAuthMessage) {
          lastAuthMessage = message;
          logAuth(message);
        }
      },
    },
  );

  if (authLoginRunId === runId) {
    authLoginProcess = undefined;
  }

  if (result.ok) {
    logAuth("OpenAI/Codex login completed. Restarting local gateway.");

    if (gatewayProcess) {
      await stopGateway();
    }

    await startGateway().catch((error) => {
      logGateway(error.message);
    });
  } else {
    logAuth(result.message ?? "OpenAI/Codex login failed");
  }

  return result;
});

ipcMain.handle("openui:auth-cancel", () => {
  if (!authLoginProcess) {
    return {
      ok: true,
      message: "No OpenAI/Codex login is running",
    };
  }

  authLoginRunId += 1;
  terminateProcess(authLoginProcess);
  authLoginProcess = undefined;
  logAuth("OpenAI/Codex login cancelled. You can retry now.");

  return {
    ok: true,
    message: "OpenAI/Codex login cancelled",
  };
});

ipcMain.handle("openui:agent-send", async (_event, message) => {
  const body = String(message ?? "").trim();

  if (!body) {
    return {
      ok: false,
      message: "Message is empty",
    };
  }

  const gateway = await startGateway();

  if (!gateway.ready) {
    return {
      ok: false,
      message: gateway.message || "Gateway did not become ready in time.",
      data: gateway,
    };
  }

  try {
    const result = await runAgentOnce(body);
    const data = parseJson(result.stdout);
    const replyText = extractOpenClawReplyText(data);

    return {
      ok: true,
      data: attachReplyText(data, replyText),
      stdout: result.stdout,
      stderr: result.stderr,
      message: replyText,
    };
  } catch (error) {
    if (isGatewayConnectError(error)) {
      logGateway("Gateway connection closed during request; waiting for readiness and retrying once.");
      const retryGateway = await waitForGatewayReady(30000);

      if (retryGateway.ready) {
        try {
          const result = await runAgentOnce(body);
          const data = parseJson(result.stdout);
          const replyText = extractOpenClawReplyText(data);

          return {
            ok: true,
            data: attachReplyText(data, replyText),
            stdout: result.stdout,
            stderr: result.stderr,
            message: replyText,
          };
        } catch (retryError) {
          error = retryError;
        }
      }
    }

    return {
      ok: false,
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr,
      message: error.message,
    };
  }
});

function runAgentOnce(body) {
  const args = ["infer", "model", "run", "--gateway", "--prompt", body, "--json"];

  if (openuiModelId) {
    args.splice(3, 0, "--model", openuiModelId);
  }

  return runOpenClaw(args, { timeout: 180000 });
}

function isGatewayConnectError(error) {
  const text = [
    error?.message,
    error?.stdout,
    error?.stderr,
  ].filter(Boolean).join("\n");

  return /gateway (?:connect failed|closed)|handshake timeout|closed before connect/i.test(text);
}

app.whenReady().then(() => {
  createWindow();
  startGateway().catch((error) => {
    logGateway(error.message);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  if (authLoginProcess) {
    terminateProcess(authLoginProcess);
    authLoginProcess = undefined;
  }

  if (gatewayProcess) {
    gatewayProcess.kill("SIGTERM");
    gatewayProcess = undefined;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
