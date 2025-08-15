# JupyterLab RTC MCP Server - Detailed Tool Specifications

This document contains detailed specifications for all tools available in the JupyterLab RTC MCP Server.

## Available Tools

### URL Tools

#### get_base_url
Get the base URL of the JupyterLab server.

**Parameters:**
None

**Returns:**
A JSON object with the base URL:
- `base_url`: The base URL of the JupyterLab server

**Example:**
```json
{
  "base_url": "http://localhost:8888"
}
```

**Note:** This tool is useful for AI agents to understand the server context and for constructing full URLs when needed.

#### nb_path_from_url
Extract the notebook path from a full JupyterLab URL with proper URL decoding.

**Parameters:**
- `url` (required): Full JupyterLab URL to a notebook

**Returns:**
A JSON object with the extracted notebook path:
- `original_url`: The original URL provided
- `base_url`: The base URL of the JupyterLab server
- `notebook_path`: The extracted and decoded notebook path

**Example:**
```json
{
  "original_url": "http://localhost:8888/tree/example/notebook1.ipynb",
  "base_url": "http://localhost:8888",
  "notebook_path": "example/notebook1.ipynb"
}
```

**Supported URL Patterns:**
- `/tree/path/to/notebook.ipynb`
- `/notebooks/path/to/notebook.ipynb`
- `/edit/path/to/notebook.ipynb`
- `/view/path/to/notebook.ipynb`

**Note:** This tool handles URL decoding to properly extract notebook paths with special characters. It validates that the extracted path ends with `.ipynb` to ensure it's a notebook file.

### Notebook Operations

#### list_nbs
List all notebook files under a specified directory, recursively.

**Parameters:**
- `path` (optional): Directory path to search for notebooks (default: root directory)

**Returns:**
A JSON array of notebook objects with properties:
- `path`: Full path to the notebook file
- `name`: Filename of the notebook
- `last_modified`: ISO timestamp of last modification

**Example:**
```json
{
  "notebooks": [
    {
      "path": "/example/notebook1.ipynb",
      "name": "notebook1.ipynb",
      "last_modified": "2023-01-01T12:00:00Z"
    }
  ]
}
```

#### get_nb_stat
Get status information about a notebook, including cell count and kernel information.

**Parameters:**
- `path` (required): Path to the notebook file

**Returns:**
A JSON object with notebook status information:
- `path`: Path to the notebook
- `cell_count`: Number of cells in the notebook
- `last_modified`: ISO timestamp of last modification
- `kernel`: Kernel information object
  - `name`: Kernel name (e.g., "python3")
  - `id`: Kernel ID
  - `state`: Kernel state (e.g., "idle", "busy")

**Example:**
```json
{
  "path": "/example/notebook1.ipynb",
  "cell_count": 5,
  "last_modified": "2023-01-01T12:00:00Z",
  "kernel": {
    "name": "python3",
    "id": "kernel-id-123",
    "state": "idle"
  }
}
```

#### read_nb_cells
Read multiple cells by specifying ranges.

**Parameters:**
- `path` (required): Path to the notebook file
- `ranges` (optional): Array of cell ranges to read
  - `start`: Starting cell index
  - `end` (optional): Ending cell index (exclusive)

**Returns:**
A JSON object with cell information:
- `cells`: Array of cell objects
  - `index`: Cell index
  - `id`: Cell ID
  - `content`: Cell content
  - `type`: Cell type ("code" or "markdown")

**Example:**
```json
{
  "cells": [
    {
      "index": 0,
      "id": "cell-1",
      "content": "print('Hello, World!')",
      "type": "code"
    }
  ]
}
```

#### modify_nb_cells
Modify multiple cells by specifying ranges, with optional execution.

**Parameters:**
- `path` (required): Path to the notebook file
- `modifications` (required): Array of cell modifications
  - `range`: Cell range to modify
    - `start`: Starting cell index
    - `end` (optional): Ending cell index (exclusive)
  - `content`: New content for the cells
- `exec` (optional, default: true): Whether to execute the modified cells

**Returns:**
Success message indicating the number of cell ranges modified and whether they were executed.

#### insert_nb_cells
Insert multiple cells at a specified location, with optional execution.

**Parameters:**
- `path` (required): Path to the notebook file
- `position` (required): Position to insert the cells
- `cells` (required): Array of cells to insert
  - `type` (optional, default: "code"): Cell type ("code" or "markdown")
  - `content`: Cell content
