# JupyterLab RTC MCP Server - Detailed Tool Specifications

This document contains detailed specifications for all tools available in the JupyterLab RTC MCP Server. The server provides a comprehensive set of tools for interacting with JupyterLab through the Model Context Protocol (MCP), enabling AI agents to perform operations on notebooks and documents with real-time collaboration capabilities.

## Available Tools Overview

The tools are organized into five main categories:

1. **URL Tools**: Tools for handling JupyterLab URLs, extracting paths, and constructing URLs for access.
2. **Notebook RTC Tools**: Tools for reading, modifying, and managing notebook cells and kernels with real-time collaboration.
3. **Document RTC Tools**: Tools for real-time collaboration on document editing.
4. **Document Management Tools**: Tools for basic document operations without real-time collaboration.
5. **RTC Session Management Tools**: Tools for querying and managing real-time collaboration sessions.

Each tool is designed to provide specific functionality while maintaining consistency in parameters, return values, and error handling.

### URL Tools

The URL Tools category provides utilities for handling JupyterLab URLs, enabling AI agents to extract paths from URLs and construct URLs for accessing notebooks and documents. These tools are essential for navigating the JupyterLab environment and establishing proper connections for real-time collaboration.

#### get_base_url
Retrieves the base URL of the JupyterLab server for use in constructing full URLs and understanding the server context.

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
Extracts the notebook path from a full JupyterLab URL with proper URL decoding, enabling AI agents to identify notebook files from URLs.

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

### Notebook RTC Tools

The Notebook RTC Tools category provides comprehensive functionality for interacting with Jupyter notebooks through real-time collaboration. These tools enable AI agents to read, modify, insert, and delete notebook cells, as well as manage kernel operations. All operations are performed using JupyterLab's RTC infrastructure, ensuring that changes are immediately visible to all collaborators.

Key features of these tools include:
- Cell operations with optional execution
- Kernel management and restart capabilities
- Support for both code and markdown cells
- Range-based operations for efficiency
- Real-time synchronization with JupyterLab

#### list_nbs
Lists all notebook files under a specified directory, recursively, providing comprehensive information about each notebook including metadata and access URLs.

**Parameters:**
- `path` (optional): Directory path to search for notebooks (default: root directory)

**Returns:**
A JSON array of notebook objects with properties:
- `path`: Full path to the notebook file
- `name`: Filename of the notebook
- `last_modified`: ISO timestamp of last modification
- `created`: ISO timestamp of creation
- `size`: File size in bytes
- `writable`: Whether the notebook is writable
- `url`: Full URL to access the notebook in JupyterLab

**Example:**
```json
{
  "notebooks": [
    {
      "path": "/example/notebook1.ipynb",
      "name": "notebook1.ipynb",
      "last_modified": "2023-01-01T12:00:00Z",
      "created": "2023-01-01T10:00:00Z",
      "size": 1024,
      "writable": true,
      "url": "http://localhost:8888/notebooks/example/notebook1.ipynb"
    }
  ]
}
```

**Note:** The URL field provides direct links to notebooks in JupyterLab using the `/notebooks/` path pattern.

#### get_nb_stat
Retrieves status information about a notebook, including cell count and kernel state, providing a snapshot of the notebook's current condition.

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
Reads multiple cells by specifying ranges with formal output schema and truncation support. If no ranges are specified, all cells in the notebook are read, providing detailed cell information including content, type, execution data, and outputs with truncation information.

**Parameters:**
- `path` (required): Path to the notebook file
- `ranges` (optional): Array of cell ranges to read
  - `start`: Starting cell index (0-based)
  - `end` (optional): Ending cell index (exclusive)
- `maxCellData` (optional, default: 2048): Maximum size in characters for cell source and output data

**Returns:**
A JSON object with cell information:
- `path`: Path to the notebook
- `cells`: Array of cell objects
  - `index`: Cell index (0-based)
  - `id`: Cell ID
  - `cell_type`: Cell type ("code", "markdown", or "raw")
  - `source`: Cell content (truncated if exceeds maxCellData)
  - `metadata`: Cell metadata
  - `execution_count`: Execution count for code cells (null if not executed)
  - `outputs`: Array of outputs for code cells (empty array if none)
    - Output types include:
      - `data`: Output data with MIME types (e.g., "text/plain", "image/png")
      - `metadata`: Output metadata
      - `execution_count`: Execution count for the output
      - `name`: Error name for error outputs
      - `value`: Error value for error outputs
      - `traceback`: Error traceback for error outputs
      - `text`: Stream output text
  - `truncated`: Object indicating truncation status
    - `source`: Boolean indicating if source was truncated
    - `outputs`: Array of booleans indicating if each output was truncated
