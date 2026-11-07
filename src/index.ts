/**
 * Public entry point of @trysac/mcp-client-cli.
 */

export { type CliDeps, type CliIO, run } from "./cli.js";
export {
  type CallToolOptions,
  type CallToolResult,
  callTool,
  checkServer,
  type Finding,
  inspect,
  type ServerReport,
} from "./client.js";
export { CliError, type CliErrorCode } from "./errors.js";
export { DEFAULT_MAX_OUTPUT, sanitizeAndTruncate, sanitizeControlCharacters } from "./sanitizer.js";
export { parseTarget, type Target } from "./target.js";
