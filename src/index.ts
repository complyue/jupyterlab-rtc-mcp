#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { JupyterLabMCPServer } from "./server/mcp-server.js";
import { logger } from "./utils/logger.js";

/**
 * Main entry point for the JupyterLab RTC MCP Server (stdio mode)
 *
 * This server enables AI agents to interact with Jupyter notebooks
 * through the Model Context Protocol while leveraging JupyterLab's
 * real-time collaboration infrastructure using stdio transport for production.
 */

interface ServerConfig {
  sessionTimeout?: number;
  maxWsPayload?: number;
}
function parseCommandLineArgs(): ServerConfig {
  const args = process.argv.slice(2);
  const config: ServerConfig = {
    sessionTimeout: 5 * 60 * 1000, // Default to 5 minutes in milliseconds
    maxWsPayload: 100 * 1024 * 1024 // Default to 100 MB in bytes
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--session-timeout') {
      const timeoutMinutes = parseInt(args[i + 1], 10);
      if (isNaN(timeoutMinutes) || timeoutMinutes < 1) {
        logger.error(`Invalid session timeout: ${args[i + 1]}. Must be a positive number of minutes`);
        process.exit(1);
      }
      config.sessionTimeout = timeoutMinutes * 60 * 1000; // Convert minutes to milliseconds
      i++; // Skip next argument
    } else if (arg === '--max-ws-payload') {
      const payloadMB = parseInt(args[i + 1], 10);
      if (isNaN(payloadMB) || payloadMB < 1) {
        logger.error(`Invalid max payload: ${args[i + 1]}. Must be a positive number of MB`);
        process.exit(1);
      }
      config.maxWsPayload = payloadMB * 1024 * 1024; // Convert MB to bytes
      i++; // Skip next argument
    }
  }

  return config;
}

async function main() {
  // Parse command line arguments
  const config = parseCommandLineArgs();

  // Create MCP server
  const server = new JupyterLabMCPServer(config.sessionTimeout, config.maxWsPayload);

  // Start server with stdio transport
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info(`JupyterLab RTC MCP Server started successfully with stdio transport`);
  } catch (error) {
    logger.error('Failed to start stdio transport server', error);
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  logger.error("Failed to start JupyterLab RTC MCP Server", error);
  process.exit(1);
});
