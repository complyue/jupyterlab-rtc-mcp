/**
 * Logging utility that respects the LOG_LEVEL environment variable
 *
 * Supported log levels (in order of severity):
 * - error: Error messages
 * - warn: Warning messages
 * - info: Informational messages
 * - debug: Debug messages (disabled by default)
 */

// Default to INFO level if LOG_LEVEL is not set
const DEFAULT_LOG_LEVEL = 2;

// Parse LOG_LEVEL environment variable
function parseLogLevel(levelString: string): number {
  switch (levelString.toLowerCase()) {
    case "error":
      return 0;
    case "warn":
    case "warning":
      return 1;
    case "info":
      return 2;
    case "debug":
      return 3;
    default:
      return DEFAULT_LOG_LEVEL;
  }
}

// Get current log level from environment
const currentLogLevel = process.env.LOG_LEVEL
  ? parseLogLevel(process.env.LOG_LEVEL)
  : DEFAULT_LOG_LEVEL;

/**
 * Logger class that provides leveled logging to stderr
 */
export class Logger {
  private context: string;

  constructor(context: string = "") {
    this.context = context;
  }

  /**
   * Log an error message
   * @param message The message to log
   * @param error Optional error object
   */
  error(message: string, error?: unknown): void {
    if (currentLogLevel >= 0) {
      const timestamp = new Date().toISOString();
      const contextPrefix = this.context ? `[${this.context}] ` : "";
      let errorMessage = "";
      let stackTrace = "";

      if (error) {
        if (error instanceof Error) {
          errorMessage = `: ${error.message}`;
          stackTrace = error.stack ? `\n${error.stack}` : "";
        } else {
          errorMessage = `: ${JSON.stringify(error)}`;
        }
      }

      console.error(
        `${timestamp} [ERROR] ${contextPrefix}${message}${errorMessage}${stackTrace}`,
      );
    }
  }

  /**
   * Log a warning message
   * @param message The message to log
   */
  warn(message: string, error?: unknown): void {
    if (currentLogLevel >= 1) {
      const timestamp = new Date().toISOString();
      const contextPrefix = this.context ? `[${this.context}] ` : "";

      let errorMessage = "";
      let stackTrace = "";

      if (error) {
        if (error instanceof Error) {
          errorMessage = `: ${error.message}`;
          stackTrace = error.stack ? `\n${error.stack}` : "";
        } else {
          errorMessage = `: ${JSON.stringify(error)}`;
        }
      }

      console.error(
        `${timestamp} [WARN] ${contextPrefix}${message}${errorMessage}${stackTrace}`,
      );
    }
  }

  /**
   * Log an info message
   * @param message The message to log
   */
  info(message: string): void {
    if (currentLogLevel >= 2) {
      const timestamp = new Date().toISOString();
      const contextPrefix = this.context ? `[${this.context}] ` : "";

      console.error(`${timestamp} [INFO] ${contextPrefix}${message}`);
    }
  }

  /**
   * Log a debug message
   * @param message The message to log
   */
  debug(message: string): void {
    // Debug logging is disabled as per requirements
    if (currentLogLevel >= 3) {
      const timestamp = new Date().toISOString();
      const contextPrefix = this.context ? `[${this.context}] ` : "";

      console.error(`${timestamp} [DEBUG] ${contextPrefix}${message}`);
    }
  }

  /**
   * Create a new logger with a specific context
   * @param context The context for the new logger
   * @returns A new logger instance with the specified context
   */
  withContext(context: string): Logger {
    return new Logger(context);
  }
}

// Default logger instance
export const logger = new Logger();
