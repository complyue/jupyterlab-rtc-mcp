import { URLExt } from "@jupyterlab/coreutils";
import { PromiseDelegate } from "@lumino/coreutils";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { cookieManager } from "./cookie-manager.js";
import { logger } from "../utils/logger.js";

export interface ISessionModel {
  format: string;
  type: string;
  fileId: string;
  sessionId: string;
}

/**
 * DocumentSession represents a session with a JupyterLab document
 *
 * This class handles WebSocket connections, document synchronization,
 * and change tracking for a single document.
 */
export class DocumentSession {
  private _session: ISessionModel;
  private baseUrl: string;
  private token: string | undefined;
  private cookieManager: typeof cookieManager;
  private document: Y.Doc;
  private provider: WebsocketProvider | null;
  private connected: boolean;
  private synced: boolean;
  private reconnectAttempts: number;
  private maxReconnectAttempts: number;
  private _connectionPromise: PromiseDelegate<void> | null;

  constructor(session: ISessionModel, baseUrl: string, token?: string) {
    this._session = session;
    this.baseUrl = baseUrl;
    this.token = token;
    this.cookieManager = cookieManager;
    this.document = new Y.Doc();
    this.provider = null;
    this.connected = false;
    this.synced = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this._connectionPromise = null;
  }

  get session() {
    return this._session;
  }

