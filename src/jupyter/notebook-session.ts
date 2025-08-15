import * as Y from "yjs";
import { YCodeCell, YNotebook } from "@jupyter/ydoc";
import { IOutput } from "@jupyterlab/nbformat";
import { cookieManager } from "./cookie-manager.js";
import { logger } from "../utils/logger.js";
import { DocumentSession, ISessionModel } from "./document-session.js";

export interface IKernelSessionModel {
  id: string;
  name: string;
}

/**
 * NotebookSession represents a session with a JupyterLab notebook
 *
 * This class handles notebook-specific operations while extending DocumentSession
 * for common WebSocket connection and synchronization functionality.
 */
export class NotebookSession extends DocumentSession {
  private yNotebook: YNotebook;
  private kernelSession: IKernelSessionModel | null;

  constructor(session: ISessionModel, baseUrl: string, token?: string) {
    // Create YNotebook which already has an embedded Y.Doc
    const yNotebook = new YNotebook();
    super(session, baseUrl, token, yNotebook.ydoc);
    this.yNotebook = yNotebook;
    this.kernelSession = null;
  }

  /**
   * Disconnect from the JupyterLab WebSocket server
   */
  override async disconnect(): Promise<void> {
    this.kernelSession = null;
    await super.disconnect();
  }

  /**
   * Reconnect to the JupyterLab WebSocket server
   */
  override async reconnect(): Promise<void> {
    this.kernelSession = null;
    await super.reconnect();
  }

  /**
   * Get the Yjs document (embedded in YNotebook)
   */
  override getDocument(): Y.Doc {
    return this.yNotebook.ydoc;
  }

  /**
   * Get the YNotebook
   */
  getYNotebook(): YNotebook {
    return this.yNotebook;
  }

  /**
   * Ensure the document is synchronized before proceeding
   * @returns Promise that resolves when the document is synchronized
   */
  override async ensureSynchronized(): Promise<void> {
    logger.debug(`Waiting for notebook synchronization...`);
    return super.ensureSynchronized();
  }

