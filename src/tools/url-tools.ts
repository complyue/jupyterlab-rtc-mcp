import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { JupyterLabAdapter } from "../jupyter/adapter.js";
import { logger } from "../utils/logger.js";

/**
 * URLTools provides operations for handling JupyterLab URLs
 *
 * This class implements the MCP tools for extracting base URLs and notebook paths
 * from JupyterLab URLs, enabling AI agents to work with full notebook URLs
 * provided by human users.
 */
export class URLTools {
  private jupyterAdapter: JupyterLabAdapter;

  constructor(jupyterAdapter: JupyterLabAdapter) {
    this.jupyterAdapter = jupyterAdapter;
  }

  /**
   * Get the base URL of the JupyterLab server
   * @returns MCP response with the base URL
   */
  async getBaseUrl(): Promise<CallToolResult> {
    try {
      // Access the private baseUrl property from the adapter
      const baseUrl = (this.jupyterAdapter as unknown as { baseUrl: string })
        .baseUrl;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                base_url: baseUrl,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to get base URL:", error);
      throw new Error(
        `Failed to get base URL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Extract the notebook path from a full JupyterLab URL
   * @param url Full JupyterLab URL to a notebook
   * @returns MCP response with the extracted notebook path
   */
  async nbPathFromUrl(url: string): Promise<CallToolResult> {
    try {
      if (!url) {
        throw new Error("URL is required");
      }

      // Get the base URL for comparison
      const baseUrl = (this.jupyterAdapter as unknown as { baseUrl: string })
        .baseUrl;

      // Normalize URLs by removing trailing slashes
      const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
      const normalizedUrl = url.replace(/\/$/, "");

      // Check if the URL starts with the base URL
      if (!normalizedUrl.startsWith(normalizedBaseUrl)) {
        throw new Error(
          `URL does not match the JupyterLab base URL: ${baseUrl}`,
        );
      }

      // Extract the path part after the base URL
      let pathPart = normalizedUrl.substring(normalizedBaseUrl.length);

      // Remove leading slash if present
      if (pathPart.startsWith("/")) {
        pathPart = pathPart.substring(1);
      }

      // Handle common JupyterLab URL patterns:
      // 1. /tree/path/to/notebook.ipynb
      // 2. /notebooks/path/to/notebook.ipynb
      // 3. /edit/path/to/notebook.ipynb
      // 4. /view/path/to/notebook.ipynb
      // 5. /lab/tree/path/to/notebook.ipynb

      // Remove the prefix if it matches one of the known patterns
      const knownPrefixes = [
        "tree/",
        "notebooks/",
        "edit/",
        "view/",
        "lab/tree/",
      ];
      for (const prefix of knownPrefixes) {
        if (pathPart.startsWith(prefix)) {
          pathPart = pathPart.substring(prefix.length);
          break;
        }
      }

      // URL decode the path to handle encoded characters
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(pathPart);
      } catch {
        throw new Error(`Failed to decode URL path: ${pathPart}`);
      }

      // Validate that the path ends with .ipynb
      if (!decodedPath.endsWith(".ipynb")) {
        throw new Error(
          "Extracted path does not appear to be a notebook file (.ipynb)",
        );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                original_url: url,
                base_url: baseUrl,
                notebook_path: decodedPath,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to extract notebook path from URL:", error);
      throw new Error(
        `Failed to extract notebook path from URL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
