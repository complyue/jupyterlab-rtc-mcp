#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { JupyterLabMCPServer } from "./server/mcp-server.js";
import { JupyterLabHTTPTransport } from "./server/transport/http-transport.js";
import { logger } from "./utils/logger.js";

/**
 * Main entry point for the JupyterLab RTC MCP Server
 *
 * This server enables AI agents to interact with Jupyter notebooks
 * through the Model Context Protocol while leveraging JupyterLab's
 * real-time collaboration infrastructure.
 */

interface ServerConfig {
  transport: 'stdio' | 'http';
  httpPort?: number;
}

function parseCommandLineArgs(): ServerConfig {
  const args = process.argv.slice(2);
  const config: ServerConfig = {
    transport: 'stdio' // Default to stdio transport
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-t' || arg === '--transport') {
      const transport = args[i + 1];
      if (transport === 'stdio' || transport === 'http') {
        config.transport = transport;
      } else {
        logger.error(`Invalid transport: ${transport}. Must be 'stdio' or 'http'`);
        process.exit(1);
      }
      i++; // Skip next argument
    } else if (arg === '-p' || arg === '--port') {
      config.httpPort = parseInt(args[i + 1], 10);
      if (isNaN(config.httpPort) || config.httpPort < 1 || config.httpPort > 65535) {
        logger.error(`Invalid port: ${args[i + 1]}. Must be a number between 1 and 65535`);
        process.exit(1);
      }
      i++; // Skip next argument
    }
  }

  return config;
}

async function main() {
  // Parse command line arguments
  const config = parseCommandLineArgs();

  // Create MCP server
  const server = new JupyterLabMCPServer();

  // Start server with appropriate transport
  try {
    if (config.transport === 'stdio') {
      // Use stdio transport (production)
      const transport = new StdioServerTransport();
      await server.connect(transport);
      logger.info(`JupyterLab RTC MCP Server started successfully with stdio transport`);
    } else if (config.transport === 'http') {
      // Use HTTP transport (debugging)
      const httpTransport = new JupyterLabHTTPTransport(config.httpPort || 3000);
      httpTransport.setMCPServer(server);
      await httpTransport.start();
      logger.info(`JupyterLab RTC MCP Server started successfully with HTTP transport on port ${httpTransport.getPort()}`);

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('Shutting down HTTP server...');
        await httpTransport.stop();
        process.exit(0);
      });
    }
  } catch (error) {
    logger.error(`Failed to start ${config.transport} transport server`, error);
    process.exit(1);
  }
}
// Start the server
main().catch((error) => {
  logger.error("Failed to start JupyterLab RTC MCP Server", error);
  process.exit(1);
});
