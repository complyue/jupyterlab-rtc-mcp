import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { JupyterLabAdapter } from "../jupyter/adapter.js";
import { createSuccessResult } from "../utils/response-utils.js";

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
      const baseUrl = this.jupyterAdapter.baseUrl;

      const result = createSuccessResult(
        "get_base_url",
        `🌐 Successfully retrieved JupyterLab base URL. Server ready for notebook operations.`,
        { base_url: baseUrl },
        [
          "Use nb_path_from_url to extract notebook paths from full URLs",
          "Use this base URL to construct full notebook URLs for sharing",
        ],
        undefined, // sessionId
        [], // warnings
      );

      return result;
    } catch (error) {
      logger.error("Failed to get base URL:", error);
      throw new Error(
        `Failed to get base URL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Extract the notebook path from a full JupyterLab URL
   * @param url Full JupyterLab URL to a notebook, which may include query parameters and fragments
   * @returns MCP response with the extracted notebook path and information about any query parameters or fragments
   */
  async nbPathFromUrl(url: string): Promise<CallToolResult> {
    try {
      if (!url) {
        throw new Error("URL is required");
      }

      // Get the base URL for comparison
      const baseUrl = this.jupyterAdapter.baseUrl;

      // Parse the URL to handle query parameters and fragments
      let urlObj: URL;
      try {
        urlObj = new URL(url);
      } catch {
        throw new Error(`Invalid URL provided: ${url}`);
      }

      // Extract just the path portion without query parameters and fragments
      const urlPath = urlObj.pathname;

      // Parse the base URL to get its pathname component
      let baseUrlObj: URL;
      try {
        baseUrlObj = new URL(baseUrl);
      } catch {
        throw new Error(`Invalid base URL: ${baseUrl}`);
      }

      // Get the pathname component of the base URL
      const baseUrlPath = baseUrlObj.pathname;

      // Validate that the schema (protocol) and host match the base URL
      if (urlObj.protocol !== baseUrlObj.protocol) {
        throw new Error(
          `URL protocol does not match the JupyterLab base URL protocol: ${baseUrlObj.protocol}`,
        );
      }
      if (urlObj.host !== baseUrlObj.host) {
        throw new Error(
          `URL host does not match the JupyterLab base URL host: ${baseUrlObj.host}`,
        );
      }

      // Normalize URLs by removing trailing slashes
      const normalizedBaseUrlPath = baseUrlPath.replace(/\/$/, "");
      const normalizedUrlPath = urlPath.replace(/\/$/, "");

      // Check if the URL path starts with the base URL path
      if (!normalizedUrlPath.startsWith(normalizedBaseUrlPath)) {
        throw new Error(
          `URL path does not match the JupyterLab base URL path: ${baseUrlPath}`,
        );
      }

      // Extract the path part after the base URL
      let pathPart = normalizedUrlPath.substring(normalizedBaseUrlPath.length);

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
        "nbclassic/notebooks/",
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

      // Check if the notebook exists and get RTC session status
      let notebookExists = false;
      let rtcSession = "absent";
      let directory = "";
      let filename = "";
      let notebookUrl = "";

      try {
        const { ServerConnection } = await import("@jupyterlab/services");
        const { URLExt } = await import("@jupyterlab/coreutils");

        const settings = ServerConnection.makeSettings({
          baseUrl: this.jupyterAdapter.baseUrl,
        });

        const contentsUrl = URLExt.join(
          settings.baseUrl,
          "/api/contents",
          URLExt.encodeParts(decodedPath),
        );

        const response = await this.jupyterAdapter.makeJupyterRequest(
          contentsUrl,
          {
            method: "GET",
          },
        );

        if (response.ok) {
          const data = await response.json();
          if (data.type === "notebook") {
            notebookExists = true;
            // Check for active RTC session
            const session = this.jupyterAdapter.getNotebookSession(data.path);
            if (session && session.isConnected()) {
              rtcSession = "present";
            }
            // Extract directory and filename
            const pathParts = decodedPath.split("/");
            filename = pathParts.pop() || "";
            directory = pathParts.join("/");
            notebookUrl = `${baseUrl}/notebooks/${decodedPath}`;
          }
        }
      } catch (error) {
        logger.warn(
          `Failed to check notebook existence for ${decodedPath}:`,
          error,
        );
        // Continue with the operation even if we can't check existence
      }

      const message = notebookExists
        ? `🔗 Successfully extracted notebook path '${decodedPath}' from the provided JupyterLab URL. RTC session is ${rtcSession} for real-time collaboration.`
        : `🔗 Successfully extracted notebook path '${decodedPath}' from the provided JupyterLab URL. Notebook may not exist or is inaccessible.`;

      const nextSteps = notebookExists
        ? rtcSession === "present"
          ? [
              "Use read_nb_cells to examine the notebook content",
              "Use get_nb_stat to check kernel and cell information",
              "Modify cells with immediate collaboration visibility",
            ]
          : [
              "Use read_nb_cells to examine the notebook content",
              "Use get_nb_stat to check kernel and cell information",
              "Assign a kernel to start an RTC session for collaboration",
            ]
        : [
            "Verify the notebook path exists",
            "Use list_nbs to find available notebooks",
            "Create the notebook if it doesn't exist",
          ];

      const result = createSuccessResult(
        "nb_path_from_url",
        message,
        {
          original_url: url,
          base_url: baseUrl,
          notebook_path: decodedPath,
          directory,
          filename,
          notebook_exists: notebookExists,
          rtc_session: rtcSession,
          url: notebookUrl,
        },
        nextSteps,
        undefined, // sessionId
        [], // warnings
      );

      return result;
    } catch (error) {
      logger.error("Failed to extract notebook path from URL:", error);
      throw new Error(
        `Failed to extract notebook path from URL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