- `truncated`: Boolean indicating if any content was truncated
- `max_cell_data`: Maximum cell data size used

**Example:**
```json
{
  "path": "example/notebook.ipynb",
  "cells": [
    {
      "index": 0,
      "id": "cell-1",
      "cell_type": "code",
      "source": "print('Hello, World!')",
      "metadata": {},
      "execution_count": 1,
      "outputs": [
        {
          "data": {
            "text/plain": "Hello, World!"
          },
          "metadata": {},
          "execution_count": 1
        }
      ],
      "truncated": {
        "source": false,
        "outputs": [false]
      }
    }
  ],
  "truncated": false,
  "max_cell_data": 2048
}
```

#### modify_nb_cells
Modifies multiple cells by specifying ranges, with optional execution after modification, allowing for efficient batch updates to notebook content. When execution is enabled, returns detailed execution results with output data.

**Parameters:**
- `path` (required): Path to the notebook file
- `modifications` (required): Array of cell modifications
  - `range`: Cell range to modify
    - `start`: Starting cell index
    - `end` (optional): Ending cell index (exclusive)
  - `content`: New content for the cells
- `exec` (optional, default: true): Whether to execute the modified cells
- `maxCellOutputSize` (optional, default: 2000): Maximum size in characters for cell output data

**Returns:**
A JSON object with:
- `message`: Success message
- `modified_ranges`: Number of cell ranges modified
- `executed`: Boolean indicating whether cells were executed
- `execution_results` (optional): Array of execution results if cells were executed
  - `outputs`: Array of cell outputs
    - Output types include:
      - `data`: Output data with MIME types (e.g., "text/plain", "image/png")
      - `metadata`: Output metadata
      - `execution_count`: Execution count for the output
      - `name`: Error name for error outputs
      - `value`: Error value for error outputs
      - `traceback`: Error traceback for error outputs
      - `text`: Stream output text
  - `truncated`: Boolean indicating if outputs were truncated
  - `original_size`: Original size of the outputs before truncation

**Example:**
```json
{
  "message": "Successfully modified 2 cell ranges and executed cells",
  "modified_ranges": 2,
  "executed": true,
  "execution_results": [
    {
      "outputs": [
        {
          "data": {
            "text/plain": "Result: 42"
          },
          "metadata": {},
          "execution_count": 1
        }
      ],
      "truncated": false,
      "original_size": 15
    }
  ]
}
```

#### insert_nb_cells
Inserts multiple cells at a specified location, with optional execution after insertion, enabling dynamic expansion of notebook content. When execution is enabled, returns detailed execution results with output data.

**Parameters:**
- `path` (required): Path to the notebook file
- `position` (required): Position to insert the cells
- `cells` (required): Array of cells to insert
  - `type` (optional, default: "code"): Cell type ("code" or "markdown")
  - `content`: Cell content
- `exec` (optional, default: true): Whether to execute the inserted cells
- `maxCellOutputSize` (optional, default: 2000): Maximum size in characters for cell output data

**Returns:**
A JSON object with:
- `message`: Success message
- `executed`: Boolean indicating whether cells were executed
- `execution_results` (optional): Array of execution results if cells were executed
  - `outputs`: Array of cell outputs
    - Output types include:
      - `data`: Output data with MIME types (e.g., "text/plain", "image/png")
      - `metadata`: Output metadata
      - `execution_count`: Execution count for the output
      - `name`: Error name for error outputs
      - `value`: Error value for error outputs
      - `traceback`: Error traceback for error outputs
      - `text`: Stream output text
  - `truncated`: Boolean indicating if outputs were truncated
  - `original_size`: Original size of the outputs before truncation

**Example:**
```json
{
  "message": "Successfully inserted cells",
  "executed": true,
  "execution_results": [
    {
      "outputs": [
        {
          "data": {
            "text/plain": "Insertion successful"
          },
          "metadata": {},
          "execution_count": 1
        }
      ],
      "truncated": false,
      "original_size": 20
    }
  ]
}
```

#### delete_nb_cells
Deletes multiple cells by specifying ranges, providing a way to remove unwanted content from notebooks efficiently.

