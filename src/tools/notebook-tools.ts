import { JupyterLabAdapter } from "../jupyter/adapter.js";
import { JupyterLabWebSocketClient } from "../jupyter/websocket-client.js";

/**
 * NotebookTools provides high-level operations for Jupyter notebooks
 *
 * This class implements the MCP tools for reading, writing, and executing
 * notebook cells, as well as other notebook-related operations.
 */
export class NotebookTools {
  private jupyterAdapter: JupyterLabAdapter;

  constructor(jupyterAdapter: JupyterLabAdapter) {
    this.jupyterAdapter = jupyterAdapter;
  }

  /**
   * List all notebook files under specified directory, recursively
   * @param params Parameters for listing notebooks
   * @returns MCP response with notebook list
   */
  async listNotebooks(params: { path?: string }): Promise<any> {
    try {
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings();
      const path = params.path || "";
      const url = URLExt.join(settings.baseUrl, "/api/contents", path);

      const init: RequestInit = {
        method: "GET",
      };

      // Add authorization header if token is provided
      const token = process.env.JUPYTERLAB_TOKEN;
      if (token) {
        init.headers = {
          ...init.headers,
          Authorization: `token ${token}`,
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

      // Process the response to extract notebook files
      const notebooks = this._extractNotebooks(data);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ notebooks }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to list notebooks: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
   * Get status information about a notebook
   * @param params Parameters for getting notebook status
   * @returns MCP response with notebook status
   */
  async getNotebookStatus(params: { path: string }): Promise<any> {
    try {
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings();

      // Get notebook content and metadata
      const contentUrl = URLExt.join(
        settings.baseUrl,
        "/api/contents",
        params.path,
      );
      const contentInit: RequestInit = {
        method: "GET",
      };

      // Add authorization header if token is provided
      const token = process.env.JUPYTERLAB_TOKEN;
      if (token) {
        contentInit.headers = {
          ...contentInit.headers,
          Authorization: `token ${token}`,
        };
      }

      let contentResponse: Response;
      try {
        contentResponse = await ServerConnection.makeRequest(
          contentUrl,
          contentInit,
          settings,
        );
      } catch (error) {
        throw new Error(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let contentData: any = await contentResponse.text();

      if (contentData.length > 0) {
        try {
          contentData = JSON.parse(contentData);
        } catch (error) {
          console.error("Not a JSON response body.", contentResponse);
        }
      }

      if (!contentResponse.ok) {
        throw new Error(
          `Server returned ${contentResponse.status}: ${contentData.message || contentData}`,
        );
      }

      // Get kernel sessions for this notebook
      const sessionsUrl = URLExt.join(settings.baseUrl, "/api/sessions");
      const sessionsInit: RequestInit = {
        method: "GET",
      };

      if (token) {
        sessionsInit.headers = {
          ...sessionsInit.headers,
          Authorization: `token ${token}`,
        };
      }

      let sessionsResponse: Response;
      try {
        sessionsResponse = await ServerConnection.makeRequest(
          sessionsUrl,
          sessionsInit,
          settings,
        );
      } catch (error) {
        throw new Error(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let sessionsData: any = await sessionsResponse.text();

      if (sessionsData.length > 0) {
        try {
          sessionsData = JSON.parse(sessionsData);
        } catch (error) {
          console.error("Not a JSON response body.", sessionsResponse);
        }
      }

      if (!sessionsResponse.ok) {
        throw new Error(
          `Server returned ${sessionsResponse.status}: ${sessionsData.message || sessionsData}`,
        );
      }

      // Find the kernel session for this notebook
      const kernelSession = sessionsData.find(
        (session: any) => session.path === params.path,
      );
      let kernelInfo = {
        name: "none",
        id: "",
        state: "not running",
      };

      if (kernelSession && kernelSession.kernel) {
        kernelInfo = {
          name: kernelSession.kernel.name,
          id: kernelSession.kernel.id,
          state: kernelSession.kernel.execution_state || "unknown",
        };
      }

      // Get cell count from notebook content
      let cellCount = 0;
      if (contentData.content && contentData.content.cells) {
        cellCount = contentData.content.cells.length;
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                path: params.path,
                cell_count: cellCount,
                last_modified: contentData.last_modified,
                kernel: kernelInfo,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to get notebook status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Read multiple cells by specifying ranges
   * @param params Parameters for reading cells
   * @returns MCP response with cell content
   */
  async readNotebookCells(params: {
    path: string;
    ranges?: Array<{ start: number; end?: number }>;
  }): Promise<any> {
    try {
      // First check if there's an active RTC session
      const sessionStatus = await this.jupyterAdapter.queryNotebookSession({
        path: params.path,
      });
      const statusData = JSON.parse(sessionStatus.content[0].text);

      if (statusData.status !== "connected") {
        throw new Error(
          `No active RTC session for notebook: ${params.path}. Please begin a session first using begin_nb_session.`,
        );
      }

      // Get the existing session
      const session = await this.jupyterAdapter.createDocumentSession(
        params.path,
        "notebook",
      );
      const notebookContent = session.getNotebookContent();

      const ranges = params.ranges || [
        { start: 0, end: notebookContent.cells.length },
      ];
      const cells = [];

      for (const range of ranges) {
        const start = range.start;
        const end = range.end !== undefined ? range.end : start + 1;

        for (let i = start; i < end && i < notebookContent.cells.length; i++) {
          cells.push({
            index: i,
            id: notebookContent.cells[i].id,
            content: notebookContent.cells[i].content,
            type: notebookContent.cells[i].type,
          });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ cells }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to read notebook cells: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Modify multiple cells by specifying ranges, execute them if not disabled
   * @param params Parameters for modifying cells
   * @returns MCP response indicating success
   */
  async modifyNotebookCells(params: {
    path: string;
    modifications: Array<{
      range: { start: number; end?: number };
      content: string;
    }>;
    exec?: boolean;
  }): Promise<any> {
    try {
      const session = await this.jupyterAdapter.createDocumentSession(
        params.path,
        "notebook",
      );
      const notebookContent = session.getNotebookContent();

      const modifiedCellIds = [];

      for (const modification of params.modifications) {
        const start = modification.range.start;
        const end =
          modification.range.end !== undefined
            ? modification.range.end
            : start + 1;

        // Update each cell in the range
        for (let i = start; i < end && i < notebookContent.cells.length; i++) {
          const cellId = notebookContent.cells[i].id;
          session.updateCellContent(cellId, modification.content);
          modifiedCellIds.push(cellId);
        }
      }

      // Execute cells if requested
      if (params.exec !== false && modifiedCellIds.length > 0) {
        await this.executeCells(session, modifiedCellIds);
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully modified ${params.modifications.length} cell ranges${params.exec !== false ? " and executed them" : ""}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to modify notebook cells: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Insert multiple cells at specified location, execute them if not disabled
   * @param params Parameters for inserting cells
   * @returns MCP response with new cell IDs
   */
  async insertNotebookCells(params: {
    path: string;
    position: number;
    cells: Array<{ type?: string; content: string }>;
    exec?: boolean;
  }): Promise<any> {
    try {
      const session = await this.jupyterAdapter.createDocumentSession(
        params.path,
        "notebook",
      );
      const cellIds = [];

      for (const cell of params.cells) {
        const cellId = session.addCell(
          cell.content,
          cell.type || "code",
          params.position,
        );
        cellIds.push(cellId);
      }

      // Execute cells if requested
      if (params.exec !== false && cellIds.length > 0) {
        await this.executeCells(session, cellIds);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Successfully inserted ${params.cells.length} cells${params.exec !== false ? " and executed them" : ""}`,
                cell_ids: cellIds,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to insert notebook cells: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete multiple cells by specifying ranges
   * @param params Parameters for deleting cells
   * @returns MCP response indicating success
   */
  async deleteNotebookCells(params: {
    path: string;
    ranges: Array<{ start: number; end?: number }>;
  }): Promise<any> {
    try {
      const session = await this.jupyterAdapter.createDocumentSession(
        params.path,
        "notebook",
      );
      const notebookContent = session.getNotebookContent();

      let deletedCount = 0;

      // Process ranges in reverse order to avoid index shifting
      const sortedRanges = [...params.ranges].sort((a, b) => b.start - a.start);

      for (const range of sortedRanges) {
        const start = range.start;
        const end = range.end !== undefined ? range.end : start + 1;

        for (
          let i = end - 1;
          i >= start && i < notebookContent.cells.length;
          i--
        ) {
          session.deleteCell(notebookContent.cells[i].id);
          deletedCount++;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully deleted ${deletedCount} cells`,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to delete notebook cells: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Restart the kernel of a specified notebook
   * @param params Parameters for restarting kernel
   * @returns MCP response indicating success
   */
  async restartNotebookKernel(params: {
    path: string;
    clear_contents?: boolean;
    exec?: boolean;
  }): Promise<any> {
    try {
      const session = await this.jupyterAdapter.createDocumentSession(
        params.path,
        "notebook",
      );

      // Restart the kernel
      await this.restartKernel(session);

      // Clear cell contents if requested
      if (params.clear_contents) {
        const notebookContent = session.getNotebookContent();

        for (const cell of notebookContent.cells) {
          if (cell.type === "code") {
            session.updateCellContent(cell.id, "");
          }
        }
      }

      // Execute all cells if requested
      if (params.exec !== false) {
        const notebookContent = session.getNotebookContent();
        const codeCellIds = notebookContent.cells
          .filter((cell: any) => cell.type === "code")
          .map((cell: any) => cell.id);

        if (codeCellIds.length > 0) {
          await this.executeCells(session, codeCellIds);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully restarted notebook kernel${params.clear_contents ? " and cleared contents" : ""}${params.exec !== false ? " and executed cells" : ""}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to restart notebook kernel: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Execute cells in a notebook
   * @param session Document session
   * @param cellIds Array of cell IDs to execute
   */
  private async executeCells(session: any, cellIds: string[]): Promise<void> {
    try {
      // Get the kernel ID from the session
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings();
      const sessionInfo = (session as any).session;

      // Get the kernel session for this notebook
      const sessionsUrl = URLExt.join(settings.baseUrl, "/api/sessions");
      const sessionsInit: RequestInit = {
        method: "GET",
      };

      // Add authorization header if token is provided
      const token = process.env.JUPYTERLAB_TOKEN;
      if (token) {
        sessionsInit.headers = {
          ...sessionsInit.headers,
          Authorization: `token ${token}`,
        };
      }

      let sessionsResponse: Response;
      try {
        sessionsResponse = await ServerConnection.makeRequest(
          sessionsUrl,
          sessionsInit,
          settings,
        );
      } catch (error) {
        throw new Error(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let sessionsData: any = await sessionsResponse.text();

      if (sessionsData.length > 0) {
        try {
          sessionsData = JSON.parse(sessionsData);
        } catch (error) {
          console.error("Not a JSON response body.", sessionsResponse);
        }
      }

      if (!sessionsResponse.ok) {
        throw new Error(
          `Server returned ${sessionsResponse.status}: ${sessionsData.message || sessionsData}`,
        );
      }

      // Find the kernel session for this notebook
      const kernelSession = sessionsData.find(
        (s: any) => s.path === sessionInfo.fileId,
      );

      if (!kernelSession || !kernelSession.kernel) {
        throw new Error("No active kernel found for this notebook");
      }

      // Execute each cell
      for (const cellId of cellIds) {
        const executeUrl = URLExt.join(
          settings.baseUrl,
          "/api/kernels",
          kernelSession.kernel.id,
          "execute",
        );

        const executeInit: RequestInit = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: this.getCellContent(session, cellId),
            silent: false,
            store_history: true,
            user_expressions: {},
            allow_stdin: false,
            stop_on_error: false,
          }),
        };

        if (token) {
          executeInit.headers = {
            ...executeInit.headers,
            Authorization: `token ${token}`,
          };
        }

        let executeResponse: Response;
        try {
          executeResponse = await ServerConnection.makeRequest(
            executeUrl,
            executeInit,
            settings,
          );
        } catch (error) {
          throw new Error(
            `Network error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        if (!executeResponse.ok) {
          throw new Error(
            `Failed to execute cell: ${executeResponse.status} ${executeResponse.statusText}`,
          );
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to execute cells: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Restart the kernel for a notebook session
   * @param session Document session
   */
  private async restartKernel(session: any): Promise<void> {
    try {
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings();
      const sessionInfo = (session as any).session;

      // Get the kernel session for this notebook
      const sessionsUrl = URLExt.join(settings.baseUrl, "/api/sessions");
      const sessionsInit: RequestInit = {
        method: "GET",
      };

      // Add authorization header if token is provided
      const token = process.env.JUPYTERLAB_TOKEN;
      if (token) {
        sessionsInit.headers = {
          ...sessionsInit.headers,
          Authorization: `token ${token}`,
        };
      }

      let sessionsResponse: Response;
      try {
        sessionsResponse = await ServerConnection.makeRequest(
          sessionsUrl,
          sessionsInit,
          settings,
        );
      } catch (error) {
        throw new Error(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let sessionsData: any = await sessionsResponse.text();

      if (sessionsData.length > 0) {
        try {
          sessionsData = JSON.parse(sessionsData);
        } catch (error) {
          console.error("Not a JSON response body.", sessionsResponse);
        }
      }

      if (!sessionsResponse.ok) {
        throw new Error(
          `Server returned ${sessionsResponse.status}: ${sessionsData.message || sessionsData}`,
        );
      }

      // Find the kernel session for this notebook
      const kernelSession = sessionsData.find(
        (s: any) => s.path === sessionInfo.fileId,
      );

      if (!kernelSession || !kernelSession.kernel) {
        throw new Error("No active kernel found for this notebook");
      }

      // Restart the kernel
      const restartUrl = URLExt.join(
        settings.baseUrl,
        "/api/kernels",
        kernelSession.kernel.id,
        "restart",
      );

      const restartInit: RequestInit = {
        method: "POST",
      };

      if (token) {
        restartInit.headers = {
          ...restartInit.headers,
          Authorization: `token ${token}`,
        };
      }

      let restartResponse: Response;
      try {
        restartResponse = await ServerConnection.makeRequest(
          restartUrl,
          restartInit,
          settings,
        );
      } catch (error) {
        throw new Error(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (!restartResponse.ok) {
        throw new Error(
          `Failed to restart kernel: ${restartResponse.status} ${restartResponse.statusText}`,
        );
      }
    } catch (error) {
      throw new Error(
        `Failed to restart kernel: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get the content of a cell
   * @param session Document session
   * @param cellId ID of the cell
   * @returns Cell content
   */
  private getCellContent(session: any, cellId: string): string {
    const notebookContent = session.getNotebookContent();
    const cell = notebookContent.cells.find((c: any) => c.id === cellId);
    return cell ? cell.content : "";
  }
}
