import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "../../utils/logger.js";

/**
 * Stdio transport handler for JupyterLab RTC MCP Server
 * 
 * This class wraps the MCP SDK's StdioServerTransport and provides
 * additional functionality specific to JupyterLab integration.
 */
export class JupyterLabStdioTransport extends StdioServerTransport {
  /**
   * Create a new stdio transport
   */
  constructor() {
    super();
  }

  /**
   * Start the transport
   */
  override async start(): Promise<void> {
    // The parent class handles the actual transport setup
    // This method is for any additional setup specific to JupyterLab
    logger.info("Starting JupyterLab RTC MCP Server with stdio transport...");
  }

  /**
   * Stop the transport
   */
  async stop(): Promise<void> {
    // The parent class handles the actual transport cleanup
    // This method is for any additional cleanup specific to JupyterLab
    logger.info("Stopping JupyterLab RTC MCP Server...");
  }
}