  /**
   * Connect to the JupyterLab WebSocket server
   */
  async connect(): Promise<void> {
    // If we're already connected and synchronized, return immediately
    if (this.connected && this.synced) {
      return;
    }

    // If we're already connecting, return the existing promise
    if (this._connectionPromise) {
      return this._connectionPromise.promise;
    }

    // Create a new connection promise
    this._connectionPromise = new PromiseDelegate<void>();

    const wsUrl = URLExt.join(
      this.baseUrl.replace(/^http/, "ws"),
      "api/collaboration/room",
      `${this._session.format}:${this._session.type}:${this._session.fileId}`,
    );

    const wsUrlWithParams = new URL(wsUrl);
    wsUrlWithParams.searchParams.append("sessionId", this._session.sessionId);

    // Add cookies if available
    if (this.cookieManager.hasCookies()) {
      const cookieHeader = this.cookieManager.getCookieHeader();
      // For WebSocket connections, we need to pass cookies as a query parameter
      // since WebSocket API doesn't support custom headers directly
      wsUrlWithParams.searchParams.append(
        "cookies",
        encodeURIComponent(cookieHeader),
      );
    }

    // Create WebSocket provider
    this.provider = new WebsocketProvider(
      wsUrlWithParams.toString(),
      `${this._session.format}:${this._session.type}:${this._session.fileId}`,
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
        // Don't resolve yet, wait for sync
      }
    });

    // Handle sync event - this is crucial for proper document initialization
    this.provider.on("sync", this._onSync);

    this.provider.on("connection-close", this._onConnectionClosed);

    this.provider.on("connection-error", (error: unknown) => {
      logger.error(
        `WebSocket error for document ${this._session.fileId}`,
        error,
      );

      // Extract more detailed error information
      let errorMessage = "Unknown WebSocket error";
      if (error) {
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (
          typeof error === "object" &&
          error !== null &&
          "message" in error
        ) {
          errorMessage = String(error.message);
        } else if (
          typeof error === "object" &&
          error !== null &&
          "type" in error &&
          "error" in error &&
          (error as { type: string }).type === "error" &&
          (error as { error: Error }).error instanceof Error
        ) {
          const errorObj = error as { error: Error };
          errorMessage =
            errorObj.error.message || JSON.stringify(errorObj.error);
        } else if (typeof error === "string") {
          errorMessage = error;
        } else {
          errorMessage = JSON.stringify(error);
        }
      }

      logger.error(
        `Detailed WebSocket error for document ${this._session.fileId}: ${errorMessage}`,
      );

      if (!this.connected && this._connectionPromise) {
        this._connectionPromise.reject(error);
        this._connectionPromise = null;
      }
    });

    // Connect to the WebSocket server
    this.provider.connect();

    // Return the connection promise
    return this._connectionPromise.promise;
  }

  /**
   * Disconnect from the JupyterLab WebSocket server
   */
  async disconnect(): Promise<void> {
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }
    this.connected = false;
    this.synced = false;
    logger.debug(`Disconnected from document: ${this._session.fileId}`);
  }

  /**
   * Reconnect to the JupyterLab WebSocket server
   */
  async reconnect(): Promise<void> {
    logger.debug(`Reconnecting to document: ${this._session.fileId}`);

    // Disconnect first if already connected
    if (this.provider) {
      this.provider.off("sync", this._onSync);
      this.provider.off("connection-close", this._onConnectionClosed);
      this.provider.destroy();
      this.provider = null;
    }

    this.connected = false;
    this.synced = false;

    // Reconnect using the same logic as in the connect method
    await this.connect();
  }

  /**
   * Get the Yjs document
   */
  getDocument(): Y.Doc {
    return this.document;
  }

  /**
   * Check if the session is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Check if the document is synchronized
   */
  isSynced(): boolean {
    return this.synced;
  }

  /**
   * Ensure the document is synchronized before proceeding
   * @returns Promise that resolves when the document is synchronized
   */
  async ensureSynchronized(): Promise<void> {
    logger.debug(
      `ensureSynchronized() called for document: ${this._session.fileId}`,
    );

    // If already synchronized, return immediately
    if (this.synced) {
      logger.debug(`Document already synchronized`);
      return;
    }

    // If not connected, throw an error
    if (!this.connected) {
      throw new Error(
        `Document session is not connected to the WebSocket server.`,
      );
    }

    // If we have a provider but it's not synced, wait for the sync event
    if (this.provider && !this.synced) {
      logger.debug(`Waiting for document synchronization...`);

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error(`Document synchronization timed out after 30 seconds.`),
          );
        }, 30000);

        const syncHandler = (isSynced: boolean) => {
          if (isSynced) {
            clearTimeout(timeout);
            this.provider?.off("sync", syncHandler);
            logger.debug(`Document synchronized successfully`);
            resolve();
          }
        };

        this.provider?.on("sync", syncHandler);
      });
    }

    // If we don't have a provider, try to reconnect
    if (!this.provider) {
      logger.debug(`No provider found, attempting to reconnect...`);
      await this.reconnect();

      // After reconnecting, wait for synchronization
      return this.ensureSynchronized();
    }
  }

  /**
   * Get the document content from the Yjs document
   */
  getDocumentContent(): {
    content: Record<string, unknown>;
    metadata: Record<string, unknown>;
  } {
    // Check if we're connected to the WebSocket server
    if (!this.connected) {
      throw new Error(
        `Document session is not connected to the WebSocket server.`,
      );
    }

    // Check if the document is synchronized
    if (!this.synced) {
      throw new Error(
        `Document is not yet synchronized. Please wait for synchronization to complete.`,
      );
    }

    // Get the document content
    const content = this.document.getMap("content");
    const metadata = this.document.getMap("metadata");

    const documentContent = {
      content: content.toJSON(),
      metadata: metadata.toJSON(),
    };

    return documentContent;
  }

  /**
   * Update document content in the Yjs document
   * @param key Key of the content to update
   * @param value New value for the content
   */
  updateContent(key: string, value: unknown): void {
    // Update the content using Yjs transaction
    this.document.transact(() => {
      const content = this.document.getMap("content");
      content.set(key, value);
    });
  }

  /**
   * Update document metadata in the Yjs document
   * @param key Key of the metadata to update
   * @param value New value for the metadata
   */
  updateMetadata(key: string, value: unknown): void {
    // Update the metadata using Yjs transaction
    this.document.transact(() => {
      const metadata = this.document.getMap("metadata");
      metadata.set(key, value);
    });
  }

  /**
   * Get document content by key
   * @param key Key of the content to retrieve
   * @returns The content value
   */
  getContent(key: string): unknown {
    const content = this.document.getMap("content");
    return content.get(key);
  }

  /**
   * Get document metadata by key
   * @param key Key of the metadata to retrieve
   * @returns The metadata value
   */
  getMetadata(key: string): unknown {
    const metadata = this.document.getMap("metadata");
    return metadata.get(key);
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

      setTimeout(() => {
        if (!this.connected) {
          this.connect().catch((error: unknown) => {
            let errorMessage = "Unknown reconnection error";
            if (error) {
              if (error instanceof Error) {
                errorMessage = error.message;
              } else if (typeof error === "string") {
                errorMessage = error;
              } else {
                errorMessage = JSON.stringify(error);
              }
            }
            logger.error(
              `Reconnection failed for document ${this._session.fileId}: ${errorMessage}`,
            );
          });
        }
      }, delay);
    } else {
      logger.error(
        `Max reconnection attempts reached for document ${this._session.fileId}`,
      );
    }
  }

  /**
   * Handle sync event from the WebSocket provider
   * @param isSynced Whether the document is synchronized
   */
  private _onSync = (isSynced: boolean) => {
    this.synced = isSynced;
    if (isSynced && this.connected) {
      // Set document ID after sync, similar to JupyterLab's implementation
      const state = this.document.getMap("state");
      state.set("document_id", this.provider!.roomname);

      // Resolve any pending connection promise
      if (this._connectionPromise) {
        this._connectionPromise.resolve();
        this._connectionPromise = null;
      }
    }
  };

  /**
   * Handle connection close event from the WebSocket provider
   * @param event Connection close event
   */
  private _onConnectionClosed = (event: unknown) => {
    this.connected = false;
    this.synced = false;
    logger.error(`Disconnected from document: ${this._session.fileId}`, event);
    this.handleReconnect();
  };
}
