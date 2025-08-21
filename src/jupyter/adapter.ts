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
import { TextDocumentSession } from "./textdoc-session.js";

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
  private _baseUrl: string;
  private _token: string | undefined;
  private _kernelManager: KernelManager;
  private sessionTimeout: number;
  private sessionTimeoutTimers: Map<string, ReturnType<typeof setTimeout>>;

  private documentSessions: Map<string, TextDocumentSession>;
  private notebookSessions: Map<string, NotebookSession>;

  constructor(sessionTimeout?: number, baseUrl?: string, token?: string) {
    this.sessionTimeout = sessionTimeout || 5 * 60 * 1000; // Default to 5 minutes
    this.sessionTimeoutTimers = new Map();

    this._baseUrl =
      baseUrl || process.env.JUPYTERLAB_URL || "http://localhost:8888";
    this._token = token || process.env.JUPYTERLAB_TOKEN;

    // Create server settings for the KernelManager
    const serverSettings = ServerConnection.makeSettings({
      baseUrl: this.baseUrl,
      token: this.token,
    });

    // Initialize the KernelManager with server settings
    this._kernelManager = new KernelManager({ serverSettings });

    this.documentSessions = new Map();
    this.notebookSessions = new Map();
  }

  get baseUrl() {
    return this._baseUrl;
  }
  get token() {
    return this._token;
  }
  get kernelManager() {
    return this._kernelManager;
  }

  /**
   * Get an existing document session
   * @param fileId File ID of the document
   * @returns TextDocumentSession or undefined if not found
   */
  getDocumentSession(fileId: string): TextDocumentSession | undefined {
    return this.documentSessions.get(fileId);
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
   * Close a document session
   * @param fileId File ID of the document
   */
  async closeDocumentSession(fileId: string): Promise<void> {
    const session = this.documentSessions.get(fileId);
    if (session) {
      // Clear any existing timeout timer
      this.clearSessionTimeout(fileId);

      await session.disconnect();
      this.documentSessions.delete(fileId);
    }
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
   * Close all document sessions
   */
  async closeAllDocumentSessions(): Promise<void> {
    // Clear all timeout timers for document sessions
    for (const fileId of this.documentSessions.keys()) {
      this.clearSessionTimeout(fileId);
    }

    const closePromises = Array.from(this.documentSessions.values()).map(
      (session) => session.disconnect(),
    );
    await Promise.all(closePromises);
    this.documentSessions.clear();
  }

  /**
   * Close all notebook sessions
   */
  async closeAllNotebookSessions(): Promise<void> {
    // Clear all timeout timers for notebook sessions
    for (const fileId of this.notebookSessions.keys()) {
      this.clearSessionTimeout(fileId);
    }

    const closePromises = Array.from(this.notebookSessions.values()).map(
      (session) => session.disconnect(),
    );
    await Promise.all(closePromises);
    this.notebookSessions.clear();
  }

  /**
   * Create a new document session for the given path
   * @param path Path to the document
   * @returns Promise that resolves to a TextDocumentSession
   */
  async createDocumentSession(path: string): Promise<TextDocumentSession> {
    try {
      // Request a document session from JupyterLab
      const session = await this.requestDocSession(path, "file");

      // Check if we already have a session for this document
      if (this.documentSessions.has(session.fileId)) {
        const existingSession = this.documentSessions.get(session.fileId)!;
        if (!existingSession.isConnected()) {
          await existingSession.connect();
        }
        return existingSession;
      }

      // Create a new document session
      const documentSession = new TextDocumentSession(session, this);

      this.documentSessions.set(session.fileId, documentSession);

      // Connect to the document
      await documentSession.connect();

      // Set up session timeout
      this.setupSessionTimeout(session.fileId);

      return documentSession;
    } catch (error) {
      logger.error(`Error in createDocumentSession for path ${path}`, error);
      throw error;
    }
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
        this,
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
   * End an RTC session for a document
   * @param params Parameters for ending a session
   * @returns MCP response indicating success
   */
  async endDocumentSession(params: { path: string }): Promise<CallToolResult> {
    // Find the session for this document
    let sessionToClose = null;
    let sessionFileId = null;
    for (const [fileId, session] of this.documentSessions) {
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
      this.documentSessions.delete(sessionFileId!);

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
                message: "No active RTC session found for this document",
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
   * Query the status of an RTC session for a document
   * @param params Parameters for querying session status
   * @returns MCP response with session status
   */
  async queryDocumentSession(params: {
    path: string;
  }): Promise<CallToolResult> {
    // Find the session for this document
    let foundSession = null;
    for (const [, session] of this.documentSessions) {
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

    const response = await this.makeJupyterRequest(url, init);

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
   * Make an HTTP request to JupyterLab with proper authentication and headers
   * @param url URL to request
   * @param init Request initialization options
   * @returns Promise that resolves to the response
   */
  public async makeJupyterRequest(
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const settings = ServerConnection.makeSettings({ baseUrl: this.baseUrl });

    // Initialize headers if not provided
    if (!init.headers) {
      init.headers = {};
    }

    // Add authorization header if token is provided
    if (this.token) {
      init.headers = {
        ...init.headers,
        Authorization: `token ${this.token}`,
      };
    }

    // Add session headers (cookies and XSRF token)
    const sessionHeaders = cookieManager.sessionHeaders();
    init.headers = {
      ...init.headers,
      ...sessionHeaders,
    };

    // Make the request
    const response = await ServerConnection.makeRequest(url, init, settings);

    // Store cookies from response
    cookieManager.parseResponseHeaders(response.headers);

    return response;
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

    const response = await this.makeJupyterRequest(url, init);

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
 * Execute code cell with a kernel connection, update its outputs and return output data
 *
 * @param cell The YCodeCell to execute
 * @param kernelConn The kernel connection
 * @param maxOutputSize Maximum size in characters for output data (default: 2000)
 * @returns Promise that resolves with cell output data when execution is complete
 */
export async function executeJupyterCell(
  cell: YCodeCell,
  kernelConn: IKernelConnection,
  maxOutputSize: number = 2000,
): Promise<{ outputs: IOutput[]; truncated: boolean; originalSize?: number }> {
  logger.debug(`Executing cell with source: ${cell.source}`);

  // Clear any existing outputs
  cell.clearOutputs();
  cell.execution_count = null;
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
          const newOutput = {
            output_type: "execute_result" as const,
            execution_count: executeResult.execution_count,
            data: executeResult.data,
            metadata: executeResult.metadata || {},
          };
          outputs.push(newOutput);
          // Add the new output at the end of the outputs array
          cell.updateOutputs(outputs.length - 1, outputs.length, [newOutput]);
          break;
        }

        case "stream": {
          const stream = msg.content as KernelMessage.IStreamMsg["content"];
          const streamOutput = {
            output_type: "stream" as const,
            name: stream.name,
            text: stream.text,
          };

          // Check if there's already a stream output with the same name
          let existingStreamIndex = -1;
          for (let i = outputs.length - 1; i >= 0; i--) {
            if (
              outputs[i].output_type === "stream" &&
              outputs[i].name === stream.name
            ) {
              existingStreamIndex = i;
              break;
            }
          }

          if (existingStreamIndex >= 0) {
            // Append to existing stream output
            cell.appendStreamOutput(existingStreamIndex, stream.text);
            // Update our local outputs array to match
            outputs[existingStreamIndex] = {
              ...outputs[existingStreamIndex],
              text: (outputs[existingStreamIndex].text || "") + stream.text,
            };
          } else {
            // Create new stream output
            outputs.push(streamOutput);
            cell.updateOutputs(outputs.length - 1, outputs.length, [
              streamOutput,
            ]);
          }
          break;
        }

        case "display_data": {
          const displayData =
            msg.content as KernelMessage.IDisplayDataMsg["content"];
          const newOutput = {
            output_type: "display_data" as const,
            data: displayData.data,
            metadata: displayData.metadata || {},
          };
          outputs.push(newOutput);
          // Add the new output at the end of the outputs array
          cell.updateOutputs(outputs.length - 1, outputs.length, [newOutput]);
          break;
        }

        case "error": {
          const error = msg.content as KernelMessage.IErrorMsg["content"];
          const newOutput = {
            output_type: "error" as const,
            ename: error.ename,
            evalue: error.evalue,
            traceback: error.traceback,
          };
          outputs.push(newOutput);
          // Add the new output at the end of the outputs array
          cell.updateOutputs(outputs.length - 1, outputs.length, [newOutput]);
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
    };

    // Wait for the execution to complete
    await future.done;

    logger.debug("Cell execution completed successfully");

    // Process outputs with truncation
    const {
      outputs: processedOutputs,
      truncated,
      originalSize,
    } = processCellOutputsWithTruncation(outputs, maxOutputSize);

    return { outputs: processedOutputs, truncated, originalSize };
  } catch (error) {
    logger.error("Error executing cell:", error);

    // Add an error output to the cell
    const errorOutput: IOutput = {
      output_type: "error",
      ename: "ExecutionError",
      evalue: error instanceof Error ? error.message : String(error),
      traceback: error instanceof Error ? [error.stack || ""] : [String(error)],
    };

    // Clear any existing outputs and add the error output
    const currentOutputs = cell.getOutputs();
    cell.updateOutputs(0, currentOutputs.length, [errorOutput]);

    // Process error output with truncation
    const {
      outputs: processedOutputs,
      truncated,
      originalSize,
    } = processCellOutputsWithTruncation([errorOutput], maxOutputSize);

    return { outputs: processedOutputs, truncated, originalSize };
  } finally {
    // restore idle state
    cell.executionState = "idle";
  }
}

/**
 * Helper function to process cell outputs with truncation
 * @param outputs Cell outputs to process
 * @param maxOutputSize Maximum size in characters for output data
 * @returns Processed outputs with truncation info and original size
 */
function processCellOutputsWithTruncation(
  outputs: IOutput[],
  maxOutputSize: number,
): { outputs: IOutput[]; truncated: boolean; originalSize?: number } {
  const processedOutputs: IOutput[] = [];
  let anyTruncated = false;
  let totalOriginalSize = 0;

  for (const output of outputs) {
    if (
      output.output_type === "execute_result" ||
      output.output_type === "display_data"
    ) {
      // Process data outputs
      const processedOutput: IOutput = {
        output_type: output.output_type,
        execution_count: output.execution_count,
        data: {},
        metadata: output.metadata || {},
      };

      // Process each data field (e.g., text/plain, image/png, etc.)
      const data = output.data || {};
      for (const [mimeType, value] of Object.entries(data)) {
        if (typeof value === "string") {
          totalOriginalSize += value.length;
          if (value.length > maxOutputSize) {
            (processedOutput.data as Record<string, unknown>)[mimeType] =
              value.substring(0, maxOutputSize) + "... [truncated]";
            anyTruncated = true;
          } else {
            (processedOutput.data as Record<string, unknown>)[mimeType] = value;
          }
        } else {
          // For non-string data, keep as is
          (processedOutput.data as Record<string, unknown>)[mimeType] = value;
        }
      }

      processedOutputs.push(processedOutput);
    } else if (output.output_type === "error") {
      // Process error outputs
      const processedOutput: IOutput = {
        output_type: "error",
        ename: output.ename,
        evalue: output.evalue,
        traceback: output.traceback,
      };

      // Truncate error value if it's too long
      if (
        typeof processedOutput.evalue === "string" &&
        processedOutput.evalue.length > maxOutputSize
      ) {
        totalOriginalSize += processedOutput.evalue.length;
        processedOutput.evalue =
          processedOutput.evalue.substring(0, maxOutputSize) +
          "... [truncated]";
        anyTruncated = true;
      }

      // Truncate traceback if it's too long
      if (
        processedOutput.traceback &&
        Array.isArray(processedOutput.traceback)
      ) {
        const processedTraceback: string[] = [];
        for (const line of processedOutput.traceback) {
          if (typeof line === "string" && line.length > maxOutputSize) {
            totalOriginalSize += line.length;
            processedTraceback.push(
              line.substring(0, maxOutputSize) + "... [truncated]",
            );
            anyTruncated = true;
          } else if (typeof line === "string") {
            totalOriginalSize += line.length;
            processedTraceback.push(line);
          }
        }
        processedOutput.traceback = processedTraceback;
      }

      processedOutputs.push(processedOutput);
    } else if (output.output_type === "stream") {
      // Process stream outputs
      const processedOutput: IOutput = {
        output_type: "stream",
        name: output.name,
        text: output.text,
      };

      // Truncate stream text if it's too long
      if (
        typeof processedOutput.text === "string" &&
        processedOutput.text.length > maxOutputSize
      ) {
        totalOriginalSize += processedOutput.text.length;
        processedOutput.text =
          processedOutput.text.substring(0, maxOutputSize) + "... [truncated]";
        anyTruncated = true;
      }

      processedOutputs.push(processedOutput);
    } else {
      // Unknown output type, keep as is
      processedOutputs.push(output);
    }
  }

  return {
    outputs: processedOutputs,
    truncated: anyTruncated,
    originalSize: anyTruncated ? totalOriginalSize : undefined,
  };
}
