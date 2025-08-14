import { URLExt } from "@jupyterlab/coreutils";
import { PromiseDelegate } from "@lumino/coreutils";
import * as Y from "yjs";
import { YNotebook } from "@jupyter/ydoc";
import { INotebookContent, MultilineString } from "@jupyterlab/nbformat";
import { cookieManager } from "./cookie-manager.js";
import { CookieWebsocketProvider } from "./websocket-provider.js";
import { logger } from "../utils/logger.js";

export interface ISessionModel {
  format: string;
  type: string;
  fileId: string;
  sessionId: string;
}

export interface IKernelSessionModel {
  id: string;
  name: string;
  lastActivity: string;
  executionState: string;
  connectionStatus: string;
}

/**
 * NotebookSession represents a session with a JupyterLab notebook
 *
 * This class handles WebSocket connections, notebook synchronization,
 * and change tracking for a single notebook. It properly uses the
 * embedded Y.Doc from YNotebook instead of creating a separate Y.Doc.
 */
export class NotebookSession {
  private _session: ISessionModel;
  private baseUrl: string;
  private token: string | undefined;
  private yNotebook: YNotebook;
  private provider: CookieWebsocketProvider | null;
  private connected: boolean;
  private synced: boolean;
  private reconnectAttempts: number;
  private maxReconnectAttempts: number;
  private _connectionPromise: PromiseDelegate<void> | null;
  private kernelSession: IKernelSessionModel | null;

  constructor(session: ISessionModel, baseUrl: string, token?: string) {
    this._session = session;
    this.baseUrl = baseUrl;
    this.token = token;

    // Create YNotebook which already has an embedded Y.Doc
    // This is the key change - we don't create a separate Y.Doc
    this.yNotebook = new YNotebook();

    this.provider = null;
    this.connected = false;
    this.synced = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this._connectionPromise = null;
    this.kernelSession = null;
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
    const _connectionPromise = (this._connectionPromise =
      new PromiseDelegate<void>());
    _connectionPromise.promise.catch((error) => {
      logger.error(
        `Unhandled connection promise rejection for notebook ${this._session.fileId}:`,
        error,
      );
    });

    const wsUrl = URLExt.join(
      this.baseUrl.replace(/^http/, "ws"),
      "api/collaboration/room",
      `${this._session.format}:${this._session.type}:${this._session.fileId}`,
    );

    const wsUrlWithParams = new URL(wsUrl);
    wsUrlWithParams.searchParams.append("sessionId", this._session.sessionId);

    // Create custom WebSocket provider using the embedded Y.Doc from YNotebook
    this.provider = new CookieWebsocketProvider(
      wsUrlWithParams.toString(),
      `${this._session.format}:${this._session.type}:${this._session.fileId}`,
      this.yNotebook.ydoc, // Use the embedded Y.Doc from YNotebook
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
        `WebSocket error for notebook ${this._session.fileId}`,
        error,
      );
      logger.debug(
        `Connection status: ${this.connected}, Connection promise exists: ${!!_connectionPromise}`,
      );

      if (!this.connected && _connectionPromise) {
        logger.debug(
          `Rejecting connection promise for notebook ${this._session.fileId}`,
        );
        _connectionPromise.reject(error);
      } else if (this.connected) {
        logger.debug(
          `WebSocket error occurred after connection was established for notebook ${this._session.fileId}`,
        );
        // Handle the error appropriately - e.g., trigger reconnection
        this.connected = false;
        this.synced = false;
        this.kernelSession = null;

        // Handle the error properly to prevent unhandled promise rejection
        try {
          this.handleReconnect();
        } catch (reconnectError) {
          logger.error(
            `Error during reconnection handling for notebook ${this._session.fileId}:`,
            reconnectError,
          );
        }
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
    this.kernelSession = null;
    logger.debug(`Disconnected from notebook: ${this._session.fileId}`);
  }

  /**
   * Reconnect to the JupyterLab WebSocket server
   */
  async reconnect(): Promise<void> {
    logger.debug(`Reconnecting to notebook: ${this._session.fileId}`);

    // Disconnect first if already connected
    if (this.provider) {
      this.provider.off("sync", this._onSync);
      this.provider.off("connection-close", this._onConnectionClosed);
      this.provider.destroy();
      this.provider = null;
    }

    this.connected = false;
    this.synced = false;

    // Store whether we had a kernel session before disconnecting
    const hadKernelSession = this.kernelSession !== null;
    this.kernelSession = null;

    // Reconnect using the same logic as in the connect method
    await this.connect();

    // If we had a kernel session before, try to restore it after reconnecting
    if (hadKernelSession && this.connected && this.synced) {
      try {
        this.kernelSession = await this._requestKernelSession();
        if (this.kernelSession) {
          logger.debug(
            `Kernel session restored for notebook: ${this._session.fileId}`,
          );
        } else {
          logger.debug(
            `No kernel session available after reconnecting to notebook: ${this._session.fileId}`,
          );
        }
      } catch (error) {
        logger.error(
          `Error restoring kernel session for notebook ${this._session.fileId}:`,
          error,
        );
      }
    }
  }

  /**
   * Get the Yjs document (embedded in YNotebook)
   */
  getDocument(): Y.Doc {
    return this.yNotebook.ydoc;
  }

  /**
   * Get the YNotebook
   */
  getYNotebook(): YNotebook {
    return this.yNotebook;
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
    // If already synchronized, return immediately
    if (this.synced) {
      logger.debug(`Notebook already synchronized`);
      return;
    }

    // If not connected, throw an error
    if (!this.connected) {
      throw new Error(
        `Notebook session is not connected to the WebSocket server.`,
      );
    }

    // If we have a provider but it's not synced, wait for the sync event
    if (this.provider && !this.synced) {
      logger.debug(`Waiting for notebook synchronization...`);

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error(`Notebook synchronization timed out after 30 seconds.`),
          );
        }, 30000);