- `exec` (optional, default: true): Whether to execute the inserted cells

**Returns:**
A JSON object with:
- `message`: Success message
- `cell_ids`: Array of IDs of the newly inserted cells

#### delete_nb_cells
Delete multiple cells by specifying ranges.

**Parameters:**
- `path` (required): Path to the notebook file
- `ranges` (required): Array of cell ranges to delete
  - `start`: Starting cell index
  - `end` (optional): Ending cell index (exclusive)

**Returns:**
Success message indicating the number of cells deleted.

#### execute_nb_cells
Execute multiple cells by specifying ranges.

**Parameters:**
- `path` (required): Path to the notebook file
- `ranges` (required): Array of cell ranges to execute
  - `start`: Starting cell index
  - `end` (optional): Ending cell index (exclusive)

**Returns:**
Success message indicating the number of cell ranges executed.

**Example:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Successfully executed 2 cell ranges"
    }
  ]
}
```

#### restart_nb_kernel
Restart the kernel of a specified notebook, with options to clear contents and execute cells.

**Parameters:**
- `path` (required): Path to the notebook file
- `clear_outputs` (optional, default: false): Whether to clear cell outputs after restart
- `exec` (optional, default: true): Whether to execute cells after restart
- `kernel_name` (optional): Name of the kernel to use (from list_available_kernels). If not specified, uses the current kernel or creates a new one with the default kernel.

**Behavior:**
- If an active kernel exists for the notebook, it will be restarted
- If no active kernel exists, a new kernel will be started and then restarted
- The tool handles kernel creation and restart in a single operation
- After kernel restart, cell contents can be cleared and cells can be executed based on parameters

**Returns:**
Success message indicating kernel restart status and whether contents were cleared and cells were executed.

**Example:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Successfully restarted notebook kernel and executed cells"
    }
  ]
}
```

**Error Handling:**
- If the notebook file doesn't exist, returns an appropriate error
- If kernel creation fails, returns detailed error information
- If kernel restart fails, returns detailed error information

#### list_available_kernels
List all available kernels on the JupyterLab server.

**Parameters:**
None

**Returns:**
A JSON object with available kernel information:
- `kernels`: Array of kernel objects
  - `name`: Kernel name (used for assignment)
  - `display_name`: Human-readable kernel name
  - `language`: Programming language of the kernel
  - `path`: Path to kernel resources

**Example:**
```json
{
  "kernels": [
    {
      "name": "python3",
      "display_name": "Python 3",
      "language": "python",
      "path": "/usr/local/share/jupyter/kernels/python3"
    },
    {
      "name": "ir",
      "display_name": "R",
      "language": "r",
      "path": "/usr/local/share/jupyter/kernels/ir"
    }
  ]
}
```

**Error Handling:**
- If the server is not accessible, returns appropriate network error
- If the kernelspecs API is not available, returns detailed error information

#### assign_nb_kernel
Assign a specific kernel to a notebook.

**Parameters:**
- `path` (required): Path to the notebook file
- `kernel_name` (required): Name of the kernel to assign (from list_available_kernels)

**Returns:**
Success message indicating kernel assignment status.

