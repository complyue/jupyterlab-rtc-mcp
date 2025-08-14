// Type definitions for JupyterLab API responses
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
