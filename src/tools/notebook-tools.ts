import { CallToolResult } from "@modelcontextprotocol/sdk/types";

import { JupyterLabAdapter, executeJupyterCell } from "../jupyter/adapter.js";
import { logger } from "../utils/logger.js";

import {
  JupyterContent,
  KernelSpec,
  NotebookInfo,
  CellRange,
  CellModification,
  CellInsertion,
  KernelInfo,
} from "../jupyter/types.js";
import { YCodeCell } from "@jupyter/ydoc";

export interface NotebookStatusResult {
  path: string;
  cell_count: number;
  last_modified: string;
  kernel?: {
    id: string;
    name: string;
  };
}

export interface KernelSpecsResponse {
  kernelspecs: Record<string, KernelSpec>;
  message?: string;
}

export interface JsonResponseBase {
  message?: string;
}

export type JsonResponse =
  | JupyterContent
  | KernelSpecsResponse
  | JsonResponseBase;

/**
 * NotebookTools provides high-level operations for Jupyter notebooks
 *
 * This class implements the MCP tools for reading, writing, and executing
 * notebook cells, as well as other notebook-related operations.
 *
 * All notebook viewing and manipulations are performed via RTC infrastructure,
 * so AI agents see up-to-date data, while its modifications are visible to human
 * users who opened a browser tab for the notebook, in real time.
 */
export class NotebookTools {
  private jupyterAdapter: JupyterLabAdapter;

  constructor(jupyterAdapter: JupyterLabAdapter) {
    this.jupyterAdapter = jupyterAdapter;
  }