**Parameters:**
- `path` (required): Path to the notebook file
- `ranges` (required): Array of cell ranges to delete
  - `start`: Starting cell index
  - `end` (optional): Ending cell index (exclusive)

**Returns:**
A JSON object with:
- `message`: Success message
- `deleted_cells`: Number of cells deleted

**Example:**
```json
{
  "message": "Successfully deleted 5 cells",
  "deleted_cells": 5
}
```

#### execute_nb_cells
Executes multiple cells by specifying ranges, allowing for selective code execution without modifying cell content. Returns detailed execution results with output data for each executed cell.

**Parameters:**
- `path` (required): Path to the notebook file
- `ranges` (required): Array of cell ranges to execute
  - `start`: Starting cell index
  - `end` (optional): Ending cell index (exclusive)
- `maxCellOutputSize` (optional, default: 2000): Maximum size in characters for cell output data

**Returns:**
A JSON object with:
- `message`: Success message
- `executed_ranges`: Number of cell ranges executed
- `executed_cells`: Number of cells executed
- `execution_results`: Array of execution results for each executed cell
  - `outputs`: Array of cell outputs
    - Output types include:
      - `data`: Output data with MIME types (e.g., "text/plain", "image/png")
      - `metadata`: Output metadata
      - `execution_count`: Execution count for the output
      - `name`: Error name for error outputs
      - `value`: Error value for error outputs
      - `traceback`: Error traceback for error outputs
      - `text`: Stream output text
  - `truncated`: Boolean indicating if outputs were truncated
  - `original_size`: Original size of the outputs before truncation

**Example:**
```json
{
  "message": "Successfully executed 2 cell ranges",
  "executed_ranges": 2,
  "executed_cells": 3,
  "execution_results": [
    {
      "outputs": [
        {
          "data": {
            "text/plain": "Execution result: 42"
          },
          "metadata": {},
          "execution_count": 1
        }
      ],
      "truncated": false,
      "original_size": 22
    },
    {
      "outputs": [
        {
          "data": {
            "text/plain": "Another result"
          },
          "metadata": {},
          "execution_count": 2
        }
      ],
      "truncated": false,
      "original_size": 14
    }
  ]
}
```

#### restart_nb_kernel
Restarts the kernel of a specified notebook, with options to clear outputs and execute cells after restart, providing a clean execution environment.

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
A JSON object with:
- `message`: Success message
- `kernel_restarted`: Boolean indicating whether kernel was restarted
- `outputs_cleared`: Boolean indicating whether outputs were cleared
- `cells_executed`: Boolean indicating whether cells were executed

**Example:**
```json
{
  "message": "Successfully restarted notebook kernel and executed cells",
  "kernel_restarted": true,
  "outputs_cleared": false,
  "cells_executed": true
}
```

**Error Handling:**
- If the notebook file doesn't exist, returns an appropriate error
- If kernel creation fails, returns detailed error information
- If kernel restart fails, returns detailed error information

#### list_available_kernels
Lists all available kernels on the JupyterLab server, providing information about kernel names, display names, languages, and resource paths.

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
Assigns a specific kernel to a notebook, enabling the notebook to use a particular programming language environment for code execution.

**Parameters:**
- `path` (required): Path to the notebook file
- `kernel_name` (required): Name of the kernel to assign (from list_available_kernels)

**Returns:**
A JSON object with:
- `message`: Success message
- `kernel_assigned`: Boolean indicating whether kernel was assigned
- `kernel_name`: Name of the assigned kernel