        const syncHandler = (isSynced: boolean) => {
          if (isSynced) {
            clearTimeout(timeout);
            this.provider?.off("sync", syncHandler);
            logger.debug(`Notebook synchronized successfully`);
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
   * Get the notebook content from the YNotebook
   */
  getNotebookContent(): INotebookContent {
    // Check if we're connected to the WebSocket server
    if (!this.connected) {
      throw new Error(
        `Notebook session is not connected to the WebSocket server.`,
      );
    }

    // Check if the document is synchronized
    if (!this.synced) {
      throw new Error(
        `Notebook is not yet synchronized. Please wait for synchronization to complete.`,
      );
    }

    return this.yNotebook.toJSON();
  }

  /**
   * Update cell content in the notebook
   * @param cellId ID of the cell to update
   * @param content New content for the cell
   */
  updateCellContent(cellId: string, content: string): void {
    // Find the cell by ID in the YNotebook
    const notebookContent = this.yNotebook.toJSON();
    const cellIndex = notebookContent.cells.findIndex(
      (cell) => cell.id === cellId,
    );

    if (cellIndex !== -1) {
      // Update the cell content using YNotebook's setSource method
      const cell = this.yNotebook.getCell(cellIndex);
      this.yNotebook.ydoc.transact(() => {
        // Use the cell's setSource method if available
        if (typeof cell.setSource === "function") {
          cell.setSource(content);
        } else {
          // Fallback to recreating the cell
          const updatedCell = {
            ...cell.toJSON(),
            source: content,
          };
          // Remove the old cell and insert the updated one
          this.yNotebook.deleteCell(cellIndex);
          this.yNotebook.insertCell(cellIndex, updatedCell);
        }
      });
    } else {
      // Create a new cell if it doesn't exist
      this.yNotebook.ydoc.transact(() => {
        const newCell = {
          cell_type: "code",
          source: content,
          metadata: {},
          id: cellId,
        };
        this.yNotebook.addCell(newCell);
      });
    }
  }
  /**
   * Add a new cell to the notebook
   * @param content Content for the new cell
   * @param type Cell type ('code' or 'markdown')
   * @param position Position to insert the cell (default: end)
   * @returns ID of the new cell
   */
  addCell(content: string, type: string = "code", position?: number): string {
    const cellId = `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create cell data structure
    const cellData = {
      cell_type: type,
      source: content,
      metadata: {},
      id: cellId,
    };

    let newCell;
    if (position !== undefined && position >= 0) {
      // Insert at specific position - YNotebook.insertCell() handles createCell() and transact() internally
      newCell = this.yNotebook.insertCell(position, cellData);
    } else {
      // Append to the end - YNotebook.addCell() handles createCell() and transact() internally
      newCell = this.yNotebook.addCell(cellData);
    }

    return newCell!.id;
  }

  /**
   * Delete a cell from the notebook
   * @param cellId ID of the cell to delete
   */
  deleteCell(cellId: string): void {
    // Find the cell by ID in the YNotebook
    const notebookContent = this.yNotebook.toJSON();
    const cellIndex = notebookContent.cells.findIndex(
      (cell) => cell.id === cellId,
    );

    if (cellIndex === -1) {
      logger.warn(`Cell with ID ${cellId} not found in notebook`);
      return;
    }

    // Delete the cell using YNotebook's deleteCell method
    this.yNotebook.ydoc.transact(() => {
      this.yNotebook.deleteCell(cellIndex);
    });
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
          logger.debug(
            `Attempting to reconnect to notebook ${this._session.fileId} (attempt ${this.reconnectAttempts})`,
          );
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
              `Reconnection failed for notebook ${this._session.fileId}: ${errorMessage}`,
            );
            logger.debug(
              `Error type: ${typeof error}, Error details: ${JSON.stringify(error)}`,
            );
          });
        }
      }, delay);
    } else {
      logger.error(
        `Max reconnection attempts reached for notebook ${this._session.fileId}`,
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
      const state = this.yNotebook.ydoc.getMap("state");
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
    this.kernelSession = null;
    logger.error(`Disconnected from notebook: ${this._session.fileId}`, event);
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

    this.handleReconnect();
  };

  /**
   * Request kernel session information from JupyterLab server
   */
  private async _requestKernelSession(): Promise<IKernelSessionModel | null> {
    try {
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings({ baseUrl: this.baseUrl });
      const url = URLExt.join(
        settings.baseUrl,
        "api/sessions",
        this._session.sessionId,
      );

      const init: RequestInit = {
        method: "GET",
      };

      // Add authorization header if token is provided
      if (this.token) {
        init.headers = {
          ...init.headers,
          Authorization: `token ${this.token}`,
        };
      }

      // Add cookies if available
      if (cookieManager.hasCookies()) {
        init.headers = {
          ...init.headers,
          Cookie: cookieManager.getCookieHeader(),
        };
      }

      let response: Response;
      response = await ServerConnection.makeRequest(url, init, settings);

      // Store cookies from response
      cookieManager.parseResponseHeaders(response.headers);

      let dataText: string = await response.text();
      let data: unknown = null;

      if (dataText.length > 0) {
        try {
          data = JSON.parse(dataText);
        } catch {
          logger.error("Not a JSON response body.", response);
          return null;
        }
      }

      if (!response.ok) {
        logger.error(
          `Server returned ${response.status}: ${data && typeof data === "object" && "message" in data ? (data as { message: string }).message : dataText}`,
        );
        return null;
      }

      // Extract kernel information from the session response
      if (data && typeof data === "object" && "kernel" in data && data.kernel) {
        const kernel = data.kernel as { id: string; name: string };
        return {
          id: kernel.id,
          name: kernel.name,
          lastActivity: new Date().toISOString(),
          executionState: "unknown", // Will be updated when we receive status updates
          connectionStatus: "connected",
        };
      }

      return null;
    } catch (error) {
      logger.error(`Error requesting kernel session:`, error);
      return null;
    }
  }

  /**
   * Update kernel session status
   * @param executionState New execution state
   * @param connectionStatus New connection status
   */
  private _updateKernelSessionStatus(
    executionState?: string,
    connectionStatus?: string,
  ): void {
    if (!this.kernelSession) {
      return;
    }

    if (executionState) {
      this.kernelSession.executionState = executionState;
    }

    if (connectionStatus) {
      this.kernelSession.connectionStatus = connectionStatus;
    }

    this.kernelSession.lastActivity = new Date().toISOString();
  }

  /**
   * Get the kernel session information
   * @returns Kernel session model or null if no kernel session exists
   */
  async getKernelSession(): Promise<IKernelSessionModel | null> {
    // If kernel session is not available, try to request it
    if (!this.kernelSession && this.connected && this.synced) {
      this.kernelSession = await this._requestKernelSession();
    }
    return this.kernelSession;
  }

  /**
   * Execute code in the kernel session
   * @param code Code to execute
   * @returns Promise that resolves with execution result
   */
  async executeCode(code: MultilineString): Promise<any> {
    if (!this.connected) {
      throw new Error("Notebook session is not connected");
    }

    // Get kernel session on-demand if not available
    if (!this.kernelSession) {
      this.kernelSession = await this._requestKernelSession();
      if (!this.kernelSession) {
        throw new Error("No kernel session available");
      }
    }

    try {
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings({ baseUrl: this.baseUrl });
      const url = URLExt.join(
        settings.baseUrl,
        "api/kernels",
        this.kernelSession.id,
        "execute",
      );

      const init: RequestInit = {
        method: "POST",
        body: JSON.stringify({
          code,
          silent: false,
        }),
      };

      // Add authorization header if token is provided
      if (this.token) {
        init.headers = {
          ...init.headers,
          Authorization: `token ${this.token}`,
        };
      }

      // Add cookies if available
      if (cookieManager.hasCookies()) {
        init.headers = {
          ...init.headers,
          Cookie: cookieManager.getCookieHeader(),
        };
      }

      let response: Response;
      response = await ServerConnection.makeRequest(url, init, settings);

      // Store cookies from response
      cookieManager.parseResponseHeaders(response.headers);

      let dataText: string = await response.text();
      let data: unknown = null;

      if (dataText.length > 0) {
        try {
          data = JSON.parse(dataText);
        } catch {
          logger.error("Not a JSON response body.", response);
          throw new Error("Invalid response from kernel execution");
        }
      }

      if (!response.ok) {
        throw new Error(
          `Kernel execution failed: ${data && typeof data === "object" && "message" in data ? (data as { message: string }).message : dataText}`,
        );
      }

      // Update kernel session status
      this._updateKernelSessionStatus("busy");

      return data;
    } catch (error) {
      logger.error(`Error executing code in kernel:`, error);
      throw error;
    }
  }
}
