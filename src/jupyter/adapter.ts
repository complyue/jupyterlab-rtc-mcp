import { YCodeCell } from "@jupyter/ydoc";
import { URLExt } from "@jupyterlab/coreutils";
import { IOutput } from "@jupyterlab/nbformat";
import {
  KernelManager,
  KernelMessage,
  ServerConnection,
} from "@jupyterlab/services";
import { IKernelConnection } from "@jupyterlab/services/lib/kernel/kernel.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";

import { logger } from "../utils/logger.js";
import { cookieManager } from "./cookie-manager.js";
import { NotebookSession } from "./notebook-session.js";

export interface ISessionModel {
  format: string;
  type: string;
  fileId: string;
  sessionId: string;
}

/**
 * JupyterLabAdapter handles communication with a JupyterLab instance with its RTC infrastructure
 *
 * This adapter manages WebSocket connections for notebook and document sessions, provides
 * an interface for AI agents to interact with Jupyter notebooks and documents.
 *
 * By design, notebook/document sessions are created implicititly on-demand, and must be closed
 * explicitly by AI agents by using tools.
 */
export class JupyterLabAdapter {
  private baseUrl: string;
  private _kernelManager: KernelManager;

  // private documentSessions: Map<string, DocumentSession>;
  private notebookSessions: Map<string, NotebookSession>;
  private token: string | undefined;
  private sessionTimeout: number;
  private sessionTimeoutTimers: Map<string, ReturnType<typeof setTimeout>>;

  constructor(sessionTimeout?: number, baseUrl?: string, token?: string) {
    this.baseUrl =
      baseUrl || process.env.JUPYTERLAB_URL || "http://localhost:8888";
    this.token = token || process.env.JUPYTERLAB_TOKEN;
    this.sessionTimeout = sessionTimeout || 5 * 60 * 1000; // Default to 5 minutes
    this.sessionTimeoutTimers = new Map();

    // Create server settings for the KernelManager
    const serverSettings = ServerConnection.makeSettings({
      baseUrl: this.baseUrl,
      token: this.token,
    });

    // Initialize the KernelManager with server settings
    this._kernelManager = new KernelManager({ serverSettings });

    this.notebookSessions = new Map();
  }

  get kernelManager() {
    return this._kernelManager;
  }

  /**
   * Get an existing notebook session
   * @param fileId File ID of the notebook
   * @returns NotebookSession or undefined if not found
   */
  getNotebookSession(fileId: string): NotebookSession | undefined {
    return this.notebookSessions.get(fileId);
  }

  /**
   * Close a notebook session
   * @param fileId File ID of the notebook
   */
  async closeNotebookSession(fileId: string): Promise<void> {
    const session = this.notebookSessions.get(fileId);
    if (session) {
      // Clear any existing timeout timer
      this.clearSessionTimeout(fileId);

      await session.disconnect();
      this.notebookSessions.delete(fileId);
    }
  }

  /**
   * Close all notebook sessions
   */
  async closeAllNotebookSessions(): Promise<void> {
    // Clear all timeout timers
    for (const fileId of this.sessionTimeoutTimers.keys()) {
      this.clearSessionTimeout(fileId);
    }

    const closePromises = Array.from(this.notebookSessions.values()).map(
      (session) => session.disconnect(),
    );
    await Promise.all(closePromises);
    this.notebookSessions.clear();
  }