**Example:**
```json
{
  "message": "Successfully assigned kernel 'python3' to notebook 'example.ipynb'",
  "kernel_assigned": true,
  "kernel_name": "python3"
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

### Document RTC Tools

The Document RTC Tools category provides real-time collaboration features for document editing using JupyterLab's RTC infrastructure. These tools enable AI agents to perform text operations on documents with immediate synchronization across all collaborators. The tools leverage Yjs CRDTs to ensure conflict-free editing and consistent document state.

Key features of these tools include:
- Position-based text insertion, deletion, and replacement
- Real-time synchronization with all collaborators
- Efficient handling of large documents with content length limits
- Support for various document types (text files, markdown, etc.)
- Conflict resolution through CRDT technology

#### get_document_content
Retrieves document content using real-time collaboration, with configurable content length limits for efficient handling of large documents.

**Parameters:**
- `path` (required): Path to the document
- `max_content` (optional, default: 32768): Maximum content length to return (default: 32KB)

**Returns:**
A JSON object with document content:
- `content`: The document content
- `truncated`: Boolean indicating if content was truncated due to size limits
- `content_length`: Length of the content

**Example:**
```json
{
  "content": "# Document Content\n\nThis is a sample document.",
  "truncated": false,
  "content_length": 42
}
```

**Note:** This tool uses RTC to efficiently retrieve document content, especially useful for large documents where only a portion is needed.

#### insert_document_text
Inserts text at a specific position in a document using real-time collaboration, with changes immediately visible to all collaborators.

**Parameters:**
- `path` (required): Path to the document
- `position` (required): Position to insert the text (0-based)
- `text` (required): Text to insert

**Returns:**
A JSON object with:
- `message`: Success message
- `position`: Position where text was inserted
- `length`: Length of inserted text

**Example:**
```json
{
  "message": "Successfully inserted 15 characters at position 42",
  "position": 42,
  "length": 15
}
```

**Note:** This tool uses Yjs RTC to efficiently insert text at the specified position, with changes immediately visible to all collaborators.

#### delete_document_text
Deletes text from a specific position in a document using real-time collaboration, with changes immediately synchronized across all collaborators.

**Parameters:**
- `path` (required): Path to the document
- `position` (required): Starting position to delete from (0-based)
- `length` (required): Number of characters to delete

**Returns:**
A JSON object with:
- `message`: Success message
- `position`: Position where text was deleted
- `length`: Length of deleted text

**Example:**
```json
{
  "message": "Successfully deleted 10 characters from position 42",
  "position": 42,
  "length": 10
}
```

**Note:** This tool uses Yjs RTC to efficiently delete text from the specified position, with changes immediately visible to all collaborators.

#### replace_document_text
Replaces text in a specific range in a document using real-time collaboration, with changes immediately synchronized across all collaborators.

**Parameters:**
- `path` (required): Path to the document
- `position` (required): Starting position to replace from (0-based)
- `length` (required): Number of characters to replace
- `text` (required): Replacement text

**Returns:**
A JSON object with:
- `message`: Success message
- `position`: Position where text was replaced
- `length`: Length of replaced text
- `new_length`: Length of replacement text

**Example:**
```json
{
  "message": "Successfully replaced 10 characters with 15 new characters at position 42",
  "position": 42,
  "length": 10,
  "new_length": 15
}
```

**Note:** This tool uses Yjs RTC to efficiently replace text in the specified range, with changes immediately visible to all collaborators.

### Document Management Tools

The Document Management Tools category provides basic document management functionality without using real-time collaboration. These tools enable AI agents to perform file system operations on documents within JupyterLab, including creation, deletion, renaming, copying, and content modification. Unlike the Document RTC Tools, these operations do not establish real-time collaboration sessions.

Key features of these tools include:
- Comprehensive document lifecycle management (create, read, update, delete)
- Support for various document types (notebooks, files, directories)
- Detailed document information retrieval
- Content manipulation with size limits
- URL generation for direct access in JupyterLab

#### list_documents
Lists available documents in JupyterLab from a specified path, providing comprehensive information about each document including metadata and access URLs.

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
- `url`: Full URL to access the document in JupyterLab

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
    "writable": true,
    "url": "http://localhost:8888/edit/example/document.md"
  }
]
```

**Note:** The URL field provides direct links to documents in JupyterLab, with different URL patterns based on document type:
- Notebooks: `/notebooks/path/to/notebook.ipynb`
- Files: `/edit/path/to/file.ext`
- Directories: `/tree/path/to/directory`

#### create_document
Creates a new document in JupyterLab with optional initial content, supporting various document types including notebooks, files, and markdown.

**Parameters:**
- `path` (required): Path for the new document
- `type` (optional, default: "notebook"): Document type ("notebook", "file", "markdown")
- `content` (optional): Initial content for the document

**Returns:**
A JSON object with:
- `message`: Success message
- `path`: Path of the created document
- `type`: Type of the created document

**Example:**
```json
{
  "message": "Successfully created notebook at '/example/new_notebook.ipynb'",
  "path": "/example/new_notebook.ipynb",
  "type": "notebook"
}
```

