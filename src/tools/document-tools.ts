import { JupyterLabAdapter } from "../jupyter/adapter.js";
import { ServerConnection } from "@jupyterlab/services";
import { URLExt } from "@jupyterlab/coreutils";
import { logger } from "../utils/logger.js";

/**
 * DocumentTools provides high-level operations for document management
 *
 * This class implements the MCP tools for listing, creating, and managing
 * documents in JupyterLab.
 *
 * All document viewing and manipulations are performed via RTC infrastructure,
 * so AI agents see up-to-date data, while its modifications are visible to human
 * users who opened a browser tab for the document, in real time.
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
    throw new Error("not implemented");
  }

  /**
   * Get document information
   * @param params Parameters for getting document info
   * @returns MCP response with document information
   */
  async getDocumentInfo(params: { path: string }): Promise<any> {
    throw new Error("not implemented");
  }

  /**
   * Delete a document
   * @param params Parameters for deleting the document
   * @returns MCP response indicating success
   */
  async deleteDocument(params: { path: string }): Promise<any> {
    throw new Error("not implemented");
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
    throw new Error("not implemented");
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
    throw new Error("not implemented");
  }
}
