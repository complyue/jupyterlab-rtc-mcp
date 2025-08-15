import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JupyterLabAdapter } from "../jupyter/adapter.js";
import { NotebookTools } from "../tools/notebook-tools.js";
import { DocumentTools } from "../tools/document-tools.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

/**
 * MCP Server implementation for JupyterLab RTC
 *
 * This class implements the MCP server functionality using the idiomatic McpServer class
 * with server.tool() method for registering tools.
 */
export class JupyterLabMCPServer {
  private server: McpServer;
  private jupyterAdapter: JupyterLabAdapter;
  private notebookTools: NotebookTools;
  private documentTools: DocumentTools;

  constructor(serverInfo?: { name: string; version: string }) {
    // Create MCP server using the idiomatic McpServer class
    this.server = new McpServer(
      {
        name: serverInfo?.name || "jupyterlab-rtc-mcp",
        version: serverInfo?.version || "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Initialize JupyterLab adapter
    this.jupyterAdapter = new JupyterLabAdapter();

    // Initialize tools
    this.notebookTools = new NotebookTools(this.jupyterAdapter);
    this.documentTools = new DocumentTools(this.jupyterAdapter);

    // Notebook Operation Tools
    this.registerNotebookTools();

    // Document Management Tools
    this.registerDocumentTools();
  }

  /**
   * Register notebook operation tools
   */
  private registerNotebookTools(): void {
    // Tool to query notebook sessions
    this.server.tool(
      "query_nb_sessions",
      "Query the status of real-time collaboration sessions for notebooks in a directory",
      {
        root_path: z
          .string()
          .optional()
          .describe(
            "Directory path to search for notebook sessions (default: lab root directory)",
          ),
      },
      async ({ root_path }) => {
        return await this.jupyterAdapter.queryNotebookSessions({ root_path });
      },
    );

    // Tool to end a notebook session
    this.server.tool(
      "end_nb_session",
      "End a real-time collaboration session for a notebook",
      { path: z.string().describe("Path to the notebook file") },
      async ({ path }) => {
        return await this.jupyterAdapter.endNotebookSession({ path });
      },
    );

    // Tool to list notebooks
    this.server.tool(
      "list_nbs",
      "List all notebook files under specified directory, recursively",
      {
        path: z
          .string()
          .optional()
          .describe("Directory path to search for notebooks (default: root)"),
      },
      async ({ path }) => {
        return await this.notebookTools.listNotebooks(path);
      },
    );

    // Tool to get notebook status
    this.server.tool(
      "get_nb_stat",
      "Get status information about a notebook",
      { path: z.string().describe("Path to the notebook file") },
      async ({ path }) => {
        return await this.notebookTools.getNotebookStatus(path);
      },
    );

    // Tool to read notebook cells
    this.server.tool(
      "read_nb_cells",
      "Read multiple cells by specifying ranges",
      {
        path: z.string().describe("Path to the notebook file"),
        ranges: z
          .array(
            z.object({
              start: z.number().describe("Starting cell index"),
              end: z
                .number()
                .optional()
                .describe("Ending cell index (exclusive)"),
            }),
          )
          .optional()
          .describe("Array of cell ranges to read"),
      },
      async ({ path, ranges }) => {
        return await this.notebookTools.readNotebookCells(path, ranges);
      },
    );

    // Tool to modify notebook cells
    this.server.tool(
      "modify_nb_cells",
      "Modify multiple cells by specifying ranges, execute them if not disabled",
      {
        path: z.string().describe("Path to the notebook file"),
        modifications: z
          .array(
            z.object({
              range: z.object({
                start: z.number().describe("Starting cell index"),
                end: z
                  .number()
                  .optional()
                  .describe("Ending cell index (exclusive)"),
              }),
              content: z.string().describe("New content for the cells"),
            }),
          )
          .describe("Array of cell modifications"),
        exec: z
          .boolean()
          .default(true)
          .describe("Whether to execute the modified cells"),
      },
      async ({ path, modifications, exec }) => {
        return await this.notebookTools.modifyNotebookCells(
          path,
          modifications,
          exec,
        );
      },
    );

    // Tool to insert notebook cells
    this.server.tool(
      "insert_nb_cells",
      "Insert multiple cells at specified location, execute them if not disabled",
      {
        path: z.string().describe("Path to the notebook file"),
        position: z.number().describe("Position to insert the cells"),
        cells: z
          .array(
            z.object({
              type: z
                .enum(["code", "markdown"])
                .default("code")
                .describe("Cell type"),
              content: z.string().describe("Cell content"),
            }),
          )
          .describe("Array of cells to insert"),
        exec: z
          .boolean()
          .default(true)
          .describe("Whether to execute the inserted cells"),
      },
      async ({ path, position, cells, exec }) => {
        return await this.notebookTools.insertNotebookCells(
          path,
          position,
          cells,
          exec,
        );
      },
    );

    // Tool to delete notebook cells
    this.server.tool(
      "delete_nb_cells",
      "Delete multiple cells by specifying ranges",
      {
        path: z.string().describe("Path to the notebook file"),
        ranges: z
          .array(
            z.object({
              start: z.number().describe("Starting cell index"),
              end: z
                .number()
                .optional()
                .describe("Ending cell index (exclusive)"),
            }),
          )
          .describe("Array of cell ranges to delete"),
      },
      async ({ path, ranges }) => {
        return await this.notebookTools.deleteNotebookCells(path, ranges);
      },
    );

    // Tool to restart notebook kernel
    this.server.tool(
      "restart_nb_kernel",
      "Restart the kernel of a specified notebook",
      {
        path: z.string().describe("Path to the notebook file"),
        clear_outputs: z
          .boolean()
          .default(false)
          .describe("Whether to clear cell contents after restart"),
        exec: z
          .boolean()
          .default(true)
          .describe("Whether to execute cells after restart"),
        kernel_name: z
          .string()
          .optional()
          .describe("Name of the kernel to use (from list_available_kernels)"),
      },
      async ({ path, clear_outputs, exec, kernel_name }) => {
        return await this.notebookTools.restartNotebookKernel(
          path,
          clear_outputs,
          exec,
          kernel_name,
        );
      },
    );

    // Tool to list available kernels
    this.server.tool(
      "list_available_kernels",
      "List all available kernels on the JupyterLab server",
      {},
      async () => {
        return await this.notebookTools.listAvailableKernels();
      },
    );

    // Tool to assign a kernel to a notebook
    this.server.tool(
      "assign_nb_kernel",
      "Assign a specific kernel to a notebook",
      {
        path: z.string().describe("Path to the notebook file"),
        kernel_name: z
          .string()
          .describe(
            "Name of the kernel to assign (from list_available_kernels)",
          ),
      },
      async ({ path, kernel_name }) => {
        return await this.notebookTools.assignNotebookKernel(path, kernel_name);
      },
    );
  }

  /**
   * Register document management tools
   */
  private registerDocumentTools(): void {
    // Tool to list documents
    this.server.tool(
      "list_documents",
      "List available documents in JupyterLab",
      {
        path: z
          .string()
          .optional()
          .describe("Path to list documents from (default: root)"),
      },
      async ({ path }) => {
        return await this.documentTools.listDocuments(path);
      },
    );

    // Tool to create a document
    this.server.tool(
      "create_document",
      "Create a new document in JupyterLab",
      {
        path: z.string().describe("Path for the new document"),
        type: z
          .enum(["notebook", "file", "markdown"])
          .default("notebook")
          .describe("Document type"),
        content: z
          .string()
          .optional()
          .describe("Initial content for the document"),
      },
      async ({ path, type, content }) => {
        return await this.documentTools.createDocument(path, type, content);
      },
    );

    // Tool to get document info
    this.server.tool(
      "get_document_info",
      "Get information about a document",
      { path: z.string().describe("Path to the document") },
      async ({ path }) => {
        return await this.documentTools.getDocumentInfo(path);
      },
    );

    // Tool to delete a document
    this.server.tool(
      "delete_document",
      "Delete a document in JupyterLab",
      { path: z.string().describe("Path to the document to delete") },
      async ({ path }) => {
        return await this.documentTools.deleteDocument(path);
      },
    );

    // Tool to rename a document
    this.server.tool(
      "rename_document",
      "Rename a document in JupyterLab",
      {
        path: z.string().describe("Current path to the document"),
        newPath: z.string().describe("New path for the document"),
      },
      async ({ path, newPath }) => {
        return await this.documentTools.renameDocument(path, newPath);
      },
    );

    // Tool to copy a document
    this.server.tool(
      "copy_document",
      "Copy a document in JupyterLab",
      {
        path: z.string().describe("Path to the document to copy"),
        copyPath: z.string().describe("Path for the copied document"),
      },
      async ({ path, copyPath }) => {
        return await this.documentTools.copyDocument(path, copyPath);
      },
    );

    // Tool to modify a document
    this.server.tool(
      "modify_document",
      "Modify the content of a document in JupyterLab",
      {
        path: z.string().describe("Path to the document to modify"),
        content: z.string().describe("New content for the document"),
      },
      async ({ path, content }) => {
        return await this.documentTools.modifyDocument(path, content);
      },
    );
  }

  /**
   * Connect the server to a transport
   * @param transport Transport to connect to
   */
  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }

  /**
   * Get the underlying MCP server instance
   * This is useful for transport implementations that need direct access
   */
  getServer(): McpServer {
    return this.server;
  }

  /**
   * Get the JupyterLab adapter instance
   * This is useful for transport implementations that need access to JupyterLab functionality
   */
  getJupyterLabAdapter(): JupyterLabAdapter {
    return this.jupyterAdapter;
  }
}
