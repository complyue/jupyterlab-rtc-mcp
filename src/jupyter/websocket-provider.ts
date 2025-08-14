import { WebsocketProvider } from "y-websocket";
import { cookieManager } from "./cookie-manager.js";
import { logger } from "../utils/logger.js";

import WebSocket from "ws";

class CookieWS extends WebSocket {
  constructor(url: string | URL, options?: WebSocket.ClientOptions) {
    const cookieHeader = cookieManager.getCookieHeader();
    // logger.debug(`WS using cookie:\n  ${cookieHeader}`);
    super(url, {
      ...options,
      headers: {
        Cookie: cookieHeader,
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
    doc: any,
    opts: {
      connect?: boolean;
      awareness?: any;
      params?: Record<string, string>;
      protocols?: string[];
      resyncInterval?: number;
      maxBackoffTime?: number;
      disableBc?: boolean;
    } = {},
  ) {
    super(serverUrl, roomname, doc, {
      ...opts,
      WebSocketPolyfill: CookieWS as any,
    });
  }
}
