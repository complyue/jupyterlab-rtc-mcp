import * as Y from "yjs";
import { ISessionModel } from "./document-session.js";
import { DocumentSession } from "./document-session.js";
import { JupyterLabAdapter } from "./adapter.js";

/**
 * TextDocumentSession represents a session with a JupyterLab text document
 *
 * This class handles text-specific operations while extending DocumentSession
 * for common WebSocket connection and synchronization functionality.
 */
export class TextDocumentSession extends DocumentSession {
  private yText: Y.Text;

  constructor(
    session: ISessionModel,
    jupyterAdapter: JupyterLabAdapter,
    ydoc?: Y.Doc,
  ) {
    // Create a Y.Doc for the text document
    const ydocInstance = ydoc || new Y.Doc();
    super(session, jupyterAdapter, ydocInstance);

    // Get or create the shared text object
    this.yText = ydocInstance.getText("content");
  }

  /**
   * Get the Yjs text object
   */
  getYText(): Y.Text {
    return this.yText;
  }

  /**
   * Get the document content
   * @returns The document content as a string
   */
  getContent(): string {
    return this.yText.toString();
  }

  /**
   * Set the document content
   * @param content The new content for the document
   */
  setContent(content: string): void {
    this.ydoc.transact(() => {
      this.yText.delete(0, this.yText.length);
      this.yText.insert(0, content);
    });
  }

  /**
   * Insert text at a specific position
   * @param position The position to insert at
   * @param text The text to insert
   */
  insertText(position: number, text: string): void {
    this.ydoc.transact(() => {
      this.yText.insert(position, text);
    });
  }

  /**
   * Delete text from a specific position
   * @param position The position to delete from
   * @param length The length of text to delete
   */
  deleteText(position: number, length: number): void {
    this.ydoc.transact(() => {
      this.yText.delete(position, length);
    });
  }

  /**
   * Replace text in a specific range
   * @param position The position to start replacing from
   * @param length The length of text to replace
   * @param text The new text to replace with
   */
  replaceText(position: number, length: number, text: string): void {
    this.ydoc.transact(() => {
      this.yText.delete(position, length);
      this.yText.insert(position, text);
    });
  }

  /**
   * Get the length of the document
   * @returns The length of the document
   */
  getLength(): number {
    return this.yText.length;
  }
}
