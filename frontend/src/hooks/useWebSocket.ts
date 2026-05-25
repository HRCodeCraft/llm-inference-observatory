import { useEffect, useRef, useCallback } from "react";

interface UseWebSocketOptions {
  url: string;
  onMessage: (data: string) => void;
  enabled?: boolean;
}

const TAG = "[InferIQ:WS]";

export function useWebSocket({ url, onMessage, enabled = true }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const attemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;

    attemptsRef.current += 1;
    console.log(TAG, `Connecting: url=${url} attempt=${attemptsRef.current}`);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(TAG, `Connected: url=${url}`);
        attemptsRef.current = 0;
      };

      ws.onmessage = (e) => {
        console.log(TAG, `Message received: ${e.data.slice(0, 80)}${e.data.length > 80 ? "…" : ""}`);
        onMessage(e.data);
      };

      ws.onclose = (e) => {
        console.warn(TAG, `Disconnected: code=${e.code} reason="${e.reason || "none"}" — reconnecting in 3s`);
        if (mountedRef.current && enabled) {
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (e) => {
        console.error(TAG, `WebSocket error — closing: url=${url}`, e);
        ws.close();
      };
    } catch (err) {
      console.error(TAG, `Failed to create WebSocket: url=${url} error=${err} — retrying in 3s`);
      if (mountedRef.current && enabled) {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    }
  }, [url, onMessage, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        console.log(TAG, `Closing WebSocket on unmount: url=${url}`);
        wsRef.current.close();
      }
    };
  }, [connect, enabled, url]);
}
