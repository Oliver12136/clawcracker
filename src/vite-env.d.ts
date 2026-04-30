/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENCLAW_GATEWAY_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type GatewayState = {
  running: boolean;
  starting: boolean;
  ready?: boolean;
  message: string;
  detail?: unknown;
};

type GatewayLog = {
  at: string;
  message: string;
};

type OpenUiResult = {
  ok: boolean;
  code?: number;
  data?: unknown;
  stdout?: string;
  stderr?: string;
  message?: string;
};

interface Window {
  openuiDesktop?: {
    windowAction(action: "close" | "minimize" | "toggle-fullscreen"): Promise<void>;
    gateway: {
      start(): Promise<GatewayState>;
      stop(): Promise<GatewayState>;
      status(): Promise<GatewayState>;
      onLog(callback: (payload: GatewayLog) => void): () => void;
      onStatus(callback: (payload: GatewayState) => void): () => void;
    };
    modelsStatus(): Promise<OpenUiResult>;
    auth: {
      loginOpenAI(): Promise<OpenUiResult>;
      cancel(): Promise<OpenUiResult>;
      onLog(callback: (payload: GatewayLog) => void): () => void;
    };
    sendAgent(message: string): Promise<OpenUiResult>;
  };
}
