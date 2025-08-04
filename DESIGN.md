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