  /**
   * List all notebook files under specified directory, recursively
   * @param path Directory path to search for notebooks (default: root)
   * @returns MCP response with notebook list
   */
  async listNotebooks(path?: string): Promise<CallToolResult> {
    try {
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
      const notebookPath = path || "";
      // Ensure proper URL construction by adding a trailing slash if path is empty
      const contentsPath = notebookPath || "/";
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

      let data: string = await response.text();
      let parsedData: JsonResponse | null = null;

      if (data.length > 0) {
        try {
          parsedData = JSON.parse(data);
        } catch (error) {
          logger.error("Not a JSON response body in listNotebooks:", error);
          logger.error("Response:", response);
        }
      }

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status}: ${parsedData?.message || data}`,
        );
      }

      // Process the response to extract notebook files
      if (!parsedData) {
        throw new Error("Failed to parse response data");
      }
      const notebooks = this._extractNotebooks(parsedData as JupyterContent);

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
  private _extractNotebooks(contents: JupyterContent): NotebookInfo[] {
    const notebooks: NotebookInfo[] = [];

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
   * @param path Path to the notebook file
   * @returns MCP response with notebook status
   */
  async getNotebookStatus(path: string): Promise<CallToolResult> {
    try {
      // Create or get existing notebook session
      const nbSession = await this.jupyterAdapter.createNotebookSession(path);

      // Ensure the notebook is synchronized
      await nbSession.ensureSynchronized();

      // Update session activity
      this.jupyterAdapter.updateSessionActivity(nbSession.session.fileId);

      // Get notebook content
      const notebookContent = nbSession.getYNotebook().toJSON();

      // Get file information using contents API
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });

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
        logger.error("Network error in getNotebookStatus:", error);
        throw new Error(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let data: string = await response.text();
      let parsedData: JsonResponse | null = null;

      if (data.length > 0) {
        try {
          parsedData = JSON.parse(data);
        } catch (error) {
          logger.error("Not a JSON response body in getNotebookStatus:", error);
          logger.error("Response:", response);
        }
      }

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status}: ${parsedData?.message || data}`,
        );
      }

      // Prepare the response
      const result: NotebookStatusResult = {
        path: path,
        cell_count: notebookContent.cells.length,
        last_modified: (parsedData as JupyterContent).last_modified!,
      };

      // Add kernel information if available
      const kernelConn = await nbSession.getKernelConnection();
      if (kernelConn) {
        result.kernel = {
          id: kernelConn.id,
          name: kernelConn.name,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to get notebook status:", error);
      throw new Error(
        `Failed to get notebook status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Read multiple cells by specifying ranges
   * @param path Path to the notebook file
   * @param ranges Array of cell ranges to read
   * @returns MCP response with cell content
   */
  async readNotebookCells(
    path: string,
    ranges?: Array<CellRange>,
  ): Promise<CallToolResult> {
    try {
      // Create or get existing notebook session
      const nbSession = await this.jupyterAdapter.createNotebookSession(path);

      // Ensure the notebook is synchronized
      await nbSession.ensureSynchronized();

      // Update session activity
      this.jupyterAdapter.updateSessionActivity(nbSession.session.fileId);

      // Get notebook content
      const notebookContent = nbSession.getYNotebook().toJSON();

      // If no ranges specified, return all cells
      const cellRanges = ranges || [
        { start: 0, end: notebookContent.cells.length },
      ];

      // Extract cells based on ranges
      const cells = [];
      for (const range of cellRanges) {
        const start = Math.max(0, range.start);
        const end = Math.min(
          notebookContent.cells.length,
          range.end || notebookContent.cells.length,
        );

        for (let i = start; i < end; i++) {
          const cell = notebookContent.cells[i];
          cells.push({ index: i, cell });
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
      logger.error("Failed to read notebook cells:", error);
      throw new Error(
        `Failed to read notebook cells: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Modify multiple cells by specifying ranges, execute them if not disabled
   * @param path Path to the notebook file
   * @param modifications Array of cell modifications
   * @param exec Whether to execute the modified cells
   * @returns MCP response indicating success
   */
  async modifyNotebookCells(
    path: string,
    modifications: Array<CellModification>,
    exec?: boolean,
  ): Promise<CallToolResult> {
    try {
      // Create or get existing notebook session
      const nbSession = await this.jupyterAdapter.createNotebookSession(path);

      // Ensure the notebook is synchronized
      await nbSession.ensureSynchronized();

      // Update session activity
      this.jupyterAdapter.updateSessionActivity(nbSession.session.fileId);

      const ynb = nbSession.getYNotebook();
      const cells2exec: YCodeCell[] = [];

      // Apply each modification
      ynb.transact(() => {
        for (const modification of modifications) {
          const start = Math.max(0, modification.range.start);
          const end = Math.min(
            ynb.cells.length,
            modification.range.end || ynb.cells.length,
          );
          // Update each cell in the range
          for (let i = start; i < end; i++) {
            const cell = ynb.getCell(i);
            cell.setSource(modification.content);
            if (cell.cell_type === "code") {
              cells2exec.push(cell);
            }
          }
        }
      });

      // Execute cells if requested
      if (exec !== false) {
        const kernelConn = await nbSession.ensureKernelConnection();
        for (const cell of cells2exec) {
          await executeJupyterCell(cell, kernelConn);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Successfully modified ${modifications.length} cell ranges${exec !== false ? " and executed cells" : ""}`,
                modified_ranges: modifications.length,
                executed: exec !== false,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to modify notebook cells:", error);
      throw new Error(
        `Failed to modify notebook cells: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Insert multiple cells at specified location, execute them if not disabled
   * @param path Path to the notebook file
   * @param position Position to insert the cells
   * @param cells Array of cells to insert
   * @param exec Whether to execute the inserted cells
   * @returns MCP response with new cell IDs
   */
  async insertNotebookCells(
    path: string,
    position: number,
    cells: Array<CellInsertion>,
    exec?: boolean,
  ): Promise<CallToolResult> {
    try {
      // Convert CellInsertion objects to the format expected by insertCells
      const cellsToInsert = cells.map((cell) => ({
        cell_type: cell.type || "code", // Default to "code" if type is not specified
        source: cell.content,
      }));

      // Create or get existing notebook session
      const nbSession = await this.jupyterAdapter.createNotebookSession(path);

      // Ensure the notebook is synchronized
      await nbSession.ensureSynchronized();

      // Update session activity
      this.jupyterAdapter.updateSessionActivity(nbSession.session.fileId);

      const ynb = nbSession.getYNotebook();
      const cells2exec: YCodeCell[] = [];

      ynb.transact(() => {
        // Use bulk insertion API to insert cells
        ynb.insertCells(position, cellsToInsert);

        // Get the actual inserted cells from the ynb.cells array
        for (let i = 0; i < cellsToInsert.length; i++) {
          const cellIndex = position + i;
          const cell = ynb.cells[cellIndex];
          if (cell && cell.cell_type === "code") {
            cells2exec.push(cell as YCodeCell);
          }
        }
      });

      // Execute cells if requested
      if (exec !== false) {
        const kernelConn = await nbSession.ensureKernelConnection();
        for (const cell of cells2exec) {
          await executeJupyterCell(cell, kernelConn);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Successfully inserted cells`,
                executed: exec !== false,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to insert notebook cells:", error);
      throw new Error(
        `Failed to insert notebook cells: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete multiple cells by specifying ranges
   * @param path Path to the notebook file
   * @param ranges Array of cell ranges to delete
   * @returns MCP response indicating success
   */
  async deleteNotebookCells(
    path: string,
    ranges: Array<CellRange>,
  ): Promise<CallToolResult> {
    try {
      // Create or get existing notebook session
      const nbSession = await this.jupyterAdapter.createNotebookSession(path);

      // Ensure the notebook is synchronized
      await nbSession.ensureSynchronized();

      // Update session activity
      this.jupyterAdapter.updateSessionActivity(nbSession.session.fileId);

      const ynb = nbSession.getYNotebook();

      // Process ranges in reverse order to avoid index shifting when deleting cells
      const sortedRanges = [...ranges].sort((a, b) => b.start - a.start);

      let deletedCells = 0;
      ynb.transact(() => {
        // Process each range, adjusting indices based on previously deleted cells
        for (const range of sortedRanges) {
          // Adjust start and end based on number of cells already deleted
          const adjustedStart = Math.max(0, range.start - deletedCells);
          const adjustedEnd = Math.min(
            ynb.cells.length,
            (range.end || ynb.cells.length) - deletedCells,
          );

          // Only delete if we have a valid range
          const cellsToDelete = adjustedEnd - adjustedStart;
          if (cellsToDelete >= 1) {
            ynb.deleteCellRange(adjustedStart, adjustedEnd);
            deletedCells += cellsToDelete;
          }
        }
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Successfully deleted ${deletedCells} cells`,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to delete notebook cells:", error);
      throw new Error(
        `Failed to delete notebook cells: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Restart the kernel of a specified notebook
   * @param path Path to the notebook file
   * @param clear_outputs Whether to clear cell contents after restart
   * @param exec Whether to execute cells after restart
   * @param kernel_name Name of the kernel to use (from list_available_kernels)
   * @returns MCP response indicating success
   */
  async restartNotebookKernel(
    path: string,
    clear_outputs?: boolean,
    exec?: boolean,
    kernel_name?: string,
  ): Promise<CallToolResult> {
    try {
      // Create or get existing notebook session
      const nbSession = await this.jupyterAdapter.createNotebookSession(path);

      // Update session activity
      this.jupyterAdapter.updateSessionActivity(nbSession.session.fileId);

      await nbSession.restartKernel(kernel_name, clear_outputs, exec);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Successfully restarted notebook kernel`,
                cleared_outputs: !!clear_outputs,
                executed_cells: exec !== false,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to restart notebook kernel:", error);
      throw new Error(
        `Failed to restart notebook kernel: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * List all available kernels on the JupyterLab server
   * @returns MCP response with list of available kernels
   */
  async listAvailableKernels(): Promise<CallToolResult> {
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

      let kernelsData: string = await kernelsResponse.text();
      let parsedKernelsData: JsonResponse | null = null;

      if (kernelsData.length > 0) {
        try {
          parsedKernelsData = JSON.parse(kernelsData);
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
          `Server returned ${kernelsResponse.status}: ${parsedKernelsData?.message || kernelsData}`,
        );
      }

      // Format the kernel information
      const kernels: KernelInfo[] = [];
      if (
        parsedKernelsData &&
        (parsedKernelsData as KernelSpecsResponse).kernelspecs
      ) {
        const kernelSpecs = (parsedKernelsData as KernelSpecsResponse)
          .kernelspecs;
        for (const [name, spec] of Object.entries(kernelSpecs)) {
          kernels.push({
            name: name,
            display_name: spec.display_name,
            language: spec.language,
            path: spec.resource_dir,
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
   * @param path Path to the notebook file
   * @param kernel_name Name of the kernel to assign (from list_available_kernels)
   * @returns MCP response indicating success
   */
  async assignNotebookKernel(
    path: string,
    kernel_name: string,
  ): Promise<CallToolResult> {
    try {
      // Create or get existing notebook session
      const nbSession = await this.jupyterAdapter.createNotebookSession(path);

      // Update session activity
      this.jupyterAdapter.updateSessionActivity(nbSession.session.fileId);

      // Get kernel connection with the specified kernel name
      const kernelConn = await nbSession.getKernelConnection(kernel_name);
      if (!kernelConn) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  message: `Failed to assign kernel '${kernel_name}' to notebook '${path}'. Could not establish kernel connection.`,
                  kernel_name: kernel_name,
                  notebook_path: path,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // The kernel is now assigned and connected
      // Return success with kernel information
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `Successfully assigned kernel '${kernel_name}' to notebook '${path}'`,
                kernel_name: kernel_name,
                notebook_path: path,
                kernel_id: kernelConn.id,
                kernel_display_name: kernelConn.name,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to assign notebook kernel:", error);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                message: `Failed to assign kernel '${kernel_name}' to notebook '${path}': ${error instanceof Error ? error.message : String(error)}`,
                kernel_name: kernel_name,
                notebook_path: path,
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
   * Execute multiple cells by specifying ranges
   * @param path Path to the notebook file
   * @param ranges Array of cell ranges to execute
   * @returns MCP response indicating success
   */
  async executeNotebookCells(
    path: string,
    ranges: Array<CellRange>,
  ): Promise<CallToolResult> {
    try {
      // Create or get existing notebook session
      const nbSession = await this.jupyterAdapter.createNotebookSession(path);

      // Ensure the notebook is synchronized
      await nbSession.ensureSynchronized();

      // Update session activity
      this.jupyterAdapter.updateSessionActivity(nbSession.session.fileId);

      const ynb = nbSession.getYNotebook();
      const kernelConn = await nbSession.ensureKernelConnection();

      // Extract cells based on ranges
      const cellsToExecute: YCodeCell[] = [];
      for (const range of ranges) {
        const start = Math.max(0, range.start);
        const end = Math.min(ynb.cells.length, range.end || ynb.cells.length);

        for (let i = start; i < end; i++) {
          const cell = ynb.getCell(i);
          if (cell.cell_type === "code") {
            cellsToExecute.push(cell as YCodeCell);
          }
        }
      }

      // Execute all cells
      for (const cell of cellsToExecute) {
        await executeJupyterCell(cell, kernelConn);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Successfully executed ${ranges.length} cell ranges`,
                executed_ranges: ranges.length,
                executed_cells: cellsToExecute.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to execute notebook cells:", error);
      throw new Error(
        `Failed to execute notebook cells: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
