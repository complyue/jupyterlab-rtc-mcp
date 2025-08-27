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
  CellData,
  CellOutput,
  CellOutputData,
  CellOutputError,
  ReadNotebookCellsResult,
  CellExecutionResult,
  CollaboratorInfo,
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
 * NotebookTools provides high-level operations for Jupyter notebooks through RTC infrastructure
 *
 * This class implements the MCP tools for reading, writing, and executing notebook cells,
 * as well as other notebook-related operations including kernel management and cell manipulation.
 *
 * All notebook viewing and manipulations are performed via RTC infrastructure,
 * so AI agents see up-to-date data, while its modifications are visible to human
 * users who opened a browser tab for the notebook, in real time.
 *
 * Key features:
 * - List notebooks with RTC session information
 * - Read cell content with truncation support for large outputs
 * - Modify, insert, and delete cells with optional execution
 * - Kernel management (restart, assign, list available kernels)
 * - Create new notebooks
 * - Execute cells with output size control
 *
 * @example
 * ```typescript
 * const notebookTools = new NotebookTools(jupyterAdapter);
 * const result = await notebookTools.readNotebookCells('path/to/notebook.ipynb');
 * console.log(result.content);
 * ```
 */
export class NotebookTools {
  private jupyterAdapter: JupyterLabAdapter;

  constructor(jupyterAdapter: JupyterLabAdapter) {
    this.jupyterAdapter = jupyterAdapter;
  }

