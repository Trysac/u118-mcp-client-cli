/**
 * Error codes emitted by the CLI and core client operations.
 */
export type CliErrorCode = "INVALID_TARGET" | "INVALID_ARGS" | "TIMEOUT" | "USAGE";

/**
 * Base error class for MCP CLI operational errors.
 */
export class CliError extends Error {
  public readonly code: CliErrorCode;

  constructor(code: CliErrorCode, message: string) {
    const safeMessage = message.length > 200 ? `${message.slice(0, 197)}...` : message;
    super(safeMessage);
    this.name = "CliError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
