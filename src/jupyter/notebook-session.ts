import { YCodeCell, YNotebook } from "@jupyter/ydoc";
import { KernelManager } from "@jupyterlab/services";
import { IKernelConnection } from "@jupyterlab/services/lib/kernel/kernel.js";
import * as Y from "yjs";

import { logger } from "../utils/logger.js";
import { executeJupyterCell, JupyterLabAdapter } from "./adapter.js";
import { DocumentSession, ISessionModel } from "./document-session.js";

/**
 * NotebookSession represents a session with a JupyterLab notebook
 *
 * This class handles notebook-specific operations while extending DocumentSession
 * for common WebSocket connection and synchronization functionality.
 */
export class NotebookSession extends DocumentSession {
  private yNotebook: YNotebook;
  private kernelManager: KernelManager;
  private kernelConn: IKernelConnection | null;

  constructor(
    session: ISessionModel,
    kernelManager: KernelManager,
    jupyterAdapter: JupyterLabAdapter,
  ) {
    // Create YNotebook which already has an embedded Y.Doc
    const yNotebook = new YNotebook();
    super(session, jupyterAdapter, yNotebook.ydoc);
    this.yNotebook = yNotebook;
    this.kernelManager = kernelManager;
    this.kernelConn = null;
  }

  /**
   * Disconnect from the JupyterLab WebSocket server
   */
  override async disconnect(): Promise<void> {
    const kernelConn = this.kernelConn;
    if (kernelConn) {
      kernelConn.dispose();
      this.kernelConn = null;
    }
    await super.disconnect();
  }

  /**
   * Reconnect to the JupyterLab WebSocket server
   */
  override async reconnect(): Promise<void> {
    const kernelConn = this.kernelConn;
    if (kernelConn) {
      kernelConn.dispose();
      this.kernelConn = null;
    }
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

  async ensureKernelConnection(
    kernelName?: string,
  ): Promise<IKernelConnection> {
    const kernelConn = await this.getKernelConnection(kernelName);
    if (!kernelConn) {
      throw new Error(
        `No connection with <${kernelName || "default"}> kernel established for notebook ${this._session.fileId}, try assign/restart with some proper kernel and retry!`,
      );
    }
    return kernelConn;
  }

  /**
   * Get a kernel connection for the given kernel session
   */
  async getKernelConnection(
    kernelName?: string,
  ): Promise<IKernelConnection | null> {
    const kernelConn = this.kernelConn;
    if (
      kernelConn &&
      !kernelConn.isDisposed &&
      (!kernelName || kernelConn.name === kernelName)
    ) {
      return kernelConn;
    }
    if (kernelConn) {
      kernelConn.dispose();
      this.kernelConn = null;
    }
    this.kernelConn = await this._connectKernel(kernelName);
    return this.kernelConn;
  }

  /**
   * Establish a new kernel connection to the JupyterLab server
   */
  private async _connectKernel(
    kernelName?: string,
  ): Promise<IKernelConnection | null> {
    try {
      const { ServerConnection } = await import("@jupyterlab/services");
      const { URLExt } = await import("@jupyterlab/coreutils");

      const settings = ServerConnection.makeSettings({
        baseUrl: this.jupyterAdapter.baseUrl,
      });

      // First, try to get the existing session to see if it already exists
      const getSessionUrl = URLExt.join(
        settings.baseUrl,
        "api/sessions",
        this._session.sessionId,
      );

      const getInit: RequestInit = {
        method: "GET",
      };

      let sessionExists = false;
      try {
        const getResponse = await this.jupyterAdapter.makeJupyterRequest(
          getSessionUrl,
          getInit,
        );
        sessionExists = getResponse.ok;
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

      let response: Response;
      try {
        response = await this.jupyterAdapter.makeJupyterRequest(url, init);

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
        if (
          data &&
          typeof data === "object" &&
          "kernel" in data &&
          data.kernel
        ) {
          const kernel = data.kernel as { id: string; name: string };
          const kernelConn = this.kernelManager.connectTo({ model: kernel });
          return kernelConn;
        }

        return null;
      } catch (error) {
        logger.error(`Error requesting kernel session:`, error);
        return null;
      }
    } catch (error) {
      logger.error(`Error in _connectKernel:`, error);
      return null;
    }
  }

  async restartKernel(
    kernelName?: string,
    clear_outputs: boolean = false,
    exec: boolean = false,
  ): Promise<void> {
    const kernelConn = this.kernelConn;
    if (kernelConn) {
      if (!kernelName) {
        // inherit old kernel name if not specified
        kernelName = kernelConn.name;
      }

      // Use the kernel connection's restart method
      try {
        await kernelConn.restart();
        logger.debug(
          `Kernel <${kernelConn.name}> (${kernelConn.id}) restarted successfully`,
        );
      } catch (error) {
        logger.error(
          `Failed to restart kernel <${kernelConn.name}> (${kernelConn.id}):`,
          error,
        );
        // If restart fails, dispose the connection and create a new one
        kernelConn.dispose();
        this.kernelConn = null;
      }
    }

    // Clear outputs if requested
    if (clear_outputs) {
      await this.ensureSynchronized();
      for (const cell of this.yNotebook.cells) {
        if (cell.cell_type === "code") {
          const codeCell = cell as YCodeCell;
          codeCell.clearOutputs();
          codeCell.execution_count = null;
        }
      }
    }

    // Get a new kernel connection (either the restarted one or a new one)
    const newKernelConn = await this.getKernelConnection(kernelName);

    // Execute cells if requested
    if (exec !== false && newKernelConn) {
      for (const cell of this.getYNotebook().cells) {
        if (cell.cell_type === "code") {
          const codeCell = cell as YCodeCell;
          if (!codeCell.getSource().trim()) {
            continue; // skip empty cell
          }
          await executeJupyterCell(codeCell, newKernelConn);
        }
      }
    }
  }
}
