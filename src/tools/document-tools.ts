import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { DocumentInfo } from "../jupyter/types.js";
import { JupyterLabAdapter } from "../jupyter/adapter.js";
import { createSuccessResult } from "../utils/response-utils.js";

import { logger } from "../utils/logger.js";

/**
 * DocumentTools provides high-level operations for document management through RTC infrastructure
 *
 * This class implements the MCP tools for listing, creating, and managing documents in JupyterLab.
 * It supports both traditional file operations (create, delete, rename, copy) and RTC-based
 * text manipulation operations (insert, delete, replace text) for real-time collaboration.
 *
 * All document viewing and manipulations are performed via RTC infrastructure,
 * so AI agents see up-to-date data, while its modifications are visible to human
 * users who opened a browser tab for the document, in real time.
 *
 * Key features:
 * - List documents with metadata and URL construction
 * - Create documents with initial content
 * - Document operations: delete, rename, copy
 * - RTC-based text manipulation: insert, delete, replace
 * - Content retrieval with truncation support
 * - RTC session management: query and end sessions
 *
 * @example
 * ```typescript
 * const documentTools = new DocumentTools(jupyterAdapter);
 * const result = await documentTools.listDocuments('projects');
 * const documents = JSON.parse(result.content[0].text);
 * console.log(`Found ${documents.length} documents`);
 * ```
 */
export class DocumentTools {
  private jupyterAdapter: JupyterLabAdapter;

  constructor(jupyterAdapter: JupyterLabAdapter) {
    this.jupyterAdapter = jupyterAdapter;
  }

