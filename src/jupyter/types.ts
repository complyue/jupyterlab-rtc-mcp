// Type definitions for JupyterLab API responses
import { IOutput } from "@jupyterlab/nbformat";

export interface JupyterContent {
  name: string;
  path: string;
  type: "notebook" | "directory" | "file";
  created?: string;
  last_modified?: string;
  size?: number;
  writable?: boolean;
  content?: JupyterContent[];
  message?: string;
}

export interface NotebookInfo {
  path: string;
  name: string;
  last_modified?: string;
  created?: string;
  size?: number;
  writable?: boolean;
  url?: string;
  // RTC session information
  rtc_session?: {
    session_id: string;
    file_id: string;
    connected: boolean;
    synced: boolean;
    collaborators?: CollaboratorInfo[];
  };
}

export interface CollaboratorInfo {
  id: string;
  name?: string;
  color?: string;
  cursor?: {
    position: number;
    cell?: number;
  };
  last_activity?: string;
}

export interface DocumentInfo {
  name: string;
  path: string;
  type: "file" | "directory" | "notebook";
  created?: string;
  last_modified?: string;
  size?: number;
  writable?: boolean;
  mimetype?: string;
  format?: string;
  url?: string;
}

export interface CellRange {
  start: number;
  end?: number;
}

export interface CellModification {
  range: CellRange;
  content: string;
}

export interface CellInsertion {
  type?: string;
  content: string;
}

export interface KernelSpec {
  display_name: string;
  language: string;
  resource_dir: string;
}

export interface KernelInfo {
  name: string;
  display_name: string;
  language: string;
  path: string;
}

// Cell output types for code cells
export interface CellOutputData {
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  execution_count?: number;
}

export interface CellOutputError {
  name: string;
  value: string;
  traceback: string[];
}

export type CellOutput = CellOutputData | CellOutputError;

// Formal cell schema with support for markdown and code cells
export interface CellData {
  index: number;
  id: string;
  cell_type: "code" | "markdown" | "raw";
  source: string;
  // For code cells only
  execution_count?: number;
  outputs?: CellOutput[];
  // Common metadata
  metadata: Record<string, unknown>;
  // Truncation info
  truncated?: {
    source: boolean;
    outputs?: boolean[];
  };
}

// Response schema for read_nb_cells tool
export interface ReadNotebookCellsResult {
  path: string;
  cells: CellData[];
  truncated?: boolean;
  max_cell_data?: number;
}

// Response schema for cell execution
export interface CellExecutionResult {
  outputs: IOutput[];
  truncated: boolean;
  original_size?: number;
}
