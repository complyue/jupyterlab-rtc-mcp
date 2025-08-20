import { WebsocketProvider } from "y-websocket";
import { cookieManager } from "./cookie-manager.js";

import WebSocket from "ws";

class CookieWS extends WebSocket {
  constructor(url: string | URL, options?: WebSocket.ClientOptions) {
    const sessionHeaders = cookieManager.sessionHeaders();
    super(url, {
      ...options,
      headers: {
        ...sessionHeaders,
      },
    });
  }
}

/**
 * Custom WebsocketProvider that can inject cookies into the WebSocket connection
 */
export class CookieWebsocketProvider extends WebsocketProvider {
  constructor(
    serverUrl: string,
    roomname: string,
    doc: unknown,
    opts: {
      connect?: boolean;
      awareness?: unknown;
      params?: Record<string, string>;
      protocols?: string[];
      resyncInterval?: number;
      maxBackoffTime?: number;
      disableBc?: boolean;
    } = {},
  ) {
    super(serverUrl, roomname, doc as any, {
      ...(opts as any),
      WebSocketPolyfill: CookieWS as any,
    });
  }
}
