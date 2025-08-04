import { ServerConnection } from "@jupyterlab/services";
import { URLExt } from "@jupyterlab/coreutils";
import { DocumentSession } from "./document-session.js";

export interface ISessionModel {
  format: string;
  type: string;
  fileId: string;
  sessionId: string;
}

/**
 * JupyterLabAdapter handles communication with JupyterLab's RTC infrastructure
 *
 * This adapter manages document sessions, WebSocket connections, and provides
 * an interface for AI agents to interact with Jupyter notebooks.
 */
export class JupyterLabAdapter {
  private baseUrl: string;
  private serverSettings: ServerConnection.ISettings;
  private documentSessions: Map<string, DocumentSession>;
  private token: string | undefined;

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl =
      baseUrl || process.env.JUPYTERLAB_URL || "http://localhost:8888";
    this.token = token || process.env.JUPYTERLAB_TOKEN;
    this.serverSettings = ServerConnection.makeSettings({
      baseUrl: this.baseUrl,
    });
    this.documentSessions = new Map();
  }

  /**
   * Create a new document session for the given path
   * @param path Path to the document
   * @param type Document type (default: 'notebook')
   * @returns Promise that resolves to a DocumentSession
   */
  async createDocumentSession(
    path: string,
    type: string = "notebook",
  ): Promise<DocumentSession> {
    try {
      // Request a document session from JupyterLab
      const session = await this.requestDocSession(path, type);

      // Check if we already have a session for this document
      if (this.documentSessions.has(session.fileId)) {
        const existingSession = this.documentSessions.get(session.fileId)!;
        if (!existingSession.isConnected()) {
          await existingSession.connect();
        }
        return existingSession;
      }

      // Create a new document session
      const documentSession = new DocumentSession(
        session,
        this.baseUrl,
        this.serverSettings,
        this.token,
      );
      this.documentSessions.set(session.fileId, documentSession);

      // Connect to the document
      await documentSession.connect();

      return documentSession;
    } catch (error) {
      throw new Error(
        `Failed to create document session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get an existing document session
   * @param fileId File ID of the document
   * @returns DocumentSession or undefined if not found
   */
  getDocumentSession(fileId: string): DocumentSession | undefined {
    return this.documentSessions.get(fileId);
  }

  /**
   * Close a document session
   * @param fileId File ID of the document
   */
  async closeDocumentSession(fileId: string): Promise<void> {
    const session = this.documentSessions.get(fileId);
    if (session) {
      await session.disconnect();
      this.documentSessions.delete(fileId);
    }
  }

  /**
   * Close all document sessions
   */
  async closeAllDocumentSessions(): Promise<void> {
    const closePromises = Array.from(this.documentSessions.values()).map(
      (session) => session.disconnect(),
    );
    await Promise.all(closePromises);
    this.documentSessions.clear();
  }

  /**
   * Begin an RTC session for a notebook
   * @param params Parameters for beginning a session
   * @returns MCP response with session information
   */
  async beginNotebookSession(params: { path: string }): Promise<any> {
    try {
      const session = await this.createDocumentSession(params.path, "notebook");
      const sessionInfo = this.getSessionInfo(session);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                path: params.path,
                session_id: sessionInfo.sessionId,
                file_id: sessionInfo.fileId,
                status: "connected",
                message: "RTC session started successfully",
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to begin notebook session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * End an RTC session for a notebook
   * @param params Parameters for ending a session
   * @returns MCP response indicating success
   */
  async endNotebookSession(params: { path: string }): Promise<any> {
    try {
      // Find the session for this notebook
      let sessionToClose = null;
      let sessionFileId = null;
      for (const [fileId, session] of this.documentSessions) {
        const sessionInfo = this.getSessionInfo(session);
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
                  message: "No active RTC session found for this notebook",
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    } catch (error) {
      throw new Error(
        `Failed to end notebook session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Query the status of an RTC session for a notebook
   * @param params Parameters for querying session status
   * @returns MCP response with session status
   */
  async queryNotebookSession(params: { path: string }): Promise<any> {
    try {
      // Find the session for this notebook
      let foundSession = null;
      for (const [fileId, session] of this.documentSessions) {
        const sessionInfo = this.getSessionInfo(session);
        if (
          sessionInfo.fileId === params.path ||
          sessionInfo.fileId.endsWith(params.path)
        ) {
          foundSession = session;
          break;
        }
      }

      if (foundSession) {
        const sessionInfo = this.getSessionInfo(foundSession);
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
    } catch (error) {
      throw new Error(
        `Failed to query notebook session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Query the status of RTC sessions for notebooks in a directory
   * @param params Parameters for querying session status
   * @returns MCP response with session status information
   */
  async queryNotebookSessions(params: { root_path?: string }): Promise<any> {
    try {
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

      let response: Response;
      try {
        response = await ServerConnection.makeRequest(url, init, settings);
      } catch (error) {
        throw new Error(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let data: any = await response.text();

      if (data.length > 0) {
        try {
          data = JSON.parse(data);
        } catch (error) {
          console.error("Not a JSON response body.", response);
        }
      }

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status}: ${data.message || data}`,
        );
      }

      // Get all notebooks in the directory
      const notebooks = this._extractNotebooks(data);

      // Check each notebook for an active session
      const sessions = [];
      let activeSessions = 0;

      for (const notebook of notebooks) {
        let foundSession = null;
        for (const [fileId, session] of this.documentSessions) {
          const sessionInfo = this.getSessionInfo(session);
          if (
            sessionInfo.fileId === notebook.path ||
            sessionInfo.fileId.endsWith(notebook.path)
          ) {
            foundSession = session;
            break;
          }
        }

        if (foundSession) {
          const sessionInfo = this.getSessionInfo(foundSession);
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
    } catch (error) {
      throw new Error(
        `Failed to query notebook sessions: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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

    let response: Response;
    try {
      response = await ServerConnection.makeRequest(url, init, settings);
    } catch (error) {
      throw new Error(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    let data: any = await response.text();

    if (data.length > 0) {
      try {
        data = JSON.parse(data);
      } catch (error) {
        console.error("Not a JSON response body.", response);
      }
    }

    if (!response.ok) {
      throw new Error(
        `Server returned ${response.status}: ${data.message || data}`,
      );
    }

    return data;
  }

  /**
   * Extract notebook files from JupyterLab contents API response
   * @param contents Contents API response
   * @returns Array of notebook objects
   */
  private _extractNotebooks(contents: any): any[] {
    const notebooks: any[] = [];

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
        path: contents.path,
        name: contents.name,
        last_modified: contents.last_modified,
        created: contents.created,
        size: contents.size,
        writable: contents.writable,
      });
    }

    return notebooks;
  }

  /**
   * Get session information from a DocumentSession
   * @param session DocumentSession
   * @returns Session model
   */
  private getSessionInfo(session: DocumentSession): ISessionModel {
    // We need to access the private session property
    // This is a workaround to avoid modifying the DocumentSession class
    return (session as any).session;
  }
}
