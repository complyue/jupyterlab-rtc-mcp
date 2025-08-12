# JupyterLab RTC MCP Server - Detailed Tool Specifications

This document contains detailed specifications for all tools available in the JupyterLab RTC MCP Server.

## Available Tools

### RTC Session Management

#### begin_nb_session
Begin a real-time collaboration session for a notebook.

**Parameters:**
- `path` (required): Path to the notebook file

**Returns:**
A JSON object with session information:
- `path`: Path to the notebook
- `session_id`: RTC session ID
- `file_id`: File ID for the RTC session
- `status`: Connection status ("connected" or "disconnected")
- `message`: Status message

**Example:**
```json
{
  "path": "/example/notebook1.ipynb",
  "session_id": "session-id-123",
  "file_id": "file-id-456",
  "status": "connected",
  "message": "RTC session started successfully"
}
```

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

#### restart_nb_kernel
Restart the kernel of a specified notebook, with options to clear contents and execute cells.

**Parameters:**
- `path` (required): Path to the notebook file
- `clear_contents` (optional, default: false): Whether to clear cell contents after restart
- `exec` (optional, default: true): Whether to execute cells after restart

**Returns:**
Success message indicating kernel restart status and whether contents were cleared and cells were executed.

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

**Returns:**
A JSON object with document information:
- `name`: Document name
- `path`: Full path to the document
- `type`: Document type
- `format`: Document format
- `created`: ISO timestamp of creation
- `last_modified`: ISO timestamp of last modification
- `size`: File size in bytes
- `writable`: Whether the document is writable
- `mimetype`: MIME type of the document
- `content`: Document content

