#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { JupyterLabMCPServer } from "./server/mcp-server.js";
import { JupyterLabSSETransport } from "./server/transport/sse-transport.js";

/**
 * Main entry point for the JupyterLab RTC MCP Server
 *
 * This server enables AI agents to interact with Jupyter notebooks
 * through the Model Context Protocol while leveraging JupyterLab's
 * real-time collaboration infrastructure.
 */

interface ServerConfig {
  useSSE: boolean;
  host: string;
  port: number;
  logLevel: string;
}

function parseCommandLineArgs(): ServerConfig {
  const args = process.argv.slice(2);
  const config: ServerConfig = {
    useSSE: false,
    host: '127.0.0.1',
    port: 3000,
    logLevel: process.env.LOG_LEVEL || 'info'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-sse' || arg === '--sse') {
      config.useSSE = true;
    } else if (arg === '-ip' || arg === '--host') {
      config.host = args[i + 1];
      i++; // Skip next argument
    } else if (arg === '-port' || arg === '--port') {
      config.port = parseInt(args[i + 1], 10);
      i++; // Skip next argument
    } else if (arg === '-log' || arg === '--log-level') {
      config.logLevel = args[i + 1];
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

  if (config.useSSE) {
    // Use SSE transport for debugging
    const sseTransport = new JupyterLabSSETransport(server, config.host, config.port);
    
    try {
      await sseTransport.start();
      console.error(`[INFO] JupyterLab RTC MCP Server started with SSE transport on http://${config.host}:${config.port}`);
    } catch (error) {
      console.error(`[ERROR] Failed to start SSE transport server:`, error);
      process.exit(1);
    }

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.error('[INFO] Shutting down SSE transport server...');
      try {
        await sseTransport.stop();
        console.error('[INFO] SSE transport server shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('[ERROR] Error during shutdown:', error);
        process.exit(1);
      }
    });
  } else {
    // Use stdio transport (default)
    try {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error(`[INFO] JupyterLab RTC MCP Server started successfully with stdio transport`);
    } catch (error) {
      console.error(`[ERROR] Failed to start stdio transport server:`, error);
      process.exit(1);
    }
  }
}

// Start the server
main().catch((error) => {
  console.error("Failed to start JupyterLab RTC MCP Server:", error);
  process.exit(1);
});