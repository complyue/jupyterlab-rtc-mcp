import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import cors from 'cors';
import { logger } from '../../utils/logger.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Server } from 'node:http';

/**
 * HTTP transport handler for JupyterLab RTC MCP Server
 * 
 * This class implements an HTTP server with streamable JSON response support
 * for debugging purposes, following the MCP HTTP transport specification.
 */
export class JupyterLabHTTPTransport {
  private app: express.Application;
  private server?: Server;
  private transports: { [sessionId: string]: StreamableHTTPServerTransport };
  private port: number;
  private host: string;
  private mcpServer?: { connect: (transport: Transport) => Promise<void> };

  /**
   * Create a new HTTP transport
   * @param port Port number to listen on
   * @param host Host IP address to bind to
   */
  constructor(port: number = 3000, host: string = '127.0.0.1') {
    this.port = port;
    this.host = host;
    this.transports = {};
    this.app = express();

    // Setup middleware
    this.app.use(express.json());

    // Configure CORS to expose Mcp-Session-Id header
    this.app.use(cors({
      origin: '*', // Allow all origins - adjust as needed for production
      exposedHeaders: ['Mcp-Session-Id']
    }));

    // Setup routes
    this.setupRoutes();
  }

  /**
   * Setup HTTP routes for MCP communication
   */
  private setupRoutes(): void {
    // Handle POST requests for MCP messages
    this.app.post('/mcp', async (req: Request, res: Response) => {
      logger.debug(`Received MCP request: ${JSON.stringify(req.body)}`);
      try {
        // Check for existing session ID
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && this.transports[sessionId]) {
          // Reuse existing transport
          transport = this.transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          // New initialization request - use JSON response mode
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableJsonResponse: true, // Enable JSON response mode
            onsessioninitialized: (sessionId) => {
              // Store the transport by session ID when session is initialized
              logger.debug(`Session initialized with ID: ${sessionId}`);
              this.transports[sessionId] = transport;
            }
          });

          // Connect the transport to the MCP server BEFORE handling the request
          await this.mcpServer!.connect(transport);
          await transport.handleRequest(req, res, req.body);
          return; // Already handled
        } else {
          // Invalid request - no session ID or not initialization request
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid session ID provided',
            },
            id: null,
          });
          return;
        }

        // Handle the request with existing transport - no need to reconnect
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        logger.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    });

    // Handle GET requests for SSE streams according to spec
    this.app.get('/mcp', async (req: Request, res: Response) => {
      // Since this is a simple implementation, we don't support GET requests for SSE streams
      // The spec requires returning 405 Method Not Allowed in this case
      res.status(405).set('Allow', 'POST').send('Method Not Allowed');
    });
  }

  /**
   * Set the MCP server to use with this transport
   * @param server The MCP server instance
   */
  setMCPServer(server: { connect: (transport: Transport) => Promise<void> }): void {
    this.mcpServer = server;
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, this.host, (error?: Error) => {
        if (error) {
          logger.error(`[ERROR] Failed to start HTTP server on ${this.host}:${this.port}:`, error);
          reject(error);
        } else {
          logger.info(`JupyterLab RTC MCP HTTP server listening on ${this.host}:${this.port}`);
          resolve();
        }
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('JupyterLab RTC MCP HTTP server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the port the server is listening on
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Get the host the server is bound to
   */
  getHost(): string {
    return this.host;
  }
}
