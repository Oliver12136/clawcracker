const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openuiDesktop", {
  windowAction(action) {
    return ipcRenderer.invoke("openui:window-action", action);
  },
  gateway: {
    start() {
      return ipcRenderer.invoke("openui:gateway-start");
    },
    stop() {
      return ipcRenderer.invoke("openui:gateway-stop");
    },
    status() {
      return ipcRenderer.invoke("openui:gateway-status");
    },
    onLog(callback) {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("openui:gateway-log", listener);
      return () => ipcRenderer.off("openui:gateway-log", listener);
    },
    onStatus(callback) {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("openui:gateway-status", listener);
      return () => ipcRenderer.off("openui:gateway-status", listener);
    },
  },
  modelsStatus() {
    return ipcRenderer.invoke("openui:models-status");
  },
  auth: {
    loginOpenAI() {
      return ipcRenderer.invoke("openui:auth-login-openai");
    },
    cancel() {
      return ipcRenderer.invoke("openui:auth-cancel");
    },
    onLog(callback) {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("openui:auth-log", listener);
      return () => ipcRenderer.off("openui:auth-log", listener);
    },
  },
  sendAgent(message) {
    return ipcRenderer.invoke("openui:agent-send", message);
  },
});
