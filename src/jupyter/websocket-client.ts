import { ServerConnection } from "@jupyterlab/services";
import { URLExt } from "@jupyterlab/coreutils";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

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
  private serverSettings: ServerConnection.ISettings;
  private token: string | undefined;
  private document: Y.Doc | null;
  private provider: WebsocketProvider | null;
  private connected: boolean;
  private session: ISessionModel | null;
  private updateCallbacks: Set<(update: Uint8Array) => void>;
  private reconnectAttempts: number;
  private maxReconnectAttempts: number;

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl =
      baseUrl || process.env.JUPYTERLAB_URL || "http://localhost:8888";
    this.token = token || process.env.JUPYTERLAB_TOKEN;
    this.serverSettings = ServerConnection.makeSettings();
    this.document = null;
    this.provider = null;
    this.connected = false;
    this.session = null;
    this.updateCallbacks = new Set();
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
      try {
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
        this.provider.on("connection-open", () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          console.error(`Connected to document: ${session.fileId}`);
          resolve();
        });

        this.provider.on("connection-close", () => {
          this.connected = false;
          console.error(`Disconnected from document: ${session.fileId}`);
          this.handleReconnect();
        });

        this.provider.on("connection-error", (error: any) => {
          console.error(
            `WebSocket error for document ${session.fileId}:`,
            error,
          );
          if (!this.connected) {
            reject(
              new Error(
                `Failed to connect to document: ${error instanceof Error ? error.message : String(error)}`,
              ),
            );
          }
        });

        // Listen for document updates
        this.document.on("update", (update: Uint8Array) => {
          this.notifyUpdateCallbacks(update);
        });

        // Connect to the WebSocket server
        this.provider.connect();
      } catch (error) {
        reject(
          new Error(
            `Failed to create WebSocket connection: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
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
    this.updateCallbacks.clear();
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
   * Register a callback for document updates
   * @param callback Function to call when document is updated
   * @returns Function to unregister the callback
   */
  onUpdate(callback: (update: Uint8Array) => void): () => void {
    this.updateCallbacks.add(callback);

    // Return a function to remove the callback
    return () => {
      this.updateCallbacks.delete(callback);
    };
  }

  /**
   * Send a Yjs update to the server
   * @param update Yjs update to send
   */
  sendUpdate(update: Uint8Array): void {
    if (this.document && this.connected) {
      this.document.transact(() => {
        Y.applyUpdate(this.document!, update);
      });
    } else {
      throw new Error("Not connected to document");
    }
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
            console.error(
              `Reconnection failed for document ${this.session?.fileId}:`,
              error,
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

  /**
   * Notify all update callbacks of a document update
   * @param update Yjs update
   */
  private notifyUpdateCallbacks(update: Uint8Array): void {
    this.updateCallbacks.forEach((callback) => {
      try {
        callback(update);
      } catch (error) {
        console.error("Error in document update callback:", error);
      }
    });
  }
}
