import { URLExt } from "@jupyterlab/coreutils";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { cookieManager } from "./cookie-manager.js";

export interface ISessionModel {
  format: string;
  type: string;
  fileId: string;
  sessionId: string;
}

/**
 * WebSocket client for JupyterLab RTC
 *
 * This class handles the WebSocket connection to JupyterLab's
 * real-time collaboration server and manages Yjs document synchronization.
 */
export class JupyterLabWebSocketClient {
  private baseUrl: string;
  private token: string | undefined;
  private cookieManager: typeof cookieManager;
  private document: Y.Doc | null;
  private provider: WebsocketProvider | null;
  private connected: boolean;
  private session: ISessionModel | null;
  private reconnectAttempts: number;
  private maxReconnectAttempts: number;

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl =
      baseUrl || process.env.JUPYTERLAB_URL || "http://localhost:8888";
    this.token = token || process.env.JUPYTERLAB_TOKEN;
    this.cookieManager = cookieManager;
    this.document = null;
    this.provider = null;
    this.connected = false;
    this.session = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  /**
   * Connect to a JupyterLab document session
   * @param session Session model for the document
   * @returns Promise that resolves when connected
   */
  async connect(session: ISessionModel): Promise<void> {
    return new Promise((resolve, reject) => {
      this.session = session;

      const wsUrl = URLExt.join(
        this.baseUrl.replace(/^http/, "ws"),
        "api/collaboration/room",
        `${session.format}:${session.type}:${session.fileId}`,
      );

      const wsUrlWithParams = new URL(wsUrl);
      wsUrlWithParams.searchParams.append("sessionId", session.sessionId);

      // Add token if provided
      if (this.token) {
        wsUrlWithParams.searchParams.append("token", this.token);
      }

      // Add cookies if available
      if (this.cookieManager.hasCookies()) {
        const cookieHeader = this.cookieManager.getCookieHeader();
        // For WebSocket connections, we need to pass cookies as a query parameter
        // since WebSocket API doesn't support custom headers directly
        wsUrlWithParams.searchParams.append(
          "cookies",
          encodeURIComponent(cookieHeader),
        );
        console.error(`[DEBUG] Using cookies for WebSocket authentication`);
      }

      // Create Yjs document
      this.document = new Y.Doc();

      // Create WebSocket provider
      this.provider = new WebsocketProvider(
        wsUrlWithParams.toString(),
        `${session.format}:${session.type}:${session.fileId}`,
        this.document,
        {
          connect: false,
        },
      );

      // Set up event handlers
      this.provider.on("status", (event: { status: string }) => {
        if (event.status === "connected") {
          this.connected = true;
          this.reconnectAttempts = 0;
          console.error(`Connected to document: ${session.fileId}`);
          resolve();
        }
      });

      this.provider.on("connection-close", () => {
        this.connected = false;
        console.error(`Disconnected from document: ${session.fileId}`);
        this.handleReconnect();
      });

      this.provider.on("connection-error", (error: any) => {
        console.error(`WebSocket error for document ${session.fileId}:`, error);

        // Extract more detailed error information
        let errorMessage = "Unknown WebSocket error";
        if (error) {
          if (error.message) {
            errorMessage = error.message;
          } else if (error.type === "error" && error.error) {
            errorMessage = error.error.message || JSON.stringify(error.error);
          } else if (typeof error === "string") {
            errorMessage = error;
          } else {
            errorMessage = JSON.stringify(error);
          }
        }

        console.error(
          `Detailed WebSocket error for document ${session.fileId}:`,
          errorMessage,
        );

        if (!this.connected) {
          reject(error);
        }
      });

      // Connect to the WebSocket server
      this.provider.connect();
    });
  }

  /**
   * Disconnect from the current session
   */
  async disconnect(): Promise<void> {
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }
    this.connected = false;
    this.document = null;
    this.session = null;
  }

  /**
   * Get the Yjs document
   * @returns Yjs document or null if not connected
   */
  getDocument(): Y.Doc | null {
    return this.document;
  }

  /**
   * Check if the client is connected
   * @returns True if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the current session
   * @returns Session model or null if not connected
   */
  getSession(): ISessionModel | null {
    return this.session;
  }


  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.session) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

      console.error(
        `Attempting to reconnect to document ${this.session.fileId} in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
      );

      setTimeout(() => {
        if (!this.connected && this.session) {
          this.connect(this.session).catch((error: any) => {
            let errorMessage = "Unknown reconnection error";
            if (error) {
              if (error.message) {
                errorMessage = error.message;
              } else if (typeof error === "string") {
                errorMessage = error;
              } else {
                errorMessage = JSON.stringify(error);
              }
            }
            console.error(
              `Reconnection failed for document ${this.session?.fileId}: ${errorMessage}`,
            );
          });
        }
      }, delay);
    } else if (this.session) {
      console.error(
        `Max reconnection attempts reached for document ${this.session.fileId}`,
      );
    }
  }

}