**Example:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Successfully assigned kernel 'python3' to notebook 'example.ipynb'"
    }
  ]
}
```

**Behavior:**
- If an active session exists for the notebook, updates the session with the new kernel
- If no active session exists, creates a new session with the specified kernel
- The kernel must be available on the server (see list_available_kernels)

**Error Handling:**
- If the notebook file doesn't exist, returns an appropriate error
- If the specified kernel is not available, returns detailed error information
- If session creation or update fails, returns detailed error information

### Document Management

#### list_documents
List available documents in JupyterLab from a specified path.

**Parameters:**
- `path` (optional): Path to list documents from (default: root directory)

**Returns:**
A JSON array of document objects with properties:
- `name`: Document name
- `path`: Full path to the document
- `type`: Document type ("file", "directory", "notebook")
- `created`: ISO timestamp of creation
- `last_modified`: ISO timestamp of last modification
- `size`: File size in bytes
- `writable`: Whether the document is writable

**Example:**
```json
[
  {
    "name": "document.md",
    "path": "/example/document.md",
    "type": "file",
    "created": "2023-01-01T10:00:00Z",
    "last_modified": "2023-01-01T12:00:00Z",
    "size": 1024,
    "writable": true
  }
]
```

#### create_document
Create a new document in JupyterLab.

**Parameters:**
- `path` (required): Path for the new document
- `type` (optional, default: "notebook"): Document type ("notebook", "file", "markdown")
- `content` (optional): Initial content for the document

**Returns:**
Success message indicating the document was created.

#### get_document_info
Get information about a document.

**Parameters:**
- `path` (required): Path to the document
- `include_content` (optional, default: false): Whether to include document content
- `max_content` (optional, default: 32768): Maximum content length to return (default: 32KB)

**Returns:**
A multi-message response with document information:

1. **First message**: Document information as JSON
   - `name`: Document name
   - `path`: Full path to the document
   - `type`: Document type
   - `format`: Document format
   - `created`: ISO timestamp of creation
   - `last_modified`: ISO timestamp of last modification
   - `size`: File size in bytes
   - `writable`: Whether the document is writable
   - `mimetype`: MIME type of the document

2. **Second message** (if include_content is true): Content information as JSON
   - `content_length`: Length of the content
   - `truncated`: Boolean indicating if content was truncated

3. **Third message** (if include_content is true): The actual document content

**Example** (without content):
```json
{
  "name": "document.md",
  "path": "/example/document.md",
  "type": "file",
  "format": "text",
  "created": "2023-01-01T10:00:00Z",
  "last_modified": "2023-01-01T12:00:00Z",
  "size": 17,
  "writable": true,
  "mimetype": "text/markdown"
}
```

**Example** (with content):
Message 1:
```json
{
  "name": "document.md",
  "path": "/example/document.md",
  "type": "file",
  "format": "text",
  "created": "2023-01-01T10:00:00Z",
  "last_modified": "2023-01-01T12:00:00Z",
  "size": 17,
  "writable": true,
  "mimetype": "text/markdown"
}
```

Message 2:
```json
{
  "content_length": 17,
  "truncated": false
}
```

Message 3:
```markdown
# Document Content
```

#### delete_document
Delete a document in JupyterLab.

**Parameters:**
- `path` (required): Path to the document to delete

**Returns:**
Success message indicating the document was deleted.

#### rename_document
Rename a document in JupyterLab.

**Parameters:**
- `path` (required): Current path to the document
- `newPath` (required): New path for the document

**Returns:**
Success message indicating the document was renamed.

#### copy_document
Copy a document in JupyterLab.

**Parameters:**
- `path` (required): Path to the document to copy
- `copyPath` (required): Path for the copied document

**Returns:**
Success message indicating the document was copied.

#### modify_document
Modify the content of a document in JupyterLab.

**Parameters:**
- `path` (required): Path to the document to modify
- `content` (required): New content for the document

**Returns:**
Success message indicating the document was modified.

### RTC Session Management

#### end_nb_session
End a real-time collaboration session for a notebook.

**Parameters:**
- `path` (required): Path to the notebook file

**Returns:**
A JSON object with session status:
- `path`: Path to the notebook
- `status`: Session status ("disconnected" or "not_found")
- `message`: Status message

**Example:**
```json
{
  "path": "/example/notebook1.ipynb",
  "status": "disconnected",
  "message": "RTC session ended successfully"
}
```

**Note:** Sessions are automatically terminated after a period of inactivity (configurable via command line argument, default: 5 minutes). This tool can be used to manually terminate a session before the timeout.

#### query_nb_sessions
Query the status of real-time collaboration sessions for notebooks in a directory.

**Parameters:**
- `root_path` (optional): Directory path to search for notebook sessions (default: lab root directory)

**Returns:**
A JSON object with session status information:
- `root_path`: The directory path that was queried
- `sessions`: Array of session objects for each notebook with active sessions
  - `path`: Path to the notebook
  - `session_id`: RTC session ID (if active)
  - `file_id`: File ID for the RTC session (if active)
  - `status`: Session status ("connected", "disconnected", or "not_found")
  - `cell_count`: Number of cells in the notebook (if active)
  - `last_activity`: Timestamp of last activity (if active)
  - `message`: Status message
- `total_sessions`: Total number of sessions found
- `active_sessions`: Number of currently active sessions

**Example:**
```json
{
  "root_path": "/example",
  "sessions": [
    {
      "path": "/example/notebook1.ipynb",
      "session_id": "session-id-123",
      "file_id": "file-id-456",
      "status": "connected",
      "cell_count": 5,
      "last_activity": "2023-01-01T12:00:00Z",
      "message": "RTC session is active"
    },
    {
      "path": "/example/notebook2.ipynb",
      "session_id": "session-id-789",
      "file_id": "file-id-012",
      "status": "disconnected",
      "cell_count": 3,
      "last_activity": "2023-01-01T11:30:00Z",
      "message": "RTC session ended"
    }
  ],
  "total_sessions": 2,
  "active_sessions": 1
}
```

**Note:** Sessions are automatically terminated after a period of inactivity (configurable via command line argument, default: 5 minutes). The `last_activity` timestamp shows when the session was last accessed.

## Architecture Overview

### Session Management

The JupyterLab RTC MCP Server uses an implicit session management approach with automatic timeout:

- **On-demand Session Creation**: Notebook and document sessions are created automatically when needed, without requiring explicit session initiation.
- **Automatic Session Termination**: Sessions are automatically terminated after a period of inactivity (configurable via command line argument, default: 5 minutes).
- **Explicit Session Termination**: Sessions can be explicitly closed using the `end_nb_session` tool to free resources before the timeout.
- **Activity Tracking**: The server tracks activity on sessions and resets the timeout timer whenever an operation is performed on a notebook.
- **Session Tracking**: The server maintains active sessions in memory and provides tools to query their status.

### Session Timeout Configuration

The session timeout can be configured using the `--session-timeout` command line argument:

```bash
# Set session timeout to 10 minutes
npx jupyterlab-rtc-mcp --session-timeout 10

