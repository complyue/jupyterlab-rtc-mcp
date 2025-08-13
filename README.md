# JupyterLab RTC MCP Server

A TypeScript-based Model Context Protocol (MCP) server that enables AI agents to operate on Jupyter notebooks while users can see updates in real-time through JupyterLab's Real-Time Collaboration (RTC) infrastructure.

## Overview

This MCP server supports both stdio and HTTP transport for communication with AI agents and integrates seamlessly with JupyterLab's WebSocket-based collaboration system, allowing AI agents to:

- Read and modify notebook content
- Execute code cells
- Collaborate with human users in real-time

## Transport Options

The server supports two transport modes:

### 1. Stdio Transport (Production)
- **Default mode** for production use
- Communicates via standard input/output
- Ideal for integration with AI agents
- Command: `npx jupyterlab-rtc-mcp`

### 2. HTTP Transport (Debugging)
- **Debug mode** for development and testing
- Provides HTTP endpoint with streamable JSON responses
- Useful for debugging and manual testing
- Command: `npx jupyterlab-rtc-mcp --transport http --port 3000`

## Features

- **Real-time Collaboration**: AI agents can modify notebooks while users see changes instantly
- **Multiple Document Types**: Support for notebooks, markdown/text files, and other JupyterLab document types
- **Kernel Information**: See kernel associated with notebooks, advice the user for proper kernel selection
- **Cell Operations**: Read, write, and execute notebook cells
- **Document Management**: Create, list, and manage documents
- **Conflict Resolution**: Handle concurrent edits from multiple agents

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- JupyterLab (with Python setup for it) with RTC enabled

## Usage

### Command Line Options

The server supports the following command line options:

```bash
# Use stdio transport (default, for production)
npx jupyterlab-rtc-mcp

# Use HTTP transport (for debugging)
npx jupyterlab-rtc-mcp --transport http

# Use HTTP transport on a specific port
npx jupyterlab-rtc-mcp --transport http --port 8080

# Show help
npx jupyterlab-rtc-mcp --help
```

### Integrating with AI Agents

To use the MCP server with an AI agent, configure the agent to use the server as an MCP provider:

```json
{
  "mcpServers": {
    "jupyterlab": {
      "command": "npx",
      "args": ["-y", "jupyterlab-rtc-mcp"],
      "env": {
        "JUPYTERLAB_URL": "http://localhost:8888",
        "JUPYTERLAB_TOKEN": "your-token-here"
      }
    }
  }
}
```

### HTTP Transport Usage

For debugging purposes, you can use the HTTP transport to interact with the server directly:

```bash
# Set environment variables for HTTP transport
export JUPYTERLAB_URL=http://localhost:8888
export JUPYTERLAB_TOKEN=your-token-here
export LOG_LEVEL=info

# Start the server with HTTP transport
npx jupyterlab-rtc-mcp --transport http --port 3000

# Then send requests to the HTTP endpoint
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Configuration

### Environment Variables

The MCP server can be configured using environment variables:

```bash
# JupyterLab server URL
export JUPYTERLAB_URL=http://localhost:8888

# Authentication token (optional)
export JUPYTERLAB_TOKEN=your-token-here

# Log level
export LOG_LEVEL=info
```

## Available Tools

The MCP server provides the following categories of tools:

### RTC Session Management
- **begin_nb_session**: Begin a real-time collaboration session for a notebook
- **end_nb_session**: End a real-time collaboration session for a notebook
- **query_nb_sessions**: Query the status of real-time collaboration sessions for notebooks in a directory

### Notebook Operations
- **list_nbs**: List all notebook files under a specified directory
- **get_nb_stat**: Get status information about a notebook, including cell count and kernel information
- **read_nb_cells**: Read multiple cells by specifying ranges
- **modify_nb_cells**: Modify multiple cells by specifying ranges, with optional execution
- **insert_nb_cells**: Insert multiple cells at a specified location, with optional execution
- **delete_nb_cells**: Delete multiple cells by specifying ranges
- **restart_nb_kernel**: Restart the kernel of a specified notebook

### Document Management
- **list_documents**: List available documents in JupyterLab from a specified path
- **create_document**: Create a new document in JupyterLab
- **get_document_info**: Get information about a document
- **delete_document**: Delete a document in JupyterLab
- **rename_document**: Rename a document in JupyterLab
- **copy_document**: Copy a document in JupyterLab
- **document_exists**: Check if a document exists in JupyterLab

For detailed specifications of each tool, including parameters, return values, and examples, please refer to [DESIGN.md](DESIGN.md).


## Development

### Clone the Repository

```bash
git clone https://github.com/complyue/jupyterlab-rtc-mcp.git
cd jupyterlab-rtc-mcp
```

### Project Structure

```
jupyterlab-rtc-mcp/
├── src/
│   ├── index.ts                 # Main server entry point
│   ├── server/
│   │   ├── mcp-server.ts        # MCP server implementation
│   │   └── transport/
│   │       ├── stdio-transport.ts # Stdio transport handler
│   │       └── http-transport.ts  # HTTP transport handler
│   ├── jupyter/
│   │   ├── adapter.ts           # JupyterLab adapter
│   │   ├── websocket-client.ts   # WebSocket client for JupyterLab
│   │   └── document-session.ts   # Document session management
│   └── tools/
│       ├── notebook-tools.ts    # Notebook operation tools
│       └── document-tools.ts    # Document management tools
├── package.json
├── tsconfig.json
└── README.md
```

### Install Dependencies

```bash
npm install
```

### Build the Project

```bash
npm run build
```

## Troubleshooting

### Common Issues

1. **Connection Errors**: Ensure JupyterLab is running and RTC is enabled
2. **WebSocket Errors**: Check network connectivity and firewall settings
3. **Authentication Issues**: Verify tokens and permissions
4. **HTTP Transport Issues**:
   - Ensure the specified port is not already in use
   - Check CORS settings if accessing from a browser
   - Verify the HTTP server is running by checking the console output

### Debugging with HTTP Transport

For debugging purposes, you can use the HTTP transport to:

1. **Test MCP requests manually** using curl or Postman
2. **Inspect request/response payloads** in browser developer tools
3. **Monitor real-time communication** between the server and clients
4. **Connect with real MCP clients** using streamable HTTP transport
5. **Use MCP Inspector** for interactive debugging

#### Using MCP Inspector

The MCP Inspector is a powerful tool for debugging MCP servers interactively:

```bash
# Start server with HTTP transport
npx jupyterlab-rtc-mcp --transport http --port 3000

# Connect with MCP Inspector
npx @modelcontextprotocol/inspector
```

When prompted, configure the inspector to connect to your HTTP endpoint:
- Transport: HTTP
- URL: http://localhost:3000/mcp

#### Configuring MCP Clients for HTTP Transport

To use the HTTP transport with MCP clients, configure the client with streamable HTTP settings:

```json
{
  "mcpServers": {
    "jupyterlab": {
      "type": "streamable-http",
      "url": "http://localhost:3000/mcp",
      "alwaysAllow": [
        "list_nbs",
        "list_documents"
      ]
    }
  }
}
```

Example debugging session:
```bash
# Set environment variables
export JUPYTERLAB_URL=http://localhost:8888
export JUPYTERLAB_TOKEN=your-token-here

# Start server with debug logging
LOG_LEVEL=debug npx jupyterlab-rtc-mcp --transport http --port 3000

# Test connection
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## License

This project is licensed under MIT License.
