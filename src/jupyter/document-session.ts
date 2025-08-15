import { URLExt } from "@jupyterlab/coreutils";
import { PromiseDelegate } from "@lumino/coreutils";
import * as Y from "yjs";
import { CookieWebsocketProvider } from "./websocket-provider.js";
import { logger } from "../utils/logger.js";

export interface ISessionModel {
  format: string;
  type: string;
  fileId: string;
  sessionId: string;
}

/**
 * DocumentSession represents a base session with a JupyterLab document
 *
 * This class handles WebSocket connections, document synchronization,
 * and change tracking for any type of document. It provides the foundation
 * for specialized document sessions like NotebookSession.
 */
export abstract class DocumentSession {
  protected _session: ISessionModel;
  protected baseUrl: string;
  protected token: string | undefined;
  protected ydoc: Y.Doc;
  protected provider: CookieWebsocketProvider | null;
  protected connected: boolean;
  protected synced: boolean;
  protected _connectionPromise: PromiseDelegate<void> | null;

  constructor(
    session: ISessionModel,
    baseUrl: string,
    token?: string,
    ydoc?: Y.Doc,
  ) {
    this._session = session;
    this.baseUrl = baseUrl;
    this.token = token;
    this.ydoc = ydoc || new Y.Doc();
    this.provider = null;
    this.connected = false;
    this.synced = false;
    this._connectionPromise = null;
  }

  get session() {
    return this._session;
  }

  /**
   * Get the Yjs document
   */
  getDocument(): Y.Doc {
    return this.ydoc;
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
    const _connectionPromise = (this._connectionPromise =
      new PromiseDelegate<void>());
    _connectionPromise.promise.catch((error) => {
      logger.error(
        `Unhandled connection promise rejection for document ${this._session.fileId}:`,
        error,
      );
    });

    const wsUrl = URLExt.join(
      this.baseUrl.replace(/^http/, "ws"),
      "api/collaboration/room",
      `${this._session.format}:${this._session.type}:${this._session.fileId}`,
    );

    // Create custom WebSocket provider
    this.provider = new CookieWebsocketProvider(
      wsUrl,
      `${this._session.format}:${this._session.type}:${this._session.fileId}`,
      this.ydoc,
      {
        connect: false,
        params: { sessionId: this._session.sessionId },
      },
    );

    // Set up event handlers
    this.provider.on("status", (event: { status: string }) => {
      if (event.status === "connected") {
        this.connected = true;
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
      logger.debug(
        `Connection status: ${this.connected}, Connection promise exists: ${!!_connectionPromise}`,
      );

      if (!this.connected && _connectionPromise) {
        logger.debug(
          `Rejecting connection promise for document ${this._session.fileId}`,
        );
        _connectionPromise.reject(error);
      } else if (this.connected) {
        logger.debug(
          `WebSocket error occurred after connection was established for document ${this._session.fileId}`,
        );
        this.connected = false;
        this.synced = false;
      }
    });

    // Connect to the WebSocket server
    this.provider.connect();

    // Return the connection promise
    return _connectionPromise.promise;
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
   * Ensure the document is synchronized before proceeding
   * @returns Promise that resolves when the document is synchronized
   */
  async ensureSynchronized(): Promise<void> {
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

    throw new Error(
      `Document session is not connected to the WebSocket server.`,
    );
  }

  /**
   * Handle sync event from the WebSocket provider
   * @param isSynced Whether the document is synchronized
   */
  private _onSync = (isSynced: boolean) => {
    this.synced = isSynced;
    if (isSynced && this.connected) {
      // Set document ID after sync, similar to JupyterLab's implementation
      const state = this.ydoc.getMap("state");
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
    logger.debug(`Connection closed event details: ${JSON.stringify(event)}`);
    logger.debug(`Connection promise exists: ${!!this._connectionPromise}`);

    // If there's a pending connection promise, reject it
    if (this._connectionPromise) {
      logger.debug(`Rejecting connection promise due to connection close`);
      this._connectionPromise.reject(
        new Error(
          `Connection closed: ${event && typeof event === "object" && "reason" in event ? (event as { reason: string }).reason : "Unknown reason"}`,
        ),
      );
      this._connectionPromise = null;
    }
  };
}