**Example:**
```json
{
  "name": "document.md",
  "path": "/example/document.md",
  "type": "file",
  "format": "text",
  "created": "2023-01-01T10:00:00Z",
  "last_modified": "2023-01-01T12:00:00Z",
  "size": 1024,
  "writable": true,
  "mimetype": "text/markdown",
  "content": "# Document Content"
}
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

#### document_exists
Check if a document exists in JupyterLab.

**Parameters:**
- `path` (required): Path to the document to check

**Returns:**
A JSON object with:
- `exists`: Boolean indicating whether the document exists


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

### Additional JupyterLab API Packages for Enhanced RTC Functionality

6. **`@jupyterlab/docmanager`** (v4.5.0)
   - **Purpose**: Provides document management capabilities for JupyterLab
   - **RTC Support**: Enhances RTC functionality by providing:
     - Document context management for collaborative sessions
     - Document lifecycle management (open, close, save)
     - Integration with document registry for model creation
   - **Key RTC Usage**:
     - Managing document contexts during RTC sessions
     - Handling document synchronization states
     - Providing document models for collaborative editing

7. **`@jupyterlab/docregistry`** (v4.5.0)
   - **Purpose**: Provides document registry functionality for JupyterLab
   - **RTC Support**: Supports RTC by:
     - Registering document models and factories
     - Managing document contexts for collaborative editing
     - Providing interfaces for document creation and management
   - **Key RTC Usage**:
     - Creating and managing document models for RTC sessions
     - Handling document type registration for collaborative documents
     - Providing context for document operations in real-time

8. **`@jupyterlab/nbformat`** (v4.5.0)
   - **Purpose**: Provides notebook format interfaces and utilities
   - **RTC Support**: Supports RTC by:
     - Defining notebook data structures for synchronization
     - Providing validation for notebook content
     - Enabling serialization/deserialization for collaborative editing
   - **Key RTC Usage**:
     - Structuring notebook data for real-time synchronization
     - Validating notebook content during collaborative editing
     - Handling notebook format conversions

9. **`@jupyterlab/notebook`** (v4.5.0)
   - **Purpose**: Provides notebook model implementations (headless)
   - **RTC Support**: Enhances RTC by:
     - Managing notebook models and their synchronization
     - Handling cell execution in collaborative environments
     - Providing notebook-level data structures
   - **Key RTC Usage**:
     - Managing notebook data structures for real-time collaboration
     - Handling cell operations in collaborative notebooks
     - Managing notebook-level synchronization state

10. **`@jupyterlab/cells`** (v4.5.0)
    - **Purpose**: Provides cell model implementations (headless)
    - **RTC Support**: Supports RTC by:
      - Managing cell models and their synchronization
      - Handling cell-specific operations in real-time
      - Providing cell-level data structures
    - **Key RTC Usage**:
      - Managing cell content synchronization
      - Handling cell execution and output in collaborative environments
      - Providing cell data structures for real-time updates

11. **`@jupyterlab/rendermime`** (v4.5.0)
    - **Purpose**: Provides MIME rendering capabilities for JupyterLab
    - **RTC Support**: Enhances RTC by:
      - Handling rich output synchronization
      - Providing consistent output formats across clients
      - Managing output data structures
    - **Key RTC Usage**:
      - Synchronizing rich content display
      - Handling MIME type rendering for collaborative outputs
      - Managing output data structures for real-time updates

12. **`@jupyterlab/outputarea`** (v4.5.0)
    - **Purpose**: Provides output area model implementations (headless)
    - **RTC Support**: Supports RTC by:
      - Managing output areas for collaborative cells
      - Synchronizing output content across clients
      - Handling output updates in real-time
    - **Key RTC Usage**:
      - Synchronizing output updates across clients
      - Managing output area state during collaboration
      - Handling output data structures for real-time updates

13. **`@jupyterlab/filebrowser`** (v4.5.0)
    - **Purpose**: Provides file system access capabilities for JupyterLab
    - **RTC Support**: Enhances RTC by:
      - Managing file operations in collaborative environments
      - Providing file system access for document creation
      - Handling file synchronization state
    - **Key RTC Usage**:
      - Creating and managing documents for RTC sessions
      - Providing file system navigation for collaborative work
      - Handling file operations during real-time collaboration

14. **`@jupyterlab/observables`** (v5.5.0)
    - **Purpose**: Provides observable data structures for JupyterLab
    - **RTC Support**: Supports RTC by:
      - Providing observable models for real-time updates
      - Enabling reactive programming patterns
      - Managing state synchronization
    - **Key RTC Usage**:
      - Creating observable models for collaborative documents
      - Handling real-time state updates
      - Managing reactive data structures for synchronization

15. **`@jupyterlab/statedb`** (v4.5.0)
    - **Purpose**: Provides state management capabilities for JupyterLab
    - **RTC Support**: Enhances RTC by:
      - Managing application state during collaboration
      - Providing state persistence for sessions
      - Handling state synchronization across clients
    - **Key RTC Usage**:
      - Managing session state for RTC connections
      - Providing state restoration for collaborative sessions
      - Handling state consistency across clients

16. **`@jupyterlab/running`** (v4.5.0)
    - **Purpose**: Provides running sessions management for JupyterLab
    - **RTC Support**: Supports RTC by:
      - Managing kernel sessions for collaborative notebooks
      - Providing session status information
      - Handling session lifecycle events
    - **Key RTC Usage**:
      - Managing kernel sessions during RTC
      - Providing session status for collaborative notebooks
      - Handling kernel operations in real-time

17. **`@jupyterlab/terminal`** (v4.5.0)
    - **Purpose**: Provides terminal emulation and management for JupyterLab
    - **RTC Support**: Enhances RTC by:
      - Enabling terminal session management
      - Providing terminal access for remote operations
      - Handling terminal state synchronization
    - **Key RTC Usage**:
      - Managing terminal sessions
      - Handling terminal state during collaboration
      - Managing terminal operations in real-time

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
   - `@jupyterlab/docmanager` provides document management for:
     - Managing document contexts during RTC sessions
     - Handling document lifecycle operations
   - `@jupyterlab/docregistry` provides document registry functionality for:
     - Creating and managing document models
     - Handling document type registration

3. **Document and Content Management Layer**:
   - `@jupyterlab/nbformat` provides notebook format interfaces for:
     - Structuring notebook data for synchronization
     - Validating notebook content during collaboration
   - `@jupyterlab/notebook` provides notebook models for:
     - Managing notebook data structures for real-time collaboration
     - Handling notebook-level synchronization
   - `@jupyterlab/cells` provides cell models for:
     - Managing cell content synchronization
     - Handling cell execution and output in collaborative environments
   - `@jupyterlab/rendermime` provides output handling for:
     - Synchronizing rich content display
     - Managing output data structures for real-time updates
   - `@jupyterlab/outputarea` provides output area models for:
     - Synchronizing output updates across clients
     - Managing output area state during collaboration

4. **File and Resource Management Layer**:
   - `@jupyterlab/filebrowser` provides file system access for:
     - Creating and managing documents for RTC sessions
     - Providing file system navigation for collaborative work
   - `@jupyterlab/running` provides session management for:
     - Managing kernel sessions during RTC
     - Providing session status for collaborative notebooks
   - `@jupyterlab/terminal` provides terminal management for:
     - Managing terminal sessions
     - Handling terminal state during collaboration

5. **State and Data Management Layer**:
   - `@jupyterlab/observables` provides observable data structures for:
     - Creating observable models for collaborative documents
     - Handling real-time state updates
   - `@jupyterlab/statedb` provides state management for:
     - Managing session state for RTC connections
     - Providing state restoration for collaborative sessions

6. **Real-time Synchronization Layer**:
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
