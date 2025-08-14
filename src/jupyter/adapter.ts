import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { ServerConnection } from "@jupyterlab/services";
import { URLExt } from "@jupyterlab/coreutils";
// import { DocumentSession } from "./document-session.js";
import { NotebookSession } from "./notebook-session.js";
import { cookieManager } from "./cookie-manager.js";
import { logger } from "../utils/logger.js";

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
  // private documentSessions: Map<string, DocumentSession>;
  private notebookSessions: Map<string, NotebookSession>;
  private token: string | undefined;

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl =
      baseUrl || process.env.JUPYTERLAB_URL || "http://localhost:8888";
    this.token = token || process.env.JUPYTERLAB_TOKEN;

    // this.documentSessions = new Map();
    this.notebookSessions = new Map();
  }

  // /**
  //  * Create a new document session for the given path
  //  * @param path Path to the document
  //  * @param type Document type (default: 'notebook')
  //  * @returns Promise that resolves to a DocumentSession
  //  */
  // async createDocumentSession(
  //   path: string,
  //   type: string = "notebook",
  // ): Promise<DocumentSession> {
  //   try {
  //     // Request a document session from JupyterLab
  //     const session = await this.requestDocSession(path, type);

  //     // Check if we already have a session for this document
  //     if (this.documentSessions.has(session.fileId)) {
  //       const existingSession = this.documentSessions.get(session.fileId)!;
  //       if (!existingSession.isConnected()) {
  //         await existingSession.connect();
  //       }
  //       return existingSession;
  //     }

  //     // Create a new document session
  //     const documentSession = new DocumentSession(
  //       session,
  //       this.baseUrl,
  //       this.token,
  //     );

  //     // Store the original path for later use with contents API
  //     (
  //       documentSession as DocumentSession & { originalPath?: string }
  //     ).originalPath = path;

  //     this.documentSessions.set(session.fileId, documentSession);

  //     // Connect to the document
  //     await documentSession.connect();

  //     return documentSession;
  //   } catch (error) {
  //     logger.error(`Error in createDocumentSession for path ${path}: `, error);
  //     throw error;
  //   }
  // }

  // /**
  //  * Get an existing document session
  //  * @param fileId File ID of the document
  //  * @returns DocumentSession or undefined if not found
  //  */
  // getDocumentSession(fileId: string): DocumentSession | undefined {
  //   return this.documentSessions.get(fileId);
  // }

  /**
   * Get an existing notebook session
   * @param fileId File ID of the notebook
   * @returns NotebookSession or undefined if not found
   */
  getNotebookSession(fileId: string): NotebookSession | undefined {
    return this.notebookSessions.get(fileId);
  }

  // /**
  //  * Close a document session
  //  * @param fileId File ID of the document
  //  */
  // async closeDocumentSession(fileId: string): Promise<void> {
  //   const session = this.documentSessions.get(fileId);
  //   if (session) {
  //     await session.disconnect();
  //     this.documentSessions.delete(fileId);
  //   }
  // }

  /**
   * Close a notebook session
   * @param fileId File ID of the notebook
   */
  async closeNotebookSession(fileId: string): Promise<void> {
    const session = this.notebookSessions.get(fileId);
    if (session) {
      await session.disconnect();
      this.notebookSessions.delete(fileId);
    }
  }

  // /**
  //  * Close all document sessions
  //  */
  // async closeAllDocumentSessions(): Promise<void> {
  //   const closePromises = Array.from(this.documentSessions.values()).map(
  //     (session) => session.disconnect(),
  //   );
  //   await Promise.all(closePromises);
  //   this.documentSessions.clear();
  // }

  /**
   * Close all notebook sessions
   */
  async closeAllNotebookSessions(): Promise<void> {
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
      const notebookContent = foundSession.getNotebookContent();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                path: params.path,
                session_id: sessionInfo.sessionId,
                file_id: sessionInfo.fileId,
                status: foundSession.isConnected()
                  ? "connected"
                  : "disconnected",
                cell_count: notebookContent.cells.length,
                last_activity: new Date().toISOString(),
                message: "RTC session is active",
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
        const notebookContent = foundSession.getNotebookContent();
        const status = foundSession.isConnected()
          ? "connected"
          : "disconnected";

        if (status === "connected") {
          activeSessions++;
        }

        sessions.push({
          path: notebook.path,
          session_id: sessionInfo.sessionId,
          file_id: sessionInfo.fileId,
          status,
          cell_count: notebookContent.cells.length,
          last_activity: new Date().toISOString(),
          message:
            status === "connected"
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
    content?: any[];
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
          if (item.type === "directory") {
            notebooks.push(...this._extractNotebooks(item));
          } else if (item.type === "notebook") {
            notebooks.push({
              path: item.path,
              name: item.name,
              last_modified: item.last_modified,
              created: item.created,
              size: item.size,
              writable: item.writable,
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
}
