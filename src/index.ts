#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { JupyterLabMCPServer } from "./server/mcp-server.js";
import { JupyterLabHTTPTransport } from "./server/transport/http-transport.js";

/**
 * Main entry point for the JupyterLab RTC MCP Server
 *
 * This server enables AI agents to interact with Jupyter notebooks
 * through the Model Context Protocol while leveraging JupyterLab's
 * real-time collaboration infrastructure.
 */

interface ServerConfig {
  logLevel: string;
  transport: 'stdio' | 'http';
  httpPort?: number;
}

function parseCommandLineArgs(): ServerConfig {
  const args = process.argv.slice(2);
  const config: ServerConfig = {
    logLevel: process.env.LOG_LEVEL || 'info',
    transport: 'stdio' // Default to stdio transport
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-log' || arg === '--log-level') {
      config.logLevel = args[i + 1];
      i++; // Skip next argument
    } else if (arg === '-t' || arg === '--transport') {
      const transport = args[i + 1];
      if (transport === 'stdio' || transport === 'http') {
        config.transport = transport;
      } else {
        console.error(`[ERROR] Invalid transport: ${transport}. Must be 'stdio' or 'http'`);
        process.exit(1);
      }
      i++; // Skip next argument
    } else if (arg === '-p' || arg === '--port') {
      config.httpPort = parseInt(args[i + 1], 10);
      if (isNaN(config.httpPort) || config.httpPort < 1 || config.httpPort > 65535) {
        console.error(`[ERROR] Invalid port: ${args[i + 1]}. Must be a number between 1 and 65535`);
        process.exit(1);
      }
      i++; // Skip next argument
    }
  }

  return config;
}
function setupLogging(logLevel: string): void {
  // Set the log level environment variable
  process.env.LOG_LEVEL = logLevel;
  
  // Configure console output based on log level
  if (logLevel === 'debug') {
    console.error(`[DEBUG] Starting JupyterLab RTC MCP Server with log level: ${logLevel}`);
  } else if (logLevel === 'warn') {
    console.error(`[WARN] Starting JupyterLab RTC MCP Server with log level: ${logLevel}`);
  } else if (logLevel === 'error') {
    console.error(`[ERROR] Starting JupyterLab RTC MCP Server with log level: ${logLevel}`);
  } else {
    console.error(`[INFO] Starting JupyterLab RTC MCP Server with log level: ${logLevel}`);
  }
}

async function main() {
  // Parse command line arguments
  const config = parseCommandLineArgs();
  
  // Setup logging
  setupLogging(config.logLevel);

  // Create MCP server
  const server = new JupyterLabMCPServer();

  // Start server with appropriate transport
  try {
    if (config.transport === 'stdio') {
      // Use stdio transport (production)
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error(`[INFO] JupyterLab RTC MCP Server started successfully with stdio transport`);
    } else if (config.transport === 'http') {
      // Use HTTP transport (debugging)
      const httpTransport = new JupyterLabHTTPTransport(config.httpPort || 3000);
      httpTransport.setMCPServer(server);
      await httpTransport.start();
      console.error(`[INFO] JupyterLab RTC MCP Server started successfully with HTTP transport on port ${httpTransport.getPort()}`);
      
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.error('[INFO] Shutting down HTTP server...');
        await httpTransport.stop();
        process.exit(0);
      });
    }
  } catch (error) {
    console.error(`[ERROR] Failed to start ${config.transport} transport server:`, error);
    process.exit(1);
  }
}
// Start the server
main().catch((error) => {
  console.error("Failed to start JupyterLab RTC MCP Server:", error);
  process.exit(1);
});