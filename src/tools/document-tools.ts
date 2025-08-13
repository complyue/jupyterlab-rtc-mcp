import { JupyterLabAdapter } from "../jupyter/adapter.js";
import { ServerConnection } from "@jupyterlab/services";
import { URLExt } from "@jupyterlab/coreutils";
import { logger } from "../utils/logger.js";

/**
 * DocumentTools provides high-level operations for document management
 *
 * This class implements the MCP tools for listing, creating, and managing
 * documents in JupyterLab.
 */
export class DocumentTools {
  private jupyterAdapter: JupyterLabAdapter;

  constructor(jupyterAdapter: JupyterLabAdapter) {
    this.jupyterAdapter = jupyterAdapter;
  }

  /**
   * List available documents in JupyterLab
   * @param params Parameters for listing documents
   * @returns MCP response with document list
   */
  async listDocuments(params: { path?: string }): Promise<any> {
    try {
      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
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

      const response = await ServerConnection.makeRequest(url, init, settings);

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status}: ${response.statusText}`,
        );
      }

      const data = await response.json();

      // Format the response to include only relevant information
      const documents = data.content.map((item: any) => ({
        name: item.name,
        path: item.path,
        type: item.type,
        created: item.created,
        last_modified: item.last_modified,
        size: item.size,
        writable: item.writable,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(documents, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to list documents:", error);
      throw new Error(
        `Failed to list documents: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Create a new document in JupyterLab
   * @param params Parameters for creating the document
   * @returns MCP response indicating success
   */
  async createDocument(params: {
    path: string;
    type?: string;
    content?: string;
  }): Promise<any> {
    try {
      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
      const url = URLExt.join(settings.baseUrl, "/api/contents", params.path);

      // Determine content based on document type
      let content;
      let format;

      if (params.type === "notebook") {
        // If content is provided, try to parse it as a notebook
        if (params.content) {
          try {
            content = JSON.parse(params.content);
          } catch (error) {
            logger.error(
              "Failed to parse notebook content in createDocument:",
              error,
            );
            // If parsing fails, create a simple notebook with the content in a single cell
            content = {
              cells: [
                {
                  cell_type: "code",
                  execution_count: null,
                  metadata: {},
                  outputs: [],
                  source: params.content,
                },
              ],
              metadata: {},
              nbformat: 4,
              nbformat_minor: 4,
            };
          }
        } else {
          content = {
            cells: [],
            metadata: {},
            nbformat: 4,
            nbformat_minor: 4,
          };
        }
        format = "json";
      } else if (params.type === "markdown") {
        content = params.content || "";
        format = "text";
      } else {
        // Default to text file
        content = params.content || "";
        format = "text";
      }

      const requestBody = {
        type: params.type || "notebook",
        format,
        content,
      };

      const init: RequestInit = {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      };

      // Add authorization header if token is provided
      const token = process.env.JUPYTERLAB_TOKEN;
      if (token) {
        init.headers = {
          ...init.headers,
          Authorization: `token ${token}`,
        };
      }

      const response = await ServerConnection.makeRequest(url, init, settings);

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status}: ${response.statusText}`,
        );
      }

      await response.json();

      return {
        content: [
          {
            type: "text",
            text: `Successfully created ${params.type || "notebook"} at ${params.path}`,
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to create document:", error);
      throw new Error(
        `Failed to create document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get document information
   * @param params Parameters for getting document info
   * @returns MCP response with document information
   */
  async getDocumentInfo(params: { path: string }): Promise<any> {
    try {
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

      const response = await ServerConnection.makeRequest(url, init, settings);

      if (!response.ok) {
        // Try to get more error details from the response body
        let errorDetails = "";
        try {
          const errorResponse = await response.text();
          errorDetails = ` - Response body: ${errorResponse}`;
        } catch {
          errorDetails = " - Could not read response body";
        }

        throw new Error(
          `Server returned ${response.status}: ${response.statusText}${errorDetails}`,
        );
      }

      const data = await response.json();

      // Format the response to include only relevant information
      const documentInfo = {
        name: data.name,
        path: data.path,
        type: data.type,
        format: data.format,
        created: data.created,
        last_modified: data.last_modified,
        size: data.size,
        writable: data.writable,
        mimetype: data.mimetype,
        content: data.content,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(documentInfo, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to get document info:", error);
      throw new Error(
        `Failed to get document info: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete a document
   * @param params Parameters for deleting the document
   * @returns MCP response indicating success
   */
  async deleteDocument(params: { path: string }): Promise<any> {
    try {
      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
      const url = URLExt.join(settings.baseUrl, "/api/contents", params.path);

      const init: RequestInit = {
        method: "DELETE",
      };

      // Add authorization header if token is provided
      const token = process.env.JUPYTERLAB_TOKEN;
      if (token) {
        init.headers = {
          ...init.headers,
          Authorization: `token ${token}`,
        };
      }

      const response = await ServerConnection.makeRequest(url, init, settings);

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status}: ${response.statusText}`,
        );
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully deleted document at ${params.path}`,
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to delete document:", error);
      throw new Error(
        `Failed to delete document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Rename a document
   * @param params Parameters for renaming the document
   * @returns MCP response indicating success
   */
  async renameDocument(params: {
    path: string;
    newPath: string;
  }): Promise<any> {
    try {
      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
      const url = URLExt.join(settings.baseUrl, "/api/contents", params.path);

      const requestBody = {
        path: params.newPath,
      };

      const init: RequestInit = {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      };

      // Add authorization header if token is provided
      const token = process.env.JUPYTERLAB_TOKEN;
      if (token) {
        init.headers = {
          ...init.headers,
          Authorization: `token ${token}`,
        };
      }

      const response = await ServerConnection.makeRequest(url, init, settings);

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status}: ${response.statusText}`,
        );
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully renamed document from ${params.path} to ${params.newPath}`,
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to rename document:", error);
      throw new Error(
        `Failed to rename document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Copy a document
   * @param params Parameters for copying the document
   * @returns MCP response indicating success
   */
  async copyDocument(params: { path: string; copyPath: string }): Promise<any> {
    try {
      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
      const url = URLExt.join(
        settings.baseUrl,
        "/api/contents",
        params.copyPath,
      );

      const requestBody = {
        copy_from: params.path,
      };

      const init: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      };

      // Add authorization header if token is provided
      const token = process.env.JUPYTERLAB_TOKEN;
      if (token) {
        init.headers = {
          ...init.headers,
          Authorization: `token ${token}`,
        };
      }

      const response = await ServerConnection.makeRequest(url, init, settings);

      if (!response.ok) {
        // Try to get more error details from the response body
        let errorDetails = "";
        try {
          const errorResponse = await response.text();
          errorDetails = ` - Response body: ${errorResponse}`;
        } catch {
          errorDetails = " - Could not read response body";
        }

        throw new Error(
          `Server returned ${response.status}: ${response.statusText}${errorDetails}`,
        );
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully copied document from ${params.path} to ${params.copyPath}`,
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to copy document:", error);
      throw new Error(
        `Failed to copy document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Modify the content of a document
   * @param params Parameters for modifying the document
   * @returns MCP response indicating success
   */
  async modifyDocument(params: {
    path: string;
    content: string;
  }): Promise<any> {
    try {
      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
      const url = URLExt.join(settings.baseUrl, "/api/contents", params.path);

      // First, get the current document to determine its type and format
      const getInit: RequestInit = {
        method: "GET",
      };

      // Add authorization header if token is provided
      const token = process.env.JUPYTERLAB_TOKEN;
      if (token) {
        getInit.headers = {
          ...getInit.headers,
          Authorization: `token ${token}`,
        };
      }

      const getResponse = await ServerConnection.makeRequest(
        url,
        getInit,
        settings,
      );

      if (!getResponse.ok) {
        throw new Error(
          `Server returned ${getResponse.status}: ${getResponse.statusText}`,
        );
      }

      const documentData = await getResponse.json();

      // Prepare the update request with the new content
      const requestBody = {
        type: documentData.type,
        format: documentData.format,
        content: params.content,
      };

      const init: RequestInit = {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      };

      // Add authorization header if token is provided
      if (token) {
        init.headers = {
          ...init.headers,
          Authorization: `token ${token}`,
        };
      }

      const response = await ServerConnection.makeRequest(url, init, settings);

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status}: ${response.statusText}`,
        );
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully modified document at ${params.path}`,
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to modify document:", error);
      throw new Error(
        `Failed to modify document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