#### get_document_info
Retrieves comprehensive information about a document, with optional content inclusion, supporting detailed metadata analysis.

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
   - `url`: Full URL to access the document in JupyterLab

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
  "mimetype": "text/markdown",
  "url": "http://localhost:8888/edit/example/document.md"
}
```

**Note:** The URL field provides direct links to documents in JupyterLab, with different URL patterns based on document type:
- Notebooks: `/notebooks/path/to/notebook.ipynb`
- Files: `/edit/path/to/file.ext`
- Directories: `/tree/path/to/directory`

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
Deletes a document in JupyterLab, permanently removing it from the file system.

**Parameters:**
- `path` (required): Path to the document to delete

**Returns:**
A JSON object with:
- `message`: Success message
- `path`: Path of the deleted document

**Example:**
```json
{
  "message": "Successfully deleted document at '/example/old_document.md'",
  "path": "/example/old_document.md"
}
```

#### rename_document
Renames a document in JupyterLab, changing its path while preserving its content and metadata.

**Parameters:**
- `path` (required): Current path to the document
- `newPath` (required): New path for the document

**Returns:**
A JSON object with:
- `message`: Success message
- `old_path`: Original path of the document
- `new_path`: New path of the document

**Example:**
```json
{
  "message": "Successfully renamed document from '/example/old_name.md' to '/example/new_name.md'",
  "old_path": "/example/old_name.md",
  "new_path": "/example/new_name.md"
}
```

#### copy_document
Copies a document in JupyterLab, creating a duplicate at the specified path while preserving the original.

**Parameters:**
- `path` (required): Path to the document to copy
- `copyPath` (required): Path for the copied document

**Returns:**
A JSON object with:
- `message`: Success message
- `original_path`: Path of the original document
- `copy_path`: Path of the copied document

**Example:**
```json
{
  "message": "Successfully copied document from '/example/source.md' to '/example/backup.md'",
  "original_path": "/example/source.md",
  "copy_path": "/example/backup.md"
}
```

#### overwrite_document
Overwrites the entire content of a document in JupyterLab, replacing all existing content with the provided new content.

**Parameters:**
- `path` (required): Path to the document to modify
- `content` (required): New content for the document

**Returns:**
A JSON object with:
- `message`: Success message
- `path`: Path of the modified document
- `content_length`: Length of the new content

**Example:**
```json
{
  "message": "Successfully overwrote document at '/example/document.md'",
  "path": "/example/document.md",
  "content_length": 256
}
```

### RTC Session Management Tools

The RTC Session Management Tools category provides functionality for querying and managing real-time collaboration sessions. These tools enable AI agents to monitor active sessions, check session status, and explicitly terminate sessions when needed. The server uses an implicit session management approach with automatic timeout, but these tools provide explicit control when required.

Key features of these tools include:
- Querying session status for notebooks and documents
- Monitoring session activity and last access times
- Explicit session termination to free resources
- Session timeout configuration
- Tracking of active and disconnected sessions

#### query_nb_sessions
Queries the status of real-time collaboration sessions for notebooks in a directory, providing comprehensive session information including activity status and metadata.

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

#### end_nb_session
Ends a real-time collaboration session for a notebook, explicitly terminating the session to free resources.

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


#### query_document_session
Queries the status of a real-time collaboration session for a document, providing information about session connectivity and last activity.

**Parameters:**
- `path` (required): Path to the document

**Returns:**
A JSON object with session status information:
- `path`: Path to the document
- `session_id`: RTC session ID (if active)
- `file_id`: File ID for the RTC session (if active)
- `status`: Session status ("connected", "disconnected", or "not_found")
- `last_activity`: Timestamp of last activity (if active)
- `message`: Status message

**Example:**
```json
{
  "path": "/example/document.md",
  "session_id": "session-id-123",
  "file_id": "file-id-456",
  "status": "connected",
  "last_activity": "2023-01-01T12:00:00Z",
  "message": "RTC session is active"
}
```

**Note:** This tool can be used to check if a document has an active RTC session and when it was last accessed.

#### end_document_session
Ends a real-time collaboration session for a document, explicitly terminating the session to free resources.

**Parameters:**
- `path` (required): Path to the document

**Returns:**
A JSON object with session status:
- `path`: Path to the document
- `status`: Session status ("disconnected" or "not_found")
- `message`: Status message

**Example:**
```json
{
  "path": "/example/document.md",
  "status": "disconnected",
  "message": "RTC session ended successfully"
}
```

**Note:** This tool can be used to manually terminate a document session before the automatic timeout.

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

1. **Notebook RTC**: Tools for reading, modifying, inserting, deleting cells, and managing kernels
2. **Document RTC**: Real-time collaboration features for document editing
3. **Document Management**: Basic document operations without real-time collaboration
4. **RTC Session Management**: Tools for querying and ending notebook sessions

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
