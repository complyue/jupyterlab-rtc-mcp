#!/usr/bin/env node

import { JupyterLabMCPServer } from "./server/mcp-server.js";
import { JupyterLabHTTPTransport } from "./server/transport/http-transport.js";
import { logger } from "./utils/logger.js";

/**
 * HTTP server entry point for the JupyterLab RTC MCP Server
 *
 * This server enables AI agents to interact with Jupyter notebooks
 * through the Model Context Protocol using HTTP transport for debugging
 * and development purposes.
 */

interface HTTPServerConfig {
  port?: number;
  host?: string;
  sessionTimeout?: number;
}
function parseCommandLineArgs(): HTTPServerConfig {
  const args = process.argv.slice(2);
  const config: HTTPServerConfig = {
    port: 3000, // Default to port 3000
    host: '127.0.0.1', // Default to localhost
    sessionTimeout: 5 * 60 * 1000 // Default to 5 minutes in milliseconds
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-p' || arg === '--port') {
      config.port = parseInt(args[i + 1], 10);
      if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
        logger.error(`Invalid port: ${args[i + 1]}. Must be a number between 1 and 65535`);
        process.exit(1);
      }
      i++; // Skip next argument
    } else if (arg === '--ip') {
      config.host = args[i + 1];
      if (!config.host || config.host.trim() === '') {
        logger.error(`Invalid IP address: ${args[i + 1]}. Must be a valid IP address or hostname`);
        process.exit(1);
      }
      i++; // Skip next argument
    } else if (arg === '--session-timeout') {
      const timeoutMinutes = parseInt(args[i + 1], 10);
      if (isNaN(timeoutMinutes) || timeoutMinutes < 1) {
        logger.error(`Invalid session timeout: ${args[i + 1]}. Must be a positive number of minutes`);
        process.exit(1);
      }
      config.sessionTimeout = timeoutMinutes * 60 * 1000; // Convert minutes to milliseconds
      i++; // Skip next argument
    }
  }

  return config;
}

async function main() {
  // Parse command line arguments
  const config = parseCommandLineArgs();

  // Create MCP server
  const server = new JupyterLabMCPServer(config.sessionTimeout);

  // Start HTTP server
  try {
    const httpTransport = new JupyterLabHTTPTransport(config.port, config.host);
    httpTransport.setMCPServer(server);
    await httpTransport.start();
    logger.info(`JupyterLab RTC MCP HTTP Server started successfully on ${httpTransport.getHost()}:${httpTransport.getPort()}`);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down HTTP server...');
      await httpTransport.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start HTTP transport server', error);
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  logger.error("Failed to start JupyterLab RTC MCP HTTP Server", error);
  process.exit(1);
});