  /**
   * List available documents in JupyterLab
   *
   * Retrieves a list of documents from the specified path in JupyterLab, including files,
   * notebooks, and directories. For each item, it constructs appropriate URLs based on
   * the item type (notebook, file, or directory) and includes metadata like creation time,
   * modification time, size, and write permissions.
   *
   * @param path Path to list documents from (default: root directory)
   * @returns MCP response with document list including name, path, type, timestamps, size, and URL
   *
   * @example
   * ```typescript
   * const result = await documentTools.listDocuments('projects/data');
   * const documents = JSON.parse(result.content[0].text);
   * documents.forEach(doc => {
   *   console.log(`${doc.name} (${doc.type}): ${doc.url}`);
   * });
   * ```
   */
  async listDocuments(path?: string): Promise<CallToolResult> {
    try {
      const baseUrl = this.jupyterAdapter.baseUrl;

      const documentPath = path || "";
      const url = `${baseUrl}/api/contents/${documentPath}`;

      const init: RequestInit = {
        method: "GET",
      };

      const response = await this.jupyterAdapter.makeJupyterRequest(url, init);

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
        }) => {
          // Construct the URL based on the item type
          let itemUrl: string;
          if (item.type === "notebook") {
            itemUrl = `${baseUrl}/notebooks/${item.path}`;
          } else if (item.type === "file") {
            itemUrl = `${baseUrl}/edit/${item.path}`;
          } else {
            // For directories
            itemUrl = `${baseUrl}/tree/${item.path}`;
          }

          return {
            name: item.name,
            path: item.path,
            type: item.type,
            created: item.created,
            last_modified: item.last_modified,
            size: item.size,
            writable: item.writable,
            url: itemUrl,
          };
        },
      );

      const message = `Found ${documents.length} documents in the specified path. Ready for document operations and RTC session management.`;

      const nextSteps = [
        "Select a document for reading or editing",
        "Use get_document_info for detailed information",
        "Create new documents if needed",
      ];

      return createSuccessResult(
        "list_documents",
        message,
        { documents },
        nextSteps,
      );
    } catch (error) {
      logger.error(`Failed to list documents from ${path || "root"}`, error);
      throw new Error(
        `Failed to list documents: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Create a new document in JupyterLab
   *
   * Creates a new document with the specified path, type, and optional initial content.
   * The method validates that .ipynb files are not created (use createNotebook instead)
   * and defaults to markdown type if not specified. Supports various document types
   * including text files, markdown, and reStructuredText.
   *
   * @param path Path for the new document
   * @param type Document type (markdown, txt, rst, etc.). Defaults to 'markdown' if not specified.
   * @param content Initial content for the document (optional)
   * @returns MCP response indicating success with confirmation message
   *
   * @example
   * ```typescript
   * const result = await documentTools.createDocument(
   *   'projects/README.md',
   *   'markdown',
   *   '# Project Documentation\n\nThis is a sample project.'
   * );
   * console.log(result.content[0].text);
   * ```
   *
   * @throws {Error} If path ends with .ipynb extension
   */
  async createDocument(
    path: string,
    type?: string,
    content?: string,
  ): Promise<CallToolResult> {
    try {
      const url = `${this.jupyterAdapter.baseUrl}/api/contents/${path}`;

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
      const token = this.jupyterAdapter.token;
      if (token) {
        init.headers = {
          ...init.headers,
          Authorization: `token ${token}`,
        };
      }

      const response = await this.jupyterAdapter.makeJupyterRequest(url, init);

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

      const message = `Successfully created document at '${path}'. Ready for content editing and RTC session creation.`;

      const nextSteps = [
        "Add content to the document",
        "Open the document in JupyterLab to start working",
        "Begin collaborative editing once RTC session is established",
      ];

      const result = {
        path: path,
        type: documentType,
        size: content ? content.length : 0,
        urls: {
          document: `${this.jupyterAdapter.baseUrl}/edit/${path}`,
        },
      };

      return createSuccessResult("create_document", message, result, nextSteps);
    } catch (error) {
      logger.error(
        `Failed to create document at ${path}. Document type: ${type || "markdown"}`,
        error,
      );
      throw new Error(
        `Failed to create document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get document information
   *
   * Retrieves comprehensive information about a document including metadata and optionally
   * its content. The method constructs appropriate URLs based on the document type and
   * supports content truncation for large files. When content is requested, it returns
   * both metadata and the actual content with truncation information.
   *
   * @param path Path to the document
   * @param includeContent Whether to include document content (default: false)
   * @param maxContent Maximum content length to return (default: 32768 characters)
   * @returns MCP response with document information including metadata and optionally content with truncation info
   *
   * @example
   * ```typescript
   * // Get document metadata only
   * const result = await documentTools.getDocumentInfo('projects/README.md');
   * const info = JSON.parse(result.content[0].text);
   * console.log(`Document size: ${info.size} bytes`);
   *
   * // Get document with content
   * const resultWithContent = await documentTools.getDocumentInfo(
   *   'projects/README.md', true, 1000
   * );
   * const contentInfo = JSON.parse(resultWithContent.content[0].text);
   * const content = resultWithContent.content[1].text;
   * console.log(`Content length: ${contentInfo.content_length}, truncated: ${contentInfo.truncated}`);
   * ```
   */
  async getDocumentInfo(
    path: string,
    includeContent: boolean = false,
    maxContent: number = 32768,
  ): Promise<CallToolResult> {
    try {
      const url = `${this.jupyterAdapter.baseUrl}/api/contents/${path}`;

      const init: RequestInit = {
        method: "GET",
      };

      const response = await this.jupyterAdapter.makeJupyterRequest(url, init);

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
      const baseUrl = this.jupyterAdapter.baseUrl;

      // Construct the URL based on the item type
      let itemUrl: string;
      if (data.type === "notebook") {
        itemUrl = `${baseUrl}/notebooks/${data.path}`;
      } else if (data.type === "file") {
        itemUrl = `${baseUrl}/edit/${data.path}`;
      } else {
        // For directories
        itemUrl = `${baseUrl}/tree/${data.path}`;
      }

      // Format the response to include only relevant information
      const documentInfo: DocumentInfo = {
        name: data.name,
        path: data.path,
        type: data.type,
        created: data.created,
        last_modified: data.last_modified,
        size: data.size,
        writable: data.writable,
        mimetype: data.mimetype,
        format: data.format,
        url: itemUrl,
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
      logger.error(
        `Failed to get document info for ${path}. Include content: ${includeContent}, Max content: ${maxContent}`,
        error,
      );
      throw new Error(
        `Failed to get document info: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete a document
   *
   * Permanently deletes a document from the JupyterLab server. This operation cannot
   * be undone. The method handles both files and directories. After successful deletion,
   * the document is no longer accessible through JupyterLab.
   *
   * @param path Path to the document to delete
   * @returns MCP response indicating success with confirmation message
   *
   * @example
   * ```typescript
   * const result = await documentTools.deleteDocument('projects/old_draft.md');
   * console.log(result.content[0].text); // "Successfully deleted document at projects/old_draft.md"
   * ```
   *
   * @warning This operation is permanent and cannot be undone
   */
  async deleteDocument(path: string): Promise<CallToolResult> {
    try {
      const url = `${this.jupyterAdapter.baseUrl}/api/contents/${path}`;

      const init: RequestInit = {
        method: "DELETE",
      };

      const response = await this.jupyterAdapter.makeJupyterRequest(url, init);

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

      const message = `Successfully deleted document at '${path}'. Document is permanently removed from the server.`;

      const nextSteps = [
        "Create a new document if needed to replace the deleted one",
        "Update any references to the deleted document",
        "Verify that dependent files are still functional",
      ];

      return createSuccessResult(
        "delete_document",
        message,
        { path },
        nextSteps,
      );
    } catch (error) {
      logger.error(`Failed to delete document at ${path}`, error);
      throw new Error(
        `Failed to delete document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Rename a document
   *
   * Renames a document by changing its path in the JupyterLab filesystem. This operation
   * effectively moves the document to a new location or changes its name. The method
   * preserves all document content and metadata during the rename operation.
   *
   * @param path Current path to the document
   * @param newPath New path for the document (can include directory changes)
   * @returns MCP response indicating success with confirmation message
   *
   * @example
   * ```typescript
   * const result = await documentTools.renameDocument(
   *   'projects/draft.md',
   *   'projects/final_version.md'
   * );
   * console.log(result.content[0].text);
   * ```
   */
  async renameDocument(path: string, newPath: string): Promise<CallToolResult> {
    try {
      const url = `${this.jupyterAdapter.baseUrl}/api/contents/${path}`;

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
      const token = this.jupyterAdapter.token;
      if (token) {
        init.headers = {
          ...init.headers,
          Authorization: `token ${token}`,
        };
      }

      const response = await this.jupyterAdapter.makeJupyterRequest(url, init);

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
      logger.error(
        `Failed to rename document from ${path} to ${newPath}`,
        error,
      );
      throw new Error(
        `Failed to rename document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Copy a document
   *
   * Creates a copy of a document at the specified path. The copy operation preserves
   * all content and metadata of the original document. The destination path can be
   * in the same directory or a different directory.
   *
   * @param path Path to the document to copy
   * @param copyPath Path for the copied document
   * @returns MCP response indicating success with confirmation message
   *
   * @example
   * ```typescript
   * const result = await documentTools.copyDocument(
   *   'projects/template.md',
   *   'projects/new_document.md'
   * );
   * console.log(result.content[0].text);
   * ```
   */
  async copyDocument(path: string, copyPath: string): Promise<CallToolResult> {
    try {
      const url = `${this.jupyterAdapter.baseUrl}/api/contents/${copyPath}`;

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

      const response = await this.jupyterAdapter.makeJupyterRequest(url, init);

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
      logger.error(
        `Failed to copy document from ${path} to ${copyPath}`,
        error,
      );
      throw new Error(
        `Failed to copy document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Overwrite the entire content of a document
   *
   * Completely replaces the content of a document with new content. The method
   * automatically detects the document type and handles content appropriately:
   * - For text files: content is treated as plain text
   * - For notebooks: content must be valid JSON and is parsed accordingly
   * The operation preserves all other document metadata.
   *
   * @param path Path to the document to overwrite
   * @param content New content for the document
   * @param type Document type (markdown, txt, rst, etc.)
   * @returns MCP response indicating success with confirmation message
   *
   * @example
   * ```typescript
   * // Overwrite a text file
   * await documentTools.overwriteDocument('projects/notes.txt', 'New content here');
   *
   * // Overwrite a notebook with JSON content
   * const notebookContent = JSON.stringify({
   *   cells: [{ cell_type: "code", source: "print('Hello')", execution_count: null }],
   *   metadata: {},
   *   nbformat: 4,
   *   nbformat_minor: 5
   * });
   * await documentTools.overwriteDocument('projects/analysis.ipynb', notebookContent);
   * ```
   *
   * @throws {Error} If content is invalid JSON for notebook files
   */
  async overwriteDocument(
    path: string,
    content: string,
    type: string,
  ): Promise<CallToolResult> {
    try {
      const url = `${this.jupyterAdapter.baseUrl}/api/contents/${path}`;

      // Prepare the request body with the new content
      const requestBody: {
        content: string | object;
        format: string;
        type: string;
      } = {
        content: content,
        format: "text",
        type: type,
      };

      const init: RequestInit = {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      };

      // Add authorization header if token is provided
      const token = this.jupyterAdapter.token;
      if (token) {
        init.headers = {
          ...init.headers,
          Authorization: `token ${token}`,
        };
      }

      const response = await this.jupyterAdapter.makeJupyterRequest(url, init);

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
      logger.error(
        `Failed to modify document at ${path}. Document type: ${type}`,
        error,
      );
      throw new Error(
        `Failed to modify document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Insert text into a document at a specific position using RTC
   *
   * Inserts text at the specified position in a document using Real-Time Collaboration (RTC)
   * infrastructure. The operation is immediately visible to all collaborators viewing the
   * document. This method only works with text files and will reject notebook files.
   *
   * @param path Path to the document
   * @param position Position to insert text at (0-based character index)
   * @param text Text to insert
   * @returns MCP response indicating success with confirmation message
   *
   * @example
   * ```typescript
   * const result = await documentTools.insertDocumentText(
   *   'projects/notes.md',
   *   10,
   *   'INSERTED TEXT'
   * );
   * console.log(result.content[0].text);
   * ```
   *
   * @throws {Error} If path ends with .ipynb extension
   */
  async insertDocumentText(
    path: string,
    position: number,
    text: string,
  ): Promise<CallToolResult> {
    try {
      // Check if this is a notebook file (.ipynb)
      if (path.toLowerCase().endsWith(".ipynb")) {
        throw new Error(
          "Cannot insert text into notebook files. Use notebook tools instead.",
        );
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
      logger.error(
        `Failed to insert document text at position ${position} in document ${path}`,
        error,
      );
      throw new Error(
        `Failed to insert document text: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete text from a document at a specific position using RTC
   *
   * Deletes a specified length of text from the given position in a document using
   * Real-Time Collaboration (RTC) infrastructure. The operation is immediately
   * visible to all collaborators viewing the document. This method only works with
   * text files and will reject notebook files.
   *
   * @param path Path to the document
   * @param position Position to delete text from (0-based character index)
   * @param length Length of text to delete (in characters)
   * @returns MCP response indicating success with confirmation message
   *
   * @example
   * ```typescript
   * const result = await documentTools.deleteDocumentText(
   *   'projects/notes.md',
   *   10,
   *   5
   * );
   * console.log(result.content[0].text); // "Successfully deleted 5 characters..."
   * ```
   *
   * @throws {Error} If path ends with .ipynb extension
   */
  async deleteDocumentText(
    path: string,
    position: number,
    length: number,
  ): Promise<CallToolResult> {
    try {
      // Check if this is a notebook file (.ipynb)
      if (path.toLowerCase().endsWith(".ipynb")) {
        throw new Error(
          "Cannot delete text from notebook files. Use notebook tools instead.",
        );
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
      logger.error(
        `Failed to delete ${length} characters from position ${position} in document ${path}`,
        error,
      );
      throw new Error(
        `Failed to delete document text: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Replace text in a document at a specific position using RTC
   *
   * Replaces a specified length of text at the given position with new text using
   * Real-Time Collaboration (RTC) infrastructure. The operation is immediately
   * visible to all collaborators viewing the document. This method only works with
   * text files and will reject notebook files.
   *
   * @param path Path to the document
   * @param position Position to replace text from (0-based character index)
   * @param length Length of text to replace (in characters)
   * @param text New text to replace with
   * @returns MCP response indicating success with confirmation message
   *
   * @example
   * ```typescript
   * const result = await documentTools.replaceDocumentText(
   *   'projects/notes.md',
   *   10,
   *   5,
   *   'REPLACEMENT TEXT'
   * );
   * console.log(result.content[0].text);
   * ```
   *
   * @throws {Error} If path ends with .ipynb extension
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
        throw new Error(
          "Cannot replace text in notebook files. Use notebook tools instead.",
        );
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
      logger.error(
        `Failed to replace ${length} characters at position ${position} in document ${path}`,
        error,
      );
      throw new Error(
        `Failed to replace document text: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get document content using RTC
   *
   * Retrieves the current content of a document using Real-Time Collaboration (RTC)
   * infrastructure, ensuring the most up-to-date content is returned. The method
   * supports content truncation for large files and provides information about
   * whether truncation occurred. This method only works with text files and will
   * reject notebook files.
   *
   * @param path Path to the document
   * @param maxContent Maximum content length to return (default: 32768 characters)
   * @returns MCP response with document content and truncation information
   *
   * @example
   * ```typescript
   * const result = await documentTools.getDocumentContent('projects/notes.md', 1000);
   * const contentInfo = JSON.parse(result.content[0].text);
   * const content = result.content[1].text;
   * console.log(`Content length: ${contentInfo.content_length}`);
   * console.log(`Truncated: ${contentInfo.truncated}`);
   * console.log('Content preview:', content.substring(0, 100));
   * ```
   *
   * @throws {Error} If path ends with .ipynb extension
   */
  async getDocumentContent(
    path: string,
    maxContent: number = 32768,
  ): Promise<CallToolResult> {
    try {
      // Check if this is a notebook file (.ipynb)
      if (path.toLowerCase().endsWith(".ipynb")) {
        throw new Error(
          "Cannot get content from notebook files using this method. Use notebook tools instead.",
        );
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
      logger.error(
        `Failed to get document content for ${path}. Max content: ${maxContent}`,
        error,
      );
      throw new Error(
        `Failed to get document content: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * End an RTC session for a document
   *
   * Terminates an active Real-Time Collaboration (RTC) session for a document.
   * This releases resources and stops real-time synchronization for the document.
   * The session can be re-established later when needed.
   *
   * @param path Path to the document
   * @returns MCP response indicating success with session termination details
   *
   * @example
   * ```typescript
   * const result = await documentTools.endDocumentSession('projects/notes.md');
   * console.log(result.content[0].text);
   * ```
   */
  async endDocumentSession(path: string): Promise<CallToolResult> {
    try {
      return await this.jupyterAdapter.endDocumentSession({ path });
    } catch (error) {
      logger.error(`Failed to end document session for ${path}`, error);
      throw new Error(
        `Failed to end document session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Query the status of an RTC session for a document
   *
   * Retrieves the current status of a Real-Time Collaboration (RTC) session for a document.
   * The response includes information about session connectivity, synchronization status,
   * and any active collaborators. This is useful for monitoring the state of real-time
   * collaboration features.
   *
   * @param path Path to the document
   * @returns MCP response with session status including connectivity, sync status, and collaborator info
   *
   * @example
   * ```typescript
   * const result = await documentTools.queryDocumentSession('projects/notes.md');
   * const sessionInfo = JSON.parse(result.content[0].text);
   * console.log(`Connected: ${sessionInfo.connected}`);
   * console.log(`Synced: ${sessionInfo.synced}`);
   * if (sessionInfo.collaborators) {
   *   console.log(`Active collaborators: ${sessionInfo.collaborators.length}`);
   * }
   * ```
   */
  async queryDocumentSession(path: string): Promise<CallToolResult> {
    try {
      const sessions = this.jupyterAdapter.listCurrTextDocSessions(path);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(sessions, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error(`Failed to query document session for ${path}`, error);
      throw new Error(
        `Failed to query document session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
