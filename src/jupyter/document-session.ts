import { WebsocketProvider } from "y-websocket";
import WebSocket from "ws";
import * as Y from "yjs";
import * as util from "util";

import { logger } from "../utils/logger.js";

import { JupyterLabAdapter } from "./adapter.js";

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
  protected jupyterAdapter: JupyterLabAdapter;
  protected ydoc: Y.Doc;
  protected provider: WebsocketProvider;
  protected _syncedPromise?: Promise<void>;
  protected _resolveSynced?: () => void;
  protected _rejectSynced?: (error: Error) => void;

  constructor(
    session: ISessionModel,
    jupyterAdapter: JupyterLabAdapter,
    ydoc?: Y.Doc,
  ) {
    this._session = session;
    this.jupyterAdapter = jupyterAdapter;
    this.ydoc = ydoc || new Y.Doc();
    this.provider = this._createProvider(this.jupyterAdapter.maxWsPayload);
    this.provider.connect();
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
    return this.provider.wsconnected ?? false;
  }

  /**
   * Check if the document is synchronized
   */
  isSynced(): boolean {
    return this.provider.synced ?? false;
  }

  /**
   * Disconnect from the JupyterLab WebSocket server
   */
  async disconnect(): Promise<void> {
    logger.debug(`Disconnecting document: ${this._session.fileId}`);
    const error = new Error(
      `Document session disconnected: ${this._session.fileId}`,
    );
    if (this._rejectSynced) {
      this._rejectSynced(error);
    }
    // Set to undefined, will be recreated in ensureSynchronized if needed
    this._syncedPromise = undefined;
    this._resolveSynced = undefined;
    this._rejectSynced = undefined;
    this.provider.destroy();
  }

  /**
   * Ensure the document is synchronized before proceeding
   * @returns Promise that resolves when the document is synchronized
   */
  async ensureSynchronized(): Promise<void> {
    if (!this.isConnected) {
      throw new Error(`Document session disconnected: ${this._session.fileId}`);
    }
    // If already synchronized, return immediately
    if (this.isSynced()) {
      return;
    }
    if (!this._syncedPromise) {
      this._syncedPromise = new Promise<void>((resolve, reject) => {
        this._resolveSynced = resolve;
        this._rejectSynced = reject;
      });
    }
    await this._syncedPromise;
  }

  /**
   * Handle sync event from the WebSocket provider
   * @param isSynced Whether the document is synchronized
   */
  private _onSync = (isSynced: boolean) => {
    if (isSynced) {
      if (this._resolveSynced) {
        this._resolveSynced();
        this._resolveSynced = undefined;
        this._rejectSynced = undefined;
      }
      if (this.isConnected()) {
        // Set document ID after sync, similar to JupyterLab's implementation
        const state = this.ydoc.getMap("state");
        state.set("document_id", this.provider.roomname);
      }
    } else {
      // Set to undefined when unsynced, will be recreated in ensureSynchronized if needed
      this._syncedPromise = undefined;
      this._resolveSynced = undefined;
      this._rejectSynced = undefined;
    }
  };

  /**
   * Handle connection close event from the WebSocket provider
   * @param event Connection close event
   */
  private _onConnectionClosed = (event: unknown) => {
    logger.debug(`Disconnected from document: ${this._session.fileId}`);
    if (this._rejectSynced) {
      const error = new Error(
        `Document connection closed: ${this._session.fileId} - ${util.inspect(event)}`,
      );
      this._rejectSynced(error);
    }
    // Set to undefined, will be recreated in ensureSynchronized if needed
    this._syncedPromise = undefined;
    this._resolveSynced = undefined;
    this._rejectSynced = undefined;
  };

  /**
   * Create and setup the WebSocket provider
   */
  private _createProvider(maxPayload: number): WebsocketProvider {
    const jupyterAdapter = this.jupyterAdapter;

    const wsUrl = `${jupyterAdapter.baseUrl.replace(/^http/, "ws")}/api/collaboration/room/${this._session.format}:${this._session.type}:${this._session.fileId}`;

    class CookieWS extends WebSocket {
      constructor(url: string | URL, options?: WebSocket.ClientOptions) {
        // Set max payload size to handle large notebooks
        const wsOptions = {
          maxPayload,
          ...options,
          headers: {
            ...jupyterAdapter.sessionHeaders(),
            ...(options?.headers || {}),
          },
        };
        logger.debug(
          `Creating WebSocket connection with maxPayload: ${maxPayload} bytes (${(maxPayload / 1024 / 1024).toFixed(1)} MB)`,
        );
        super(url, wsOptions);
      }
    }
    /**
     * Custom WebsocketProvider that can inject cookies into the WebSocket connection
     */
    class CookieWebsocketProvider extends WebsocketProvider {
      constructor(
        serverUrl: string,
        roomname: string,
        doc: Y.Doc,
        opts: {
          connect?: boolean | undefined;
          params?:
            | {
                [x: string]: string;
              }
            | undefined;
          protocols?: string[] | undefined;
          resyncInterval?: number | undefined;
          maxBackoffTime?: number | undefined;
          disableBc?: boolean | undefined;
        } = {},
      ) {
        super(serverUrl, roomname, doc, {
          ...opts,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          WebSocketPolyfill: CookieWS as any,
        });
      }
    }

    // Create custom WebSocket provider
    const provider = new CookieWebsocketProvider(
      wsUrl,
      `${this._session.format}:${this._session.type}:${this._session.fileId}`,
      this.ydoc,
      {
        connect: false,
        params: { sessionId: this._session.sessionId },
      },
    );

    // Set up event handlers
    provider.on("status", (event: { status: string }) => {
      logger.debug(
        `Doc Session ${this._session.fileId} WS status changed to ${event.status}`,
      );
    });

    // Handle sync event - this is crucial for proper document initialization
    provider.on("sync", this._onSync);

    provider.on("connection-close", this._onConnectionClosed);

    provider.on("connection-error", (error: unknown) => {
      logger.error(
        `WebSocket error for document ${this._session.fileId}`,
        error,
      );

      const connectionError = new Error(
        `Document connection error: ${this._session.fileId}:\n  ${util.inspect(error)}`,
      );
      if (this._rejectSynced) {
        this._rejectSynced(connectionError);
      }
      // Set to undefined, will be recreated in ensureSynchronized if needed
      this._syncedPromise = undefined;
      this._resolveSynced = undefined;
      this._rejectSynced = undefined;

      // Destroy the provider on connection error
      provider.destroy();
    });

    return provider;
  }
}
