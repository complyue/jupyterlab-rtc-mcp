import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { JupyterLabAdapter } from "../jupyter/adapter.js";
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
   * @param params Parameters for listing notebooks
   * @returns MCP response with notebook list
   */
  async listNotebooks(params: { path?: string }): Promise<CallToolResult> {
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
   * @param params Parameters for getting notebook status
   * @returns MCP response with notebook status
   */
  async getNotebookStatus(params: { path: string }): Promise<CallToolResult> {
    try {
      // Create or get existing notebook session
      const nbSession = await this.jupyterAdapter.createNotebookSession(
        params.path,
      );

      // Ensure the notebook is synchronized
      await nbSession.ensureSynchronized();

      // Get notebook content
      const notebookContent = nbSession.getYNotebook().toJSON();

      // Get kernel session information
      const kernelSession = await nbSession.getKernelSession();

      // Get file information using contents API
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
        path: params.path,
        cell_count: notebookContent.cells.length,
        last_modified: (parsedData as JupyterContent).last_modified!,
      };

      // Add kernel information if available
      if (kernelSession) {
        result.kernel = {
          id: kernelSession.id,
          name: kernelSession.name,
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
   * @param params Parameters for reading cells
   * @returns MCP response with cell content
   */
  async readNotebookCells(params: {
    path: string;
    ranges?: Array<CellRange>;
  }): Promise<CallToolResult> {
    try {
      // Create or get existing notebook session
      const nbSession = await this.jupyterAdapter.createNotebookSession(
        params.path,
      );

      // Ensure the notebook is synchronized
      await nbSession.ensureSynchronized();

      // Get notebook content
      const notebookContent = nbSession.getYNotebook().toJSON();

      // If no ranges specified, return all cells
      const ranges = params.ranges || [
        { start: 0, end: notebookContent.cells.length },
      ];

      // Extract cells based on ranges
      const cells = [];
      for (const range of ranges) {
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
   * @param params Parameters for modifying cells
   * @returns MCP response indicating success
   */
  async modifyNotebookCells(params: {
    path: string;
    modifications: Array<CellModification>;
    exec?: boolean;
  }): Promise<CallToolResult> {
    try {
      // Create or get existing notebook session
      const nbSession = await this.jupyterAdapter.createNotebookSession(
        params.path,
      );

      // Ensure the notebook is synchronized
      await nbSession.ensureSynchronized();

      const ynb = nbSession.getYNotebook();
      const cells2exec: YCodeCell[] = [];

      // Apply each modification
      ynb.transact(() => {
        for (const modification of params.modifications) {
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
      if (params.exec !== false) {
        for (const cell of cells2exec) {
          await nbSession.executeCell(cell);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Successfully modified ${params.modifications.length} cell ranges${params.exec !== false ? " and executed cells" : ""}`,
                modified_ranges: params.modifications.length,
                executed: params.exec !== false,
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
   * @param params Parameters for inserting cells
   * @returns MCP response with new cell IDs
   */
  async insertNotebookCells(params: {
    path: string;
    position: number;
    cells: Array<CellInsertion>;
    exec?: boolean;
  }): Promise<CallToolResult> {
    try {
      // Create or get existing notebook session
      const nbSession = await this.jupyterAdapter.createNotebookSession(
        params.path,
      );

      // Ensure the notebook is synchronized
      await nbSession.ensureSynchronized();

      const ynb = nbSession.getYNotebook();
      const cells2exec: YCodeCell[] = [];

      ynb.transact(() => {
        // TODO: use bulk insertion api to insert cells, push resulted new code cells into cells2exec
        ynb.insertCells(0, []);
      });

      // Execute cells if requested
      if (params.exec !== false) {
        for (const cell of cells2exec) {
          await nbSession.executeCell(cell);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Successfully inserted cells`,
                executed: params.exec !== false,
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
   * @param params Parameters for deleting cells
   * @returns MCP response indicating success
   */
  async deleteNotebookCells(params: {
    path: string;
    ranges: Array<CellRange>;
  }): Promise<CallToolResult> {
    try {
      // Create or get existing notebook session
      const nbSession = await this.jupyterAdapter.createNotebookSession(
        params.path,
      );

      // Ensure the notebook is synchronized
      await nbSession.ensureSynchronized();

      const ynb = nbSession.getYNotebook();

      // Process ranges in reverse order to avoid index shifting when deleting cells
      const sortedRanges = [...params.ranges].sort((a, b) => b.start - a.start);

      ynb.transact(() => {
        // TODO: the correct logic must consider overlapping of ranges, as well as index shift
        //       after previous range has been deleted, non-1st range must be adjusted accordingly
        for (const range of sortedRanges) {
          const start = Math.max(0, range.start);
          const end = Math.min(ynb.cells.length, range.end || ynb.cells.length);
          ynb.deleteCellRange(start, end);
        }
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Successfully deleted cells`,
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
   * @param params Parameters for restarting kernel
   * @returns MCP response indicating success
   */
  async restartNotebookKernel(params: {
    path: string;
    clear_outputs?: boolean;
    exec?: boolean;
    kernel_name?: string;
  }): Promise<CallToolResult> {
    try {
      // Create or get existing notebook session
      const nbSession = await this.jupyterAdapter.createNotebookSession(
        params.path,
      );

      await nbSession.restartKernel(
        params.kernel_name,
        params.clear_outputs,
        params.exec,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Successfully restarted notebook kernel`,
                cleared_outputs: !!params.clear_outputs,
                executed_cells: params.exec !== false,
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
   * @param params Parameters for assigning kernel
   * @returns MCP response indicating success
   */
  async assignNotebookKernel(params: {
    path: string;
    kernel_name: string;
  }): Promise<CallToolResult> {
    try {
      // Create or get existing notebook session
      const nbSession = await this.jupyterAdapter.createNotebookSession(
        params.path,
      );

      await nbSession.getKernelSession(params.kernel_name);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Successfully assigned kernel '${params.kernel_name}' to notebook '${params.path}'`,
                kernel_name: params.kernel_name,
                notebook_path: params.path,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to assign notebook kernel:", error);
      throw new Error(
        `Failed to assign notebook kernel: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
