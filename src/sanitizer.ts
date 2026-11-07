/**
 * Default character limit for tool responses in characters.
 */
export const DEFAULT_MAX_OUTPUT = 100_000;

/**
 * Strips C0 and C1 control characters except newline (\n, U+000A) and tab (\t, U+0009).
 * Specifically strips:
 * - U+0000 through U+0008
 * - U+000B through U+001F (including ESC U+001B)
 * - U+007F through U+009F
 *
 * @param input - The raw string from the MCP server.
 * @returns The sanitised string with control characters removed.
 */
export function sanitizeControlCharacters(input: string): string {
  // Matches U+0000-U+0008, U+000B-U+001F, and U+007F-U+009F
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control character removal per MCP CLI spec
  return input.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "");
}

/**
 * Sanitises server output and applies truncation according to maxOutput limits.
 *
 * @param input - The raw text from the server.
 * @param maxOutput - Maximum number of characters allowed before truncating.
 * @returns The sanitised string, truncated with a marker if exceeding maxOutput.
 */
export function sanitizeAndTruncate(input: string, maxOutput: number = DEFAULT_MAX_OUTPUT): string {
  const clean = sanitizeControlCharacters(input);
  const limit = Math.max(0, maxOutput);
  if (clean.length <= limit) {
    return clean;
  }
  const truncatedCount = clean.length - limit;
  return `${clean.slice(0, limit)}\n[truncated ${truncatedCount} chars]`;
}
