import { JupyterLabAdapter } from "../jupyter/adapter.js";
import { logger } from "../utils/logger.js";

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

      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
      const path = params.path || "";
      // Ensure proper URL construction by adding a trailing slash if path is empty
      const contentsPath = path || "/";
      const url = URLExt.join(settings.baseUrl, "/api/contents", contentsPath);

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
        logger.error("Network error in listNotebooks:", error);
        throw new Error(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let data: any = await response.text();

      if (data.length > 0) {
        try {
          data = JSON.parse(data);
        } catch (error) {
          logger.error("Not a JSON response body in listNotebooks:", error);
          logger.error("Response:", response);
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
      logger.error("Failed to list notebooks:", error);
      throw new Error(
        `Failed to list notebooks: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if a directory should be skipped when listing notebooks
   * @param directoryName Name of the directory to check
   * @returns True if the directory should be skipped
   */
  private _shouldSkipDirectory(directoryName: string): boolean {
    // Skip common Jupyter checkpoint directories and other system directories
    const skippedDirs = [
      ".ipynb_checkpoints",
      "__pycache__",
      ".git",
      ".vscode",
      ".idea",
      "node_modules",
    ];
    return skippedDirs.includes(directoryName);
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
            // Skip directories that should be ignored
            if (!this._shouldSkipDirectory(item.name)) {
              notebooks.push(...this._extractNotebooks(item));
            }
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

      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });

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
        logger.error("Network error in getNotebookStatus (content):", error);
        throw new Error(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let contentData: any = await contentResponse.text();

      if (contentData.length > 0) {
        try {
          contentData = JSON.parse(contentData);
        } catch (error) {
          logger.error(
            "Not a JSON response body in getNotebookStatus (content):",
            error,
          );
          logger.error("Response:", contentResponse);
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
        logger.error("Network error in getNotebookStatus (sessions):", error);
        throw new Error(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let sessionsData: any = await sessionsResponse.text();

      if (sessionsData.length > 0) {
        try {
          sessionsData = JSON.parse(sessionsData);
        } catch (error) {
          logger.error(
            "Not a JSON response body in getNotebookStatus (sessions):",
            error,
          );
          logger.error("Response:", sessionsResponse);
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
      logger.error("Failed to get notebook status", error);
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
      // Try to get notebook content via contents API first (no session required)
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
      const url = URLExt.join(settings.baseUrl, "/api/contents", params.path);

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
        logger.error("Network error in readNotebookCells:", error);
        throw new Error(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let data: any = await response.text();

      if (data.length > 0) {
        try {
          data = JSON.parse(data);
        } catch (error) {
          logger.error("Not a JSON response body in readNotebookCells:", error);
          logger.error("Response:", response);
        }
      }

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status}: ${data.message || data}`,
        );
      }

      // Extract cells from notebook content
      const notebookContent = data.content;
      if (!notebookContent || !notebookContent.cells) {
        throw new Error("Invalid notebook content or no cells found");
      }

      const ranges = params.ranges || [
        { start: 0, end: notebookContent.cells.length },
      ];
      const cells = [];

      for (const range of ranges) {
        const start = range.start;
        const end = range.end !== undefined ? range.end : start + 1;

        for (let i = start; i < end && i < notebookContent.cells.length; i++) {
          const cell = notebookContent.cells[i];
          cells.push({
            index: i,
            id: cell.id || `cell-${i}`, // Generate ID if not present
            content: cell.source || "", // Jupyter uses 'source' for cell content
            type: cell.cell_type || "code", // Jupyter uses 'cell_type'
            execution_count: cell.execution_count,
            outputs: cell.outputs,
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
      logger.error("Failed to read notebook cells", error);
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
      const session = await this.jupyterAdapter.createNotebookSession(
        params.path,
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
      logger.error("Failed to modify notebook cells", error);
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
      const session = await this.jupyterAdapter.createNotebookSession(
        params.path,
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
      logger.error(
        `Failed to insert notebook cells: ${error instanceof Error ? error.message : String(error)}`,
      );
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
      const session = await this.jupyterAdapter.createNotebookSession(
        params.path,
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
      logger.error("Failed to delete notebook cells", error);
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
    kernel_name?: string;
  }): Promise<any> {
    try {
      const session = await this.jupyterAdapter.createNotebookSession(
        params.path,
      );

      // Restart the kernel - pass the original path for contents API calls
      await this.restartKernel(session, params.kernel_name, params.path);

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
            text: `Successfully restarted notebook kernel${params.kernel_name ? ` (${params.kernel_name})` : ""}${params.clear_contents ? " and cleared contents" : ""}${params.exec !== false ? " and executed cells" : ""}`,
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to restart notebook kernel", error);
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
    // Get the kernel ID from the session
    const { ServerConnection } = await import("@jupyterlab/services");
    const { URLExt } = await import("@jupyterlab/coreutils");

    const settings = ServerConnection.makeSettings({
      baseUrl: this.jupyterAdapter["baseUrl"],
    });
    const sessionInfo = (session as any).session;

    // Store the original path for contents API calls
    const originalPath = (session as any).originalPath || sessionInfo.fileId;

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
      logger.error("Network error in executeCells", error);
      throw new Error(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    let sessionsData: any = await sessionsResponse.text();

    if (sessionsData.length > 0) {
      try {
        sessionsData = JSON.parse(sessionsData);
      } catch (error) {
        logger.error("Not a JSON response body in executeCells:", error);
        logger.error("Response:", sessionsResponse);
      }
    }

    if (!sessionsResponse.ok) {
      throw new Error(
        `Server returned ${sessionsResponse.status}: ${sessionsData.message || sessionsData}`,
      );
    }

    // Find the kernel session for this notebook
    // Try to match by path or fileId
    // Note: The sessionInfo.fileId is actually the notebook path in JupyterLab
    const kernelSession = sessionsData.find(
      (s: any) =>
        s.path === sessionInfo.fileId ||
        s.path?.endsWith(sessionInfo.fileId) ||
        s.notebook?.path === sessionInfo.fileId ||
        s.notebook?.path?.endsWith(sessionInfo.fileId) ||
        s.name === sessionInfo.fileId ||
        s.name?.endsWith(sessionInfo.fileId),
    );

    if (!kernelSession || !kernelSession.kernel) {
      // Try to start a new kernel for the notebook
      logger.debug(
        `No active kernel found, attempting to start a new kernel for ${sessionInfo.fileId}`,
      );

      try {
        // First, let's get the notebook content to ensure it exists
        const { URLExt } = await import("@jupyterlab/coreutils");

        // Use originalPath instead of fileId for contents API
        const pathToUse = originalPath;
        logger.debug(
          `Using path for contents API: ${pathToUse} (originalPath: ${originalPath}, fileId: ${sessionInfo.fileId})`,
        );

        const contentUrl = URLExt.join(
          settings.baseUrl,
          "/api/contents",
          pathToUse,
        );
        const contentInit: RequestInit = {
          method: "GET",
        };

        if (token) {
          contentInit.headers = {
            ...contentInit.headers,
            Authorization: `token ${token}`,
          };
        }

        const contentResponse = await ServerConnection.makeRequest(
          contentUrl,
          contentInit,
          settings,
        );

        if (!contentResponse.ok) {
          logger.debug(
            `Notebook content check failed for ${sessionInfo.fileId}: ${contentResponse.status} ${contentResponse.statusText}`,
          );
          logger.debug(`Request URL was: ${contentUrl}`);
          throw new Error(
            `Failed to get notebook content: ${contentResponse.status} ${contentResponse.statusText}`,
          );
        }

        logger.debug(
          `Successfully verified notebook exists at path: ${sessionInfo.fileId}`,
        );

        // Create a new session for the notebook
        const newSessionUrl = URLExt.join(settings.baseUrl, "/api/sessions");
        const newSessionInit: RequestInit = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: pathToUse, // Use original path instead of fileId
            type: "notebook",
            kernel: {
              name: "python3", // Default kernel, can be made configurable
            },
          }),
        };

        if (token) {
          newSessionInit.headers = {
            ...newSessionInit.headers,
            Authorization: `token ${token}`,
          };
        }

        logger.debug(
          `Creating new session for notebook: ${sessionInfo.fileId}`,
        );

        const newSessionResponse = await ServerConnection.makeRequest(
          newSessionUrl,
          newSessionInit,
          settings,
        );

        if (!newSessionResponse.ok) {
          const errorText = await newSessionResponse.text();
          logger.error(`[DEBUG] Session creation failed: ${errorText}`);
          throw new Error(
            `Failed to create new kernel session: ${newSessionResponse.status} ${newSessionResponse.statusText}`,
          );
        }

        const newSessionData = await newSessionResponse.json();
        logger.debug(`New session created: ${JSON.stringify(newSessionData)}`);

        if (!newSessionData.kernel) {
          throw new Error("New session created but no kernel was started");
        }

        // Use the new kernel session
        const newKernelSession = {
          ...newSessionData,
          kernel: newSessionData.kernel,
        };

        // Execute cells with the new kernel
        await this.executeCellsWithKernel(
          session,
          cellIds,
          newKernelSession,
          settings,
          token,
        );
        return;
      } catch (kernelError) {
        logger.error("Failed to start new kernel:", kernelError);
        throw new Error(
          `No active kernel found for this notebook and failed to start a new one: ${kernelError instanceof Error ? kernelError.message : String(kernelError)}`,
        );
      }
    }

    // Execute cells with the existing kernel
    await this.executeCellsWithKernel(
      session,
      cellIds,
      kernelSession,
      settings,
      token,
    );
  }

  /**
   * Execute cells with a specific kernel
   * @param session Document session
   * @param cellIds Array of cell IDs to execute
   * @param kernelSession Kernel session to use
   * @param settings Server settings
   * @param token Authorization token
   */
  private async executeCellsWithKernel(
    session: any,
    cellIds: string[],
    kernelSession: any,
    settings: any,
    token: string | undefined,
  ): Promise<void> {
    const { URLExt } = await import("@jupyterlab/coreutils");
    const { ServerConnection } = await import("@jupyterlab/services");

    // Check if kernel session and kernel are valid
    if (!kernelSession || !kernelSession.kernel || !kernelSession.kernel.id) {
      throw new Error("Invalid kernel session or kernel ID");
    }

    logger.debug(
      `Executing ${cellIds.length} cells with kernel: ${kernelSession.kernel.id}`,
    );

    // Execute each cell
    for (const cellId of cellIds) {
      const cellContent = this.getCellContent(session, cellId);
      logger.debug(
        `Executing cell ${cellId} with content: ${cellContent.substring(0, 100)}...`,
      );

      const executeUrl = URLExt.join(
        settings.baseUrl,
        "/api/kernels",
        kernelSession.kernel.id,
        "execute",
      );

      logger.debug(`Cell execution URL: ${executeUrl}`);

      const executeInit: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: cellContent,
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

      logger.debug(
        `Cell execution request body: ${JSON.stringify(
          {
            code:
              cellContent.substring(0, 100) +
              (cellContent.length > 100 ? "..." : ""),
            silent: false,
            store_history: true,
            user_expressions: {},
            allow_stdin: false,
            stop_on_error: false,
          },
          null,
          2,
        )}`,
      );

      let executeResponse: Response;
      try {
        logger.debug(`Sending cell execution request to: ${executeUrl}`);

        // Check if the kernel is still alive before sending the request
        const kernelStatusUrl = URLExt.join(
          settings.baseUrl,
          "/api/kernels",
          kernelSession.kernel.id,
        );

        try {
          const statusInit: RequestInit = {
            method: "GET",
          };

          if (token) {
            statusInit.headers = {
              ...statusInit.headers,
              Authorization: `token ${token}`,
            };
          }

          const statusResponse = await ServerConnection.makeRequest(
            kernelStatusUrl,
            statusInit,
            settings,
          );
          logger.debug(
            `Kernel status check response: ${statusResponse.status}`,
          );
          if (statusResponse.status === 404) {
            logger.debug(`Kernel ${kernelSession.kernel.id} not found (404)`);
            throw new Error(
              `Kernel ${kernelSession.kernel.id} not found. It may have been terminated.`,
            );
          }
        } catch (statusError) {
          logger.debug(
            `Error checking kernel status: ${statusError instanceof Error ? statusError.message : String(statusError)}`,
          );
        }

        executeResponse = await ServerConnection.makeRequest(
          executeUrl,
          executeInit,
          settings,
        );
        logger.debug(
          `Cell execution response status: ${executeResponse.status}`,
        );
      } catch (error) {
        logger.debug(
          `Network error executing cell ${cellId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw new Error(
          `Network error executing cell ${cellId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (!executeResponse.ok) {
        const errorText = await executeResponse.text();
        logger.error(`Cell execution failed for ${cellId}: ${errorText}`);
        throw new Error(
          `Failed to execute cell ${cellId}: ${executeResponse.status} ${executeResponse.statusText} - ${errorText}`,
        );
      }

      // Get the execution response to check for errors
      const responseText = await executeResponse.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        // If we can't parse the response, it might not be JSON, which is okay
        logger.warn(
          `Could not parse execution response for cell ${cellId} as JSON:\n${responseText}`,
        );
      }
      if (responseData?.status === "error") {
        logger.error(
          `Cell execution returned error for ${cellId}: ${responseData}`,
        );
        throw new Error(
          `Cell execution error for ${cellId}: ${responseData.evalue || "Unknown error"}`,
        );
      }

      logger.debug(`Successfully executed cell ${cellId}`);
    }
  }

  private async restartKernel(
    session: any,
    kernelName?: string,
    originalPath?: string,
  ): Promise<void> {
    try {
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
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
        logger.error("Network error in restartKernel", error);
        throw new Error(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let sessionsData: any = await sessionsResponse.text();

      if (sessionsData.length > 0) {
        try {
          sessionsData = JSON.parse(sessionsData);
        } catch (parseError) {
          logger.error(
            "Not a JSON response body in restartKernel:",
            parseError,
          );
          logger.error("Response:", sessionsResponse);
        }
      }

      if (!sessionsResponse.ok) {
        throw new Error(
          `Server returned ${sessionsResponse.status}: ${sessionsData.message || sessionsData}`,
        );
      }

      // Find the kernel session for this notebook
      // Try to match by path or fileId
      const kernelSession = sessionsData.find(
        (s: any) =>
          s.path === sessionInfo.fileId ||
          s.path?.endsWith(sessionInfo.fileId) ||
          s.notebook?.path === sessionInfo.fileId ||
          s.notebook?.path?.endsWith(sessionInfo.fileId),
      );

      if (!kernelSession || !kernelSession.kernel) {
        // No active kernel found, try to start a new one
        logger.debug(
          `No active kernel found, attempting to start a new kernel for ${sessionInfo.fileId}`,
        );

        try {
          // First, let's get the notebook content to ensure it exists
          // DEBUG: Log the path resolution issue
          // FIX: Use originalPath if available, otherwise fall back to fileId
          const pathToUse = originalPath || sessionInfo.fileId;
          logger.debug(`Using path for contents API: ${pathToUse}`);

          const contentUrl = URLExt.join(
            settings.baseUrl,
            "/api/contents",
            pathToUse,
          );
          const contentInit: RequestInit = {
            method: "GET",
          };

          if (token) {
            contentInit.headers = {
              ...contentInit.headers,
              Authorization: `token ${token}`,
            };
          }

          const contentResponse = await ServerConnection.makeRequest(
            contentUrl,
            contentInit,
            settings,
          );

          if (!contentResponse.ok) {
            throw new Error(
              `Failed to get notebook content: ${contentResponse.status} ${contentResponse.statusText}`,
            );
          }

          // Create a new session for the notebook
          const newSessionUrl = URLExt.join(settings.baseUrl, "/api/sessions");
          const newSessionInit: RequestInit = {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              // FIX: Use originalPath if available, otherwise fall back to fileId
              path: originalPath || sessionInfo.fileId,
              type: "notebook",
              kernel: {
                name: kernelName || "python3", // Use specified kernel or default
              },
            }),
          };

          if (token) {
            newSessionInit.headers = {
              ...newSessionInit.headers,
              Authorization: `token ${token}`,
            };
          }

          logger.debug(
            `Creating new session for notebook: ${sessionInfo.fileId} with kernel: ${kernelName || "python3"}`,
          );

          const newSessionResponse = await ServerConnection.makeRequest(
            newSessionUrl,
            newSessionInit,
            settings,
          );

          if (!newSessionResponse.ok) {
            const errorText = await newSessionResponse.text();
            logger.debug(`Session creation failed: ${errorText}`);
            throw new Error(
              `Failed to create new kernel session: ${newSessionResponse.status} ${newSessionResponse.statusText}`,
            );
          }

          const newSessionData = await newSessionResponse.json();
          logger.debug(
            `New session created: ${JSON.stringify(newSessionData)}`,
          );

          if (!newSessionData.kernel) {
            throw new Error("New session created but no kernel was started");
          }

          // Use the new kernel session
          const newKernelSession = {
            ...newSessionData,
            kernel: newSessionData.kernel,
          };

          // Restart the newly created kernel
          const restartUrl = URLExt.join(
            settings.baseUrl,
            "/api/kernels",
            newKernelSession.kernel.id,
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
            logger.error(
              "Network error in restartKernel (restart new kernel):",
              error,
            );
            throw new Error(
              `Network error: ${error instanceof Error ? error.message : String(error)}`,
            );
          }

          if (!restartResponse.ok) {
            throw new Error(
              `Failed to restart new kernel: ${restartResponse.status} ${restartResponse.statusText}`,
            );
          }

          logger.debug(
            `Successfully started and restarted new kernel for ${sessionInfo.fileId}`,
          );
          return;
        } catch (kernelError) {
          logger.error("Failed to start new kernel:", kernelError);
          throw new Error(
            `No active kernel found for this notebook and failed to start a new one: ${kernelError instanceof Error ? kernelError.message : String(kernelError)}`,
          );
        }
      }

      // If a specific kernel name is requested and different from current, update the session
      if (kernelName && kernelSession.kernel.name !== kernelName) {
        const updateUrl = URLExt.join(
          settings.baseUrl,
          "/api/sessions",
          kernelSession.id,
        );
        const updateInit: RequestInit = {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kernel: {
              name: kernelName,
            },
          }),
        };

        if (token) {
          updateInit.headers = {
            ...updateInit.headers,
            Authorization: `token ${token}`,
          };
        }

        const updateResponse = await ServerConnection.makeRequest(
          updateUrl,
          updateInit,
          settings,
        );

        if (!updateResponse.ok) {
          throw new Error(
            `Failed to update kernel to ${kernelName}: ${updateResponse.status} ${updateResponse.statusText}`,
          );
        }

        // Get the updated session
        const updatedSessionsResponse = await ServerConnection.makeRequest(
          sessionsUrl,
          sessionsInit,
          settings,
        );
        const updatedSessionsData = await updatedSessionsResponse.json();

        const updatedKernelSession = updatedSessionsData.find(
          (s: any) => s.id === kernelSession.id,
        );

        if (!updatedKernelSession || !updatedKernelSession.kernel) {
          throw new Error("Failed to get updated kernel session");
        }

        // Restart the updated kernel
        const restartUrl = URLExt.join(
          settings.baseUrl,
          "/api/kernels",
          updatedKernelSession.kernel.id,
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
          logger.error(
            "Network error in restartKernel (restart updated kernel):",
            error,
          );
          throw new Error(
            `Network error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        if (!restartResponse.ok) {
          throw new Error(
            `Failed to restart updated kernel: ${restartResponse.status} ${restartResponse.statusText}`,
          );
        }

        logger.debug(
          `Successfully updated kernel to ${kernelName} and restarted for ${sessionInfo.fileId}`,
        );
        return;
      }

      // Restart the existing kernel
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
        logger.error(
          "Network error in restartKernel (restart existing kernel):",
          error,
        );
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
      logger.error("Failed to restart kernel:", error);
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
    try {
      if (!session || typeof session.getNotebookContent !== "function") {
        throw new Error(
          "Invalid session or session does not have getNotebookContent method",
        );
      }

      const notebookContent = session.getNotebookContent();

      if (notebookContent && notebookContent.cells) {
        // Log the first few cells to understand their structure
        const sampleSize = Math.min(3, notebookContent.cells.length);
        for (let i = 0; i < sampleSize; i++) {
          const cell = notebookContent.cells[i];
        }

        logger.error(
          `[DEBUG] All cell IDs in notebook:`,
          notebookContent.cells.map((c: any, index: number) => {
            logger.error(
              `[DEBUG] Cell ${index} full object:`,
              JSON.stringify(c, null, 2),
            );
            return c?.id || `undefined-${index}`;
          }),
        );
      }

      if (
        !notebookContent ||
        !notebookContent.cells ||
        !Array.isArray(notebookContent.cells)
      ) {
        throw new Error("Invalid notebook content or cells array");
      }

      // Try different ways to find the cell
      let cell = notebookContent.cells.find((c: any) => c.id === cellId);

      if (!cell) {
        // Try to find by string conversion
        cell = notebookContent.cells.find(
          (c: any) => String(c.id) === String(cellId),
        );

        // Try to find by partial match
        if (!cell && cellId.includes("-")) {
          const partialId = cellId.split("-")[1];
          cell = notebookContent.cells.find(
            (c: any) => c.id && c.id.includes(partialId),
          );
        }
      }

      if (!cell) {
        return "";
      }

      // Try both 'content' and 'source' fields
      const cellContent = cell.content || cell.source || "";

      // Add error handling for empty cell content
      if (!cellContent.trim()) {
        logger.warn(`[WARN] Cell ${cellId} has empty content after trimming`);
      }

      return cellContent;
    } catch (error) {
      logger.error(`[DEBUG] Error getting cell content for ${cellId}:`, error);
      throw new Error(
        `Failed to get cell content for ${cellId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * List all available kernels on the JupyterLab server
   * @returns MCP response with list of available kernels
   */
  async listAvailableKernels(): Promise<any> {
    try {
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });

      // Get available kernels
      const kernelsUrl = URLExt.join(settings.baseUrl, "/api/kernelspecs");
      const kernelsInit: RequestInit = {
        method: "GET",
      };

      // Add authorization header if token is provided
      const token = process.env.JUPYTERLAB_TOKEN;
      if (token) {
        kernelsInit.headers = {
          ...kernelsInit.headers,
          Authorization: `token ${token}`,
        };
      }

      let kernelsResponse: Response;
      try {
        kernelsResponse = await ServerConnection.makeRequest(
          kernelsUrl,
          kernelsInit,
          settings,
        );
      } catch (error) {
        logger.error("Network error in listAvailableKernels:", error);
        throw new Error(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let kernelsData: any = await kernelsResponse.text();

      if (kernelsData.length > 0) {
        try {
          kernelsData = JSON.parse(kernelsData);
        } catch (error) {
          logger.error(
            "Not a JSON response body in listAvailableKernels:",
            error,
          );
          logger.error("Response:", kernelsResponse);
        }
      }

      if (!kernelsResponse.ok) {
        throw new Error(
          `Server returned ${kernelsResponse.status}: ${kernelsData.message || kernelsData}`,
        );
      }

      // Format the kernel information
      const kernels = [];
      if (kernelsData.kernelspecs) {
        for (const [name, spec] of Object.entries(
          kernelsData.kernelspecs as any,
        )) {
          kernels.push({
            name: name,
            display_name: (spec as any).display_name,
            language: (spec as any).language,
            path: (spec as any).resource_dir,
          });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ kernels }, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to list available kernels:", error);
      throw new Error(
        `Failed to list available kernels: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Assign a specific kernel to a notebook
   * @param params Parameters for assigning kernel
   * @returns MCP response indicating success
   */
  async assignNotebookKernel(params: {
    path: string;
    kernel_name: string;
  }): Promise<any> {
    try {
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });

      // First, check if the notebook exists
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

      const contentResponse = await ServerConnection.makeRequest(
        contentUrl,
        contentInit,
        settings,
      );

      if (!contentResponse.ok) {
        throw new Error(
          `Failed to get notebook content: ${contentResponse.status} ${contentResponse.statusText}`,
        );
      }

      // Check if there's an existing session for this notebook
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

      const sessionsResponse = await ServerConnection.makeRequest(
        sessionsUrl,
        sessionsInit,
        settings,
      );

      if (!sessionsResponse.ok) {
        throw new Error(
          `Failed to get sessions: ${sessionsResponse.status} ${sessionsResponse.statusText}`,
        );
      }

      const sessionsData = await sessionsResponse.json();

      // Find existing session for this notebook
      const existingSession = sessionsData.find(
        (s: any) =>
          s.path === params.path ||
          s.path?.endsWith(params.path) ||
          s.notebook?.path === params.path ||
          s.notebook?.path?.endsWith(params.path),
      );

      if (existingSession) {
        // Update existing session with new kernel
        const updateUrl = URLExt.join(
          settings.baseUrl,
          "/api/sessions",
          existingSession.id,
        );
        const updateInit: RequestInit = {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kernel: {
              name: params.kernel_name,
            },
          }),
        };

        if (token) {
          updateInit.headers = {
            ...updateInit.headers,
            Authorization: `token ${token}`,
          };
        }

        const updateResponse = await ServerConnection.makeRequest(
          updateUrl,
          updateInit,
          settings,
        );

        if (!updateResponse.ok) {
          throw new Error(
            `Failed to update kernel: ${updateResponse.status} ${updateResponse.statusText}`,
          );
        }

        return {
          content: [
            {
              type: "text",
              text: `Successfully assigned kernel '${params.kernel_name}' to notebook '${params.path}'`,
            },
          ],
        };
      } else {
        // Create new session with specified kernel
        const createUrl = URLExt.join(settings.baseUrl, "/api/sessions");
        const createInit: RequestInit = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: params.path,
            type: "notebook",
            kernel: {
              name: params.kernel_name,
            },
          }),
        };

        if (token) {
          createInit.headers = {
            ...createInit.headers,
            Authorization: `token ${token}`,
          };
        }

        const createResponse = await ServerConnection.makeRequest(
          createUrl,
          createInit,
          settings,
        );

        if (!createResponse.ok) {
          throw new Error(
            `Failed to create session with kernel: ${createResponse.status} ${createResponse.statusText}`,
          );
        }

        return {
          content: [
            {
              type: "text",
              text: `Successfully created new session with kernel '${params.kernel_name}' for notebook '${params.path}'`,
            },
          ],
        };
      }
    } catch (error) {
      logger.error("Failed to assign notebook kernel:", error);
      throw new Error(
        `Failed to assign notebook kernel: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
