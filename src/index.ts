#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { JupyterLabMCPServer } from "./server/mcp-server.js";

/**
 * Main entry point for the JupyterLab RTC MCP Server
 * 
 * This server enables AI agents to interact with Jupyter notebooks
 * through the Model Context Protocol while leveraging JupyterLab's
 * real-time collaboration infrastructure.
 */

async function main() {
  // Get log level from environment
  const logLevel = process.env.LOG_LEVEL || 'info';
  
  // Only log to stderr to avoid interfering with stdio transport
  if (logLevel === 'debug') {
    console.error("Starting JupyterLab RTC MCP Server in debug mode...");
  } else {
    console.error("Starting JupyterLab RTC MCP Server...");
  }

  // Create MCP server
  const server = new JupyterLabMCPServer();

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (logLevel === 'debug') {
    console.error("JupyterLab RTC MCP Server started successfully in debug mode");
  } else {
    console.error("JupyterLab RTC MCP Server started successfully");
  }
}

// Start the server
main().catch((error) => {
  console.error("Failed to start JupyterLab RTC MCP Server:", error);
  process.exit(1);
});