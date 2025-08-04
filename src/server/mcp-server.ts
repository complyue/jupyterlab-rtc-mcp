import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import { JupyterLabAdapter } from "../jupyter/adapter.js";
import { NotebookTools } from "../tools/notebook-tools.js";
import { DocumentTools } from "../tools/document-tools.js";

// Define the schema for tool call requests
const ToolCallRequestSchema = z.object({
  method: z.literal("tools/call"),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.any()).optional(),
  }),
});

// Define the schema for tools list requests
const ToolsListRequestSchema = z.object({
  method: z.literal("tools/list"),
  params: z.object({}).optional(),
});

/**
 * MCP Server implementation for JupyterLab RTC
 *
 * This class implements the MCP server functionality, registering tools
 * for notebook and document operations.
 */
export class JupyterLabMCPServer {
  private server: Server;
  private jupyterAdapter: JupyterLabAdapter;
  private notebookTools: NotebookTools;
  private documentTools: DocumentTools;

  constructor() {
    // Create MCP server
    this.server = new Server(
      {
        name: "jupyterlab-rtc-mcp",
        version: "0.1.0",
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

    // Register tools
    this.setupRequestHandlers();
  }

  /**
   * Setup request handlers for all tools
   */
  private setupRequestHandlers(): void {
    // Register tool call handler
    this.server.setRequestHandler(ToolCallRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "begin_nb_session":
            return await this.jupyterAdapter.beginNotebookSession(
              args as { path: string },
            );

          case "end_nb_session":
            return await this.jupyterAdapter.endNotebookSession(
              args as { path: string },
            );

          case "query_nb_sessions":
            return await this.jupyterAdapter.queryNotebookSessions(
              args as { root_path?: string },
            );

          case "list_nbs":
            return await this.notebookTools.listNotebooks(
              args as { path?: string },
            );

          case "get_nb_stat":
            return await this.notebookTools.getNotebookStatus(
              args as { path: string },
            );

          case "read_nb_cells":
            return await this.notebookTools.readNotebookCells(
              args as {
                path: string;
                ranges?: Array<{ start: number; end?: number }>;
              },
            );

          case "modify_nb_cells":
            return await this.notebookTools.modifyNotebookCells(
              args as {
                path: string;
                modifications: Array<{
                  range: { start: number; end?: number };
                  content: string;
                }>;
                exec?: boolean;
              },
            );

          case "insert_nb_cells":
            return await this.notebookTools.insertNotebookCells(
              args as {
                path: string;
                position: number;
                cells: Array<{ type?: string; content: string }>;
                exec?: boolean;
              },
            );

          case "delete_nb_cells":
            return await this.notebookTools.deleteNotebookCells(
              args as {
                path: string;
                ranges: Array<{ start: number; end?: number }>;
              },
            );

          case "restart_nb_kernel":
            return await this.notebookTools.restartNotebookKernel(
              args as {
                path: string;
                clear_contents?: boolean;
                exec?: boolean;
              },
            );

          case "list_documents":
            return await this.documentTools.listDocuments(
              args as { path?: string },
            );

          case "create_document":
            return await this.documentTools.createDocument(
              args as { path: string; type?: string; content?: string },
            );

          case "get_document_info":
            return await this.documentTools.getDocumentInfo(
              args as { path: string },
            );

          case "delete_document":
            return await this.documentTools.deleteDocument(
              args as { path: string },
            );

          case "rename_document":
            return await this.documentTools.renameDocument(
              args as { path: string; newPath: string },
            );

          case "copy_document":
            return await this.documentTools.copyDocument(
              args as { path: string; copyPath: string },
            );

          case "modify_document":
            return await this.documentTools.modifyDocument(
              args as { path: string; content: string },
            );

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });

    // Register tools list handler
    this.server.setRequestHandler(ToolsListRequestSchema, async () => {
      return {
        tools: [
          {
            name: "begin_nb_session",
            description:
              "Begin a real-time collaboration session for a notebook",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the notebook file",
                },
              },
              required: ["path"],
            },
          },
          {
            name: "end_nb_session",
            description: "End a real-time collaboration session for a notebook",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the notebook file",
                },
              },
              required: ["path"],
            },
          },
          {
            name: "query_nb_sessions",
            description:
              "Query the status of real-time collaboration sessions for notebooks in a directory",
            inputSchema: {
              type: "object",
              properties: {
                root_path: {
                  type: "string",
                  description:
                    "Directory path to search for notebook sessions (default: lab root directory)",
                },
              },
            },
          },
          {
            name: "list_nbs",
            description:
              "List all notebook files under specified directory, recursively",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description:
                    "Directory path to search for notebooks (default: root)",
                },
              },
            },
          },
          {
            name: "get_nb_stat",
            description: "Get status information about a notebook",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the notebook file",
                },
              },
              required: ["path"],
            },
          },
          {
            name: "read_nb_cells",
            description: "Read multiple cells by specifying ranges",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the notebook file",
                },
                ranges: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      start: {
                        type: "number",
                        description: "Starting cell index",
                      },
                      end: {
                        type: "number",
                        description: "Ending cell index (exclusive)",
                      },
                    },
                    required: ["start"],
                  },
                  description: "Array of cell ranges to read",
                },
              },
              required: ["path"],
            },
          },
          {
            name: "modify_nb_cells",
            description:
              "Modify multiple cells by specifying ranges, execute them if not disabled",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the notebook file",
                },
                modifications: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      range: {
                        type: "object",
                        properties: {
                          start: {
                            type: "number",
                            description: "Starting cell index",
                          },
                          end: {
                            type: "number",
                            description: "Ending cell index (exclusive)",
                          },
                        },
                        required: ["start"],
                      },
                      content: {
                        type: "string",
                        description: "New content for the cells",
                      },
                    },
                    required: ["range", "content"],
                  },
                  description: "Array of cell modifications",
                },
                exec: {
                  type: "boolean",
                  default: true,
                  description: "Whether to execute the modified cells",
                },
              },
              required: ["path", "modifications"],
            },
          },
          {
            name: "insert_nb_cells",
            description:
              "Insert multiple cells at specified location, execute them if not disabled",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the notebook file",
                },
                position: {
                  type: "number",
                  description: "Position to insert the cells",
                },
                cells: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["code", "markdown"],
                        default: "code",
                        description: "Cell type",
                      },
                      content: {
                        type: "string",
                        description: "Cell content",
                      },
                    },
                    required: ["content"],
                  },
                  description: "Array of cells to insert",
                },
                exec: {
                  type: "boolean",
                  default: true,
                  description: "Whether to execute the inserted cells",
                },
              },
              required: ["path", "position", "cells"],
            },
          },
          {
            name: "delete_nb_cells",
            description: "Delete multiple cells by specifying ranges",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the notebook file",
                },
                ranges: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      start: {
                        type: "number",
                        description: "Starting cell index",
                      },
                      end: {
                        type: "number",
                        description: "Ending cell index (exclusive)",
                      },
                    },
                    required: ["start"],
                  },
                  description: "Array of cell ranges to delete",
                },
              },
              required: ["path", "ranges"],
            },
          },
          {
            name: "restart_nb_kernel",
            description: "Restart the kernel of a specified notebook",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the notebook file",
                },
                clear_contents: {
                  type: "boolean",
                  default: false,
                  description: "Whether to clear cell contents after restart",
                },
                exec: {
                  type: "boolean",
                  default: true,
                  description: "Whether to execute cells after restart",
                },
              },
              required: ["path"],
            },
          },
          {
            name: "list_documents",
            description: "List available documents in JupyterLab",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to list documents from (default: root)",
                },
              },
            },
          },
          {
            name: "create_document",
            description: "Create a new document in JupyterLab",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path for the new document",
                },
                type: {
                  type: "string",
                  enum: ["notebook", "file", "markdown"],
                  default: "notebook",
                  description: "Document type",
                },
                content: {
                  type: "string",
                  description: "Initial content for the document",
                },
              },
              required: ["path"],
            },
          },
          {
            name: "get_document_info",
            description: "Get information about a document",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the document",
                },
              },
              required: ["path"],
            },
          },
          {
            name: "delete_document",
            description: "Delete a document in JupyterLab",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the document to delete",
                },
              },
              required: ["path"],
            },
          },
          {
            name: "rename_document",
            description: "Rename a document in JupyterLab",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Current path to the document",
                },
                newPath: {
                  type: "string",
                  description: "New path for the document",
                },
              },
              required: ["path", "newPath"],
            },
          },
          {
            name: "copy_document",
            description: "Copy a document in JupyterLab",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the document to copy",
                },
                copyPath: {
                  type: "string",
                  description: "Path for the copied document",
                },
              },
              required: ["path", "copyPath"],
            },
          },
          {
            name: "modify_document",
            description: "Modify the content of a document in JupyterLab",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the document to modify",
                },
                content: {
                  type: "string",
                  description: "New content for the document",
                },
              },
              required: ["path", "content"],
            },
          },
        ],
      };
    });
  }

  /**
   * Connect the server to a transport
   * @param transport Transport to connect to
   */
  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }
}