# Set session timeout to 1 minute
npx jupyterlab-rtc-mcp --session-timeout 1
```

The timeout value is specified in minutes. If not provided, the default timeout is 5 minutes.

When a session times out, it is automatically terminated and resources are freed. Any subsequent operations on the notebook will create a new session.

### Real-time Collaboration Infrastructure

The server leverages JupyterLab's built-in RTC infrastructure:

- **WebSocket Communication**: Uses WebSocket connections for real-time synchronization.
- **Yjs CRDTs**: Leverages Yjs for conflict-free replicated data types to ensure consistency across clients.

### Tool Architecture

Tools are organized into logical categories:

1. **RTC Session Management**: Tools for querying and ending notebook sessions
2. **Notebook Operations**: Tools for reading, modifying, inserting, deleting cells, and managing kernels
3. **Document Management**: Tools for creating, listing, and managing documents in JupyterLab

## Dependencies

### Core Dependencies

1. **`@modelcontextprotocol/sdk`** (v0.5.0)
   - **Purpose**: Provides the MCP server implementation
   - **RTC Support**: Enables the server to communicate with AI agents

2. **`@jupyterlab/services`** (v7.0.0)
   - **Purpose**: Provides client-side APIs for interacting with JupyterLab services
   - **RTC Support**: Provides essential APIs for RTC functionality:
     - `ServerConnection.makeSettings()`: Creates connection settings for JupyterLab API
     - `ServerConnection.makeRequest()`: Makes HTTP requests to JupyterLab endpoints
     - `User.IManager`: Manages user identity and authentication

3. **`@jupyterlab/coreutils`** (v6.0.0)
   - **Purpose**: Provides utility functions for JupyterLab
   - **RTC Support**: Provides essential utilities:
     - `URLExt.join()`: Constructs URLs to JupyterLab API endpoints
     - `URLExt.parse()`: Parses URLs for WebSocket connections

### Real-time Collaboration Dependencies

4. **`yjs`** (v13.6.0)
   - **Purpose**: CRDT (Conflict-free Replicated Data Type) library for real-time collaboration
   - **RTC Support**: Core technology enabling real-time synchronization of documents

5. **`y-websocket`** (v1.5.0)
   - **Purpose**: WebSocket provider for Yjs
   - **RTC Support**: Enables real-time synchronization over WebSocket connections

6. **`@jupyter/ydoc`**
   - **Purpose**: Provides Yjs-based document models for JupyterLab
   - **RTC Support**: Enables notebook-specific synchronization using YNotebook

### Additional Dependencies

7. **`zod`**
   - **Purpose**: Schema validation for tool parameters
   - **RTC Support**: Ensures proper parameter validation for RTC operations

## How These Dependencies Work Together for RTC

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
   - `@jupyter/ydoc` provides notebook-specific document models

### Evidence of RTC Support in @jupyterlab/services and @jupyterlab/coreutils

From the JupyterLab RTC codebase, we can see how these libraries are used:

1. **Document Session Request**:
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

2. **WebSocket Provider Connection**:
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

3. **Global Awareness**:
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