  /**
   * List all notebook files under specified directory, with configurable depth and limit
   *
   * This method searches for .ipynb files in the specified directory and subdirectories up to max_depth,
   * skipping common system directories like .ipynb_checkpoints, __pycache__, etc.
   * For each notebook found, it constructs a URL and checks for active RTC sessions.
   *
   * @param path Directory path to search for notebooks (default: root)
   * @param maxDepth Maximum depth to search recursively (0 for current directory only, default: 3)
   * @param maxNbs Maximum number of notebooks to return (default: 10)
   * @returns MCP response with notebook list including RTC session information
   *
   * @example
   * ```typescript
   * const result = await notebookTools.listNotebooks('projects', 2, 5);
   * const notebooks = JSON.parse(result.content[0].text).notebooks;
   * console.log(`Found ${notebooks.length} notebooks`);
   * ```
   */
  async listNotebooks(
    path?: string,
    maxDepth?: number,
    maxNbs?: number,
  ): Promise<CallToolResult> {
    try {
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
      const notebookPath = path || "";
      // Ensure proper URL construction by adding a trailing slash if path is empty
      const contentsPath = URLExt.encodeParts(notebookPath) || "/";
      const url = URLExt.join(settings.baseUrl, "/api/contents", contentsPath);

      const init: RequestInit = {
        method: "GET",
      };

      let response: Response;
      try {
        response = await this.jupyterAdapter.makeJupyterRequest(url, init);
      } catch (error) {
        logger.error(
          `Network error in listNotebooks. URL: ${url}, Method: ${init.method}, Base URL: ${settings.baseUrl}`,
          error,
        );
        throw new Error(
          `Network error when accessing ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let data: string = await response.text();
      let parsedData: JsonResponse | null = null;

      if (data.length > 0) {
        try {
          parsedData = JSON.parse(data);
        } catch (error) {
          logger.error(
            `Not a JSON response body in listNotebooks. Response status: ${response.status}, Response text: ${await response.text().catch(() => "Could not read response text")}`,
            error,
          );
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
      const notebooks: NotebookInfo[] = [];

      // Set default values for maxDepth and maxNbs
      const depthLimit = maxDepth ?? 3;
      const notebooksLimit = maxNbs ?? 10;

      // Local closure function to extract notebooks from a directory path, return whether there're potentially more notebooks that are not included in the returned list
      const extractNotebooks = async (
        targetDir: string,
        currentDepth: number = 0,
      ): Promise<boolean> => {
        // Ensure proper URL construction
        const contentsPath = URLExt.encodeParts(targetDir) || "/";
        const url = URLExt.join(
          settings.baseUrl,
          "/api/contents",
          contentsPath,
        );

        let response: Response;
        try {
          response = await this.jupyterAdapter.makeJupyterRequest(url, init);
        } catch (error) {
          logger.error(`Network error in extractNotebooks. URL: ${url}`, error);
          throw new Error(
            `Network error when accessing ${url}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        let data: string = await response.text();
        let parsedData: JsonResponse | null = null;

        if (data.length > 0) {
          try {
            parsedData = JSON.parse(data);
          } catch (error) {
            logger.error(
              `Not a JSON response body in extractNotebooks. Response status: ${response.status}`,
              error,
            );
          }
        }

        if (!response.ok) {
          throw new Error(
            `Server returned ${response.status}: ${parsedData?.message || data}`,
          );
        }

        if (!parsedData) {
          throw new Error("Failed to parse response data");
        }

        const contents = parsedData as JupyterContent;

        if (contents.type === "directory") {
          // Process notebooks in current directory
          if (contents.content) {
            for (const item of contents.content) {
              if (item.type === "notebook") {
                // Construct the full URL for the notebook
                const baseUrl = this.jupyterAdapter["baseUrl"];
                const notebookUrl = `${baseUrl}/notebooks/${item.path}`;

                // Check for active RTC session for this notebook
                const rtcSession = this._getNotebookRTCSession(item.path);

                // there's at least one more nb not included
                if (notebooks.length >= notebooksLimit) {
                  return true;
                }
                notebooks.push({
                  path: item.path,
                  name: item.name,
                  last_modified: item.last_modified,
                  created: item.created,
                  size: item.size,
                  writable: item.writable,
                  url: notebookUrl,
                  rtc_session: rtcSession,
                });
              } else if (
                item.type === "directory" &&
                currentDepth < depthLimit
              ) {
                // Skip directories that should be ignored
                if (!this._shouldSkipDirectory(item.name)) {
                  // Recursively process subdirectory, but tolerate errors
                  try {
                    await extractNotebooks(item.path, currentDepth + 1);
                  } catch (error) {
                    // Log the error but continue processing other directories
                    logger.warn(
                      `Failed to access subdirectory ${item.path}`,
                      error,
                    );
                  }
                }
              }
            }
          }
        } else if (contents.type === "notebook") {
          // Single notebook file
          const baseUrl = this.jupyterAdapter["baseUrl"];
          const notebookUrl = `${baseUrl}/notebooks/${contents.path}`;

          // Check for active RTC session for this notebook
          const rtcSession = this._getNotebookRTCSession(contents.path);

          // there's at least one more nb not included
          if (notebooks.length >= notebooksLimit) {
            return true;
          }
          notebooks.push({
            path: contents.path,
            name: contents.name,
            last_modified: contents.last_modified,
            created: contents.created,
            size: contents.size,
            writable: contents.writable,
            url: notebookUrl,
            rtc_session: rtcSession,
          });
        }

        return false;
      };

      // Extract notebooks using the closure function
      const moreNbs = await extractNotebooks(notebookPath, 0);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                more_exist: moreNbs,
                notebooks: notebooks,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error(`Failed to list notebooks from ${path || "root"}`, error);
      throw new Error(
        `Failed to list notebooks from ${path || "root"}: ${error instanceof Error ? error.message : String(error)}`,
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
   * Get RTC session information for a notebook
   * @param path Path to the notebook
   * @returns RTC session information or undefined if no active session
   */
  private _getNotebookRTCSession(path: string):
    | {
        session_id: string;
        file_id: string;
        connected: boolean;
        synced: boolean;
        collaborators?: CollaboratorInfo[];
      }
    | undefined {
    // Check if there's an active notebook session for this path
    const notebookSession = this.jupyterAdapter.getNotebookSession(path);

    if (notebookSession) {
      const sessionInfo = notebookSession.session;
      return {
        session_id: sessionInfo.sessionId,
        file_id: sessionInfo.fileId,
        connected: notebookSession.isConnected(),
        synced: notebookSession.isSynced(),
        // TODO: Add collaborator information when the API supports it
        // collaborators: this._getCollaborators(notebookSession),
      };
    }

    return undefined;
  }

  /**
   * Get collaborator information from a notebook session
   * @param session Notebook session
   * @returns Array of collaborator information
   */
  private _getCollaborators(session: unknown): CollaboratorInfo[] {
    // This is a placeholder implementation
    // In a real implementation, this would extract collaborator information
    // from the Yjs awareness protocol or another source
    const collaborators: CollaboratorInfo[] = [];

    // TODO: Implement collaborator information extraction using the session parameter
    // This would typically involve:
    // 1. Getting awareness information from the Yjs document: session.getDocument()
    // 2. Extracting user information from the WebSocket provider
    // 3. Formatting the data into CollaboratorInfo objects

    return collaborators;
  }

  /**
   * Get status information about a notebook
   *
   * Retrieves comprehensive status information about a notebook including cell count,
   * last modification time, and kernel information if available. This method creates
   * an RTC session if one doesn't exist and ensures the notebook is synchronized.
   *
   * @param path Path to the notebook file
   * @returns MCP response with notebook status including path, cell count, last modified time, and kernel info
   *
   * @example
   * ```typescript
   * const result = await notebookTools.getNotebookStatus('projects/analysis.ipynb');
   * const status = JSON.parse(result.content[0].text);
   * console.log(`Notebook has ${status.cell_count} cells`);
   * if (status.kernel) {
   *   console.log(`Kernel: ${status.kernel.name} (${status.kernel.id})`);
   * }
   * ```
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

      const url = URLExt.join(
        settings.baseUrl,
        "/api/contents",
        URLExt.encodeParts(path),
      );

      const init: RequestInit = {
        method: "GET",
      };

      let response: Response;
      try {
        response = await this.jupyterAdapter.makeJupyterRequest(url, init);
      } catch (error) {
        logger.error(
          `Network error in getNotebookStatus. URL: ${url}, Notebook path: ${path}, Base URL: ${settings.baseUrl}`,
          error,
        );
        throw new Error(
          `Network error when accessing ${url} for notebook ${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let data: string = await response.text();
      let parsedData: JsonResponse | null = null;

      if (data.length > 0) {
        try {
          parsedData = JSON.parse(data);
        } catch (error) {
          logger.error(
            `Not a JSON response body in getNotebookStatus. Response status: ${response.status}, Response text: ${await response.text().catch(() => "Could not read response text")}`,
            error,
          );
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
      logger.error(`Failed to get status for notebook ${path}`, error);
      throw new Error(
        `Failed to get status for notebook ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Helper function to truncate text if it exceeds max length
   * @param text Text to truncate
   * @param maxLength Maximum length
   * @returns Object with truncated text and flag indicating if truncation occurred
   */
  private _truncateText(
    text: string,
    maxLength: number,
  ): { text: string; truncated: boolean } {
    if (text.length <= maxLength) {
      return { text, truncated: false };
    }
    return {
      text: text.substring(0, maxLength - 14) + "... [truncated]",
      truncated: true,
    };
  }

  /**
   * Helper function to process cell outputs with truncation
   * @param outputs Cell outputs to process
   * @param maxCellData Maximum data size
   * @returns Processed outputs with truncation info
   */
  private _processCellOutputs(
    outputs: unknown[],
    maxCellData: number,
  ): { outputs: CellOutput[]; truncated: boolean[] } {
    const processedOutputs: CellOutput[] = [];
    const truncated: boolean[] = [];

    for (const output of outputs) {
      const typedOutput = output as {
        output_type?: string;
        metadata?: Record<string, unknown>;
        execution_count?: number;
        data?: Record<string, unknown>;
        ename?: string;
        evalue?: string;
        traceback?: string[];
        text?: string;
      };
      if (
        typedOutput.output_type === "execute_result" ||
        typedOutput.output_type === "display_data"
      ) {
        // Process data outputs
        const dataOutput: CellOutputData = {
          data: {},
          metadata: typedOutput.metadata || {},
          execution_count: typedOutput.execution_count,
        };

        // Process each data field (e.g., text/plain, image/png, etc.)
        for (const [mimeType, value] of Object.entries(
          typedOutput.data || {},
        )) {
          if (typeof value === "string") {
            const result = this._truncateText(value, maxCellData);
            dataOutput.data[mimeType] = result.text;
            if (result.truncated) {
              truncated.push(true);
            } else {
              truncated.push(false);
            }
          } else {
            // For non-string data, keep as is
            dataOutput.data[mimeType] = value;
            truncated.push(false);
          }
        }

        processedOutputs.push(dataOutput);
      } else if (typedOutput.output_type === "error") {
        // Process error outputs
        const errorOutput: CellOutputError = {
          name: typedOutput.ename || "Error",
          value: typedOutput.evalue || "",
          traceback: typedOutput.traceback || [],
        };

        // Truncate error values if they're too long
        const valueResult = this._truncateText(errorOutput.value, maxCellData);
        errorOutput.value = valueResult.text;
        if (valueResult.truncated) {
          truncated.push(true);
        } else {
          truncated.push(false);
        }

        // Truncate traceback if it's too long
        const processedTraceback: string[] = [];
        let tracebackTruncated = false;
        for (const line of errorOutput.traceback) {
          const result = this._truncateText(line, maxCellData);
          processedTraceback.push(result.text);
          if (result.truncated) {
            tracebackTruncated = true;
          }
        }
        errorOutput.traceback = processedTraceback;
        if (tracebackTruncated) {
          truncated.push(true);
        }

        processedOutputs.push(errorOutput);
      } else if (typedOutput.output_type === "stream") {
        // Process stream outputs
        const streamOutput: CellOutputData = {
          data: {
            "text/plain": typedOutput.text || "",
          },
          metadata: {},
        };

        const result = this._truncateText(
          String(streamOutput.data["text/plain"]),
          maxCellData,
        );
        streamOutput.data["text/plain"] = result.text;
        truncated.push(result.truncated);

        processedOutputs.push(streamOutput);
      } else {
        // Unknown output type, skip
        truncated.push(false);
      }
    }

    return { outputs: processedOutputs, truncated };
  }

  /**
   * Read multiple cells by specifying ranges with formal output schema and truncation support
   *
   * Reads cells from a notebook with support for specifying ranges and truncating large outputs.
   * The method creates an RTC session, ensures synchronization, and processes cell outputs
   * including execution results, display data, and error outputs. Large outputs are truncated
   * with appropriate metadata indicating truncation occurred.
   *
   * @param path Path to the notebook file
   * @param ranges Array of cell ranges to read. If not provided, reads all cells.
   * @param maxCellData Maximum size in characters for cell source and output data (default: 2048)
   * @returns MCP response with formal cell data schema including cell content, metadata, outputs, and truncation info
   *
   * @example
   * ```typescript
   * // Read cells 0-4 and 10-14
   * const result = await notebookTools.readNotebookCells('notebook.ipynb', [
   *   { start: 0, end: 5 },
   *   { start: 10, end: 15 }
   * ], 4096);
   * const data = JSON.parse(result.content[0].text);
   * console.log(`Read ${data.cells.length} cells`);
   * ```
   */
  async readNotebookCells(
    path: string,
    ranges?: Array<CellRange>,
    maxCellData: number = 2048,
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
      const cells: CellData[] = [];
      let anyTruncated = false;

      for (const range of cellRanges) {
        const start = Math.max(0, range.start);
        const end = Math.min(
          notebookContent.cells.length,
          range.end || notebookContent.cells.length,
        );

        for (let i = start; i < end; i++) {
          const rawCell = notebookContent.cells[i];

          // Process cell source with truncation
          const sourceResult = this._truncateText(
            Array.isArray(rawCell.source)
              ? rawCell.source.join("")
              : rawCell.source || "",
            maxCellData,
          );

          // Create formal cell data structure
          const cellData: CellData = {
            index: i,
            id: String(rawCell.id || `cell-${i}`),
            cell_type: rawCell.cell_type as "code" | "markdown" | "raw",
            source: sourceResult.text,
            metadata: rawCell.metadata || {},
          };

          // Add truncation info for source
          if (sourceResult.truncated) {
            cellData.truncated = {
              source: true,
            };
            anyTruncated = true;
          } else {
            cellData.truncated = {
              source: false,
            };
          }

          // Add code cell specific fields
          if (rawCell.cell_type === "code") {
            if (
              rawCell.execution_count !== null &&
              rawCell.execution_count !== undefined
            ) {
              cellData.execution_count = Number(rawCell.execution_count);
            }

            // Process outputs if they exist
            if (
              rawCell.outputs &&
              Array.isArray(rawCell.outputs) &&
              rawCell.outputs.length > 0
            ) {
              const { outputs: processedOutputs, truncated: outputsTruncated } =
                this._processCellOutputs(
                  rawCell.outputs as unknown[],
                  maxCellData,
                );
              cellData.outputs = processedOutputs;

              // Update truncation info for outputs
              if (cellData.truncated) {
                cellData.truncated.outputs = outputsTruncated;
              } else {
                cellData.truncated = {
                  source: false,
                  outputs: outputsTruncated,
                };
              }

              if (outputsTruncated.some((truncated) => truncated)) {
                anyTruncated = true;
              }
            }
          }

          cells.push(cellData);
        }
      }

      // Create formal response
      const result: ReadNotebookCellsResult = {
        path,
        cells,
        truncated: anyTruncated,
        max_cell_data: maxCellData,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error(
        `Failed to read cells from notebook ${path}. Cell ranges: ${JSON.stringify(ranges)}`,
        error,
      );
      throw new Error(
        `Failed to read cells from notebook ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Modify multiple cells by specifying ranges, execute them if not disabled
   *
   * Modifies the content of cells in specified ranges using RTC transactions for atomic updates.
   * Supports optional execution of modified cells with configurable output size limits.
   * The method ensures all modifications are applied in a single transaction and only
   * executes code cells when execution is enabled.
   *
   * @param path Path to the notebook file
   * @param modifications Array of cell modifications, each specifying a range and new content
   * @param exec Whether to execute the modified cells (default: true). Set to false to skip execution.
   * @param maxCellOutputSize Maximum size in characters for cell output data (default: 2000)
   * @returns MCP response with execution results if cells were executed, including outputs and truncation info
   *
   * @example
   * ```typescript
   * const result = await notebookTools.modifyNotebookCells('notebook.ipynb', [
   *   { range: { start: 0, end: 1 }, content: 'print("Hello World")' }
   * ], true, 4096);
   * const response = JSON.parse(result.content[0].text);
   * console.log(`Modified ${response.modified_ranges} ranges`);
   * ```
   */
  async modifyNotebookCells(
    path: string,
    modifications: Array<CellModification>,
    exec?: boolean,
    maxCellOutputSize: number = 2000,
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
      let executionResults: CellExecutionResult[] = [];
      if (exec !== false) {
        const kernelConn = await nbSession.ensureKernelConnection();
        for (const cell of cells2exec) {
          if (!cell.getSource().trim()) {
            cell.clearOutputs();
            cell.execution_count = null;
            continue; // skip empty cell
          }
          const result = await executeJupyterCell(
            cell,
            kernelConn,
            maxCellOutputSize,
          );
          executionResults.push({
            outputs: result.outputs,
            truncated: result.truncated,
            original_size: result.originalSize,
          });
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
                execution_results:
                  exec !== false ? executionResults : undefined,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error(
        `Failed to modify cells in notebook ${path}. Modifications count: ${modifications.length}`,
        error,
      );
      throw new Error(
        `Failed to modify cells in notebook ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Create a new empty notebook in JupyterLab
   *
   * Creates a new empty Jupyter notebook with the standard structure (nbformat 4, nbformat_minor 5).
   * The path must end with .ipynb extension. The notebook is created with no cells and basic metadata.
   *
   * @param path Path for the new notebook file (should end with .ipynb)
   * @returns MCP response indicating success with confirmation message
   *
   * @example
   * ```typescript
   * const result = await notebookTools.createNotebook('projects/new_analysis.ipynb');
   * console.log(result.content[0].text); // "Successfully created empty notebook at projects/new_analysis.ipynb"
   * ```
   *
   * @throws {Error} If path doesn't end with .ipynb extension
   */
  async createNotebook(path: string): Promise<CallToolResult> {
    try {
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter.baseUrl,
      });

      const url = URLExt.join(
        settings.baseUrl,
        "/api/contents",
        URLExt.encodeParts(path),
      );

      // Validate that the path ends with .ipynb
      if (!path.toLowerCase().endsWith(".ipynb")) {
        throw new Error("Notebook file path must end with .ipynb extension");
      }

      // Create an empty notebook structure
      const requestBody = {
        type: "notebook",
        content: {
          cells: [],
          metadata: {},
          nbformat: 4,
          nbformat_minor: 5,
        },
        format: "json",
      };

      const init: RequestInit = {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      };

      let response: Response;
      try {
        response = await this.jupyterAdapter.makeJupyterRequest(url, init);
      } catch (error) {
        logger.error(
          `Network error in createNotebook. URL: ${url}, Notebook path: ${path}, Base URL: ${settings.baseUrl}`,
          error,
        );
        throw new Error(
          `Network error when creating notebook at ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (!response.ok) {
        // Try to get more error details from the response body
        let errorDetails = "";
        try {
          const errorResponse = await response.text();
          errorDetails = ` - Response body: ${errorResponse}`;
        } catch {
          errorDetails = " - Could not read response body";
        }

        logger.error(
          `Server error in createNotebook. URL: ${url}, Notebook path: ${path}, Error details: ${errorDetails}`,
        );
        throw new Error(
          `Server returned ${response.status} when creating notebook at ${path}: ${response.statusText}${errorDetails}`,
        );
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully created empty notebook at ${path}`,
          },
        ],
      };
    } catch (error) {
      logger.error(`Failed to create notebook at ${path}`, error);
      throw new Error(
        `Failed to create notebook at ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Insert multiple cells at specified location, execute them if not disabled
   *
   * Inserts multiple cells at a specified position in the notebook using RTC transactions.
   * Supports different cell types (code, markdown, raw) and optional execution of code cells.
   * The method performs bulk insertion for efficiency and tracks which cells were executed.
   *
   * @param path Path to the notebook file
   * @param position Position to insert the cells (0-based index)
   * @param cells Array of cells to insert, each specifying type and content
   * @param exec Whether to execute the inserted cells (default: true). Set to false to skip execution.
   * @param maxCellOutputSize Maximum size in characters for cell output data (default: 2000)
   * @returns MCP response with execution results if cells were executed, including outputs and truncation info
   *
   * @example
   * ```typescript
   * const result = await notebookTools.insertNotebookCells('notebook.ipynb', 0, [
   *   { type: 'markdown', content: '# Analysis' },
   *   { type: 'code', content: 'import pandas as pd' }
   * ], true, 4096);
   * const response = JSON.parse(result.content[0].text);
   * console.log(`Inserted cells executed: ${response.executed}`);
   * ```
   */
  async insertNotebookCells(
    path: string,
    position: number,
    cells: Array<CellInsertion>,
    exec?: boolean,
    maxCellOutputSize: number = 2000,
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

      // Execute cells if requested
      let executionResults: CellExecutionResult[] = [];
      if (exec !== false) {
        const kernelConn = await nbSession.ensureKernelConnection();
        for (const cell of cells2exec) {
          if (!cell.getSource().trim()) {
            cell.clearOutputs();
            cell.execution_count = null;
            continue; // skip empty cell
          }
          const result = await executeJupyterCell(
            cell,
            kernelConn,
            maxCellOutputSize,
          );
          executionResults.push({
            outputs: result.outputs,
            truncated: result.truncated,
            original_size: result.originalSize,
          });
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
                execution_results:
                  exec !== false ? executionResults : undefined,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error(
        `Failed to insert cells into notebook ${path} at position ${position}. Cells count: ${cells.length}`,
        error,
      );
      throw new Error(
        `Failed to insert cells into notebook ${path} at position ${position}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete multiple cells by specifying ranges
   *
   * Deletes cells from specified ranges in the notebook using RTC transactions.
   * The method processes ranges in reverse order to avoid index shifting issues when
   * deleting multiple ranges. All deletions are performed in a single transaction.
   *
   * @param path Path to the notebook file
   * @param ranges Array of cell ranges to delete. Each range specifies start and optional end indices.
   * @returns MCP response indicating success with the count of deleted cells
   *
   * @example
   * ```typescript
   * const result = await notebookTools.deleteNotebookCells('notebook.ipynb', [
   *   { start: 0, end: 2 },  // Delete cells 0 and 1
   *   { start: 5 }            // Delete cell 5 only
   * ]);
   * const response = JSON.parse(result.content[0].text);
   * console.log(`Deleted ${response.message.match(/\d+/)?.[0]} cells`);
   * ```
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
      logger.error(
        `Failed to delete cells from notebook ${path}. Ranges: ${JSON.stringify(ranges)}`,
        error,
      );
      throw new Error(
        `Failed to delete cells from notebook ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Restart the kernel of a specified notebook
   *
   * Restarts the kernel associated with a notebook with options to clear outputs and
   * re-execute cells. Supports specifying a different kernel name to switch kernels.
   * The method handles the kernel restart process and optional post-restart operations.
   *
   * @param path Path to the notebook file
   * @param clear_outputs Whether to clear cell outputs after restart (default: false)
   * @param exec Whether to execute cells after restart (default: false)
   * @param kernel_name Name of the kernel to use (from list_available_kernels). If not specified, uses current kernel.
   * @returns MCP response indicating success with details about cleared outputs and executed cells
   *
   * @example
   * ```typescript
   * const result = await notebookTools.restartNotebookKernel('notebook.ipynb',
   *   true, true, 'python3');
   * const response = JSON.parse(result.content[0].text);
   * console.log(`Kernel restarted, outputs cleared: ${response.cleared_outputs}`);
   * ```
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
      logger.error(
        `Failed to restart kernel for notebook ${path}. Clear outputs: ${!!clear_outputs}, Execute cells: ${!!exec}, Kernel name: ${kernel_name || "default"}`,
        error,
      );
      throw new Error(
        `Failed to restart kernel for notebook ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * List all available kernels on the JupyterLab server
   *
   * Retrieves a list of all available kernel specifications from the JupyterLab server.
   * Each kernel specification includes display name, language, and resource directory path.
   * This information can be used to select appropriate kernels for notebooks.
   *
   * @returns MCP response with list of available kernels including name, display name, language, and path
   *
   * @example
   * ```typescript
   * const result = await notebookTools.listAvailableKernels();
   * const kernelData = JSON.parse(result.content[0].text);
   * console.log('Available kernels:');
   * kernelData.kernels.forEach(kernel => {
   *   console.log(`- ${kernel.name}: ${kernel.display_name} (${kernel.language})`);
   * });
   * ```
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

      let kernelsResponse: Response;
      try {
        kernelsResponse = await this.jupyterAdapter.makeJupyterRequest(
          kernelsUrl,
          kernelsInit,
        );
      } catch (error) {
        logger.error(
          `Network error in listAvailableKernels. URL: ${kernelsUrl}, Base URL: ${settings.baseUrl}`,
          error,
        );
        throw new Error(
          `Network error when accessing ${kernelsUrl}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let kernelsData: string = await kernelsResponse.text();
      let parsedKernelsData: JsonResponse | null = null;

      if (kernelsData.length > 0) {
        try {
          parsedKernelsData = JSON.parse(kernelsData);
        } catch (error) {
          logger.error(
            `Not a JSON response body in listAvailableKernels. Response status: ${kernelsResponse.status}, Response text: ${await kernelsResponse.text().catch(() => "Could not read response text")}`,
            error,
          );
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
      logger.error(
        `Failed to list available kernels. Base URL: ${this.jupyterAdapter["baseUrl"]}`,
        error,
      );
      throw new Error(
        `Failed to list available kernels: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Assign a specific kernel to a notebook
   *
   * Assigns a specific kernel to a notebook by establishing a connection with the
   * specified kernel. The kernel name must be from the list of available kernels.
   * Returns detailed information about the successful assignment or error details
   * if the assignment failed.
   *
   * @param path Path to the notebook file
   * @param kernel_name Name of the kernel to assign (from list_available_kernels)
   * @returns MCP response indicating success with kernel information or failure details
   *
   * @example
   * ```typescript
   * const result = await notebookTools.assignNotebookKernel('notebook.ipynb', 'python3');
   * const response = JSON.parse(result.content[0].text);
   * if (response.success) {
   *   console.log(`Assigned kernel: ${response.kernel_display_name} (${response.kernel_id})`);
   * } else {
   *   console.log(`Assignment failed: ${response.message}`);
   * }
   * ```
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
      logger.error(
        `Failed to assign notebook kernel. Notebook path: ${path}, Kernel name: ${kernel_name}`,
        error,
      );

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
   *
   * Executes code cells in specified ranges with configurable output size limits.
   * Only code cells are executed; markdown and raw cells are ignored. The method
   * ensures the notebook is synchronized and establishes a kernel connection before
   * execution. Returns detailed execution results including outputs and truncation info.
   *
   * @param path Path to the notebook file
   * @param ranges Array of cell ranges to execute. Each range specifies start and optional end indices.
   * @param maxCellOutputSize Maximum size in characters for cell output data (default: 2000)
   * @returns MCP response with execution results including outputs, truncation info, and execution statistics
   *
   * @example
   * ```typescript
   * const result = await notebookTools.executeNotebookCells('notebook.ipynb', [
   *   { start: 0, end: 3 },
   *   { start: 5 }
   * ], 4096);
   * const response = JSON.parse(result.content[0].text);
   * console.log(`Executed ${response.executed_cells} cells in ${response.executed_ranges} ranges`);
   * ```
   */
  async executeNotebookCells(
    path: string,
    ranges: Array<CellRange>,
    maxCellOutputSize: number = 2000,
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

      // Execute all cells and collect results
      const executionResults: CellExecutionResult[] = [];
      for (const cell of cellsToExecute) {
        if (!cell.getSource().trim()) {
          cell.clearOutputs();
          cell.execution_count = null;
          continue; // skip empty cell
        }
        const result = await executeJupyterCell(
          cell,
          kernelConn,
          maxCellOutputSize,
        );
        executionResults.push({
          outputs: result.outputs,
          truncated: result.truncated,
          original_size: result.originalSize,
        });
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
                execution_results: executionResults,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error(
        `Failed to execute cells in notebook ${path}. Ranges: ${JSON.stringify(ranges)}`,
        error,
      );
      throw new Error(
        `Failed to execute cells in notebook ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
