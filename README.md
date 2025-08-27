# JupyterLab RTC MCP Server

A TypeScript-based Model Context Protocol (MCP) server that enables AI agents to operate on Jupyter notebooks while users can see updates in real-time through JupyterLab's Real-Time Collaboration (RTC) infrastructure.

## Overview

This MCP server supports both stdio and HTTP transport for communication with AI agents and integrates seamlessly with JupyterLab's WebSocket-based collaboration system, allowing AI agents to:

- Communicate with human users about notebook and document paths and contents by referencing URLs
- Read and modify notebook content
- Assign/change/restart notebook kernels
- Execute code cells and see the results
- Read and modify documents (experimental, configuration opt in)

Thanks to the [Jupyter Real-Time Collaboration](https://jupyterlab-realtime-collaboration.readthedocs.io) extension, human users can monitor AI agent operations in real time as they work.

## Features

- **URL Integration**: Human users can share JupyterLab notebook/document URLs for AI agents to convert to paths and initiate RTC. All document and notebook listings include direct URLs, and AI agents can provide specific URLs for human users to open in a browser to establish RTC connections.
- **Real-time Collaboration**: AI agents can modify notebooks while users see changes instantly
- **Multiple Document Types**: Support for notebooks, markdown/text files, and other JupyterLab document types
- **Kernel Control**: Manage the kernel associated with notebooks
- **Cell Operations**: Read, write, and execute notebook cells
- **Document Management**: Create, list, and manage documents (experimental, configuration opt in)
- **Automatic Session Timeout**: Sessions are automatically terminated after a period of inactivity to free resources

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- JupyterLab [with RTC enabled](https://jupyterlab-realtime-collaboration.readthedocs.io)

[Jupyter Real-Time Collaboration](https://jupyterlab-realtime-collaboration.readthedocs.io) is a Jupyter Server Extension and JupyterLab extension that provides support for [Y documents](https://github.com/jupyter-server/jupyter_ydoc) and adds collaboration UI elements to JupyterLab.
```bash
pip install jupyter-collaboration
```

Or

```bash
conda install -c conda-forge jupyter-collaboration
```

 ### Integration with AI Agents

Assuming your JupyterLab server is started with token authentication:

```bash
jupyter lab --IdentityProvider.token=your-token-here
```

To use the MCP server, configure your MCP settings:

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

You can configure multiple MCP servers for multiple JupyterLab instances at the same time.

## Available Tools

The MCP server provides the following categories of tools:

### URL Tools

- **get_base_url**: Retrieves the base URL of the JupyterLab server for constructing full URLs
- **nb_path_from_url**: Extracts the notebook path from a JupyterLab URL with proper URL decoding

### Notebook Tools

- **create_notebook**: Creates a new empty notebook in JupyterLab at the specified path
- **list_nbs**: Lists all notebook files under a specified directory, including URLs for direct access
- **get_nb_stat**: Retrieves status information about a notebook, including cell count and kernel information
- **read_nb_cells**: Reads multiple cells by specifying ranges with truncation support
- **modify_nb_cells**: Modifies multiple cells by specifying ranges, with optional execution
- **insert_nb_cells**: Inserts multiple cells at a specified location, with optional execution
- **delete_nb_cells**: Deletes multiple cells by specifying ranges
- **execute_nb_cells**: Executes multiple cells by specifying ranges
- **restart_nb_kernel**: Restarts the kernel of a specified notebook
- **list_available_kernels**: Lists all available kernels on the JupyterLab server
- **assign_nb_kernel**: Assigns a specific kernel to a notebook

### Document Editing Tools

> **Note**: Document tools are currently experimental and may have limitations with real-time collaboration. To enable these tools, set the `JUPYTERLAB_DOC_TOOLS` environment variable to `1`

- **get_document_content**: Retrieves document content using real-time collaboration with truncation support
- **insert_document_text**: Inserts text at a specific position in a document using real-time collaboration
- **delete_document_text**: Deletes text from a specific position in a document using real-time collaboration
- **replace_document_text**: Replaces text within a specific range in a document using real-time collaboration

### Document Management Tools

> **Note**: Document tools are currently experimental and may have limitations with real-time collaboration. To enable these tools, set the `JUPYTERLAB_DOC_TOOLS` environment variable to `1`

- **list_documents**: Lists available documents in JupyterLab from a specified path, including URLs for direct access
- **create_document**: Creates a new document in JupyterLab
- **get_document_info**: Retrieves information about a document, including URL for direct access
- **delete_document**: Deletes a document in JupyterLab
- **rename_document**: Renames a document in JupyterLab
- **copy_document**: Copies a document in JupyterLab
- **overwrite_document**: Overwrites the entire content of a document

### Session Management Tools
- **end_nb_session**: Ends a real-time collaboration session for a notebook
- **query_nb_sessions**: Queries the status of real-time collaboration sessions for notebooks in a directory
- **query_document_session**: Queries the status of a real-time collaboration session for a document
- **end_document_session**: Ends a real-time collaboration session for a document
- **Automatic Timeout**: Sessions are automatically terminated after a period of inactivity (configurable via command line options)

For detailed specifications of each tool, including parameters, return values, and examples, refer to [DESIGN.md](DESIGN.md).

## Transport Options

The server provides two separate entry points for different transport modes:

### Stdio Transport (Production)

- **Default mode** for production use
- Communicates via standard input/output
- Ideal for integration with AI agents
- Minimal runtime footprint and bundle size
- Command: `npx jupyterlab-rtc-mcp`

### HTTP Transport (Debugging)

- **Debug mode** for development and testing
- Provides HTTP endpoint with streamable JSON responses
- Useful for debugging and manual testing
- Separate entry point with HTTP-specific dependencies
- Command: `npx jupyterlab-rtc-mcp-http --port 3000`

### Command Line Options

#### Stdio Transport

```bash
# Use stdio transport (default, for production)
npx jupyterlab-rtc-mcp

# Set session timeout (in minutes)
npx jupyterlab-rtc-mcp --session-timeout 10

# Set maximum WebSocket payload size (in MB)
npx jupyterlab-rtc-mcp --max-ws-payload 200
```

#### HTTP Transport

```bash
# Use HTTP transport (for debugging)
npx jupyterlab-rtc-mcp-http

# Use HTTP transport on a specific port
npx jupyterlab-rtc-mcp-http --port 3080

# Use HTTP transport on a specific IP address
npx jupyterlab-rtc-mcp-http --ip 0.0.0.0

# Use HTTP transport on a specific IP and port
npx jupyterlab-rtc-mcp-http --ip 0.0.0.0 --port 3080

# Set session timeout (in minutes)
npx jupyterlab-rtc-mcp-http --session-timeout 10

# Set maximum WebSocket payload size (in MB)
npx jupyterlab-rtc-mcp-http --max-ws-payload 200
```

### HTTP Transport Usage

For debugging purposes, you can use the MCP server over HTTP transport

```bash
# Set environment variables for HTTP transport
export JUPYTERLAB_URL=http://localhost:8888
export JUPYTERLAB_TOKEN=your-token-here
export LOG_LEVEL=info

# Start the server with HTTP transport
npx jupyterlab-rtc-mcp-http --port 3000

# Start the server accessible from any network interface
npx jupyterlab-rtc-mcp-http --ip 0.0.0.0 --port 3000
```

#### Configuring MCP Clients for HTTP Transport

To use the HTTP transport with MCP clients, configure the client with streamable HTTP settings:

```json
{
  "mcpServers": {
    "jupyterlab": {
      "type": "streamable-http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Configuration

### Environment Variables

The MCP server can be configured using the following environment variables:

```bash
# JupyterLab server URL
export JUPYTERLAB_URL=http://localhost:8888

# Authentication token (optional)
export JUPYTERLAB_TOKEN=your-token-here

# Log level
export LOG_LEVEL=info

# Enable experimental document tools (optional)
export JUPYTERLAB_DOC_TOOLS=1
```

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
│   ├── index.ts                 # Stdio server entry point (production)
│   ├── http-server.ts           # HTTP server entry point (debugging)
│   ├── server/
│   │   ├── mcp-server.ts        # MCP server implementation with tool registration
│   │   └── transport/
│   │       ├── http-transport.ts # HTTP transport handler
│   │       └── stdio-transport.ts # Stdio transport handler
│   ├── jupyter/
│   │   ├── adapter.ts           # JupyterLab adapter for RTC communication
│   │   ├── cookie-manager.ts    # Cookie management for authentication
│   │   ├── document-session.ts  # Document session management
│   │   └── notebook-session.ts  # Notebook session management
│   ├── tools/
│   │   ├── notebook-tools.ts    # Notebook operation tools
│   │   ├── document-tools.ts    # Document management tools
│   │   └── url-tools.ts         # URL handling tools
│   └── utils/
│       └── logger.ts           # Logging utility
├── package.json                 # Project dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── README.md                   # Project documentation
├── DESIGN.md                   # Detailed tool specifications
└── AGENTS.md                   # AI agent guidelines
```

### Install Dependencies

```bash
npm install
```

### Build the Project

```bash
# Build both stdio and HTTP versions
npm run build

# Create optimized bundle for production
npm run bundle    # Creates stdio-only bundle (minimal size)
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
5. **Session Timeout Issues**:
   - Sessions are automatically terminated after 5 minutes of inactivity by default
   - Adjust the timeout using the `--session-timeout` command line argument
   - Monitor session status using the `query_nb_sessions` tool

### Debugging with HTTP Transport

For debugging purposes, you can use the HTTP transport to:

1. **Test MCP requests manually** using curl or Postman
2. **Inspect request/response payloads** in browser developer tools
3. **Monitor real-time communication** between the server and clients
4. **Connect with real MCP clients** using streamable HTTP transport
5. **Use MCP Inspector** for interactive debugging

#### Using MCP Inspector

The MCP Inspector is a powerful tool for interactively debugging MCP servers:

```bash
# Start server with HTTP transport
npx jupyterlab-rtc-mcp-http --port 3000

# Start server accessible from any network interface
npx jupyterlab-rtc-mcp-http --ip 0.0.0.0 --port 3000

# Connect with MCP Inspector
npx @modelcontextprotocol/inspector
```

When prompted, configure the inspector to connect to your HTTP endpoint:

- Transport: HTTP
- URL: http://localhost:3000/mcp


## License

This project is licensed under the MIT License.
