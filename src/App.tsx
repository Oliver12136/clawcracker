import { FormEvent, useEffect, useRef, useState } from "react";
import bottomGrid from "./assets/figma/bottom-grid.svg";
import helpButton from "./assets/figma/help-button.svg";
import resizeCorner from "./assets/figma/resize-corner.svg";

type DebugEntry = {
  at: string;
  message: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  body: string;
  state: "pending" | "done" | "error";
};

type AuthState = "idle" | "running" | "failed" | "completed" | "cancelled";

function App() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"home" | "chat">("home");
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [gateway, setGateway] = useState<GatewayState>({
    running: false,
    starting: true,
    message: "Starting desktop bridge",
  });
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  const [lastResult, setLastResult] = useState<OpenUiResult | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [modelStatus, setModelStatus] = useState<OpenUiResult | null>(null);
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [authMessage, setAuthMessage] = useState("Ready to sign in");
  const [authUrl, setAuthUrl] = useState("");
  const [authDeviceCode, setAuthDeviceCode] = useState("");
  const authAttemptRef = useRef(0);

  useEffect(() => {
    const desktop = window.openuiDesktop;

    if (!desktop) {
      setGateway({
        running: false,
        starting: false,
        message: "Desktop bridge unavailable. Run npm run app:dev.",
      });
      return;
    }

    const removeLogListener = desktop.gateway.onLog((payload) => {
      appendDebug(payload.message, payload.at);
    });
    const removeStatusListener = desktop.gateway.onStatus((payload) => {
      setGateway(payload);
      appendDebug(payload.message);
    });
    const removeAuthLogListener = desktop.auth.onLog((payload) => {
      appendDebug(payload.message, payload.at);
      captureAuthHint(payload.message);
    });

    desktop.gateway
      .start()
      .then((payload) => {
        setGateway(payload);
        appendDebug(payload.message);
      })
      .catch((error: Error) => {
        setGateway({
          running: false,
          starting: false,
          message: error.message,
        });
        appendDebug(error.message);
      });

    const gatewayPoll = window.setInterval(() => {
      desktop.gateway
        .status()
        .then((payload) => {
          setGateway(payload);
        })
        .catch((error: Error) => {
          appendDebug(error.message);
        });
    }, 1500);

    refreshModelStatus(desktop);

    return () => {
      window.clearInterval(gatewayPoll);
      removeLogListener();
      removeStatusListener();
      removeAuthLogListener();
    };
  }, []);

  function appendDebug(message: string, at = new Date().toISOString()) {
    if (!message) {
      return;
    }

    setEntries((current) => [...current.slice(-16), { at, message }]);
  }

  async function refreshModelStatus(desktop = window.openuiDesktop) {
    if (!desktop) {
      return;
    }

    const result = await desktop.modelsStatus();
    setModelStatus(result);
    appendDebug(`Models status: ${modelStatusLabel(result)}`);
  }

  async function startOpenAiLogin() {
    const desktop = window.openuiDesktop;

    if (!desktop || authState === "running") {
      return;
    }

    const attemptId = authAttemptRef.current + 1;
    authAttemptRef.current = attemptId;
    setAuthState("running");
    setAuthMessage("Waiting for browser device authorization");
    setAuthUrl("");
    setAuthDeviceCode("");
    setIsDebugOpen(true);
    setLastResult(null);
    appendDebug("Starting OpenAI/Codex device-code login");

    try {
      const result = await desktop.auth.loginOpenAI();

      if (authAttemptRef.current !== attemptId) {
        return;
      }

      setLastResult(result);
      setAuthState(result.ok ? "completed" : "failed");
      setAuthMessage(result.ok ? "Login completed" : result.message ?? "Login failed");
      appendDebug(result.ok ? "OpenAI/Codex login completed" : result.message ?? "Login failed");
      await refreshModelStatus(desktop);
    } catch (error) {
      if (authAttemptRef.current !== attemptId) {
        return;
      }

      const result = {
        ok: false,
        message: error instanceof Error ? error.message : "OpenAI/Codex login failed.",
      };
      setLastResult(result);
      setAuthState("failed");
      setAuthMessage(result.message);
      appendDebug(result.message);
    }
  }

  async function cancelOpenAiLogin() {
    const desktop = window.openuiDesktop;

    if (!desktop || authState !== "running") {
      return;
    }

    authAttemptRef.current += 1;
    const result = await desktop.auth.cancel();
    setLastResult(result);
    setAuthState("cancelled");
    setAuthMessage(result.message ?? "Login cancelled");
    appendDebug(result.message ?? "Login cancelled");
    await refreshModelStatus(desktop);
  }

  function captureAuthHint(message: string) {
    const urlMatch =
      message.match(/(?:URL|Open(?: manually)?|Open this URL):\s*(https?:\/\/[^\s"'<>]+)/i) ??
      message.match(/https?:\/\/[^\s"'<>]+/);
    const rawUrl = urlMatch?.[1] ?? urlMatch?.[0];

    if (rawUrl) {
      setAuthUrl(rawUrl.replace(/[),.;]+$/, ""));
    }

    const codeMatch = message.match(/(?:Code|device code):\s*([A-Z0-9][A-Z0-9 -]{4,}[A-Z0-9])/i);

    if (codeMatch) {
      setAuthDeviceCode(codeMatch[1].replace(/\s+/g, " ").trim());
    }
  }

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = prompt.trim();

    if (!body || !window.openuiDesktop) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      body,
      state: "done",
    };
    const assistantMessageId = createId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      body: "OpenClaw is thinking...",
      state: "pending",
    };

    setMode("chat");
    setPrompt("");
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setIsSending(true);
    setLastResult(null);
    appendDebug(`Agent request: ${body}`);

    let result: OpenUiResult;

    try {
      result = await window.openuiDesktop.sendAgent(body);
    } catch (error) {
      result = {
        ok: false,
        message: error instanceof Error ? error.message : "Desktop bridge request failed.",
      };
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === assistantMessageId
          ? {
              ...message,
              body: result.ok
                ? extractAgentText(result)
                : result.message ?? result.stderr ?? "OpenClaw request failed.",
              state: result.ok ? "done" : "error",
            }
          : message,
      ),
    );
    setLastResult(result);
    setIsSending(false);
    appendDebug(result.ok ? "Agent response received" : result.message ?? "Agent request failed");
  }

  function windowAction(action: "close" | "minimize" | "toggle-fullscreen") {
    window.openuiDesktop?.windowAction(action);
  }

  const modelSummary = getModelSummary(modelStatus);

  return (
    <main className="figma-stage">
      <section
        aria-label={mode === "home" ? "ClawCracker first screen" : "ClawCracker chat layer"}
        className="wireframe"
        data-name="Wireframe - 6"
        data-node-id={mode === "home" ? "36:6797" : "38:8596"}
      >
        <header className="wireframe-header" data-name="header" data-node-id="36:6798">
          <div
            className="system-buttons"
            data-name="system buttonn"
            data-node-id="36:6799"
          >
            <button
              aria-label="Close window"
              className="traffic-light close"
              data-name="Close"
              data-node-id="36:6800"
              onClick={() => windowAction("close")}
              type="button"
            />
            <button
              aria-label="Minimize window"
              className="traffic-light minimize"
              data-name="Minimize"
              data-node-id="36:6801"
              onClick={() => windowAction("minimize")}
              type="button"
            />
            <button
              aria-label="Toggle fullscreen"
              className="traffic-light fullscreen"
              data-name="Fullscreen"
              data-node-id="36:6802"
              onClick={() => windowAction("toggle-fullscreen")}
              type="button"
            />
          </div>

          <p className="window-title" data-name="ClawCracker" data-node-id="36:6803">
            ClawCracker
          </p>

          <button
            aria-label="Toggle debug panel"
            className="help-button"
            data-name="Help button"
            data-node-id="36:6804"
            onClick={() => setIsDebugOpen((value) => !value)}
            type="button"
          >
            <img alt="" src={helpButton} />
          </button>
        </header>

        {mode === "home" ? (
          <section className="prompt-group" data-name="Frame 2" data-node-id="36:6806">
            <h1 data-name="What should we do?" data-node-id="36:6807">
              What should we do?
            </h1>

            <PromptForm
              autoFocus
              isSending={isSending}
              nodeId="36:6808"
              onChange={setPrompt}
              onSubmit={submitPrompt}
              value={prompt}
            />
          </section>
        ) : (
          <section className="chat-layer" data-name="Chat layer" data-node-id="38:8596">
            <div className="chat-scroll" role="log" aria-live="polite">
              {messages.map((message) => (
                <ChatMessageFrame message={message} key={message.id} />
              ))}
            </div>

            <PromptForm
              isSending={isSending}
              nodeId="38:8596-composer"
              onChange={setPrompt}
              onSubmit={submitPrompt}
              value={prompt}
              variant="chat"
            />
          </section>
        )}

        <aside className={`debug-drawer ${isDebugOpen ? "open" : ""}`} aria-live="polite">
          <div className="debug-header">
            <span className={gateway.running ? "online" : "offline"} />
            <strong>{gateway.message}</strong>
            <button onClick={() => setIsDebugOpen(false)} type="button">
              close
            </button>
          </div>
          <div className="model-card">
            <div>
              <span>Model</span>
              <strong>{modelSummary.model}</strong>
              <p className={modelSummary.missingAuth ? "auth-missing" : "auth-ready"}>
                {modelSummary.auth}
              </p>
              <p className={`auth-state ${authState}`}>{authMessage}</p>
            </div>
            <div className="model-actions">
              <button disabled={authState === "running"} onClick={startOpenAiLogin} type="button">
                {authState === "failed" || authState === "cancelled" ? "retry login" : "browser login"}
              </button>
              <button
                className="secondary-action"
                disabled={authState !== "running"}
                onClick={cancelOpenAiLogin}
                type="button"
              >
                cancel
              </button>
              <button onClick={() => refreshModelStatus()} type="button">
                refresh
              </button>
            </div>
            {authUrl || authDeviceCode ? (
              <div className="auth-device-card">
                {authDeviceCode ? (
                  <p>
                    <span>9 digit device code</span>
                    <strong>{authDeviceCode}</strong>
                  </p>
                ) : null}
                {authUrl ? (
                  <p>
                    <span>login url</span>
                    <strong className="auth-url">{authUrl}</strong>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          {lastResult ? (
            <pre className={lastResult.ok ? "result ok" : "result error"}>
              {formatResult(lastResult)}
            </pre>
          ) : null}
          <div className="debug-log">
            {entries.map((entry, index) => (
              <p key={`${entry.at}-${index}`}>
                <time>{new Date(entry.at).toLocaleTimeString()}</time>
                {entry.message}
              </p>
            ))}
          </div>
        </aside>

        <img
          alt=""
          aria-hidden="true"
          className="bottom-grid"
          data-name="Group 1"
          data-node-id="38:8595"
          src={bottomGrid}
        />

        <div aria-hidden="true" className="resize-corner" data-node-id="36:7776">
          <img alt="" src={resizeCorner} />
        </div>
      </section>
    </main>
  );
}

function ChatMessageFrame({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const rowNodeId = isUser ? "38:8664" : "38:8663";
  const frameNodeId = isUser ? "38:8666" : "38:8605";
  const boxNodeId = isUser ? "38:8667" : "38:8607";
  const contentNodeId = isUser ? "38:8668" : "38:8608";
  const textNodeId = isUser ? "38:8669" : "38:8611";
  const markerNodeId = isUser ? "38:8665" : "38:8660";

  return (
    <article
      className={`chat-row ${message.role} ${message.state}`}
      data-name={isUser ? "Frame 7" : "Frame 6"}
      data-node-id={rowNodeId}
    >
      {!isUser ? <ChatMarker role="assistant" nodeId={markerNodeId} /> : null}
      <div className="chat-message-frame" data-name="Frame 2" data-node-id={frameNodeId}>
        <div className="chat-message-box" data-name="Frame 1" data-node-id={boxNodeId}>
          <div className="chat-message-content" data-name="Frame 3" data-node-id={contentNodeId}>
            <p className="chat-message-text" data-node-id={textNodeId} title={message.body}>
              {message.body}
            </p>
          </div>
        </div>
      </div>
      {isUser ? <ChatMarker role="user" nodeId={markerNodeId} /> : null}
    </article>
  );
}

function ChatMarker({ nodeId, role }: { nodeId: string; role: "assistant" | "user" }) {
  if (role === "assistant") {
    return (
      <div className="chat-marker-frame assistant">
        <span
          aria-hidden="true"
          className="chat-marker assistant"
          data-name="Fullscreen"
          data-node-id={nodeId}
        />
      </div>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="chat-marker user"
      data-name="Fullscreen"
      data-node-id={nodeId}
    />
  );
}

type PromptFormProps = {
  autoFocus?: boolean;
  isSending: boolean;
  nodeId: string;
  onChange(value: string): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  value: string;
  variant?: "home" | "chat";
};

function PromptForm({
  autoFocus = false,
  isSending,
  nodeId,
  onChange,
  onSubmit,
  value,
  variant = "home",
}: PromptFormProps) {
  return (
    <form
      className={`prompt-box ${variant === "chat" ? "chat-composer" : ""}`}
      data-name="Frame 1"
      data-node-id={nodeId}
      onSubmit={onSubmit}
    >
      <div
        className="prompt-content"
        data-name="Frame 3"
        data-node-id={variant === "chat" ? "39:4" : "36:6809"}
      >
        {variant === "home" ? (
          <div className="diamond-frame" data-name="Frame 4" data-node-id="36:6810">
            <span
              aria-hidden="true"
              className="prompt-diamond"
              data-name="Fullscreen"
              data-node-id="36:6811"
            />
          </div>
        ) : null}
        <input
          aria-label="OpenClaw prompt"
          autoFocus={autoFocus}
          data-name="type, paste a link, drop a file or type/record to record"
          data-node-id={variant === "chat" ? "39:7" : "36:6812"}
          disabled={isSending}
          onChange={(event) => onChange(event.target.value)}
          placeholder="type, paste a link, drop a file or type/record to record"
          type="text"
          value={value}
        />
      </div>
    </form>
  );
}

function formatResult(result: OpenUiResult) {
  if (result.data !== undefined) {
    return JSON.stringify(result.data, null, 2);
  }

  return [result.stdout, result.stderr, result.message].filter(Boolean).join("\n").trim();
}

function extractAgentText(result: OpenUiResult) {
  const directText = findText(result.data);

  if (directText) {
    return directText;
  }

  return formatResult(result) || "OpenClaw completed without text output.";
}

function findText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  for (const key of [
    "replyText",
    "outputs",
    "reply",
    "answer",
    "final",
    "message",
    "response",
    "result",
    "output",
    "text",
    "content",
  ]) {
    const text = findText(record[key]);

    if (text) {
      return text;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = findText(item);

      if (text) {
        return text;
      }
    }
  }

  return undefined;
}

function modelStatusLabel(result: OpenUiResult) {
  if (!result.ok) {
    return result.message ?? "not configured";
  }

  const summary = getModelSummary(result);
  return `${summary.model} / ${summary.auth}`;
}

function getModelSummary(result: OpenUiResult | null) {
  const data = asRecord(result?.data);
  const model = readString(data?.defaultModel) ?? readString(data?.resolvedDefault) ?? "unknown";
  const auth = asRecord(data?.auth);
  const missingProviders = readStringArray(auth?.missingProvidersInUse);
  const unusableProfiles = readRecordArray(auth?.unusableProfiles);
  const providers = Array.isArray(auth?.providers) ? auth.providers : [];
  const missingAuth = missingProviders.length > 0;

  if (!result) {
    return {
      auth: "checking auth",
      missingAuth: false,
      model: "checking",
    };
  }

  if (!result.ok) {
    return {
      auth: result.message ?? "model status unavailable",
      missingAuth: false,
      model,
    };
  }

  if (missingAuth) {
    return {
      auth: `${missingProviders.join(", ")} auth missing`,
      missingAuth,
      model,
    };
  }

  if (unusableProfiles.length > 0) {
    const cooldownMs = readNumber(unusableProfiles[0]?.remainingMs);
    const cooldown = cooldownMs ? ` cooldown ${Math.ceil(cooldownMs / 1000)}s` : "";

    return {
      auth: `auth needs attention${cooldown}`,
      missingAuth: true,
      model,
    };
  }

  return {
    auth: providers.length > 0 ? "auth ready" : "auth ready",
    missingAuth,
    model,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)));
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export default App;
