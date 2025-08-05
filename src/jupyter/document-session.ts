import { ServerConnection } from "@jupyterlab/services";
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
 * DocumentSession represents a session with a JupyterLab document
 *
 * This class handles WebSocket connections, document synchronization,
 * and change tracking for a single document.
 */
export class DocumentSession {
  private session: ISessionModel;
  private baseUrl: string;
  private serverSettings: ServerConnection.ISettings;
  private token: string | undefined;
  private cookieManager: typeof cookieManager;
  private document: Y.Doc;
  private provider: WebsocketProvider | null;
  private connected: boolean;
  private updateCallbacks: Set<(update: Uint8Array) => void>;
  private reconnectAttempts: number;
  private maxReconnectAttempts: number;

  constructor(
    session: ISessionModel,
    baseUrl: string,
    serverSettings: ServerConnection.ISettings,
    token?: string,
  ) {
    this.session = session;
    this.baseUrl = baseUrl;
    this.serverSettings = serverSettings;
    this.token = token;
    this.cookieManager = cookieManager;
    this.document = new Y.Doc();
    this.provider = null;
    this.connected = false;
    this.updateCallbacks = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  /**
   * Connect to the JupyterLab WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = URLExt.join(
          this.baseUrl.replace(/^http/, "ws"),
          "api/collaboration/room",
          `${this.session.format}:${this.session.type}:${this.session.fileId}`,
        );

        const wsUrlWithParams = new URL(wsUrl);
        wsUrlWithParams.searchParams.append(
          "sessionId",
          this.session.sessionId,
        );

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
            resolve();
          }
        });

        this.provider.on("connection-close", () => {
          this.connected = false;
          console.error(`Disconnected from document: ${this.session.fileId}`);
          this.handleReconnect();
          this.provider?.on("connection-error", (error: any) => {
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
                errorMessage =
                  error.error.message || JSON.stringify(error.error);
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
            console.error(
              `[DEBUG] WebSocket URL: ${wsUrlWithParams.toString()}`,
            );
            console.error(`[DEBUG] Base URL: ${this.baseUrl}`);
            console.error(`[DEBUG] Session ID: ${this.session.sessionId}`);
            console.error(`[DEBUG] File ID: ${this.session.fileId}`);

            if (!this.connected) {
              reject(
                new Error(`Failed to connect to document: ${errorMessage}`),
              );
            }
          });
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
   * Disconnect from the JupyterLab WebSocket server
   */
  async disconnect(): Promise<void> {
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }
    this.connected = false;
    this.updateCallbacks.clear();
    console.error(`Disconnected from document: ${this.session.fileId}`);
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
   * Get the notebook content from the Yjs document
   */
  getNotebookContent(): any {
    const cells = [];
    const cellsMap = this.document.getMap("cells");

    for (const [cellId, cell] of cellsMap) {
      if (cell instanceof Y.Map) {
        cells.push({
          id: cellId,
          content: cell.get("source") || "",
          type: cell.get("cell_type") || "code",
          metadata: cell.get("metadata")?.toJSON() || {},
        });
      }
    }

    return {
      cells,
      metadata: this.document.getMap("metadata")?.toJSON() || {},
    };
  }

  /**
   * Update cell content in the Yjs document
   * @param cellId ID of the cell to update
   * @param content New content for the cell
   */
  updateCellContent(cellId: string, content: string): void {
    const cellsMap = this.document.getMap("cells");
    let cell = cellsMap.get(cellId);

    if (cell instanceof Y.Map) {
      cell.set("source", content);
    } else {
      // Create a new cell if it doesn't exist
      const newCell = new Y.Map();
      newCell.set("source", content);
      newCell.set("cell_type", "code");
      newCell.set("metadata", new Y.Map());
      cellsMap.set(cellId, newCell);
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
    const cellsMap = this.document.getMap("cells");
    const cellId = `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newCell = new Y.Map();
    newCell.set("source", content);
    newCell.set("cell_type", type);
    newCell.set("metadata", new Y.Map());

    if (position !== undefined && position >= 0) {
      // Insert at specific position
      const cells = Array.from(cellsMap.entries());
      const newCells = new Y.Map();

      // Insert cells before the position
      for (let i = 0; i < position && i < cells.length; i++) {
        newCells.set(cells[i][0], cells[i][1]);
      }

      // Insert the new cell
      newCells.set(cellId, newCell);

      // Insert remaining cells
      for (let i = position; i < cells.length; i++) {
        newCells.set(cells[i][0], cells[i][1]);
      }

      // Replace the cells map
      this.document.transact(() => {
        cellsMap.clear();
        for (const [key, value] of newCells) {
          cellsMap.set(key, value);
        }
      });
    } else {
      // Append to the end
      cellsMap.set(cellId, newCell);
    }

    return cellId;
  }

  /**
   * Delete a cell from the notebook
   * @param cellId ID of the cell to delete
   */
  deleteCell(cellId: string): void {
    const cellsMap = this.document.getMap("cells");
    cellsMap.delete(cellId);
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
          this.connect().catch((error) => {
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
