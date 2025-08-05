# JupyterLab RTC MCP Server

JupyterLab RTC MCP Server is a TypeScript-based Model Context Protocol (MCP) server that enables AI agents to operate on Jupyter notebooks while users can see updates in real-time through JupyterLab's Real-Time Collaboration (RTC) infrastructure. The server integrates with JupyterLab's WebSocket-based collaboration system, allowing AI agents to read and modify notebook content, execute code cells, and collaborate with human users in real-time.

## Project Structure and Organization

The project follows a modular TypeScript architecture with clear separation of concerns:

```
jupyterlab-rtc-mcp/
├── src/
│   ├── index.ts                 # Main server entry point with CLI argument parsing
│   ├── server/
│   │   ├── mcp-server.ts        # MCP server implementation with tool registration
│   │   └── transport/
│   │       ├── sse-transport.ts # SSE transport for debugging
│   │       └── stdio-transport.ts # Stdio transport handler
│   ├── jupyter/
│   │   ├── adapter.ts           # JupyterLab adapter for RTC communication
│   │   ├── cookie-manager.ts    # Cookie management for authentication
│   │   ├── document-session.ts  # Document session management
│   │   └── websocket-client.ts  # WebSocket client for JupyterLab
│   └── tools/
│       ├── notebook-tools.ts    # Notebook operation tools
│       └── document-tools.ts    # Document management tools
├── package.json                 # Project dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── README.md                   # Project documentation
├── DESIGN.md                   # Detailed tool specifications
└── AGENTS.md                   # This file - AI agent guidelines
```

### Key Components

1. **MCP Server Layer** (`src/server/mcp-server.ts`): Implements the MCP protocol, registers tools, and handles requests from AI agents.

2. **JupyterLab Adapter** (`src/jupyter/adapter.ts`): Manages communication with JupyterLab's RTC infrastructure, handles document sessions, and provides an interface for AI agents.

3. **Transport Layer** (`src/server/transport/`): Supports both stdio (production) and SSE (debugging) transports for communication with AI agents.

4. **Tools Implementation** (`src/tools/`): Provides high-level operations for notebook and document management.

## Build, Test, and Development Commands

### Available Scripts

- `npm run build` - Compile TypeScript source code to JavaScript in the `dist/` directory
- `npm run lint` - Run ESLint to check code quality and style
- `npm run format` - Format code using Prettier
- `npm run start:sse` - Start the server with SSE transport on http://127.0.0.1:3000

### Development Environment Setup

1. Install dependencies: `npm install`
2. Build the project: `npm run build`
3. Start the SSE server for debug `npm run start:sse`, i.e. easier to see logs

## Code Style and Conventions

### TypeScript Configuration

- Target: ES2022
- Module system: ESNext
- Strict mode enabled with most type-checking options
- Output directory: `./dist`
- Source root: `./src`

### Coding Standards

- Use TypeScript for all source code
- Prefer ES modules (import/export) over CommonJS
- Use meaningful variable and function names
- Follow camelCase naming convention for variables and functions
- Use PascalCase for class names and interfaces
- Use UPPER_CASE for constants
- Prefer `const` over `let` when possible
- Use arrow functions for anonymous functions
- Use template literals for string interpolation
- Use async/await for asynchronous operations

### Error Handling

- Always handle errors with try-catch blocks
- Provide meaningful error messages
- Log errors for debugging purposes
- Return appropriate error responses in MCP tools

### Documentation

- Use JSDoc comments for all public methods and classes
- Include parameter descriptions and return value types
- Provide examples for complex functionality

## Architecture and Design Patterns

### MCP Protocol Implementation

The server implements the Model Context Protocol (MCP) to communicate with AI agents. It supports two transport mechanisms:

1. **Stdio Transport** (default): Uses standard input/output for communication, recommended for production use
2. **SSE Transport**: Uses Server-Sent Events over HTTP, primarily for debugging purposes

### JupyterLab Integration

The server integrates with JupyterLab's RTC infrastructure through several key components:

1. **Document Sessions**: Manages real-time collaboration sessions for notebooks and documents
2. **WebSocket Communication**: Handles real-time synchronization with JupyterLab
3. **Authentication**: Supports token-based authentication and cookie management

### Tool Architecture

The server provides tools organized into three categories:

1. **RTC Session Management**: Tools for beginning, ending, and querying notebook sessions
2. **Notebook Operations**: Tools for reading, modifying, inserting, deleting cells, and managing kernels
3. **Document Management**: Tools for creating, listing, and managing documents in JupyterLab

### Design Patterns

1. **Adapter Pattern**: The `JupyterLabAdapter` class adapts JupyterLab's APIs for use by the MCP server
2. **Factory Pattern**: Used for creating different types of transport mechanisms
3. **Command Pattern**: Each tool implements a specific command that can be executed by the MCP server
4. **Observer Pattern**: Used for handling real-time updates from JupyterLab

## Configuration

### Environment Variables

The server can be configured using the following environment variables:

```bash
# JupyterLab server URL (required)
export JUPYTERLAB_URL=http://localhost:8888

# Authentication token (optional)
export JUPYTERLAB_TOKEN=your-token-here

# Log level (optional, default: info)
export LOG_LEVEL=debug
```

### Command Line Arguments

The server supports the following command line arguments:

- `-sse` or `--sse`: Use SSE transport instead of stdio
- `-ip` or `--host`: Set the host IP for SSE transport (default: 127.0.0.1)
- `-port` or `--port`: Set the port for SSE transport (default: 3000)

### MCP Configuration

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

For SSE transport (debugging only):

```json
{
  "mcpServers": {
    "jupyterlab-sse": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

## Dependencies

### Core Dependencies

- `@modelcontextprotocol/sdk`: Provides the MCP server implementation
- `@jupyterlab/services`: Client-side APIs for interacting with JupyterLab
- `@jupyterlab/coreutils`: Utility functions for JupyterLab
- `yjs`: CRDT library for real-time collaboration
- `y-websocket`: WebSocket provider for Yjs
- `zod`: Schema validation

### Development Dependencies

- `typescript`: TypeScript compiler
- `express`: Web server for SSE transport
- `@types/node`: TypeScript definitions for Node.js
- `@typescript-eslint/eslint-plugin`: ESLint plugin for TypeScript
- `eslint`: JavaScript linter
- `prettier`: Code formatter

## Troubleshooting

### Common Issues

1. **Connection Errors**: Ensure JupyterLab is running and RTC is enabled
2. **WebSocket Errors**: Check network connectivity and firewall settings
3. **Authentication Issues**: Verify tokens and permissions
4. **Build Errors**: Ensure all dependencies are installed and TypeScript configuration is correct

### Debugging

- Use SSE transport for debugging (`npm run start:sse`)
- Check console logs for detailed error information
- Use browser developer tools to inspect network traffic
- Verify JupyterLab RTC endpoints are accessible

For more detailed information about the available tools and their specifications, refer to @DESIGN.md.