  /**
   * Request kernel session information from JupyterLab server
   */
  private async _requestKernelSession(
    kernelName?: string,
  ): Promise<IKernelSessionModel | null> {
    try {
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings({ baseUrl: this.baseUrl });

      // First, try to get the existing session to see if it already exists
      const getSessionUrl = URLExt.join(
        settings.baseUrl,
        "api/sessions",
        this._session.sessionId,
      );

      const getInit: RequestInit = {
        method: "GET",
      };

      // Add authorization header if token is provided
      if (this.token) {
        getInit.headers = {
          ...getInit.headers,
          Authorization: `token ${this.token}`,
        };
      }

      // Add cookies if available
      if (cookieManager.hasCookies()) {
        getInit.headers = {
          ...getInit.headers,
          Cookie: cookieManager.getCookieHeader(),
        };
      }

      let sessionExists = false;
      try {
        const getResponse = await ServerConnection.makeRequest(
          getSessionUrl,
          getInit,
          settings,
        );
        sessionExists = getResponse.ok;
        // Store cookies from response
        cookieManager.parseResponseHeaders(getResponse.headers);
      } catch (error) {
        // Session doesn't exist or other error
        logger.debug(
          `Session check failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const kernelSpec = kernelName ? { name: kernelName } : {};
      const url = sessionExists
        ? getSessionUrl
        : URLExt.join(settings.baseUrl, "api/sessions");

      const init: RequestInit = {
        method: sessionExists ? "PATCH" : "POST",
        body: JSON.stringify({
          kernel: kernelSpec,
          // For new sessions, we need to include the path and other required fields
          ...(sessionExists
            ? {}
            : {
                path: `/notebooks/${this._session.fileId}`,
                name: `Notebook ${this._session.fileId}`,
                type: "notebook",
              }),
        }),
      };

      // Add authorization header if token is provided
      if (this.token) {
        init.headers = {
          ...init.headers,
          Authorization: `token ${this.token}`,
        };
      }

      // Add cookies if available
      if (cookieManager.hasCookies()) {
        init.headers = {
          ...init.headers,
          Cookie: cookieManager.getCookieHeader(),
        };
      }

      let response: Response;
      response = await ServerConnection.makeRequest(url, init, settings);

      // Store cookies from response
      cookieManager.parseResponseHeaders(response.headers);

      let dataText: string = await response.text();
      let data: unknown = null;

      if (dataText.length > 0) {
        try {
          data = JSON.parse(dataText);
        } catch (error) {
          logger.error("Not a JSON response body.", error);
          return null;
        }
      }

      if (!response.ok) {
        logger.error(
          `Server returned ${response.status}: ${data && typeof data === "object" && "message" in data ? (data as { message: string }).message : dataText}`,
        );
        return null;
      }

      // Extract kernel information from the session response
      if (data && typeof data === "object" && "kernel" in data && data.kernel) {
        const kernel = data.kernel as { id: string; name: string };
        return {
          id: kernel.id,
          name: kernel.name,
        };
      }

      // If this is a new session creation, the response might have a different structure
      if (
        data &&
        typeof data === "object" &&
        "id" in data &&
        "kernel" in data &&
        data.kernel
      ) {
        const kernel = data.kernel as { id: string; name: string };
        return {
          id: kernel.id,
          name: kernel.name,
        };
      }

      return null;
    } catch (error) {
      logger.error(`Error requesting kernel session:`, error);
      return null;
    }
  }

  async ensureKernelSession(kernelName?: string): Promise<IKernelSessionModel> {
    const ks = await this.getKernelSession(kernelName);
    if (!ks) {
      throw new Error(
        `No kernel session with <${kernelName || "default"}> kernel established for notebook ${this._session.fileId}, try restart the kernel with a proper kernel and retry!`,
      );
    }
    return ks;
  }

  /**
   * Get the kernel session information
   * @returns Kernel session model or null if no kernel session exists
   */
  async getKernelSession(
    kernelName?: string,
  ): Promise<IKernelSessionModel | null> {
    // If kernel session is not available, try to request it
    if (
      !this.kernelSession ||
      (kernelName && kernelName !== this.kernelSession.name)
    ) {
      this.kernelSession = await this._requestKernelSession(kernelName);
    }
    return this.kernelSession;
  }

  async restartKernel(
    kernelName?: string,
    clear_outputs: boolean = false,
    exec: boolean = false,
  ): Promise<void> {
    const { ServerConnection } = await import("@jupyterlab/services");
    const { URLExt } = await import("@jupyterlab/coreutils");

    const settings = ServerConnection.makeSettings({
      baseUrl: this.baseUrl,
    });

    if (this.kernelSession) {
      // Restart the existing kernel
      const url = URLExt.join(
        settings.baseUrl,
        "api/kernels",
        this.kernelSession.id,
        "restart",
      );

      const init: RequestInit = {
        method: "POST",
      };

      // Add authorization header if token is provided
      if (this.token) {
        init.headers = {
          ...init.headers,
          Authorization: `token ${this.token}`,
        };
      }

      // Add cookies if available
      if (cookieManager.hasCookies()) {
        init.headers = {
          ...init.headers,
          Cookie: cookieManager.getCookieHeader(),
        };
      }

      let response: Response;
      response = await ServerConnection.makeRequest(url, init, settings);

      if (!response.ok) {
        const data = await response.text();
        throw new Error(`Kernel restart failed: ${data}`);
      }
    }

    this.kernelSession = await this._requestKernelSession(kernelName);
    const kernelSessionId = this.kernelSession!.id;

    // Clear outputs if requested
    if (clear_outputs) {
      await this.ensureSynchronized();
      for (const cell of this.yNotebook.cells) {
        if (cell.cell_type === "code") {
          (cell as YCodeCell).setOutputs([]);
        }
      }
    }

    // Execute cells if requested
    if (exec !== false) {
      for (const cell of this.getYNotebook().cells) {
        if (cell.cell_type === "code") {
          const codeCell = cell as YCodeCell;
          await this.executeCell(codeCell, kernelSessionId);
        }
      }
    }
  }

  /**
   * Execute code in the kernel session
   * @param code Code to execute
   * @returns Promise that resolves with execution result
   */
  async executeCell(cell: YCodeCell, kernelSessionId: string): Promise<void> {
    const { ServerConnection } = await import("@jupyterlab/services");
    const { URLExt } = await import("@jupyterlab/coreutils");

    const settings = ServerConnection.makeSettings({ baseUrl: this.baseUrl });
    const url = URLExt.join(
      settings.baseUrl,
      "api/kernels",
      kernelSessionId,
      "execute",
    );

    const init: RequestInit = {
      method: "POST",
      body: JSON.stringify({
        code: cell.source,
        silent: false,
      }),
    };

    // Add authorization header if token is provided
    if (this.token) {
      init.headers = {
        ...init.headers,
        Authorization: `token ${this.token}`,
      };
    }

    // Add cookies if available
    if (cookieManager.hasCookies()) {
      init.headers = {
        ...init.headers,
        Cookie: cookieManager.getCookieHeader(),
      };
    }

    let response: Response;
    response = await ServerConnection.makeRequest(url, init, settings);

    // Store cookies from response
    cookieManager.parseResponseHeaders(response.headers);

    let dataText: string = await response.text();
    let data: unknown = null;
    if (dataText.length > 0) {
      try {
        data = JSON.parse(dataText);
      } catch {
        logger.error("Not a JSON response body.", response);
        throw new Error("Invalid response from kernel execution");
      }
    }

    if (!response.ok) {
      throw new Error(
        `Kernel execution failed: ${data && typeof data === "object" && "message" in data ? (data as { message: string }).message : dataText}`,
      );
    }

    // TODO: this is incorrect yet, convert the result into eligible outputs
    const outputs: IOutput[] = [];
    cell.setOutputs(outputs);
  }
}