  /**
   * Create a new notebook session for the given path
   * @param path Path to the notebook
   * @returns Promise that resolves to a NotebookSession
   */
  async createNotebookSession(path: string): Promise<NotebookSession> {
    try {
      // Request a document session from JupyterLab
      const session = await this.requestDocSession(path, "notebook");

      // Check if we already have a session for this notebook
      if (this.notebookSessions.has(session.fileId)) {
        const existingSession = this.notebookSessions.get(session.fileId)!;
        if (!existingSession.isConnected()) {
          await existingSession.connect();
        }
        return existingSession;
      }

      // Create a new notebook session
      const notebookSession = new NotebookSession(
        session,
        this._kernelManager,
        this.baseUrl,
        this.token,
      );

      // Store the original path for later use with contents API
      (
        notebookSession as NotebookSession & { originalPath?: string }
      ).originalPath = path;

      this.notebookSessions.set(session.fileId, notebookSession);

      // Connect to the notebook
      await notebookSession.connect();

      // Set up session timeout
      this.setupSessionTimeout(session.fileId);

      return notebookSession;
    } catch (error) {
      logger.error(`Error in createNotebookSession for path ${path}`, error);
      throw error;
    }
  }

  /**
   * End an RTC session for a notebook
   * @param params Parameters for ending a session
   * @returns MCP response indicating success
   */
  async endNotebookSession(params: { path: string }): Promise<CallToolResult> {
    // Find the session for this notebook
    let sessionToClose = null;
    let sessionFileId = null;
    for (const [fileId, session] of this.notebookSessions) {
      const sessionInfo = session.session;
      if (
        sessionInfo.fileId === params.path ||
        sessionInfo.fileId.endsWith(params.path)
      ) {
        sessionToClose = session;
        sessionFileId = fileId;
        break;
      }
    }

    if (sessionToClose) {
      // Clear any existing timeout timer
      this.clearSessionTimeout(sessionFileId!);

      await sessionToClose.disconnect();
      this.notebookSessions.delete(sessionFileId!);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                path: params.path,
                status: "disconnected",
                message: "RTC session ended successfully",
              },
              null,
              2,
            ),
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                path: params.path,
                status: "not_found",
                message: "No active RTC session found for this notebook",
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  }

  /**
   * Query the status of an RTC session for a notebook
   * @param params Parameters for querying session status
   * @returns MCP response with session status
   */
  async queryNotebookSession(params: {
    path: string;
  }): Promise<CallToolResult> {
    // Find the session for this notebook
    let foundSession = null;
    for (const [, session] of this.notebookSessions) {
      const sessionInfo = session.session;
      if (
        sessionInfo.fileId === params.path ||
        sessionInfo.fileId.endsWith(params.path)
      ) {
        foundSession = session;
        break;
      }
    }

    if (foundSession) {
      const sessionInfo = foundSession.session;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                path: params.path,
                session_id: sessionInfo.sessionId,
                file_id: sessionInfo.fileId,
                connected: foundSession.isConnected(),
                synced: foundSession.isSynced(),
                message: "RTC session found",
              },
              null,
              2,
            ),
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                path: params.path,
                status: "not_found",
                message: "No active RTC session found",
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  }

  /**
   * Query the status of RTC sessions for notebooks in a directory
   * @param params Parameters for querying session status
   * @returns MCP response with session status information
   */
  async queryNotebookSessions(params: {
    root_path?: string;
  }): Promise<CallToolResult> {
    const { ServerConnection } = await import("@jupyterlab/services");
    const { URLExt } = await import("@jupyterlab/coreutils");

    const settings = ServerConnection.makeSettings({ baseUrl: this.baseUrl });
    const rootPath = params.root_path || "";
    const url = URLExt.join(settings.baseUrl, "/api/contents", rootPath);

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
    let data = null;

    if (dataText.length > 0) {
      try {
        data = JSON.parse(dataText);
      } catch {
        logger.error("Not a JSON response body.", response);
      }
    }

    if (!response.ok) {
      throw new Error(
        `Server returned ${response.status}: ${data && typeof data === "object" && "message" in data ? (data as { message: string }).message : dataText}`,
      );
    }

    // Get all notebooks in the directory
    const notebooks = this._extractNotebooks(data);

    // Check each notebook for an active session
    const sessions = [];
    let activeSessions = 0;

    for (const notebook of notebooks) {
      let foundSession = null;
      for (const [, session] of this.notebookSessions) {
        const sessionInfo = session.session;
        if (
          sessionInfo.fileId === notebook.path ||
          sessionInfo.fileId.endsWith(notebook.path)
        ) {
          foundSession = session;
          break;
        }
      }

      if (foundSession) {
        const sessionInfo = foundSession.session;

        if (foundSession.isConnected()) {
          activeSessions++;
        }

        sessions.push({
          path: notebook.path,
          session_id: sessionInfo.sessionId,
          file_id: sessionInfo.fileId,
          connected: foundSession.isConnected(),
          synced: foundSession.isSynced(),
          message: foundSession.isConnected()
            ? "RTC session is active"
            : "RTC session ended",
        });
      } else {
        sessions.push({
          path: notebook.path,
          session_id: "",
          file_id: "",
          status: "not_found",
          cell_count: 0,
          last_activity: null,
          message: "No active RTC session found for this notebook",
        });
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              root_path: rootPath,
              sessions,
              total_sessions: sessions.length,
              active_sessions: activeSessions,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  /**
   * Request a document session from JupyterLab
   * @param path Path to the document
   * @param type Document type
   * @returns Promise that resolves to a session model
   */
  private async requestDocSession(
    path: string,
    type: string,
  ): Promise<ISessionModel> {
    const settings = ServerConnection.makeSettings({ baseUrl: this.baseUrl });
    const url = URLExt.join(
      settings.baseUrl,
      "api/collaboration/session",
      encodeURIComponent(path),
    );

    const init: RequestInit = {
      method: "PUT",
      body: JSON.stringify({ format: "json", type }),
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
      }
    }

    if (!response.ok) {
      throw new Error(
        `Server returned ${response.status}: ${data && typeof data === "object" && "message" in data ? (data as { message: string }).message : dataText}`,
      );
    }

    return data as ISessionModel;
  }

  /**
   * Extract notebook files from JupyterLab contents API response
   * @param contents Contents API response
   * @returns Array of notebook objects
   */
  private _extractNotebooks(contents: {
    type: string;
    content?: unknown[];
    path?: string;
    name?: string;
    last_modified?: string;
    created?: string;
    size?: number;
    writable?: boolean;
  }): Array<{
    path: string;
    name: string;
    last_modified?: string;
    created?: string;
    size?: number;
    writable?: boolean;
  }> {
    const notebooks: Array<{
      path: string;
      name: string;
      last_modified?: string;
      created?: string;
      size?: number;
      writable?: boolean;
    }> = [];

    if (contents.type === "directory") {
      // Recursively process directory contents
      if (contents.content) {
        for (const item of contents.content) {
          const typedItem = item as {
            type: string;
            content?: unknown[];
            path?: string;
            name?: string;
            last_modified?: string;
            created?: string;
            size?: number;
            writable?: boolean;
          };

          if (typedItem.type === "directory") {
            notebooks.push(...this._extractNotebooks(typedItem));
          } else if (typedItem.type === "notebook") {
            notebooks.push({
              path: typedItem.path || "",
              name: typedItem.name || "",
              last_modified: typedItem.last_modified,
              created: typedItem.created,
              size: typedItem.size,
              writable: typedItem.writable,
            });
          }
        }
      }
    } else if (contents.type === "notebook") {
      // Single notebook file
      notebooks.push({
        path: contents.path!,
        name: contents.name!,
        last_modified: contents.last_modified,
        created: contents.created,
        size: contents.size,
        writable: contents.writable,
      });
    }

    return notebooks;
  }

  /**
   * Set up a timeout for a session to automatically close after inactivity
   * @param fileId File ID of the notebook
   */
  private setupSessionTimeout(fileId: string): void {
    // Clear any existing timeout timer
    this.clearSessionTimeout(fileId);

    // Set up new timeout timer
    const timer = setTimeout(async () => {
      logger.info(
        `Session timeout reached for notebook ${fileId}, closing session...`,
      );
      await this.closeNotebookSession(fileId);
    }, this.sessionTimeout);

    this.sessionTimeoutTimers.set(fileId, timer);
  }

  /**
   * Clear the timeout timer for a session
   * @param fileId File ID of the notebook
   */
  private clearSessionTimeout(fileId: string): void {
    const timer = this.sessionTimeoutTimers.get(fileId);
    if (timer) {
      clearTimeout(timer);
      this.sessionTimeoutTimers.delete(fileId);
    }
  }

  /**
   * Update the activity timestamp for a session and reset the timeout
   * @param fileId File ID of the notebook
   */
  public updateSessionActivity(fileId: string): void {
    if (this.notebookSessions.has(fileId)) {
      this.setupSessionTimeout(fileId);
    }
  }
}

/**
 * Execute code cell with a kernel connection, update its outputs
 *
 * @param cell The YCodeCell to execute
 * @param kernelConn The kernel connection
 * @returns Promise that resolves when execution is complete
 */
export async function executeJupyterCell(
  cell: YCodeCell,
  kernelConn: IKernelConnection,
): Promise<void> {
  logger.debug(`Executing cell with source: ${cell.source}`);

  // Clear any existing outputs
  cell.setOutputs([]);
  // set it's running state
  cell.executionState = "running";

  try {
    // Create an execute request using the kernel connection
    const future = kernelConn.requestExecute({
      code: cell.source,
      silent: false,
    });
    // Set up handlers for IOPub messages (outputs, streams, etc.)
    const outputs: IOutput[] = [];

    future.onIOPub = (msg) => {
      logger.debug(`Received IOPub message: ${msg.header.msg_type}`);

      // Handle different types of IOPub messages
      switch (msg.header.msg_type) {
        case "execute_result": {
          const executeResult =
            msg.content as KernelMessage.IExecuteResultMsg["content"];
          outputs.push({
            output_type: "execute_result",
            execution_count: executeResult.execution_count,
            data: executeResult.data,
            metadata: executeResult.metadata || {},
          });
          break;
        }

        case "stream": {
          const stream = msg.content as KernelMessage.IStreamMsg["content"];
          outputs.push({
            output_type: "stream",
            name: stream.name,
            text: stream.text,
          });
          break;
        }

        case "display_data": {
          const displayData =
            msg.content as KernelMessage.IDisplayDataMsg["content"];
          outputs.push({
            output_type: "display_data",
            data: displayData.data,
            metadata: displayData.metadata || {},
          });
          break;
        }

        case "error": {
          const error = msg.content as KernelMessage.IErrorMsg["content"];
          outputs.push({
            output_type: "error",
            ename: error.ename,
            evalue: error.evalue,
            traceback: error.traceback,
          });
          break;
        }

        case "execute_input": {
          const executeInput =
            msg.content as KernelMessage.IExecuteInputMsg["content"];
          // Set the execution count on the cell when execution starts
          cell.execution_count = executeInput.execution_count;
          break;
        }

        case "status":
          // Status messages don't produce outputs
          break;

        default:
          logger.debug(`Unhandled IOPub message type: ${msg.header.msg_type}`);
      }

      // Update the cell outputs with the latest outputs
      cell.setOutputs([...outputs]);
    };

    // Wait for the execution to complete
    await future.done;

    logger.debug("Cell execution completed successfully");
  } catch (error) {
    logger.error("Error executing cell:", error);

    // Add an error output to the cell
    const errorOutput: IOutput = {
      output_type: "error",
      ename: "ExecutionError",
      evalue: error instanceof Error ? error.message : String(error),
      traceback: error instanceof Error ? [error.stack || ""] : [String(error)],
    };

    cell.setOutputs([errorOutput]);
    throw error;
  } finally {
    // restore idle state
    cell.executionState = "idle";
  }
}
