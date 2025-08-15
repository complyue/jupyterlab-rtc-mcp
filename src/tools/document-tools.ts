import { JupyterLabAdapter } from "../jupyter/adapter.js";
import { ServerConnection } from "@jupyterlab/services";
import { URLExt } from "@jupyterlab/coreutils";
import { logger } from "../utils/logger.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

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
   * @param path Path to list documents from (default: root)
   * @returns MCP response with document list
   */
  async listDocuments(path?: string): Promise<CallToolResult> {
    try {
      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
      const documentPath = path || "";
      const url = URLExt.join(settings.baseUrl, "/api/contents", documentPath);

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
      const documents = data.content.map(
        (item: {
          name: string;
          path: string;
          type: string;
          created: string;
          last_modified: string;
          size: number;
          writable: boolean;
        }) => ({
          name: item.name,
          path: item.path,
          type: item.type,
          created: item.created,
          last_modified: item.last_modified,
          size: item.size,
          writable: item.writable,
        }),
      );

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
   * @param path Path for the new document
   * @param type Document type (markdown, txt, rst, etc.)
   * @param content Initial content for the document
   * @returns MCP response indicating success
   */
  async createDocument(
    path: string,
    type?: string,
    content?: string,
  ): Promise<CallToolResult> {
    try {
      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
      const url = URLExt.join(settings.baseUrl, "/api/contents", path);

      // Default to 'markdown' type if not specified
      const documentType = type || "markdown";

      const requestBody: {
        type: string;
        content?: string;
        format?: string;
      } = {
        type: documentType,
      };

      // Add content if provided
      if (content !== undefined) {
        requestBody.content = content;
        // For files, we need to specify the format
        requestBody.format = "text";
      }

      // Validate that we're not creating a notebook file
      if (path.toLowerCase().endsWith(".ipynb")) {
        throw new Error(
          "Cannot create .ipynb files with create_document. Use create_notebook tool instead.",
        );
      }

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
            text: `Successfully created document at ${path}`,
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
   * @param path Path to the document
   * @param includeContent Whether to include document content (default: false)
   * @param maxContent Maximum content length to return (default: 32768)
   * @returns MCP response with document information
   */
  async getDocumentInfo(
    path: string,
    includeContent: boolean = false,
    maxContent: number = 32768,
  ): Promise<CallToolResult> {
    try {
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
        created: data.created,
        last_modified: data.last_modified,
        size: data.size,
        writable: data.writable,
        mimetype: data.mimetype,
        format: data.format,
      };

      // Build the content array with proper typing
      const resultContent: CallToolResult["content"] = [
        {
          type: "text" as const,
          text: JSON.stringify(documentInfo, null, 2),
        },
      ];

      // Process content only if requested
      if (includeContent && typeof data.content === "string") {
        let content = data.content;
        const contentLength = content.length;
        const contentInfo: {
          content_length: number;
          truncated?: boolean;
        } = {
          content_length: contentLength,
        };

        // Truncate content if it exceeds maxContent
        if (contentLength > maxContent) {
          const suffix = "\n\n...[CONTENT TRUNCATED]";
          content = content.substring(0, maxContent - suffix.length) + suffix;
          contentInfo.truncated = true;
        } else {
          contentInfo.truncated = false;
        }

        resultContent.push({
          type: "text" as const,
          text: JSON.stringify(contentInfo, null, 2),
        });
        resultContent.push({
          type: "text" as const,
          text: content,
        });
      }

      return {
        content: resultContent,
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
   * @param path Path to the document to delete
   * @returns MCP response indicating success
   */
  async deleteDocument(path: string): Promise<CallToolResult> {
    try {
      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
      const url = URLExt.join(settings.baseUrl, "/api/contents", path);

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
            text: `Successfully deleted document at ${path}`,
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
   * @param path Current path to the document
   * @param newPath New path for the document
   * @returns MCP response indicating success
   */
  async renameDocument(path: string, newPath: string): Promise<CallToolResult> {
    try {
      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
      const url = URLExt.join(settings.baseUrl, "/api/contents", path);

      const requestBody = {
        path: newPath,
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
            text: `Successfully renamed document from ${path} to ${newPath}`,
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
   * @param path Path to the document to copy
   * @param copyPath Path for the copied document
   * @returns MCP response indicating success
   */
  async copyDocument(path: string, copyPath: string): Promise<CallToolResult> {
    try {
      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
      const url = URLExt.join(settings.baseUrl, "/api/contents", copyPath);

      const requestBody = {
        copy_from: path,
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
            text: `Successfully copied document from ${path} to ${copyPath}`,
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
   * Overwrite the entire content of a document
   * @param path Path to the document to overwrite
   * @param content New content for the document
   * @returns MCP response indicating success
   */
  async overwriteDocument(path: string, content: string): Promise<CallToolResult> {
    try {
      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter["baseUrl"],
      });
      const url = URLExt.join(settings.baseUrl, "/api/contents", path);

      // First, get the current document info to determine its type
      const getInfoInit: RequestInit = {
        method: "GET",
      };

      // Add authorization header if token is provided
      const token = process.env.JUPYTERLAB_TOKEN;
      if (token) {
        getInfoInit.headers = {
          ...getInfoInit.headers,
          Authorization: `token ${token}`,
        };
      }

      const infoResponse = await ServerConnection.makeRequest(
        url,
        getInfoInit,
        settings,
      );

      if (!infoResponse.ok) {
        throw new Error(
          `Failed to get document info: ${infoResponse.status} ${infoResponse.statusText}`,
        );
      }

      const docInfo = await infoResponse.json();

      // Prepare the request body with the new content
      const requestBody: {
        content: string | object;
        format: string;
      } = {
        content: content,
        format: "text", // Assume text format for simplicity
      };

      // For notebooks, we need to handle the content differently
      if (docInfo.type === "notebook") {
        // If it's a notebook, parse the content as JSON
        try {
          requestBody.content = JSON.parse(content);
          requestBody.format = "json";
        } catch {
          throw new Error("Invalid JSON content for notebook");
        }
      }

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
            text: `Successfully modified document at ${path}`,
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

  /**
   * Insert text into a document at a specific position using RTC
   * @param path Path to the document
   * @param position Position to insert text at
   * @param text Text to insert
   * @returns MCP response indicating success
   */
  async insertDocumentText(
    path: string,
    position: number,
    text: string,
  ): Promise<CallToolResult> {
    try {
      // Check if this is a notebook file (.ipynb)
      if (path.toLowerCase().endsWith(".ipynb")) {
        throw new Error("Cannot insert text into notebook files. Use notebook tools instead.");
      }

      // For text files, use RTC
      const docSession = await this.jupyterAdapter.createDocumentSession(path);

      // Ensure the document is synchronized
      await docSession.ensureSynchronized();

      // Update session activity
      this.jupyterAdapter.updateSessionActivity(docSession.session.fileId);

      // Insert text using RTC
      docSession.insertText(position, text);

      return {
        content: [
          {
            type: "text",
            text: `Successfully inserted text at position ${position} in document ${path} using RTC`,
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to insert document text:", error);
      throw new Error(
        `Failed to insert document text: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete text from a document at a specific position using RTC
   * @param path Path to the document
   * @param position Position to delete text from
   * @param length Length of text to delete
   * @returns MCP response indicating success
   */
  async deleteDocumentText(
    path: string,
    position: number,
    length: number,
  ): Promise<CallToolResult> {
    try {
      // Check if this is a notebook file (.ipynb)
      if (path.toLowerCase().endsWith(".ipynb")) {
        throw new Error("Cannot delete text from notebook files. Use notebook tools instead.");
      }

      // For text files, use RTC
      const docSession = await this.jupyterAdapter.createDocumentSession(path);

      // Ensure the document is synchronized
      await docSession.ensureSynchronized();

      // Update session activity
      this.jupyterAdapter.updateSessionActivity(docSession.session.fileId);

      // Delete text using RTC
      docSession.deleteText(position, length);

      return {
        content: [
          {
            type: "text",
            text: `Successfully deleted ${length} characters from position ${position} in document ${path} using RTC`,
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to delete document text:", error);
      throw new Error(
        `Failed to delete document text: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Replace text in a document at a specific position using RTC
   * @param path Path to the document
   * @param position Position to replace text from
   * @param length Length of text to replace
   * @param text New text to replace with
   * @returns MCP response indicating success
   */
  async replaceDocumentText(
    path: string,
    position: number,
    length: number,
    text: string,
  ): Promise<CallToolResult> {
    try {
      // Check if this is a notebook file (.ipynb)
      if (path.toLowerCase().endsWith(".ipynb")) {
        throw new Error("Cannot replace text in notebook files. Use notebook tools instead.");
      }

      // For text files, use RTC
      const docSession = await this.jupyterAdapter.createDocumentSession(path);

      // Ensure the document is synchronized
      await docSession.ensureSynchronized();

      // Update session activity
      this.jupyterAdapter.updateSessionActivity(docSession.session.fileId);

      // Replace text using RTC
      docSession.replaceText(position, length, text);

      return {
        content: [
          {
            type: "text",
            text: `Successfully replaced ${length} characters with new text at position ${position} in document ${path} using RTC`,
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to replace document text:", error);
      throw new Error(
        `Failed to replace document text: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get document content using RTC
   * @param path Path to the document
   * @param maxContent Maximum content length to return (default: 32768)
   * @returns MCP response with document content
   */
  async getDocumentContent(
    path: string,
    maxContent: number = 32768,
  ): Promise<CallToolResult> {
    try {
      // Check if this is a notebook file (.ipynb)
      if (path.toLowerCase().endsWith(".ipynb")) {
        throw new Error("Cannot get content from notebook files using this method. Use notebook tools instead.");
      }

      // For text files, use RTC
      const docSession = await this.jupyterAdapter.createDocumentSession(path);

      // Ensure the document is synchronized
      await docSession.ensureSynchronized();

      // Update session activity
      this.jupyterAdapter.updateSessionActivity(docSession.session.fileId);

      // Get document content using RTC
      let content = docSession.getContent();
      const contentLength = content.length;
      const contentInfo: {
        content_length: number;
        truncated?: boolean;
      } = {
        content_length: contentLength,
      };

      // Truncate content if it exceeds maxContent
      if (contentLength > maxContent) {
        const suffix = "\n\n...[CONTENT TRUNCATED]";
        content = content.substring(0, maxContent - suffix.length) + suffix;
        contentInfo.truncated = true;
      } else {
        contentInfo.truncated = false;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(contentInfo, null, 2),
          },
          {
            type: "text",
            text: content,
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to get document content:", error);
      throw new Error(
        `Failed to get document content: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * End an RTC session for a document
   * @param path Path to the document
   * @returns MCP response indicating success
   */
  async endDocumentSession(path: string): Promise<CallToolResult> {
    try {
      return await this.jupyterAdapter.endDocumentSession({ path });
    } catch (error) {
      logger.error("Failed to end document session:", error);
      throw new Error(
        `Failed to end document session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Query the status of an RTC session for a document
   * @param path Path to the document
   * @returns MCP response with session status
   */
  async queryDocumentSession(path: string): Promise<CallToolResult> {
    try {
      return await this.jupyterAdapter.queryDocumentSession({ path });
    } catch (error) {
      logger.error("Failed to query document session:", error);
      throw new Error(
        `Failed to query document session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
