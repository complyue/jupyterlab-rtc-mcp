#!/usr/bin/env node

// Capture real streams before importing dependencies
const realStdin = process.stdin;
const realStdout = process.stdout;

import { createWriteStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, unlink } from 'fs';

function redirectDepsOutLog() {
  // Determine log file path from environment or generate temporary file
  let unlinkDepsOutFile = false,
    depsOutFn = process.env.JUPYTERLAB_DEPS_LOG_FILE;
  // keep the file if a name specified via env var, for debug purpose
  if (!depsOutFn) { // or try unlink it,
    // so the disk space it occupies will be auto freed after process exit
    unlinkDepsOutFile = true;
    const tempDir = mkdtempSync(join(tmpdir(), 'jupyterlab-rtc-mcp-'));
    depsOutFn = join(tempDir, 'deps-out.log');
  }

  // Create fake stdout that redirects to log file
  const fakeStdout = createWriteStream(depsOutFn, { flags: 'a' });
  if (unlinkDepsOutFile) {
    // Make it deleted, free space after this process exited
    unlink(depsOutFn, err => {
      // this is supposed to succeed on *nix, fail on Windows
      // sorry Windows users, you'll have to cleanup the log files by hand
    });
  }

  // Replace process.stdout to fool our dependencies
  Object.defineProperty(process, 'stdout', {
    get: () => fakeStdout,
    configurable: true
  });

  return depsOutFn;
}

const depsLogFile = redirectDepsOutLog();


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
  // Log the fake stdout file location to stderr
  logger.info(`Dependency logs redirected to: ${depsLogFile}`);

  // Parse command line arguments
  const config = parseCommandLineArgs();

  // Create MCP server
  const server = new JupyterLabMCPServer(config.sessionTimeout, config.maxWsPayload);

  // Start server with stdio transport
  try {
    const transport = new StdioServerTransport(realStdin, realStdout);
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
