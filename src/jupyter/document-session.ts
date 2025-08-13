import { URLExt } from "@jupyterlab/coreutils";
import { PromiseDelegate } from "@lumino/coreutils";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { YNotebook } from "@jupyter/ydoc";
import { cookieManager } from "./cookie-manager.js";

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
  private session: ISessionModel;
  private baseUrl: string;
  private token: string | undefined;
  private cookieManager: typeof cookieManager;
  private document: Y.Doc;
  private yNotebook: YNotebook;
  private provider: WebsocketProvider | null;
  private connected: boolean;
  private synced: boolean;
  private reconnectAttempts: number;
  private maxReconnectAttempts: number;
  private _connectionPromise: PromiseDelegate<void> | null;

  constructor(
    session: ISessionModel,
    baseUrl: string,
    token?: string,
  ) {
    this.session = session;
    this.baseUrl = baseUrl;
    this.token = token;
    this.cookieManager = cookieManager;
    this.document = new Y.Doc();
    this.yNotebook = new YNotebook();
    this.provider = null;
    this.connected = false;
    this.synced = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this._connectionPromise = null;

    // Initialize document structure immediately
    this.initializeDocumentStructure();
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
      `${this.session.format}:${this.session.type}:${this.session.fileId}`,
    );

    const wsUrlWithParams = new URL(wsUrl);
    wsUrlWithParams.searchParams.append("sessionId", this.session.sessionId);

    // Add token if provided
    if (this.token) {
      wsUrlWithParams.searchParams.append("token", this.token);
      console.error(
        `[DEBUG] Using token for authentication: ${this.token.substring(0, 10)}...`,
      );
    } else {
      console.error(`[DEBUG] No token provided for authentication`);
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

    console.error(
      `[DEBUG] Attempting WebSocket connection to: ${wsUrlWithParams.toString()}`,
    );

    // Create WebSocket provider
    this.provider = new WebsocketProvider(
      wsUrlWithParams.toString(),
      `${this.session.format}:${this.session.type}:${this.session.fileId}`,
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
        console.error(`Connected to document: ${this.session.fileId}`);
        // Don't resolve yet, wait for sync
      }
    });

    // Handle sync event - this is crucial for proper document initialization
    this.provider.on("sync", this._onSync);

    this.provider.on("connection-close", this._onConnectionClosed);

    this.provider.on("connection-error", (error: any) => {
      console.error(
        `WebSocket error for document ${this.session.fileId}:`,
        error,
      );

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
        `Detailed WebSocket error for document ${this.session.fileId}:`,
        errorMessage,
      );

      // Try to get more information about the WebSocket connection attempt
      console.error(`[DEBUG] WebSocket URL: ${wsUrlWithParams.toString()}`);
      console.error(`[DEBUG] Base URL: ${this.baseUrl}`);
      console.error(`[DEBUG] Session ID: ${this.session.sessionId}`);
      console.error(`[DEBUG] File ID: ${this.session.fileId}`);

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
    console.error(`Disconnected from document: ${this.session.fileId}`);
  }

  /**
   * Reconnect to the JupyterLab WebSocket server
   */
  async reconnect(): Promise<void> {
    console.error(`[DEBUG] Reconnecting to document: ${this.session.fileId}`);

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
    console.error(
      `[DEBUG] ensureSynchronized() called for document: ${this.session.fileId}`,
    );

    // If already synchronized, return immediately
    if (this.synced) {
      console.error(`[DEBUG] Document already synchronized`);
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
      console.error(`[DEBUG] Waiting for document synchronization...`);

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
            console.error(`[DEBUG] Document synchronized successfully`);
            resolve();
          }
        };

        this.provider?.on("sync", syncHandler);
      });
    }

    // If we don't have a provider, try to reconnect
    if (!this.provider) {
      console.error(`[DEBUG] No provider found, attempting to reconnect...`);
      await this.reconnect();

      // After reconnecting, wait for synchronization
      return this.ensureSynchronized();
    }
  }

  /**
   * Initialize the document structure with required maps
   */
  private initializeDocumentStructure(): void {
    console.error(
      `[DEBUG] initializeDocumentStructure() called for document: ${this.session.fileId}`,
    );

    try {
      // Use YNotebook's built-in structure initialization
      this.document.transact(() => {
        console.error(
          `[DEBUG] Inside document transaction for ${this.session.fileId}`,
        );

        // Initialize with basic notebook metadata if not already set
        if (
          !this.yNotebook.metadata ||
          Object.keys(this.yNotebook.metadata).length === 0
        ) {
          console.error(`[DEBUG] Initializing empty notebook metadata`);
          this.yNotebook.setMetadata({
            kernelspec: {
              display_name: "Python 3",
              language: "python",
              name: "python3",
            },
            language_info: {
              name: "python",
              version: "3.8.5",
            },
          });
        }

        // Ensure nbformat is set
        if (!this.yNotebook.nbformat) {
          this.yNotebook.nbformat = 4;
        }

        // Ensure nbformat_minor is set
        if (!this.yNotebook.nbformat_minor) {
          this.yNotebook.nbformat_minor = 5;
        }
      });

      console.error(
        `[DEBUG] Document structure initialization completed successfully for ${this.session.fileId}`,
      );
    } catch (error) {
      console.error(
        `[DEBUG] Error in initializeDocumentStructure() for ${this.session.fileId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get the notebook content from the Yjs document
   */
  getNotebookContent(): any {
    console.error(
      `[DEBUG] getNotebookContent() called for document: ${this.session.fileId}`,
    );

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

    // Initialize document structure if needed
    console.error(`[DEBUG] Calling initializeDocumentStructure()`);
    this.initializeDocumentStructure();

    // Get the notebook content using YNotebook
    console.error(`[DEBUG] Getting notebook content from YNotebook`);
    const notebookContent = this.yNotebook.toJSON();

    console.error(
      `[DEBUG] Notebook content retrieved:`,
      JSON.stringify(
        {
          cellCount: notebookContent.cells?.length || 0,
          nbformat: notebookContent.nbformat,
          nbformat_minor: notebookContent.nbformat_minor,
        },
        null,
        2,
      ),
    );

    // Transform the content to match the expected format
    const cells = notebookContent.cells.map((cell: any) => ({
      id: cell.id,
      content: cell.source,
      type: cell.cell_type,
      metadata: cell.metadata || {},
    }));

    return {
      cells,
      metadata: notebookContent.metadata || {},
    };
  }

  /**
   * Update cell content in the Yjs document
   * @param cellId ID of the cell to update
   * @param content New content for the cell
   */
  updateCellContent(cellId: string, content: string): void {
    // Initialize document structure if needed
    this.initializeDocumentStructure();

    // Find the cell by ID in the YNotebook
    const notebookContent = this.yNotebook.toJSON();
    const cellIndex = notebookContent.cells.findIndex(
      (cell: any) => cell.id === cellId,
    );

    if (cellIndex !== -1) {
      // Update the cell content using YNotebook's setSource method
      const cell = this.yNotebook.getCell(cellIndex);
      this.document.transact(() => {
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
      this.document.transact(() => {
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
    // Initialize document structure if needed
    this.initializeDocumentStructure();

    const cellId = `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newCell = {
      cell_type: type,
      source: content,
      metadata: {},
      id: cellId,
    };

    if (position !== undefined && position >= 0) {
      // Insert at specific position
      this.document.transact(() => {
        this.yNotebook.insertCell(position, newCell);
      });
    } else {
      // Append to the end
      this.document.transact(() => {
        this.yNotebook.addCell(newCell);
      });
    }

    return cellId;
  }

  /**
   * Delete a cell from the notebook
   * @param cellId ID of the cell to delete
   */
  deleteCell(cellId: string): void {
    // Initialize document structure if needed
    this.initializeDocumentStructure();

    // Find the cell by ID in the YNotebook
    const notebookContent = this.yNotebook.toJSON();
    const cellIndex = notebookContent.cells.findIndex(
      (cell: any) => cell.id === cellId,
    );

    if (cellIndex === -1) {
      console.warn(`Cell with ID ${cellId} not found in document`);
      return;
    }

    // Delete the cell using YNotebook's deleteCell method
    this.document.transact(() => {
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

      console.error(
        `Attempting to reconnect to document ${this.session.fileId} in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
      );

      setTimeout(() => {
        if (!this.connected) {
          this.connect().catch((error: any) => {
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
              `Reconnection failed for document ${this.session.fileId}: ${errorMessage}`,
            );
          });
        }
      }, delay);
    } else {
      console.error(
        `Max reconnection attempts reached for document ${this.session.fileId}`,
      );
    }
  }

  /**
   * Handle sync event from the WebSocket provider
   * @param isSynced Whether the document is synchronized
   */
  private _onSync = (isSynced: boolean) => {
    console.error(`[DEBUG] Document sync status: ${isSynced}`);
    this.synced = isSynced;
    if (isSynced && this.connected) {
      // Set document ID after sync, similar to JupyterLab's implementation
      const state = this.document.getMap("state");
      state.set("document_id", this.provider!.roomname);
      console.error(
        `[DEBUG] Document synchronized and ready, resolving connection promise`,
      );

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
  private _onConnectionClosed = (event: any) => {
    this.connected = false;
    this.synced = false;
    console.error(`Disconnected from document: ${this.session.fileId}`, event);
    this.handleReconnect();
  };
}
