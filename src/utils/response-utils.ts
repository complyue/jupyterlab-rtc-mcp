import { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * Utility functions for creating standardized MCP tool responses
 */

/**
 * Create a standardized success result for MCP tools (converts to CallToolResult)
 * @param operation The operation/tool name
 * @param message Natural language message describing the operation result
 * @param data The structured result data
 * @param nextSteps Optional next steps suggestions (included in the message)
 * @param sessionId Optional session ID
 * @param warnings Optional warnings array
 * @returns MCP CallToolResult with properly formatted content
 */
export function createSuccessResult<T>(
  operation: string,
  message: string,
  data: T,
  nextSteps?: string[],
  sessionId?: string,
  warnings?: string[],
): CallToolResult {
  let modifiedMessage = message;
  if (nextSteps && nextSteps.length > 0) {
    modifiedMessage +=
      "\n\n**Next steps:**\n" + nextSteps.map((step) => `- ${step}`).join("\n");
  }
  // Create multi-message response: natural language message first, then structured data
  const content = [
    {
      type: "text" as const,
      text: modifiedMessage, // Natural language description
    },
    {
      type: "text" as const,
      text: JSON.stringify(
        {
          // Structured data without the message field (already sent as separate message)
          success: true,
          operation,
          data,
          metadata: {
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            warnings: warnings || [],
          },
        },
        null,
        2,
      ),
    },
  ];
  return { content };
}

/**
 * Create a standardized error result for MCP tools (converts to CallToolResult)
 * @param operation The operation/tool name
 * @param message Natural language error message
 * @param errorCode Error code for programmatic handling
 * @param details Optional detailed error information
 * @param nextSteps Optional next steps suggestions (included in the message)
 * @param sessionId Optional session ID
 * @param warnings Optional warnings array
 * @param suggestion Optional suggestion for fixing the error
 * @returns MCP CallToolResult with properly formatted content
 */
export function createErrorResult(
  operation: string,
  message: string,
  errorCode: string,
  details?: Record<string, unknown>,
  nextSteps?: string[],
  sessionId?: string,
  warnings?: string[],
  suggestion?: string,
): CallToolResult {
  let modifiedMessage = message;
  if (nextSteps && nextSteps.length > 0) {
    modifiedMessage +=
      "\n\n**Next steps:**\n" + nextSteps.map((step) => `- ${step}`).join("\n");
  }
  // Create multi-message response: natural language message first, then structured data
  const content = [
    {
      type: "text" as const,
      text: modifiedMessage, // Natural language description
    },
    {
      type: "text" as const,
      text: JSON.stringify(
        {
          // Structured data without the message field (already sent as separate message)
          success: false,
          operation,
          error: {
            code: errorCode,
            details,
            suggestion,
          },
          metadata: {
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            warnings: warnings || [],
          },
        },
        null,
        2,
      ),
    },
  ];
  return { content };
}
