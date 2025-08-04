import express, { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { JupyterLabMCPServer } from '../mcp-server.js';
import { IncomingMessage } from 'node:http';

/**
 * SSE transport handler for JupyterLab RTC MCP Server
 * 
 * This class implements the SSE transport for debugging purposes,
 * allowing the server to be accessed via HTTP endpoints instead of stdio.
 */
export class JupyterLabSSETransport {
  private app: express.Application;
  private server: any;
  private transports: Record<string, SSEServerTransport> = {};
  private mcpServer: JupyterLabMCPServer;
  private port: number;
  private host: string;

  /**
   * Create a new SSE transport
   * @param mcpServer The MCP server instance
   * @param host The host to bind to
   * @param port The port to listen on
   */
  constructor(mcpServer: JupyterLabMCPServer, host: string = '127.0.0.1', port: number = 3000) {
    this.mcpServer = mcpServer;
    this.host = host;
    this.port = port;
    this.app = express();
    
    // Setup routes
    this.setupRoutes();
  }

  /**
   * Setup the routes for SSE transport
   */
  private setupRoutes(): void {
    // Apply JSON middleware only to routes that need it
    // Exclude /messages endpoint since MCP SDK needs to read the raw stream
    this.app.use((req: Request, res: Response, next: express.NextFunction) => {
      if (req.path !== '/messages') {
        express.json()(req, res, next);
      } else {
        next();
      }
    });
    
    // SSE endpoint for establishing the stream
    this.app.get('/mcp', async (req: Request, res: Response) => {
      console.log('Received GET request to /mcp (establishing SSE stream)');

      try {
        // Create a new SSE transport for the client
        // The endpoint for POST messages is '/messages'
        const transport = new SSEServerTransport('/messages', res);

        // Store the transport by session ID
        const sessionId = transport.sessionId;
        this.transports[sessionId] = transport;

        // Set up onclose handler to clean up transport when closed
        transport.onclose = () => {
          console.log(`SSE transport closed for session ${sessionId}`);
          delete this.transports[sessionId];
        };

        // Connect the transport to the MCP server
        await this.mcpServer.connect(transport);

        console.log(`Established SSE stream with session ID: ${sessionId}`);
      } catch (error) {
        console.error('Error establishing SSE stream:', error);
        if (!res.headersSent) {
          res.status(500).send('Error establishing SSE stream');
        }
      }
    });

    // Messages endpoint for receiving client JSON-RPC requests
    this.app.post('/messages', async (req: Request, res: Response) => {
      // Extract session ID from URL query parameter
      const sessionId = req.query.sessionId as string | undefined;

      if (!sessionId) {
        console.error('No session ID provided in request URL');
        res.status(400).send('Missing sessionId parameter');
        return;
      }

      const transport = this.transports[sessionId];
      if (!transport) {
        console.error(`No active transport found for session ID: ${sessionId}`);
        res.status(404).send('Session not found');
        return;
      }

      try {
        // Handle the POST message with the transport
        await transport.handlePostMessage(req as IncomingMessage, res);
      } catch (error) {
        console.error('Error handling request:', error);
        if (!res.headersSent) {
          res.status(500).send('Error handling request');
        }
      }
    });

    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'ok',
        transports: Object.keys(this.transports).length,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Start the SSE transport server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, this.host, () => {
        console.log(`JupyterLab RTC MCP Server with SSE transport listening on http://${this.host}:${this.port}`);
        console.log(`SSE endpoint: http://${this.host}:${this.port}/mcp`);
        console.log(`Messages endpoint: http://${this.host}:${this.port}/messages`);
        console.log(`Health check: http://${this.host}:${this.port}/health`);
        resolve();
      });

      this.server.on('error', (error: any) => {
        console.error('Failed to start SSE transport server:', error);
        reject(error);
      });
    });
  }

  /**
   * Stop the SSE transport server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        // Close all active transports to properly clean up resources
        for (const sessionId in this.transports) {
          try {
            console.log(`Closing transport for session ${sessionId}`);
            this.transports[sessionId].close();
            delete this.transports[sessionId];
          } catch (error) {
            console.error(`Error closing transport for session ${sessionId}:`, error);
          }
        }

        this.server.close(() => {
          console.log('SSE transport server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
