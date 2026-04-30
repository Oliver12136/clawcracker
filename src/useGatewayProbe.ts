import { useEffect, useState } from "react";

type GatewayState = "checking" | "reachable" | "offline";

type GatewayProbe = {
  state: GatewayState;
  label: string;
  detail: string;
};

const gatewayUrl =
  import.meta.env.VITE_OPENCLAW_GATEWAY_WS_URL ?? "ws://127.0.0.1:18789";

export function useGatewayProbe(): GatewayProbe {
  const [probe, setProbe] = useState<GatewayProbe>({
    state: "checking",
    label: "Checking gateway",
    detail: gatewayUrl,
  });

  useEffect(() => {
    const socket = new WebSocket(gatewayUrl);
    const timeout = window.setTimeout(() => {
      setProbe({
        state: "offline",
        label: "Gateway not running",
        detail: "Start it with npm run openclaw:gateway",
      });
      socket.close();
    }, 1600);

    socket.addEventListener("open", () => {
      window.clearTimeout(timeout);
      setProbe({
        state: "reachable",
        label: "Gateway reachable",
        detail: gatewayUrl,
      });
      socket.close();
    });

    socket.addEventListener("error", () => {
      window.clearTimeout(timeout);
      setProbe({
        state: "offline",
        label: "Gateway offline",
        detail: "Start it with npm run openclaw:gateway",
      });
    });

    return () => {
      window.clearTimeout(timeout);
      socket.close();
    };
  }, []);

  return probe;
}
