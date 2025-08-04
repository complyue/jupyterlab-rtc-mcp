# JupyterLab RTC MCP Server

A TypeScript-based Model Context Protocol (MCP) server that enables AI agents to operate on Jupyter notebooks while users can see updates in real-time through JupyterLab's Real-Time Collaboration (RTC) infrastructure.

## Overview

This MCP server uses stdio transport for communication with AI agents and integrates seamlessly with JupyterLab's WebSocket-based collaboration system, allowing AI agents to:

- Read and modify notebook content
- Execute code cells
- Collaborate with human users in real-time

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
│   │       └── stdio-transport.ts # Stdio transport handler
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

### Debug Mode

Enable debug mode for detailed logging:

To enable debug mode, add the `LOG_LEVEL=debug` environment variable to your MCP server configuration:

```json
{
  "mcpServers": {
    "jupyterlab": {
      "command": "npx",
      "args": ["-y", "jupyterlab-rtc-mcp"],
      "env": {
        "JUPYTERLAB_URL": "http://localhost:8888",
        "JUPYTERLAB_TOKEN": "your-token-here",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

Alternatively, you can set it in your shell environment:

```bash
export LOG_LEVEL=debug
```

Debug mode provides detailed logging information about:
- WebSocket connections and disconnections
- Document session creation and management
- Cell operations and execution
- Error details and stack traces

## Dependencies Supporting RTC Features

### Core Dependencies

1. **`@modelcontextprotocol/sdk`** (v0.5.0)
   - **Purpose**: Provides the MCP server implementation and stdio transport
   - **RTC Support**: Enables the server to communicate with AI agents via stdio transport

2. **`@jupyterlab/services`** (v7.0.0)
   - **Purpose**: Provides client-side APIs for interacting with JupyterLab services
   - **RTC Support**: While not specifically designed for RTC, it provides essential APIs that enable RTC functionality:
     - `ServerConnection.makeSettings()`: Creates connection settings for JupyterLab API
     - `ServerConnection.makeRequest()`: Makes HTTP requests to JupyterLab endpoints
     - `User.IManager`: Manages user identity and authentication
   - **Key RTC Usage**: These APIs are used to:
     - Request document sessions from the RTC collaboration endpoint (`api/collaboration/session`)
     - Connect to WebSocket rooms for real-time collaboration
     - Handle user authentication and identity management

3. **`@jupyterlab/coreutils`** (v6.0.0)
   - **Purpose**: Provides utility functions for JupyterLab
   - **RTC Support**: While not specifically designed for RTC, it provides essential utilities:
     - `URLExt.join()`: Constructs URLs to JupyterLab API endpoints
     - `URLExt.parse()`: Parses URLs for WebSocket connections
   - **Key RTC Usage**: These utilities are used to:
     - Build URLs to RTC collaboration endpoints
     - Construct WebSocket URLs for real-time synchronization

### Real-time Collaboration Dependencies

4. **`yjs`** (v13.6.0)
   - **Purpose**: CRDT (Conflict-free Replicated Data Type) library for real-time collaboration
   - **RTC Support**: Core technology enabling real-time synchronization of documents

5. **`y-websocket`** (v1.5.0)
   - **Purpose**: WebSocket provider for Yjs
   - **RTC Support**: Enables real-time synchronization over WebSocket connections

### How These Dependencies Work Together for RTC

1. **MCP Protocol Layer**:
   - `@modelcontextprotocol/sdk` handles the MCP protocol communication with AI agents

2. **JupyterLab Integration Layer**:
   - `@jupyterlab/services` provides APIs for:
     - Requesting document sessions from RTC endpoints
     - Managing user authentication
     - Making HTTP requests to JupyterLab
   - `@jupyterlab/coreutils` provides utilities for:
     - Building URLs to RTC endpoints
     - Constructing WebSocket URLs

3. **Real-time Synchronization Layer**:
   - `yjs` provides the CRDT data structures for shared documents
   - `y-websocket` manages the WebSocket connection to JupyterLab's RTC server

### Evidence of RTC Support in @jupyterlab/services and @jupyterlab/coreutils

From the JupyterLab RTC codebase, we can see how these libraries are used:

1. **Document Session Request** (from `packages/docprovider/src/requests.ts`):
   ```typescript
   export async function requestDocSession(
     format: string,
     type: string,
     path: string
   ): Promise<ISessionModel> {
     const settings = ServerConnection.makeSettings(); // From @jupyterlab/services
     const url = URLExt.join( // From @jupyterlab/coreutils
       settings.baseUrl,
       DOC_SESSION_URL,
       encodeURIComponent(path)
     );
     // ... makes request to RTC endpoint
   }
   ```

2. **WebSocket Provider Connection** (from `packages/docprovider/src/yprovider.ts`):
   ```typescript
   private async _connect(): Promise<void> {
     const session = await requestDocSession(
       this._format,
       this._contentType,
       this._path
     );

     this._yWebsocketProvider = new YWebsocketProvider(
       this._serverUrl, // Built using URLExt from @jupyterlab/coreutils
       `${session.format}:${session.type}:${session.fileId}`,
       this._sharedModel.ydoc,
       {
         disableBc: true,
         params: { sessionId: session.sessionId },
         awareness: this._awareness
       }
     );
     // ... sets up event handlers for real-time sync
   }
   ```

3. **Global Awareness** (from `packages/collaboration-extension/src/collaboration.ts`):
   ```typescript
   const server = ServerConnection.makeSettings(); // From @jupyterlab/services
   const url = URLExt.join(server.wsUrl, 'api/collaboration/room'); // From @jupyterlab/coreutils

   new WebSocketAwarenessProvider({
     url: url,
     roomID: 'JupyterLab:globalAwareness',
     awareness: awareness,
     user: user // From @jupyterlab/services
   });
   ```

These code examples demonstrate that while `@jupyterlab/services` and `@jupyterlab/coreutils` are not specifically designed for RTC, they provide the essential building blocks that enable RTC functionality in JupyterLab. They are used to:
- Create connections to JupyterLab servers
- Build URLs to RTC endpoints
- Manage user authentication and identity
- Make HTTP requests to RTC APIs

## License

This project is licensed under MIT License.
