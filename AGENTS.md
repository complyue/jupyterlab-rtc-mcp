# JupyterLab RTC MCP Server

JupyterLab RTC MCP Server is a TypeScript-based Model Context Protocol (MCP) server that enables AI agents to operate on Jupyter notebooks while users can see updates in real-time through JupyterLab's Real-Time Collaboration (RTC) infrastructure. The server integrates with JupyterLab's WebSocket-based collaboration system, allowing AI agents to read and modify notebook content, execute code cells, and collaborate with human users in real-time.

## Project Structure and Organization

The project follows a modular TypeScript architecture with clear separation of concerns:

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
└── AGENTS.md                   # This file - AI agent guidelines
```

### Key Components

1. **MCP Server Layer** (`src/server/mcp-server.ts`): Implements the MCP protocol, registers tools, and handles requests from AI agents.

2. **JupyterLab Adapter** (`src/jupyter/adapter.ts`): Manages communication with JupyterLab's RTC infrastructure, handles implicit session creation, and provides an interface for AI agents.

3. **Transport Layer** (`src/server/transport/`): Supports both HTTP and stdio transports for communication with AI agents.

4. **Tools Implementation** (`src/tools/`): Provides high-level operations for notebook, document, and URL management.

## Build, Test, and Development Commands

### Available Scripts

- `npm run build` - Compile TypeScript source code to JavaScript in the `dist/` directory
- `npm run lint` - Run ESLint to check code quality and style
- `npm run format` - Format code using Prettier
- `npm run bundle` - Create optimized stdio-only bundle (minimal size)

### Development Environment Setup

1. Install dependencies: `npm install`
2. Build the project: `npm run build`
3. Create optimized bundles:
   - For production: `npm run bundle`

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

The server implements the Model Context Protocol (MCP) to communicate with AI agents. It provides two separate entry points for different transport modes:

1. **Stdio Mode (Production)**: Optimized for production use with minimal runtime footprint
2. **HTTP Mode (Debugging)**: Full HTTP functionality with IP binding support for development

### JupyterLab Integration

The server integrates with JupyterLab's RTC infrastructure through several key components:

1. **Implicit Session Management**: Sessions are created on-demand when needed, without explicit initiation
2. **WebSocket Communication**: Handles real-time synchronization with JupyterLab
3. **Authentication**: Supports token-based authentication and cookie management

### Tool Architecture

The server provides tools organized into four categories:

1. **URL Tools**: Tools for handling JupyterLab URLs, including extracting paths from human provided URLs, and constructing URLs for human users to open with browser, to establish RTC by AI agents and human users
2. **Notebook Operations**: Tools for reading, modifying, inserting, deleting cells, and managing kernels by AI agents
3. **Document Management**: Tools for creating, listing, and managing documents in JupyterLab, and RTC edits by AI agents
4. **RTC Session Management**: Tools for querying and explicitly ending notebook/document sessions (sessions are created implicitly)

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

### Command Line Options

#### Stdio Mode (Production)

```bash
# Use stdio transport (default, for production)
npx jupyterlab-rtc-mcp

# Set session timeout (in minutes)
npx jupyterlab-rtc-mcp --session-timeout 10
```

#### HTTP Mode (Debugging)

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
```

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

## Dependencies

### Core Dependencies

- `@modelcontextprotocol/sdk`: Provides the MCP server implementation
- `@jupyterlab/services`: Client-side APIs for interacting with JupyterLab
- `@jupyterlab/coreutils`: Utility functions for JupyterLab
- `@jupyter/ydoc`: Yjs-based document models for JupyterLab
- `yjs`: CRDT library for real-time collaboration
- `y-websocket`: WebSocket provider for Yjs
- `zod`: Schema validation

### HTTP Mode Dependencies

- `express`: Web framework for HTTP server
- `cors`: CORS middleware for HTTP server

### Development Dependencies

- `typescript`: TypeScript compiler
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

- Check console logs for detailed error information
- Use browser developer tools to inspect network traffic
- Verify JupyterLab RTC endpoints are accessible

For more detailed information about the available tools and their specifications, refer to @DESIGN.md.
